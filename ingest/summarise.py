"""Summarise every series: coverage, latest value, extremes, and data-quality flags.

Serves two purposes at once.

Verification -- a run that silently halves a series shows up here as a coverage
change, and the quality flags surface the places where CBE's own data is odd
(zero-filled rows in the FX series, duplicate periods, long gaps).

Product -- `catalog/summary.json` is exactly the Last / Previous / Highest /
Lowest table the homepage needs, precomputed at build time so the browser
never has to scan a series to render a tile.

Run:  python ingest/summarise.py [--check | --dates | --shrink [--restore] | --calendar]
      --check exits non-zero if any series trips a hard quality rule,
      including an observation dated after today or before 1950.
      --dates runs only that date rule, writes nothing, for the publish job.
      --shrink compares every clean CSV with the last commit and exits
      non-zero if one lost rows or series; --restore puts the committed copy
      back, so a short CBE response is flagged but never saved over the record.
      --calendar checks only the MPC calendar. It warns, never fails.
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import pathlib
import statistics
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES = ROOT / "data" / "clean" / "series"
RECORDS = ROOT / "data" / "clean" / "records"
CATALOG = ROOT / "catalog"

# No observation can be dated after the day it was built, and nothing CBE
# publishes goes back before this. Either one is a parsing error: the old
# Excel parser once dated $34bn of external debt to 2086.
EARLIEST = "1950-01-01"

# A daily series that has not moved in this long is probably discontinued
# rather than merely quiet. Reported, not fatal -- several CBE series really
# did stop (the FX auctions ended in 2016).
STALE_DAYS = {"D": 21, "W": 45, "BW": 45, "M": 75, "Q": 200, "IRR": 3650}


def load_series() -> dict[str, list[tuple[str, float]]]:
    data: dict[str, list[tuple[str, float]]] = collections.defaultdict(list)
    for path in sorted(SERIES.glob("*.csv")):
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                try:
                    data[row["series_id"]].append((row["period"], float(row["value"])))
                except (ValueError, KeyError):
                    continue
    for points in data.values():
        points.sort()
    return data


def summarise(sid: str, points: list[tuple[str, float]], meta: dict) -> dict:
    periods = [p for p, _ in points]
    values = [v for _, v in points]

    hi_i = max(range(len(values)), key=values.__getitem__)
    lo_i = min(range(len(values)), key=values.__getitem__)

    flags: list[str] = []

    dupes = [p for p, n in collections.Counter(periods).items() if n > 1]
    if dupes:
        flags.append(f"duplicate periods: {len(dupes)} (e.g. {sorted(dupes)[0]})")

    zeros = sum(1 for v in values if v == 0)
    if zeros and zeros < len(values) * 0.5:
        flags.append(f"{zeros} zero values (CBE publishes 0 where no rate was set)")

    freq = (meta or {}).get("freq")
    if freq in STALE_DAYS and periods:
        last = dt.date.fromisoformat(periods[-1])
        age = (dt.date.today() - last).days
        if age > STALE_DAYS[freq]:
            flags.append(f"no new value in {age} days (discontinued?)")

    # Largest single-step move, which is how the devaluation events get found.
    biggest = None
    if len(values) > 1:
        moves = []
        for i in range(1, len(values)):
            prev = values[i - 1]
            if prev:
                moves.append((abs((values[i] - prev) / prev), periods[i], values[i] - prev))
        if moves:
            pct, when, delta = max(moves)
            biggest = {"period": when, "pct_change": round(pct * 100, 2), "change": round(delta, 6)}

    return {
        "series_id": sid,
        "title_en": (meta or {}).get("title_en"),
        "family": (meta or {}).get("family"),
        "freq": freq,
        "unit": (meta or {}).get("unit"),
        "n": len(values),
        "first_period": periods[0],
        "last_period": periods[-1],
        "last": values[-1],
        "previous": values[-2] if len(values) > 1 else None,
        "highest": {"value": values[hi_i], "period": periods[hi_i]},
        "lowest": {"value": values[lo_i], "period": periods[lo_i]},
        "median": round(statistics.median(values), 6),
        "biggest_move": biggest,
        "flags": flags,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 on a hard failure")
    ap.add_argument("--dates", action="store_true",
                    help="check only observation dates; exit 1 on any after today or before 1950")
    ap.add_argument("--shrink", action="store_true",
                    help="exit 1 if a clean CSV lost rows or series against the last commit")
    ap.add_argument("--restore", action="store_true",
                    help="with --shrink: put the committed copy back over any file that shrank")
    ap.add_argument("--calendar", action="store_true",
                    help="check only the MPC calendar; warns, never fails")
    args = ap.parse_args()

    # Kept out of --check on purpose. A calendar running low once stopped every
    # day's data being saved, and later turned every daily run red from mid
    # December. A missing next meeting is a reminder, never a failure.
    if args.calendar:
        check_mpc_calendar()
        return 0
    if args.shrink:
        return 1 if check_shrink(args.restore) else 0
    if args.dates:
        return 1 if check_dates(load_series()) else 0

    catalog_path = CATALOG / "series.json"
    catalog = (
        {c["series_id"]: c for c in json.loads(catalog_path.read_text(encoding="utf-8"))}
        if catalog_path.exists()
        else {}
    )

    data = load_series()
    if not data:
        print("no series found; run fetch_series.py first", file=sys.stderr)
        return 1

    summaries = [summarise(sid, pts, catalog.get(sid, {})) for sid, pts in sorted(data.items())]

    CATALOG.mkdir(exist_ok=True)
    (CATALOG / "summary.json").write_text(
        json.dumps(summaries, indent=1, ensure_ascii=False), encoding="utf-8"
    )

    total_obs = sum(s["n"] for s in summaries)
    uncatalogued = [s["series_id"] for s in summaries if s["series_id"] not in catalog]
    flagged = [s for s in summaries if s["flags"]]

    lines = [
        "# Coverage",
        "",
        "_Generated from `data/clean/series/`. See `catalog/last_run.json` for the",
        "run timestamp -- keeping it out of here means this file only changes when",
        "the coverage actually does._",
        "",
        f"**{len(summaries)} series, {total_obs:,} observations.**",
        "",
        "| Series | Coverage | n | Latest | Unit |",
        "|---|---|---|---|---|",
    ]
    for s in summaries:
        lines.append(
            f"| `{s['series_id']}` | {s['first_period']} to {s['last_period']} "
            f"| {s['n']:,} | {s['last']:g} | {s['unit'] or ''} |"
        )
    if flagged:
        lines += ["", "## Flags", ""]
        for s in flagged:
            lines.append(f"- `{s['series_id']}` -- " + "; ".join(s["flags"]))
    (CATALOG / "COVERAGE.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"{len(summaries)} series, {total_obs:,} observations")
    print(f"wrote catalog/summary.json and catalog/COVERAGE.md")
    if flagged:
        print(f"\n{len(flagged)} series with flags:")
        for s in flagged[:12]:
            print(f"  {s['series_id']:28s} {'; '.join(s['flags'])}")
        if len(flagged) > 12:
            print(f"  ... and {len(flagged) - 12} more (see catalog/COVERAGE.md)")
    if uncatalogued:
        print(f"\nWARNING: {len(uncatalogued)} series missing catalog metadata:", file=sys.stderr)
        for sid in uncatalogued[:10]:
            print(f"  {sid}", file=sys.stderr)

    check_mpc_calendar()
    misdated = check_dates(data)

    if args.check:
        hard = [s for s in summaries if any(f.startswith("duplicate") for f in s["flags"])]
        if hard or uncatalogued or misdated:
            return 1
    return 0


def check_dates(data: dict[str, list[tuple[str, float]]]) -> list[str]:
    """Series with an observation dated after today or before 1950."""
    today = dt.date.today().isoformat()
    bad = []
    for sid, points in sorted(data.items()):
        wrong = [p for p, _ in points if p > today or p < EARLIEST]
        if wrong:
            bad.append(sid)
            print(f"::error::{sid} has {len(wrong)} observation(s) dated outside {EARLIEST}..{today}, "
                  f"e.g. {wrong[0]}", file=sys.stderr)
    if not bad:
        print(f"dates: every observation falls between {EARLIEST} and {today}")
    return bad


def _committed(path: pathlib.Path) -> bytes | None:
    """The file as of the last commit, or None if it is new or git is unavailable."""
    rel = path.relative_to(ROOT).as_posix()
    try:
        out = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT, capture_output=True, check=False)
    except OSError:
        return None
    return out.stdout if out.returncode == 0 else None


def _shape(text: str, keyed: bool) -> tuple[int, set]:
    rows = list(csv.reader(text.splitlines()))[1:]
    return len(rows), ({r[0] for r in rows if r} if keyed else set())


def check_shrink(restore: bool) -> list[str]:
    """Clean CSVs that lost rows or series against the last commit.

    The daily static floors in datasets.yaml let a response cut by a few
    percent through. Comparing with what was committed yesterday catches any
    loss at all. With restore, the committed copy goes back, so the run still
    saves everything else and the shrunken file waits for a person.
    """
    # An id retired on purpose (catalog/id_map.json says where it went) is not lost.
    id_map = CATALOG / "id_map.json"
    moved = set(json.loads(id_map.read_text(encoding="utf-8")).get("ids", {})) if id_map.exists() else set()
    shrunk = []
    for path in sorted(SERIES.glob("*.csv")) + sorted(RECORDS.glob("*.csv")):
        before = _committed(path)
        if before is None:
            continue
        keyed = path.parent == SERIES
        old_rows, old_ids = _shape(before.decode("utf-8"), keyed)
        new_rows, new_ids = _shape(path.read_text(encoding="utf-8"), keyed)
        lost = sorted(old_ids - new_ids - moved)
        if new_rows >= old_rows and not lost:
            continue
        rel = path.relative_to(ROOT).as_posix()
        shrunk.append(rel)
        print(f"::error::{rel} shrank: {old_rows:,} rows to {new_rows:,}"
              + (f", lost {len(lost)} series (e.g. {lost[0]})" if lost else "")
              + ("; the committed copy is kept" if restore else ""), file=sys.stderr)
        if restore:
            path.write_bytes(before)
    if not shrunk:
        print("shrink: no clean CSV lost rows or series against the last commit")
    return shrunk


def check_mpc_calendar() -> int:
    """Speak up before the meeting calendar runs out. Returns the meetings left.

    data/mpc_calendar.json is filled by fetch_mpc_calendar.py from CBE's
    schedule endpoint, with the dates typed in by hand as the fallback.
    Everything else here fails loudly when it goes stale because a scrape stops
    returning rows. This cannot. It just quietly stops having a next meeting to
    count down to, so it warns, and nobody has to notice a missing countdown.
    """
    path = ROOT / "data" / "mpc_calendar.json"
    if not path.exists():
        print("\nWARNING: data/mpc_calendar.json is missing", file=sys.stderr)
        return 0
    try:
        calendar = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as err:
        print(f"\nWARNING: data/mpc_calendar.json is not valid JSON: {err}", file=sys.stderr)
        return 0

    today = dt.date.today().isoformat()
    ahead = [m["date"] for m in calendar.get("meetings", []) if m.get("date", "") >= today]
    floor = calendar.get("warn_below", 2)
    if len(ahead) < floor:
        # ::warning:: shows on the run's summary page without turning it red.
        print(f"\n::warning::only {len(ahead)} MPC meeting(s) left in data/mpc_calendar.json "
              f"(want at least {floor}). ingest/fetch_mpc_calendar.py reads them from CBE; if it "
              f"cannot, add next year's dates from {calendar.get('source_url', 'cbe.org.eg')} "
              f"and update checked_on.",
              file=sys.stderr)
        return len(ahead)
    print(f"MPC calendar: {len(ahead)} meetings ahead, next {ahead[0]}")
    return len(ahead)


if __name__ == "__main__":
    raise SystemExit(main())
