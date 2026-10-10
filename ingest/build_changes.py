"""Read the git history as a dated record of what CBE published.

CBE overwrites its files in place when it revises a figure, and keeps no public
changelog of it. This repository commits every clean file each day, so its
history is a dated record of what CBE published, and of any later revisions.
Miqyas keeps a dated copy of the daily tables from 20 August 2026.

`data/clean/series/*.csv` is `series_id,period,value`, and `fetch_series.py`
sorts by `(series_id, period)` before writing, so each series occupies a
contiguous block and `git log -p --unified=0` reads cleanly:

  - a lone `+` line is a new reading
  - a `-`/`+` pair on the same `series_id,period` is a changed value
  - a lone `-` line is a reading that is no longer there

`data/clean/records/*.csv` holds the 15 auction tables as CBE serves them, one
row per auction. A row there is matched to its earlier self by its dates,
tenor, ISIN and auction number.

**Whose change it was decides everything**, and it is decided per file, per
commit. A change is re-read by Miqyas, not revised by CBE, when:

  - a person made the commit (a parser fix, a new series, a re-dating);
  - the Excel parser's PARSER_VERSION changed since the archive was last
    written, whatever the number of values that moved. Before that constant
    existed, any change to the parser's source counts the same way;
  - a clean table changed when the raw file CBE served behind it did not, which
    can only be this project reading the same bytes differently;
  - the reading sits on a date where CBE published two values for one figure,
    and the one kept changed.

Series Miqyas computes or parses out of prose (the 39 marked `derived`) move
when their sources move and are never counted as revisions. A scraper commit
that would restate or remove more than 500 readings at once is held back
rather than trusted: CBE does not do that in a day, and a short download or an
unannounced parser change does. Only what is left can be a revision.

A series that existed before is never new. The weekly Excel catch-up is an
archive update, kept apart from the day's new readings, because its readings
are for quarters long past and ranking them beside today's exchange rate is how
"FDI Chile: -8.7 from 3.6e-16" once led the feed.

`vintages()` turns the same history into a table of every value the clean
series have held, with the first and last day each was held. build_exports.py
publishes it.

Requires the full history. `actions/checkout` clones at depth 1 by default and
this then sees nothing at all, which is why publish.yml sets `fetch-depth: 0`.

Run:  python ingest/build_changes.py
"""

from __future__ import annotations

import collections
import csv
import datetime as dt
import hashlib
import html
import io
import json
import pathlib
import re
import statistics
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES_DIR = ROOT / "data" / "clean" / "series"
RECORDS_DIR = ROOT / "data" / "clean" / "records"
DIST = ROOT / "dist"
API = DIST / "api" / "v1"

SITE_URL = "https://mogh0neim.github.io/egypt-macro/"

WINDOW_DAYS = 180
# A day's new readings run to a few hundred. The forty that moved most and an
# honest total is the same information at a fraction of the size.
MOVED_PER_DAY = 40
# One commit adding more than this to a series that already existed is CBE
# filling in history, not the day's news. The daily scrape adds one to three.
BACKFILL = 10
# A previous value smaller than this is zero with float noise on it. A
# percentage on it is meaningless (-8.7 from 3.6e-16 is -2.4 quintillion
# percent), so none is given.
NEAR_ZERO = 1e-6

LINE = re.compile(r"^([+-])([A-Za-z0-9._-]+),(\d{4}-\d{2}-\d{2}),(.+)$")
HUNK = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")

# Who made the commit. The scraper means CBE served something; a person means
# this project changed how it reads what CBE served.
SCRAPER = "egypt-macro-bot"
SCRAPE_SUBJECT = re.compile(r"^(data|check|archive):")
# CBE does not restate five hundred figures in a day. A scraper commit that
# looks like it did is held back rather than reported.
REPARSE_SUSPECT = 500

EXCEL = "excel_archive"
EXCEL_PARSER = "ingest/parse_excel.py"
# Read out of the parser's source at each commit rather than imported, so the
# history can be replayed: `PARSER_VERSION = "2"` or `PARSER_VERSION: str = "2"`.
PARSER_VERSION = re.compile(r"""^PARSER_VERSION\s*(?::[^=\n]+)?=\s*['"]?([^'"#\s]+)""", re.M)
# The columns that say which auction a row is, as opposed to what it raised.
RECORD_KEY = re.compile(r"date|tenor|isin|auction number|type", re.I)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                          text=True, encoding="utf-8", errors="replace").stdout


