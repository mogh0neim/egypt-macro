"""How the data jobs are doing, in one file, and whether anyone should be told.

The weekly job once failed seven Sundays running and nothing on the site said
so: the daily job kept the freshness strip green the whole time. This reads
the repository rather than the site, so it sees both jobs:

  - when the daily job last saved data (catalog/last_run.json, its heartbeat)
  - when the weekly job last ran (catalog/weekly_run.json, its heartbeat, or
    the last `archive:` commit before that file existed)
  - how many Excel files are quarantined, against the version before
  - rows in every clean table, against the version before the last change

and writes health.json. A problem is: the daily job over 30 hours old, the
weekly job over 9 days old, the quarantine growing, or a table losing rows in
a scraper commit. Row and quarantine changes count only for 48 hours after
they land, so one fall raises one alarm rather than one every night.

Standard library only, so the nightly watchdog needs no install.

Run:  python ingest/health.py [--out PATH] [--problems PATH] [--now ISO]
      --now pretends it is that time, to see what a stale job would raise.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DAILY_MAX_HOURS = 30
WEEKLY_MAX_DAYS = 9
LOOKBACK_HOURS = 48
SCRAPER = "egypt-macro-bot"
TABLES = ("data/clean/series", "data/clean/records")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout


def parse_time(text: str | None) -> dt.datetime | None:
    if not text:
        return None
    try:
        when = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=dt.timezone.utc)


def read_json(path: pathlib.Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def last_commit(*args: str) -> dt.datetime | None:
    out = git("log", "-1", "--format=%ct", *args).strip()
    return dt.datetime.fromtimestamp(int(out), dt.timezone.utc) if out.isdigit() else None


def daily_run() -> dt.datetime | None:
    beat = read_json(ROOT / "catalog" / "last_run.json") or {}
    return parse_time(beat.get("retrieved_at")) or last_commit(
        f"--author={SCRAPER}", "-E", "--grep=^(data|check):")


def weekly_run() -> dt.datetime | None:
    """The older half of the weekly job: both halves have to have run."""
    beat = read_json(ROOT / "catalog" / "weekly_run.json") or {}
    times = [parse_time(part.get("checked_at")) for part in beat.values() if isinstance(part, dict)]
    times = [t for t in times if t]
    if times:
        return min(times)
    return last_commit("-E", "--grep=^archive:")


def count_rows(text: str) -> int:
    return max(len([line for line in text.splitlines() if line.strip()]) - 1, 0)


def last_change(path: str) -> tuple[str, dt.datetime, str] | None:
    out = git("log", "-1", "--format=%H%x1f%ct%x1f%an", "--", path).strip()
    parts = out.split("\x1f")
    if len(parts) != 3:
        return None
    return parts[0], dt.datetime.fromtimestamp(int(parts[1]), dt.timezone.utc), parts[2]


def code_changed(sha: str, rel: str) -> bool:
    """Whether ingest/ changed between the previous version of `rel` and `sha`.

    A table that shrinks because the code that builds it was rewritten is
    explained, not a fault: the Excel date fix of 10 October 2026 collapsed
    1,927 misdated rows on purpose, and would otherwise have emailed an alarm
    for something already known. It is still recorded in health.json.
    """
    prev = git("log", "-1", "--format=%H", f"{sha}^", "--", rel).strip()
    return bool(prev) and bool(git("log", "--format=%H", f"{prev}..{sha}", "--", "ingest/").strip())


def tables(now: dt.datetime) -> tuple[dict, list[str]]:
    """Rows per clean table, and any that fell in a recent scraper commit."""
    out: dict[str, dict] = {}
    problems: list[str] = []
    for folder in TABLES:
        for path in sorted((ROOT / folder).glob("*.csv")):
            rel = path.relative_to(ROOT).as_posix()
            rows = count_rows(path.read_text(encoding="utf-8", errors="replace"))
            entry: dict = {"rows": rows}
            change = last_change(rel)
            if change:
                sha, when, author = change
                entry["changed_at"] = when.isoformat(timespec="seconds")
                if now - when <= dt.timedelta(hours=LOOKBACK_HOURS):
                    before = git("show", f"{sha}^:{rel}")
                    if before:
                        entry["previous"] = count_rows(before)
                        if author == SCRAPER and rows < entry["previous"] and code_changed(sha, rel):
                            entry["explained"] = "the code that builds this table changed"
                        elif author == SCRAPER and rows < entry["previous"]:
                            problems.append(
                                f"`{rel}` fell from {entry['previous']:,} to {rows:,} rows in "
                                f"{sha[:10]} ({entry['changed_at']}).")
            out[rel] = entry
    return out, problems


def quarantine(now: dt.datetime) -> tuple[dict, list[str]]:
    rel = "catalog/excel_quarantine.json"
    now_q = read_json(ROOT / rel) or {}
    entry = {"count": now_q.get("count", 0)}
    problems: list[str] = []
    change = last_change(rel)
    if change and now - change[1] <= dt.timedelta(hours=LOOKBACK_HOURS):
        try:
            before = json.loads(git("show", f"{change[0]}^:{rel}") or "{}")
        except ValueError:
            before = {}
        entry["previous"] = before.get("count", 0)
        if entry["count"] > entry["previous"] and code_changed(change[0], rel):
            entry["explained"] = "the parser changed; see catalog/excel_quarantine.json"
        elif entry["count"] > entry["previous"]:
            problems.append(f"Quarantined Excel files grew from {entry['previous']} to "
                            f"{entry['count']} in {change[0][:10]}.")
    return entry, problems


def build(now: dt.datetime) -> dict:
    problems: list[str] = []
    daily, weekly = daily_run(), weekly_run()
    health: dict = {"generated": now.isoformat(timespec="seconds")}

    if daily:
        hours = (now - daily).total_seconds() / 3600
        health["daily"] = {"last_run": daily.isoformat(timespec="seconds"), "hours_ago": round(hours, 1)}
        if hours > DAILY_MAX_HOURS:
            problems.append(f"The daily job last saved data {hours:.0f} hours ago "
                            f"({daily:%d %b %Y %H:%M} UTC); the limit is {DAILY_MAX_HOURS}.")
    else:
        problems.append("No record of the daily job ever running (catalog/last_run.json).")

    if weekly:
        days = (now - weekly).total_seconds() / 86400
        health["weekly"] = {"last_run": weekly.isoformat(timespec="seconds"), "days_ago": round(days, 1)}
        if days > WEEKLY_MAX_DAYS:
            problems.append(f"The weekly archive job last ran {days:.1f} days ago "
                            f"({weekly:%d %b %Y} UTC); the limit is {WEEKLY_MAX_DAYS}.")
    else:
        problems.append("No record of the weekly archive job ever running.")

    health["quarantine"], found = quarantine(now)
    problems += found
    health["tables"], found = tables(now)
    problems += found
    unparsed = read_json(ROOT / "corpus" / "unparsed_releases.json")
    health["unparsed_releases"] = len(unparsed) if isinstance(unparsed, list) else None
    health["problems"] = problems
    return health


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "dist" / "health.json"))
    ap.add_argument("--problems", help="write the problems here as Markdown, only if there are any")
    ap.add_argument("--now", help="pretend it is this UTC time (ISO), for a dry run")
    args = ap.parse_args()

    now = parse_time(args.now) if args.now else dt.datetime.now(dt.timezone.utc)
    if now is None:
        print(f"--now: cannot read {args.now!r}", file=sys.stderr)
        return 2
    health = build(now.replace(microsecond=0))

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(health, indent=1) + "\n", encoding="utf-8")

    daily = health.get("daily", {})
    weekly = health.get("weekly", {})
    print(f"daily  {daily.get('last_run', 'never')} ({daily.get('hours_ago', '?')} h ago)")
    print(f"weekly {weekly.get('last_run', 'never')} ({weekly.get('days_ago', '?')} days ago)")
    print(f"quarantine {health['quarantine']}; {len(health['tables'])} tables; "
          f"{health['unparsed_releases']} unparsed releases")
    print(f"wrote {out}")
    if health["problems"]:
        print(f"\n{len(health['problems'])} problem(s):")
        for p in health["problems"]:
            print(f"  - {p}")
        if args.problems:
            pathlib.Path(args.problems).write_text(
                "The nightly watchdog found something wrong with the data jobs.\n\n"
                + "".join(f"- {p}\n" for p in health["problems"])
                + "\nClose this issue once it is dealt with. The watchdog opens a new one "
                  "the next night if anything is still wrong.\n",
                encoding="utf-8")
    else:
        print("no problems")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
