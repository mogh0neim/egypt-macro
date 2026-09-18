"""Read the git history as a feed of what CBE changed.

This is the one thing here nobody else can publish.

CBE overwrites its files in place when it revises a figure. The Excel sheet at
a URL today is not the sheet that was there last month, and there is no
changelog, no vintage, and no way to ask what a number read on a past date.
This repository commits every clean file every morning, so the history *is* the
record of revisions, and it is a record that exists nowhere else and cannot be
reconstructed after the fact.

Nothing had ever read it. The site could show today's number and every number
before it, and could not show the one thing it alone knew: that a number had
been quietly changed.

`data/clean/series/*.csv` is `series_id,period,value`, and `fetch_series.py`
sorts by `(series_id, period)` before writing, so each series occupies a
contiguous block and a new reading appends inside its own block rather than at
the end of the file. That is what makes `git log -p --unified=0` readable:

  - a lone `+` line is **a new reading**
  - a `-`/`+` pair on the same `series_id,period` with a different value is
    **a revision**, which is the newsworthy one
  - a commit that adds hundreds of readings for one series at once is a new
    series or a backfill, not news, and is collapsed into a single line

Requires the full history. `actions/checkout@v4` clones at depth 1 by default
and this then sees nothing at all, which is why publish.yml sets
`fetch-depth: 0`.

Run:  python ingest/build_changes.py
"""

from __future__ import annotations

import collections
import csv
import datetime as dt
import html
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES_DIR = ROOT / "data" / "clean" / "series"
DIST = ROOT / "dist"
API = DIST / "api" / "v1"

SITE_URL = "https://mogh0neim.github.io/egypt-macro/"

WINDOW_DAYS = 180
# A daily scrape moves a few hundred numbers across 1,318 series. All of them
# in one JSON the browser has to parse is a few megabytes for a page nobody
# reads to the end; the most interesting forty and an honest total is the same
# information at a hundredth of the size.
MOVED_PER_DAY = 40
# One commit adding more than this for a single series is a backfill or a new
# series arriving, not a day's news. The daily scrape adds one to three.
BACKFILL = 10

LINE = re.compile(r"^([+-])([A-Za-z0-9._-]+),(\d{4}-\d{2}-\d{2}),(.+)$")

# Who changed the number, which is the whole point.
#
# A commit by the scraper means CBE published something different from what CBE
# published before: that is a revision, and it is the thing this feed exists
# for. A commit by a person means the parser changed and the *reading* changed,
# which is our correction and not CBE's revision. Calling the second one a CBE
# revision would be a lie, and it is the exact lie that would destroy the only
# reason to trust this page.
#
# The first pass got this wrong and reported 34,877 "CBE revisions" in one day.
# They were commit 5ae8e0b recovering units for the Excel archive.
SCRAPER = "egypt-macro-bot"
SCRAPE_SUBJECT = re.compile(r"^(data|check|archive):")
# Even a scraper commit can carry a reparse, if a person changed the parser and
# left the rewrite to the next run. CBE does not restate five hundred figures in
# a morning, so a commit that looks like it did is treated as a reparse and kept
# out of the revisions feed rather than trusted.
REPARSE_SUSPECT = 500


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                          text=True, encoding="utf-8", errors="replace").stdout


def current_values() -> dict[str, list[tuple[str, float]]]:
    """Every series as it stands now, so a new reading can say what it moved from.

    `--unified=0` gives no context lines, so the diff alone cannot say what the
    previous value was. The files on disk can, and reading all sixteen of them
    costs about a second.
    """
    out: dict[str, list[tuple[str, float]]] = collections.defaultdict(list)
    for path in sorted(SERIES_DIR.glob("*.csv")):
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                try:
                    out[row["series_id"]].append((row["period"], float(row["value"])))
                except (ValueError, KeyError):
                    continue
    for values in out.values():
        values.sort()
    return out


def previous_reading(values: list[tuple[str, float]], period: str):
    prior = None
    for p, v in values:
        if p >= period:
            break
        prior = (p, v)
    return prior