def cat_files(specs: list[str]) -> dict[str, str | None]:
    """`<rev>:<path>` -> the file's text at that revision, in one git call."""
    if not specs:
        return {}
    out = subprocess.run(["git", "cat-file", "--batch"], cwd=ROOT, capture_output=True,
                         input="\n".join(specs).encode() + b"\n").stdout
    found: dict[str, str | None] = {}
    pos = 0
    for spec in specs:
        end = out.index(b"\n", pos)
        header = out[pos:end].split()
        pos = end + 1
        if len(header) < 3 or header[-1] == b"missing":
            found[spec] = None
            continue
        size = int(header[2])
        found[spec] = out[pos:pos + size].decode("utf-8", "replace")
        pos += size + 1
    return found


def tidy(x: float) -> float:
    """Six significant figures, and float noise read as the zero it is."""
    return 0.0 if abs(x) < 1e-9 else float(f"{x:.6g}")


def utc_day(ts: int) -> str:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat()


# ---------- reading the history ----------

def raw_touched() -> dict[str, dict[str, str]]:
    """sha -> {path: A/M/D} for every commit that touched data/raw/."""
    out: dict[str, dict[str, str]] = {}
    for chunk in git("log", "--format=%x00%H", "--name-status", "--no-renames",
                     "--", "data/raw/").split("\x00")[1:]:
        sha, _, body = chunk.partition("\n")
        out[sha.strip()] = {parts[-1]: parts[0][:1]
                            for parts in (line.split("\t") for line in body.splitlines())
                            if len(parts) >= 2}
    return out


def read_commits() -> list[dict]:
    """Every commit that touched the clean data, oldest first, already parsed.

    Each commit carries, per file, what was added and removed: series files as
    {(series_id, period): value}, auction tables as lists of row text.
    """
    log = git("log", "--reverse", "--format=%x00%H%x1f%ct%x1f%an%x1f%s", "-p",
              "--unified=0", "--no-renames", "--", "data/clean/series/", "data/clean/records/")
    raw = raw_touched()
    commits: list[dict] = []
    last = 0
    for chunk in log.split("\x00")[1:]:
        header, _, body = chunk.partition("\n")
        parts = header.split("\x1f", 3)
        if len(parts) < 4:
            continue
        sha, ts, author, subject = parts
        # Committer time, held in step with the history's own order: a rebased
        # commit can carry a clock earlier than its parent's.
        last = max(int(ts), last)
        series: dict[str, dict] = {}
        records: dict[str, dict] = {}
        target = None
        old_no = new_no = 0
        for line in body.splitlines():
            if line.startswith("diff --git "):
                path = line.split(" b/", 1)[-1]
                name = path.rsplit("/", 1)[-1]
                if not name.endswith(".csv"):
                    target = None
                elif path.startswith("data/clean/records/"):
                    target = records.setdefault(name[:-4], {"added": [], "removed": []})
                else:
                    target = series.setdefault(name[:-4], {"added": {}, "removed": {}})
                continue
            if target is None or line.startswith(("+++", "---")):
                continue
            hunk = HUNK.match(line)
            if hunk:
                old_no, new_no = int(hunk.group(1)), int(hunk.group(2))
                continue
            if not line or line[0] not in "+-":
                continue
            if line[0] == "-":
                number, old_no = old_no, old_no + 1
            else:
                number, new_no = new_no, new_no + 1
            if number == 1:
                continue  # the CSV header
            if isinstance(target["added"], list):
                target["added" if line[0] == "+" else "removed"].append(line[1:])
                continue
            m = LINE.match(line)
            if not m:
                continue
            sign, sid, period, value = m.groups()
            try:
                number_value = float(value)
            except ValueError:
                continue
            target["added" if sign == "+" else "removed"][(sid, period)] = number_value
        commits.append({
            "sha": sha, "date": utc_day(last), "ts": last, "author": author,
            "subject": subject,
            "by_scraper": author == SCRAPER or bool(SCRAPE_SUBJECT.match(subject)),
            "series": series, "records": records, "raw": raw.get(sha, {}),
        })

    # The Excel parser as it stood at each commit that rewrote the archive.
    specs = [f"{c['sha']}:{EXCEL_PARSER}" for c in commits if EXCEL in c["series"]]
    sources = cat_files(specs)
    for c in commits:
        source = sources.get(f"{c['sha']}:{EXCEL_PARSER}")
        if source is not None:
            m = PARSER_VERSION.search(source)
            c["parser"] = (m.group(1) if m else None,
                           hashlib.sha1(source.encode("utf-8")).hexdigest())
    return commits


