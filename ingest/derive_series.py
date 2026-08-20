"""Derive time series from the auction record tables.

An auction result is an event, not a series: several tenors are auctioned on
the same day, and the tenor actually offered drifts (91 days one week, 89 the
next). To get a usable yield curve the tenors are bucketed to the standard
points the market quotes -- 3M, 6M, 9M, 12M -- and each bucket becomes one
series per measure.

Outputs `data/clean/series/derived_auctions.csv` plus catalog entries.

Also emits the bid-to-cover ratio, which CBE never publishes but which falls
straight out of submitted / accepted and is the standard read on whether an
auction went well.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from parse_table import to_number  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
RECORDS = ROOT / "data" / "clean" / "records"
SERIES = ROOT / "data" / "clean" / "series"
CATALOG = ROOT / "catalog" / "series.json"

# Tenor buckets. CBE auctions 89-91, 175-182, 259-273 and 336-371 day paper
# depending on the calendar; the market talks about 3/6/9/12 months.
BUCKETS = [
    (60, 120, "3M", "3-month"),
    (150, 200, "6M", "6-month"),
    (240, 290, "9M", "9-month"),
    (330, 400, "12M", "12-month"),
]

MEASURES = {
    "Weighted Avg. Yield (%)": ("YLD.WAVG", "weighted average yield", "percent per annum"),
    "Min. Yield (%)": ("YLD.MIN", "minimum accepted yield", "percent per annum"),
    "Max. Yield (%)": ("YLD.MAX", "maximum accepted yield", "percent per annum"),
    "Accepted Amount": ("AMT.ACC", "amount accepted", "EGP"),
    "Submitted Amount": ("AMT.SUB", "amount submitted", "EGP"),
}


def bucket_for(tenor_days: float | None) -> tuple[str, str] | None:
    if tenor_days is None:
        return None
    for lo, hi, code, label in BUCKETS:
        if lo <= tenor_days <= hi:
            return code, label
    return None


def iso(raw: str) -> str | None:
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", (raw or "").strip())
    if not m:
        return None
    d, mo, y = (int(x) for x in m.groups())
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None


def derive_tbills(path: pathlib.Path, prefix: str, label: str):
    """-> (observations, catalog entries) for a bill auction record table."""
    if not path.exists():
        return [], []

    with path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        return [], []

    obs: list[tuple[str, str, float]] = []
    catalog: dict[str, dict] = {}
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    for row in rows:
        b = bucket_for(to_number(row.get("Tenor (days)", "")))
        if not b:
            continue
        code, blabel = b
        period = iso(row.get("Issue Date", ""))
        if not period:
            continue

        for column, (suffix, mlabel, unit) in MEASURES.items():
            value = to_number(row.get(column, ""))
            if value is None:
                continue
            sid = f"{prefix}.{code}.{suffix}"
            obs.append((sid, period, value))
            catalog.setdefault(
                sid,
                {
                    "series_id": sid,
                    "title_en": f"{label} {blabel} auction, {mlabel}",
                    "dataset": "derived_auctions",
                    "family": "govt",
                    "freq": "W",
                    "unit": unit,
                    "derived": True,
                    "method": (
                        f"Auctions with tenor in [{[x for x in BUCKETS if x[2]==code][0][0]}, "
                        f"{[x for x in BUCKETS if x[2]==code][0][1]}] days, grouped as {code}."
                    ),
                    "retrieved_at": now,
                },
            )

        # Bid-to-cover: how many pounds were bid for every pound sold. CBE
        # publishes the two amounts but never the ratio.
        sub = to_number(row.get("Submitted Amount", ""))
        acc = to_number(row.get("Accepted Amount", ""))
        if sub and acc:
            sid = f"{prefix}.{code}.BIDCOVER"
            obs.append((sid, period, round(sub / acc, 4)))
            catalog.setdefault(
                sid,
                {
                    "series_id": sid,
                    "title_en": f"{label} {blabel} auction, bid-to-cover ratio",
                    "dataset": "derived_auctions",
                    "family": "govt",
                    "freq": "W",
                    "unit": "ratio",
                    "derived": True,
                    "method": "Submitted Amount / Accepted Amount, computed here. Not published by CBE.",
                    "retrieved_at": now,
                },
            )

    return obs, list(catalog.values())


def main() -> int:
    all_obs: list[tuple[str, str, float]] = []
    all_cat: list[dict] = []

    for filename, prefix, label in [
        ("auction_tbills_egp.csv", "EG.TB.EGP", "EGP treasury bill"),
        ("auction_tbills_usd.csv", "EG.TB.USD", "USD treasury bill"),
        ("auction_tbills_eur.csv", "EG.TB.EUR", "EUR treasury bill"),
    ]:
        obs, cat = derive_tbills(RECORDS / filename, prefix, label)
        all_obs += obs
        all_cat += cat
        print(f"{filename:28s} -> {len(obs):6d} observations, {len(cat)} series")

    if not all_obs:
        print("nothing derived; run fetch_series.py first", file=sys.stderr)
        return 1

    # Several auctions of the same bucket can settle on one day (a reopening
    # alongside a new issue). Average them so each series has one point per day.
    grouped: dict[tuple[str, str], list[float]] = {}
    for sid, period, value in all_obs:
        grouped.setdefault((sid, period), []).append(value)
    collapsed = sorted(
        (sid, period, round(sum(v) / len(v), 6))
        for (sid, period), v in grouped.items()
    )

    SERIES.mkdir(parents=True, exist_ok=True)
    with (SERIES / "derived_auctions.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["series_id", "period", "value"])
        w.writerows(collapsed)

    # Merge into the catalog written by fetch_series.py rather than replacing it.
    existing = json.loads(CATALOG.read_text(encoding="utf-8")) if CATALOG.exists() else []
    by_id = {c["series_id"]: c for c in existing}
    for entry in all_cat:
        by_id[entry["series_id"]] = entry
    CATALOG.write_text(
        json.dumps(sorted(by_id.values(), key=lambda c: c["series_id"]), indent=1),
        encoding="utf-8",
    )

    print(f"\nwrote {len(collapsed):,} observations across {len(all_cat)} derived series")
    print(f"catalog now holds {len(by_id)} series")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