def read_history(since: str) -> list[dict]:
    """Every commit touching the clean series, newest first, already parsed."""
    raw = git("log", f"--since={since}", "--format=%x00%H%x1f%ad%x1f%an%x1f%s",
              "--date=short", "-p", "--unified=0", "--", "data/clean/series/")
    commits = []
    for chunk in raw.split("\x00")[1:]:
        header, _, body = chunk.partition("\n")
        parts = header.split("\x1f")
        if len(parts) < 4:
            continue
        sha, date, author, subject = parts[0], parts[1], parts[2], parts[3]
        added: dict[tuple[str, str], float] = {}
        removed: dict[tuple[str, str], float] = {}
        for line in body.splitlines():
            if line.startswith(("+++", "---")):
                continue
            m = LINE.match(line)
            if not m:
                continue
            sign, sid, period, value = m.groups()
            try:
                number = float(value)
            except ValueError:
                continue
            (added if sign == "+" else removed)[(sid, period)] = number
        restated = sum(1 for key in added if key in removed and added[key] != removed[key])
        by_scraper = author == SCRAPER or bool(SCRAPE_SUBJECT.match(subject))
        commits.append({
            "sha": sha[:10], "date": date, "author": author, "subject": subject,
            "added": added, "removed": removed,
            "from_cbe": by_scraper and restated <= REPARSE_SUSPECT,
            "restated": restated,
        })
    return commits


def classify(commits: list[dict], catalogue: dict[str, dict], values: dict) -> list[dict]:
    """Group the parsed commits into one entry per day."""
    by_day: dict[str, dict] = {}

    for commit in commits:
        day = by_day.setdefault(commit["date"], {
            "date": commit["date"], "commits": [], "moved": [], "revised": [],
            "new_series": [], "reparsed": 0, "reparsed_examples": [],
        })
        day["commits"].append(commit["sha"])

        added, removed = commit["added"], commit["removed"]
        per_series = collections.Counter(sid for sid, _ in added)

        for (sid, period), value in sorted(added.items()):
            meta = catalogue.get(sid, {})
            title = meta.get("title_en") or sid
            unit = meta.get("unit")

            if (sid, period) in removed:
                was = removed[(sid, period)]
                if was == value:
                    continue
                if not commit["from_cbe"]:
                    # Our parser changed, not CBE's figure. Counted, never
                    # dressed up as a revision.
                    day["reparsed"] += 1
                    if len(day["reparsed_examples"]) < 5:
                        day["reparsed_examples"].append({
                            "series_id": sid, "title": title, "period": period,
                            "was": was, "now": value,
                        })
                    continue
                day["revised"].append({
                    "series_id": sid, "title": title, "unit": unit, "period": period,
                    "was": was, "now": value,
                    "change": round(value - was, 6),
                    "pct": round((value - was) / was * 100, 4) if was else None,
                })
                continue

            if per_series[sid] > BACKFILL:
                continue  # collapsed below, once per series

            prior = previous_reading(values.get(sid, []), period)
            entry = {"series_id": sid, "title": title, "unit": unit,
                     "period": period, "value": value}
            if prior:
                entry["previous"] = prior[1]
                entry["change"] = round(value - prior[1], 6)
                entry["pct"] = round((value - prior[1]) / prior[1] * 100, 4) if prior[1] else None
            day["moved"].append(entry)

        for sid, count in per_series.items():
            if count > BACKFILL:
                periods = sorted(p for s, p in added if s == sid)
                meta = catalogue.get(sid, {})
                day["new_series"].append({
                    "series_id": sid, "title": meta.get("title_en") or sid,
                    "n": count, "first": periods[0], "last": periods[-1],
                })

        # A value that disappeared entirely: CBE withdrew a reading. Rarer than
        # a revision and worth the same attention.
        for (sid, period), was in sorted(removed.items()):
            if (sid, period) in added:
                continue
            if not commit["from_cbe"]:
                day["reparsed"] += 1
                continue
            meta = catalogue.get(sid, {})
            day["revised"].append({
                "series_id": sid, "title": meta.get("title_en") or sid,
                "unit": meta.get("unit"), "period": period,
                "was": was, "now": None, "withdrawn": True,
            })

    days = sorted(by_day.values(), key=lambda d: d["date"], reverse=True)
    for day in days:
        day["moved_total"] = len(day["moved"])
        # Biggest relative move first: a t-bill yield moving 30bp is the story,
        # and forty daily FX fixings that each moved 0.1% are not.
        day["moved"].sort(key=lambda m: -abs(m.get("pct") or 0))
        day["moved"] = day["moved"][:MOVED_PER_DAY]
        day["revised"].sort(key=lambda r: -abs(r.get("pct") or 0))
    return days