def parser_changed(before: tuple | None, now: tuple | None) -> bool:
    """Whether the Excel parser changed between two archive commits.

    PARSER_VERSION decides when both sides carry it. Before it existed, any
    change to the parser's source counts: that is the only way to read the 10
    October 2026 re-dating, which predates the constant, as ours.
    """
    if not before or not now:
        return False
    if before[0] and now[0]:
        return before[0] != now[0]
    return before[1] != now[1]


def raw_behind(commit: dict, name: str, *, modified_only: bool = False) -> bool:
    """Whether CBE served something new behind a clean file in this commit."""
    if name == EXCEL:
        prefix, match = "data/raw/excel/", None
    elif name == "press_derived":
        prefix, match = "data/raw/press/", None
    else:
        prefix, match = "data/raw/series/", name
    for path, status in commit["raw"].items():
        if not path.startswith(prefix):
            continue
        if match and path[len(prefix):].split(".", 1)[0] != match:
            continue
        if modified_only and status != "M":
            continue
        return True
    return False


def record_headers() -> dict[str, list[str]]:
    out = {}
    for path in sorted(RECORDS_DIR.glob("*.csv")):
        with path.open(encoding="utf-8") as fh:
            out[path.stem] = next(csv.reader(fh), [])
    return out


def record_titles() -> dict[str, str]:
    try:
        import yaml
        cfg = yaml.safe_load((ROOT / "ingest" / "datasets.yaml").read_text(encoding="utf-8"))
        return {d["key"]: d.get("title_en") or d["key"] for d in cfg.get("datasets", [])}
    except Exception:  # noqa: BLE001 - a title is a nicety, never a reason to fail
        return {}


def as_number(text: str):
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return text.strip()


def iso_from_dmy(text: str) -> str | None:
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})$", text.strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None


# ---------- the replay ----------

def new_day(date: str) -> dict:
    return {
        "date": date, "commits": [], "moved": [], "moved_total": 0, "backfilled": 0,
        "revised": [], "new_series": [],
        "records": {"added": 0, "examples": []},
        "archive": {"added": 0, "series": [], "latest": None, "changed": 0, "removed": 0,
                    "examples": []},
        "reread": {"changed": 0, "added": 0, "removed": 0, "series_new": 0,
                   "series_gone": 0, "renamed": 0, "why": [], "examples": [],
                   "_new": [], "_gone": []},
        "held_back": 0,
    }


def still_held(state: dict, entry: dict) -> bool:
    value = state.get(entry["series_id"], {}).get(entry["period"])
    return value is not None and tidy(value) == entry["value"]


def close_day(day: dict, state: dict, ts: int, id_map: dict[str, list[str]]) -> None:
    """Finish a day once its last commit is in, against the state at that moment."""
    day["time"] = dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat(timespec="seconds")
    # A reading overwritten later the same day was never that day's news: the
    # re-dating on 10 October 2026 moved what the morning's catch-up had added.
    day["moved"] = [m for m in day["moved"] if still_held(state, m)]
    # Biggest first, measured against each series' usual level, so an exchange
    # rate and an interbank volume can sit in one list.
    day["moved"].sort(key=lambda m: -m["_size"])
    day["moved"] = day["moved"][:MOVED_PER_DAY]
    for m in day["moved"]:
        m.pop("_size", None)
    archive = day["archive"]
    archive["series"] = len(set(archive["series"]))
    held = sorted((e for e in archive["examples"] if still_held(state, e)),
                  key=lambda e: (e["period"], abs(e["value"])), reverse=True)
    archive["latest"] = held[0]["period"] if held else None
    archive["examples"] = held[:10]
    if not (archive["added"] or archive["changed"] or archive["removed"]):
        day.pop("archive")
    if not day["records"]["added"]:
        day.pop("records")
    reread = day["reread"]
    # Ids that changed under a parser rebuild are one series under a new name,
    # not one series withdrawn and another new: catalog/id_map.json says which.
    new_ids, gone_ids = set(reread.pop("_new")), set(reread.pop("_gone"))
    renamed = {old for old in gone_ids if new_ids & set(id_map.get(old, ()))}
    successors = {new for old in renamed for new in id_map[old]} & new_ids
    reread["renamed"] = len(renamed)
    reread["series_gone"] -= len(renamed)
    reread["series_new"] -= len(successors)
    day["reparsed"] = reread["changed"] + reread["added"] + reread["removed"]
    if not (day["reparsed"] or reread["series_new"] or reread["series_gone"]):
        day.pop("reread")
    day["revised"].sort(key=lambda r: (r.get("source", ""), r.get("title", ""), r.get("period") or ""))


