"""Summarise every series: coverage, latest value, extremes, and data-quality flags.

Serves two purposes at once.

Verification -- a run that silently halves a series shows up here as a coverage
change, and the quality flags surface the places where CBE's own data is odd
(zero-filled rows in the FX series, duplicate periods, long gaps).

Product -- `catalog/summary.json` is exactly the Last / Previous / Highest /
Lowest table the homepage needs, precomputed at build time so the browser
never has to scan a series to render a tile.

Run:  python ingest/summarise.py [--check]
      --check exits non-zero if any series trips a hard quality rule.
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES = ROOT / "data" / "clean" / "series"
CATALOG = ROOT / "catalog"

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
    args = ap.parse_args()

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

    if args.check:
        hard = [s for s in summaries if any(f.startswith("duplicate") for f in s["flags"])]
        if hard or uncatalogued:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