# ---------- the feeds ----------

def headline(day: dict) -> str:
    bits = []
    if day["moved_total"]:
        bits.append(f"{day['moved_total']} number{'s' if day['moved_total'] != 1 else ''} moved")
    if day["revised"]:
        bits.append(f"{len(day['revised'])} revised by CBE")
    if day["new_series"]:
        bits.append(f"{len(day['new_series'])} new series")
    if day["reparsed"]:
        bits.append(f"{day['reparsed']:,} reread here")
    return ", ".join(bits) if bits else "nothing changed"


def nice(iso: str) -> str:
    try:
        return dt.date.fromisoformat(iso).strftime("%d %b %Y").lstrip("0")
    except ValueError:
        return iso


def rss(days: list[dict], *, path: pathlib.Path, title: str, description: str,
        link: str, only_revisions: bool) -> int:
    items = []
    for day in days:
        if only_revisions and not day["revised"]:
            continue
        body = []
        if day["revised"]:
            body.append("<p><b>Revised by CBE after publication</b></p><ul>")
            for r in day["revised"][:40]:
                if r.get("withdrawn"):
                    body.append(f"<li>{html.escape(r['title'])} for {nice(r['period'])}: "
                                f"withdrawn, was {r['was']:g}</li>")
                else:
                    body.append(f"<li>{html.escape(r['title'])} for {nice(r['period'])}: "
                                f"{r['was']:g} restated as {r['now']:g}</li>")
            body.append("</ul>")
        if not only_revisions:
            if day["new_series"]:
                body.append("<p><b>New series</b></p><ul>" + "".join(
                    f"<li>{html.escape(n['title'])}, {n['n']:,} readings "
                    f"from {nice(n['first'])}</li>" for n in day["new_series"][:20]) + "</ul>")
            if day["moved"]:
                body.append("<p><b>Biggest moves</b></p><ul>" + "".join(
                    f"<li>{html.escape(m['title'])}: {m['value']:g}"
                    + (f" from {m['previous']:g}" if "previous" in m else "")
                    + f" ({nice(m['period'])})</li>" for m in day["moved"][:20]) + "</ul>")
        if not body:
            continue
        # RFC 822, in GMT, because a feed reader is entitled to a real date.
        stamp = dt.datetime.fromisoformat(day["date"] + "T12:00:00+00:00")
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
    since = (dt.date.today() - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    commits = read_history(since)
    days = classify(commits, catalogue, current_values()) if commits else []

    anomalies = []
    path = ROOT / "data" / "clean" / "anomalies.csv"
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                meta = catalogue.get(row["series_id"], {})
                anomalies.append({
                    "series_id": row["series_id"],
                    "title": meta.get("title_en") or row["series_id"],
                    "period": row["period"], "kept": row["kept"],
                    "discarded": row["discarded"], "dataset": row["dataset"],
                })

    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "window_days": WINDOW_DAYS,
        "history_commits": int(depth) if depth.isdigit() else None,
        "moved_per_day_cap": MOVED_PER_DAY,
        "days": days,
        "anomalies": anomalies,
        "note": ("Built from this repository's own git history. CBE overwrites its files in "
                 "place when it revises a figure, so a revision is only visible to something "
                 "that kept the previous copy."),
    }
    (API / "changes.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    all_items = rss(days, path=DIST / "changes.xml",
                    title="Miqyas: what changed in Egypt's data",
                    description="What the Central Bank of Egypt published, and what it quietly "
                                "restated, every morning.",
                    link=SITE_URL + "#/changes", only_revisions=False)
    rev_items = rss(days, path=DIST / "changes-revisions.xml",
                    title="Miqyas: CBE revisions only",
                    description="Only the figures the Central Bank of Egypt changed after "
                                "publishing them. Deliberately low volume.",
                    link=SITE_URL + "#/changes", only_revisions=True)

    revisions = sum(len(d["revised"]) for d in days)
    reparsed = sum(d["reparsed"] for d in days)
    moved = sum(d["moved_total"] for d in days)
    print(f"changes: {len(days)} days over {WINDOW_DAYS}, {moved:,} readings added, "
          f"{revisions} revised by CBE, {reparsed:,} reread by our own parser, "
          f"{len(anomalies)} same-day conflicts on record")
    print(f"  changes.xml {all_items} items · changes-revisions.xml {rev_items} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