def classify(commits: list[dict], catalogue: dict[str, dict],
             conflicts: set[tuple[str, str]],
             id_map: dict[str, list[str]] | None = None) -> list[dict]:
    """Replay the history from an empty repository and file every change."""
    state: dict[str, dict[str, float]] = collections.defaultdict(dict)
    ever: set[str] = set()
    headers = record_headers()
    titles = record_titles()
    computed = {sid for sid, meta in catalogue.items() if meta.get("derived")}
    last_parser = None
    days: list[dict] = []
    id_map = id_map or {}

    def title_of(sid):
        return (catalogue.get(sid) or {}).get("title_en") or sid

    def unit_of(sid):
        return (catalogue.get(sid) or {}).get("unit")

    def reread(day, kind, reason, example=None):
        day["reread"][kind] += 1
        if reason not in day["reread"]["why"]:
            day["reread"]["why"].append(reason)
        if example and len(day["reread"]["examples"]) < 5:
            day["reread"]["examples"].append(example)

    for index, commit in enumerate(commits):
        if not days or days[-1]["date"] != commit["date"]:
            if days:
                close_day(days[-1], state, commits[index - 1]["ts"], id_map)
            days.append(new_day(commit["date"]))
        day = days[-1]
        day["commits"].append(commit["sha"][:10])
        starting = index == 0

        # ---- series: whose change is it ----
        if EXCEL in commit["series"]:
            parser_moved = parser_changed(last_parser, commit.get("parser"))
            last_parser = commit.get("parser")
        else:
            parser_moved = False
        cause: dict[str, str] = {}
        for name in commit["series"]:
            if starting:
                cause[name] = "start"
            elif not commit["by_scraper"]:
                cause[name] = "miqyas"
            elif name == EXCEL and parser_moved:
                cause[name] = "parser"
            elif not name.startswith("derived") and not raw_behind(commit, name):
                cause[name] = "no_source_change"
            else:
                cause[name] = "cbe"

        # (series_id, period) -> [before, after, file, present after]. A key can
        # leave one file and land in another in the same commit: that is a move.
        merged: dict[tuple[str, str], list] = {}
        for name, diff in commit["series"].items():
            for key in diff["removed"]:
                merged.setdefault(key, [state[key[0]].get(key[1]), None, name, False])
            for key, value in diff["added"].items():
                slot = merged.setdefault(key, [state[key[0]].get(key[1]), None, name, False])
                slot[1:] = [value, name, True]
        file_of = {sid: name for (sid, _), (_, _, name, _) in merged.items()}
        had_rows = {sid for sid, _ in merged if state[sid]}
        new_per_series = collections.Counter(
            sid for (sid, _period), (before, _after, _name, present) in merged.items()
            if present and before is None)

        candidates = []
        fresh = []
        for (sid, period), (before, after, name, present) in sorted(merged.items()):
            if before is not None and present and tidy(before) == tidy(after):
                continue  # the same figure written with different float noise
            how = cause[name]
            kind = "added" if before is None else "removed" if not present else "changed"
            if how == "start":
                continue
            if how != "cbe":
                reread(day, kind, how, {"series_id": sid, "title": title_of(sid), "period": period,
                                        "was": tidy(before), "now": tidy(after)}
                       if kind == "changed" else None)
                continue
            if kind != "added":
                if sid in computed or name.startswith("derived"):
                    reread(day, kind, "computed")
                elif (sid, period) in conflicts:
                    reread(day, kind, "conflict")
                else:
                    candidates.append((sid, period, before, after if present else None, name))
                continue
            if sid not in ever:
                continue  # a new series, listed once below
            if name == EXCEL:
                archive = day["archive"]
                archive["added"] += 1
                archive["series"].append(sid)
                archive["examples"].append({"series_id": sid, "title": title_of(sid),
                                            "unit": unit_of(sid), "period": period,
                                            "value": tidy(after)})
            elif new_per_series[sid] > BACKFILL:
                day["backfilled"] += 1
            else:
                fresh.append((sid, period, after))

        # More than CBE restates in a day, whoever committed it.
        held = len(candidates) > REPARSE_SUSPECT
        excel_trusted = (bool((commit.get("parser") or (None,))[0])
                         and raw_behind(commit, EXCEL, modified_only=True))
        for sid, period, before, after, name in candidates:
            if held:
                day["held_back"] += 1
            elif name == EXCEL and not excel_trusted:
                # Until the archive parser carries a PARSER_VERSION it keeps
                # whichever of two values lands last, so a value can change
                # because a new file arrived. Listed, never counted, until then;
                # and only ever counted when a file CBE replaced is behind it.
                day["archive"]["changed" if after is not None else "removed"] += 1
            else:
                entry = {"series_id": sid, "title": title_of(sid), "unit": unit_of(sid),
                         "period": period, "was": tidy(before),
                         "source": "Excel archive" if name == EXCEL else "daily tables"}
                if after is None:
                    entry.update(now=None, withdrawn=True)
                else:
                    entry.update(now=tidy(after), change=tidy(after - before),
                                 pct=round((after - before) / before * 100, 4)
                                 if abs(before) >= NEAR_ZERO else None)
                day["revised"].append(entry)

        for (sid, period), (_before, after, _name, present) in merged.items():
            if present:
                state[sid][period] = after
            else:
                state[sid].pop(period, None)

        # ---- series that arrived or left whole ----
        if starting:
            day["start"] = {"series": sum(1 for s in state if state[s]),
                            "readings": sum(len(v) for v in state.values())}
        else:
            for sid in sorted(new_per_series):
                if sid in ever or not state[sid]:
                    continue
                how = cause[file_of[sid]]
                if how != "cbe":
                    reread(day, "series_new", how)
                    day["reread"]["_new"].append(sid)
                    continue
                periods = sorted(state[sid])
                day["new_series"].append({
                    "series_id": sid, "title": title_of(sid), "n": len(periods),
                    "first": periods[0], "last": periods[-1],
                    "source": "Excel archive" if file_of[sid] == EXCEL else "daily tables"})
            for sid in sorted(had_rows):
                if not state[sid] and cause[file_of[sid]] != "cbe":
                    reread(day, "series_gone", cause[file_of[sid]])
                    day["reread"]["_gone"].append(sid)

        # ---- new readings, against what they joined ----
        for sid, period, value in fresh:
            entry = {"series_id": sid, "title": title_of(sid), "unit": unit_of(sid),
                     "period": period, "value": tidy(value), "_size": 0.0}
            earlier = [p for p in state[sid] if p < period]
            if earlier:
                base = state[sid][max(earlier)]
                change = value - base
                usual = [abs(v) for v in state[sid].values() if abs(v) >= NEAR_ZERO]
                entry.update(previous=tidy(base), change=tidy(change),
                             pct=round(change / base * 100, 4) if abs(base) >= NEAR_ZERO else None,
                             _size=abs(change) / (statistics.median(usual) if usual else 1.0))
            day["moved"].append(entry)
            day["moved_total"] += 1
        ever.update(sid for sid in new_per_series if state[sid])

        # ---- auction tables ----
        for name, diff in commit["records"].items():
            removed = collections.Counter(diff["removed"])
            added = collections.Counter(diff["added"])
            same = removed & added  # CBE reordering its own table is not news
            removed -= same
            added -= same
            if starting or not (removed or added):
                continue
            header = headers.get(name, [])
            key_cols = [i for i, h in enumerate(header) if RECORD_KEY.search(h)]

            def parse(text):
                row = next(csv.reader(io.StringIO(text)), [])
                return (tuple(row[i] for i in key_cols) if len(row) == len(header) else (text,)), row

            def describe(row):
                return "; ".join(f"{header[i]} {row[i]}" for i in key_cols
                                 if len(row) == len(header) and row[i])

            def dated(row):
                for i in key_cols:
                    if len(row) == len(header) and "date" in header[i].lower():
                        iso = iso_from_dmy(row[i])
                        if iso:
                            return iso
                return None

            gone: dict[tuple, list] = collections.defaultdict(list)
            for text in removed.elements():
                key, row = parse(text)
                gone[key].append(row)
            table = titles.get(name, name)
            restated, results = [], []
            for text in added.elements():
                key, row = parse(text)
                if gone.get(key):
                    old = gone[key].pop()
                    for i, (was, now) in enumerate(zip(old, row)):
                        if as_number(was) != as_number(now):
                            restated.append({
                                "table": name, "title": f"{table}, {describe(row)}: {header[i]}",
                                "period": dated(row), "was": as_number(was), "now": as_number(now),
                                "source": "auction tables"})
                    continue
                results.append(row)
            withdrawn = [row for rows in gone.values() for row in rows]

            if not commit["by_scraper"] or not raw_behind(commit, name):
                how = "miqyas" if not commit["by_scraper"] else "no_source_change"
                for kind, n in (("added", len(results)), ("changed", len(restated)),
                                ("removed", len(withdrawn))):
                    for _ in range(n):
                        reread(day, kind, how)
                continue
            day["records"]["added"] += len(results)
            for row in results:
                if len(day["records"]["examples"]) < 10:
                    day["records"]["examples"].append({
                        "table": name, "title": table, "detail": describe(row), "period": dated(row)})
            if len(restated) + len(withdrawn) > REPARSE_SUSPECT:
                day["held_back"] += len(restated) + len(withdrawn)
                continue
            day["revised"].extend(restated)
            for row in withdrawn:
                day["revised"].append({
                    "table": name, "title": f"{table}, {describe(row)}", "period": dated(row),
                    "was": ",".join(row), "now": None, "withdrawn": True, "source": "auction tables"})

    if days:
        close_day(days[-1], state, commits[-1]["ts"], id_map)
    return sorted(days, key=lambda d: d["date"], reverse=True)


