"""Chain a consumer price index out of the month-on-month rate.

CBE publishes inflation as rates and never as a level: headline and core, month
on month and year on year, and nothing that says what a pound bought. That is
fine for reading the news and useless for the only question most people
actually have, which is what their salary or their savings are worth now
compared to some year they remember. Answering that needs an index.

The Excel archive does carry `EG.XL.PRICE.CPI.*` levels, and they cannot be
used: 32 series of annual June snapshots, three to eleven points each, with two
visible rebasings and a twelve-year hole between 2009 and 2019. They are a
by-product of whichever spreadsheet tab they arrived on.

So the index is chained from `EG.CPI.HDL.MOM`, which is monthly, unbroken from
January 2005, and published by CBE itself:

    index[t] = index[t-1] * (1 + mom[t] / 100),  index[Dec 2004] = 100

Two things about this are worth knowing before trusting a number that comes out
of it, and both are checked rather than assumed:

**It agrees with CBE.** Recomputing year-on-year inflation from the chained
index and comparing it against the published `EG.CPI.HDL.YOY` gives a median
disagreement of 0.001 percentage points across 248 months. That is the check
`main()` runs, and a build where it stops being true should fail rather than
quietly ship a calculator that is wrong.

**It disagrees in 2009 and 2010.** Ten months there drift by more than a point,
peaking at 1.8pp in June 2010. That is not compounding error -- compounding
error grows, and this is a bulge that closes again. It is a rebasing: the
`EG.XL.PRICE.CPI.ALL_ITEMS` series in the Excel archive drops from 133.6 to
102.4 between June 2009 and June 2010, which is the same event seen from the
other side. A chained index cannot see a rebasing, and CBE has never published
the linking factor, so the honest thing is to state it: a comparison that spans
2009 to 2010 carries about a point and a half of error in that one year, out of
a cumulative fourteenfold rise.

The series stops at January 2005 rather than reaching the year-on-year series'
2000 start. Extending it backwards would mean a second, different derivation
inside one series, and the FX series a reader would compare it against begins
in 2005 anyway.

Run:  python ingest/derive_prices.py
"""

from __future__ import annotations

import csv
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES = ROOT / "data" / "clean" / "series"
CATALOG = ROOT / "catalog" / "series.json"

SOURCE = "EG.CPI.HDL.MOM"
CHECK_AGAINST = "EG.CPI.HDL.YOY"
INDEX_ID = "EG.CPI.HDL.INDEX"
BASE_PERIOD = "2004-12-01"
BASE_VALUE = 100.0

# The 2009-10 rebasing is a known, explained bulge. These bound it: a build that
# drifts wider than this is a real regression -- a scale change in the source,
# or a month read twice -- not the rebasing.
MAX_MEDIAN_DRIFT = 0.05   # percentage points
MAX_BAD_MONTHS = 20       # months drifting more than 1.5pp


def read_series(path: pathlib.Path) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                out.setdefault(row["series_id"], {})[row["period"]] = float(row["value"])
            except (ValueError, KeyError):
                continue
    return out


def minus_twelve(period: str) -> str:
    year, month, _ = period.split("-")
    return f"{int(year) - 1}-{month}-01"


def chain(mom: dict[str, float]) -> dict[str, float]:
    level = BASE_VALUE
    index: dict[str, float] = {}
    for period in sorted(mom):
        level *= 1 + mom[period] / 100.0
        index[period] = round(level, 4)
    return index


def drift_against_published(index: dict[str, float], yoy: dict[str, float]) -> list[tuple[float, str]]:
    """How far the index's own year-on-year is from the one CBE printed."""
    out = []
    for period, value in index.items():
        year_ago = minus_twelve(period)
        if year_ago in index and period in yoy:
            implied = (value / index[year_ago] - 1) * 100
            out.append((abs(implied - yoy[period]), period))
    out.sort(reverse=True)
    return out


def main() -> int:
    path = SERIES / "inflation.csv"
    if not path.exists():
        print("data/clean/series/inflation.csv is missing; run fetch_series.py first", file=sys.stderr)
        return 1

    data = read_series(path)
    mom = data.get(SOURCE, {})
    yoy = data.get(CHECK_AGAINST, {})
    if len(mom) < 100:
        print(f"only {len(mom)} readings of {SOURCE}; refusing to chain an index", file=sys.stderr)
        return 1

    index = chain(mom)
    drift = drift_against_published(index, yoy)
    if not drift:
        print(f"nothing to check the index against: {CHECK_AGAINST} is missing", file=sys.stderr)
        return 1

    median = statistics.median(d for d, _ in drift)
    bad = [(d, p) for d, p in drift if d > 1.5]
    print(f"chained {len(index):,} months from {min(index)} to {max(index)}: "
          f"{BASE_VALUE:.0f} -> {index[max(index)]:,.1f}")
    print(f"  against {CHECK_AGAINST}: median drift {median:.3f}pp, "
          f"worst {drift[0][0]:.2f}pp at {drift[0][1][:7]}, {len(bad)} months over 1.5pp")

    if median > MAX_MEDIAN_DRIFT or len(bad) > MAX_BAD_MONTHS:
        print(f"refusing to write: the chained index no longer reproduces {CHECK_AGAINST}. "
              f"median {median:.3f}pp (limit {MAX_MEDIAN_DRIFT}), "
              f"{len(bad)} months over 1.5pp (limit {MAX_BAD_MONTHS}). "
              "Check whether CBE changed the units of the month-on-month series.",
              file=sys.stderr)
        return 1

    rows = [(INDEX_ID, BASE_PERIOD, BASE_VALUE)] + [
        (INDEX_ID, period, index[period]) for period in sorted(index)
    ]
    with (SERIES / "derived_prices.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["series_id", "period", "value"])
        writer.writerows(rows)

    entry = {
        "series_id": INDEX_ID,
        "title_en": "Consumer Price Index, chained (Dec 2004 = 100)",
        "dataset": "derived_prices",
        "family": "prices",
        "freq": "M",
        "unit": "index",
        "derived": True,
        "method": (
            "CBE publishes inflation as a rate and never as a level. This chains "
            f"{SOURCE}, the published month-on-month headline rate, from a base of "
            "100 in December 2004. Recomputing year-on-year inflation from it "
            f"reproduces the published {CHECK_AGAINST} to a median of "
            f"{median:.3f} percentage points. It does not reproduce 2009 and 2010, "
            "where CAPMAS rebased the basket and a chained index cannot see the "
            "link: a comparison spanning those two years carries roughly 1.5 "
            "percentage points of error in that one year."
        ),
    }

    existing = json.loads(CATALOG.read_text(encoding="utf-8")) if CATALOG.exists() else []
    by_id = {c["series_id"]: c for c in existing}
    by_id[INDEX_ID] = entry
    CATALOG.write_text(
        # Arabic titles literal, not escaped. All writers of this file must
        # agree, or every alternate run rewrites all of it.
        json.dumps(sorted(by_id.values(), key=lambda c: c["series_id"]), indent=1, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"wrote {len(rows):,} observations; catalog now holds {len(by_id):,} series")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