# ---------- the vintage table ----------

def vintages(commits: list[dict]) -> list[tuple]:
    """Every value the clean series have held, with the days it was held.

    One row per (series_id, period, value, first_seen, last_seen). Days are UTC
    and end-of-day: a value written and overwritten within one day never was
    that day's figure and is left out. `last_seen` is the last day the value
    was held, or None while it still is. "What did this series read on day D"
    is every row with first_seen <= D and (last_seen is None or last_seen >= D).
    """
    by_day: dict[str, dict] = {}
    for commit in commits:
        end = by_day.setdefault(commit["date"], {})
        added: dict[tuple[str, str], float] = {}
        for diff in commit["series"].values():
            added.update(diff["added"])
        for diff in commit["series"].values():
            for key in diff["removed"]:
                if key not in added:
                    end[key] = None
        end.update(added)

    current: dict[tuple[str, str], tuple[float, str]] = {}
    rows: list[tuple] = []
    for date in sorted(by_day):
        day_before = (dt.date.fromisoformat(date) - dt.timedelta(days=1)).isoformat()
        for key, value in by_day[date].items():
            held = current.get(key)
            if held and value is not None and held[0] == value:
                continue
            if held:
                rows.append((key[0], key[1], held[0], held[1], day_before))
                del current[key]
            if value is not None:
                current[key] = (value, date)
    rows.extend((sid, period, value, first, None)
                for (sid, period), (value, first) in current.items())
    rows.sort(key=lambda r: (r[0], r[1], r[3]))
    return rows


# ---------- the feeds ----------

def plural(n: int, word: str, many: str | None = None) -> str:
    return f"{n:,} {word if n == 1 else (many or word + 's')}"


def headline(day: dict) -> str:
    bits = []
    if day["moved_total"]:
        bits.append(plural(day["moved_total"], "new reading"))
    if day["revised"]:
        bits.append(plural(len(day["revised"]), "figure") + " revised")
    if day["new_series"]:
        bits.append(plural(len(day["new_series"]), "new series", "new series"))
    if day.get("records"):
        bits.append(plural(day["records"]["added"], "auction result"))
    if day.get("archive"):
        bits.append("Excel archive update, " + plural(day["archive"]["added"], "reading") + " added")
    if day.get("reread"):
        bits.append(f"{day['reparsed']:,} re-read by Miqyas")
    if day["held_back"]:
        bits.append(f"{day['held_back']:,} held back")
    if day.get("start"):
        bits.append("the record begins")
    return ", ".join(bits) if bits else "nothing changed"


def nice(iso: str | None) -> str:
    try:
        return dt.date.fromisoformat(iso).strftime("%d %b %Y").lstrip("0")
    except (TypeError, ValueError):
        return iso or ""


def num(v, unit=None) -> str:
    if v is None:
        return "nothing"
    if isinstance(v, str):
        return v
    x = tidy(v)
    # Six significant figures, written out: 72,713,500,000 rather than 7.27135e+10.
    text = f"{int(x):,}" if x == int(x) and abs(x) < 1e15 else (f"{x:,}" if abs(x) >= 1e-4 else f"{x:g}")
    return f"{text} {unit}" if unit else text


def rss(days: list[dict], *, path: pathlib.Path, title: str, description: str,
        link: str, only_revisions: bool) -> int:
    items = []
    for day in days:
        if only_revisions and not day["revised"]:
            continue
        body = []
        if day["revised"]:
            body.append("<p><b>Revised after publication</b></p><ul>")
            for r in day["revised"][:40]:
                when = f" for {nice(r['period'])}" if r.get("period") else ""
                if r.get("withdrawn"):
                    body.append(f"<li>{html.escape(r['title'])}{when}: no longer published, "
                                f"was {html.escape(num(r['was'], r.get('unit')))}</li>")
                else:
                    body.append(f"<li>{html.escape(r['title'])}{when}: "
                                f"{html.escape(num(r['was'], r.get('unit')))} revised to "
                                f"{html.escape(num(r['now'], r.get('unit')))}</li>")
            body.append("</ul>")
        if not only_revisions:
            if day["new_series"]:
                body.append("<p><b>New series</b></p><ul>" + "".join(
                    f"<li>{html.escape(n['title'])}, {n['n']:,} readings "
                    f"from {nice(n['first'])}</li>" for n in day["new_series"][:20]) + "</ul>")
            if day["moved"]:
                body.append("<p><b>New readings, biggest moves</b></p><ul>" + "".join(
                    f"<li>{html.escape(m['title'])}: {html.escape(num(m['value'], m.get('unit')))}"
                    + (f", previously {html.escape(num(m['previous']))}" if "previous" in m else "")
                    + f" ({nice(m['period'])})</li>" for m in day["moved"][:20]) + "</ul>")
            if day.get("records"):
                body.append(f"<p><b>Auction results</b>: {day['records']['added']:,} new</p>")
            if day.get("archive"):
                a = day["archive"]
                body.append(f"<p><b>Excel archive update</b>: {a['added']:,} readings added "
                            f"across {a['series']:,} series"
                            + (f", newest for {nice(a['latest'])}" if a.get("latest") else "")
                            + (f"; {a['changed'] + a['removed']:,} values changed or removed, "
                               "not counted as revisions" if a["changed"] or a["removed"] else "")
                            + ".</p>")
            if day.get("reread"):
                r = day["reread"]
                body.append(f"<p><b>Re-read by Miqyas, not changed by CBE</b>: "
                            f"{r['changed']:,} values changed, {r['added']:,} added and "
                            f"{r['removed']:,} removed.</p>")
            if day["held_back"]:
                body.append(f"<p><b>Held back</b>: {day['held_back']:,} changes in one go, "
                            "too many to treat as revisions without a check.</p>")
        if not body:
            continue
        stamp = dt.datetime.fromisoformat(day["time"])
        items.append(
            "  <item>\n"
            f"    <title>{html.escape(nice(day['date']))}: {html.escape(headline(day))}</title>\n"
            f"    <link>{link}</link>\n"
            f"    <guid isPermaLink=\"false\">miqyas-{'rev-' if only_revisions else ''}{day['date']}</guid>\n"
            f"    <pubDate>{stamp.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>\n"
            f"    <description>{html.escape(''.join(body))}</description>\n"
            "  </item>\n")

    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n'
        f"  <title>{html.escape(title)}</title>\n"
        f"  <link>{link}</link>\n"
        f"  <description>{html.escape(description)}</description>\n"
        "  <language>en</language>\n"
        f'  <atom:link href="{SITE_URL}{path.name}" rel="self" type="application/rss+xml"/>\n'
        f"  <lastBuildDate>{dt.datetime.now(dt.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>\n"
        + "".join(items) + "</channel>\n</rss>\n",
        encoding="utf-8")
    return len(items)


def load_id_map() -> dict[str, list[str]]:
    """catalog/id_map.json, old id -> new id(s), once the archive ids have changed."""
    path = ROOT / "catalog" / "id_map.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and isinstance(raw.get("map"), dict):
        raw = raw["map"]
    if not isinstance(raw, dict):
        return {}
    return {old: [new] if isinstance(new, str) else list(new or []) for old, new in raw.items()}


def coverage(commits: list[dict]) -> dict:
    """What is checked for revisions, for the page to say in plain words."""
    manifest = ROOT / "catalog" / "excel_manifest.json"
    excel_checked = False
    if manifest.exists():
        files = json.loads(manifest.read_text(encoding="utf-8")).get("files", [])
        excel_checked = any(f.get("last_modified") for f in files)
    parser = (ROOT / EXCEL_PARSER).read_text(encoding="utf-8") if (ROOT / EXCEL_PARSER).exists() else ""
    return {
        "since": commits[0]["date"] if commits else None,
        "excel_files_checked": excel_checked,
        "excel_revisions_counted": bool(PARSER_VERSION.search(parser)),
    }


def main() -> int:
    if not (API / "series.json").exists():
        print("dist/api/v1/series.json is missing. Run build_exports.py first.", file=sys.stderr)
        return 1

    depth = git("rev-list", "--count", "HEAD").strip()
    if depth in ("", "1"):
        print("only one commit of history is available: this needs a full clone "
              "(actions/checkout with fetch-depth: 0). Writing an empty feed.",
              file=sys.stderr)

    catalogue = {s["series_id"]: s
                 for s in json.loads((API / "series.json").read_text(encoding="utf-8"))}
    # series.json in the API drops `derived`; the catalogue has it.
    for entry in json.loads((ROOT / "catalog" / "series.json").read_text(encoding="utf-8")):
        if entry.get("derived") and entry["series_id"] in catalogue:
            catalogue[entry["series_id"]]["derived"] = True
        elif entry.get("derived"):
            catalogue[entry["series_id"]] = entry

    anomalies = []
    conflicts: set[tuple[str, str]] = set()
    path = ROOT / "data" / "clean" / "anomalies.csv"
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                meta = catalogue.get(row["series_id"], {})
                conflicts.add((row["series_id"], row["period"]))
                anomalies.append({
                    "series_id": row["series_id"],
                    "title": meta.get("title_en") or row["series_id"],
                    "period": row["period"], "kept": row["kept"],
                    "discarded": row["discarded"], "dataset": row["dataset"],
                })

    commits = read_commits()
    since = (dt.date.today() - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    days = ([d for d in classify(commits, catalogue, conflicts, load_id_map()) if d["date"] >= since]
            if commits else [])

    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "window_days": WINDOW_DAYS,
        "history_commits": int(depth) if depth.isdigit() else None,
        "moved_per_day_cap": MOVED_PER_DAY,
        "coverage": coverage(commits),
        "days": days,
        "anomalies": anomalies,
        "note": ("Built from this repository's own git history. CBE overwrites its files in "
                 "place when it revises a figure, so a revision is only visible to something "
                 "that kept the previous copy. Values Miqyas re-read, and series it computes, "
                 "are counted separately and never as revisions."),
    }
    (API / "changes.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    all_items = rss(days, path=DIST / "changes.xml",
                    title="Miqyas: what changed in Egypt's data",
                    description="What the Central Bank of Egypt published each day, and any "
                                "revisions. Independent; not affiliated with CBE.",
                    link=SITE_URL + "#/changes", only_revisions=False)
    rev_items = rss(days, path=DIST / "changes-revisions.xml",
                    title="Miqyas: CBE revisions",
                    description="Figures the Central Bank of Egypt changed after publishing them. "
                                "Low volume. Independent; not affiliated with CBE.",
                    link=SITE_URL + "#/changes", only_revisions=True)

    revisions = sum(len(d["revised"]) for d in days)
    reread = sum(d.get("reparsed", 0) for d in days)
    held = sum(d["held_back"] for d in days)
    moved = sum(d["moved_total"] for d in days)
    archive = sum(d.get("archive", {}).get("added", 0) for d in days)
    print(f"changes: {len(days)} days over {WINDOW_DAYS}, {moved:,} new readings, "
          f"{archive:,} added by archive updates, {revisions} revised by CBE, "
          f"{reread:,} re-read by Miqyas, {held:,} held back, "
          f"{len(anomalies)} same-day conflicts on record")
    print(f"  changes.xml {all_items} items · changes-revisions.xml {rev_items} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
