"""Build the chart annotation layer.

Two kinds of event, found two different ways.

Exchange-rate regime breaks are *detected*: a single-day move in the official
USD rate above a threshold is, in Egypt, always a policy event rather than
market noise. The float of November 2016 shows up as +66.7% in one day. Finding
them from the data rather than typing them from memory means the list stays
correct as new ones happen, and it cannot quietly drift out of date.

Policy rate decisions are *joined*: every change in the corridor is matched to
the MPC statement published within a few days of it.

Detection produces candidates, not gospel. Each one carries the evidence that
triggered it so a human can confirm the label; `events.json` is meant to be
edited by hand afterwards, and re-running preserves any `label` already set.
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES = ROOT / "data" / "clean" / "series"
CORPUS = ROOT / "corpus"
EVENTS = ROOT / "events.json"

# A one-day move this large in a managed currency is a policy decision.
FX_THRESHOLD_PCT = 4.0
FX_SERIES = "EG.FX.OFF.USD.SELL"

# Regimes are the shaded bands behind the FX chart. These are historical fact,
# not something the data can tell us, so they are declared.
FX_REGIMES = [
    ("2005-01-01", "2016-11-02", "Managed peg"),
    ("2016-11-03", "2022-03-20", "Post-float managed rate"),
    ("2022-03-21", "2024-03-05", "Stepwise devaluations"),
    ("2024-03-06", None, "Post-Ras El Hekma float"),
]


def load(series_id: str) -> list[tuple[str, float]]:
    points: list[tuple[str, float]] = []
    for path in SERIES.glob("*.csv"):
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row["series_id"] == series_id:
                    try:
                        points.append((row["period"], float(row["value"])))
                    except ValueError:
                        pass
    points.sort()
    return points


def detect_fx_events(threshold: float) -> list[dict]:
    points = load(FX_SERIES)
    if not points:
        print(f"no {FX_SERIES}; run fetch_series.py first", file=sys.stderr)
        return []

    out = []
    for i in range(1, len(points)):
        prev_date, prev = points[i - 1]
        date, value = points[i]
        if not prev:
            continue
        pct = (value - prev) / prev * 100
        if abs(pct) < threshold:
            continue
        out.append(
            {
                "date": date,
                "type": "fx_move",
                "label": None,  # for a human to fill in
                "direction": "devaluation" if pct > 0 else "appreciation",
                "evidence": {
                    "series": FX_SERIES,
                    "from": prev,
                    "to": value,
                    "pct_change": round(pct, 2),
                    "previous_date": prev_date,
                },
            }
        )
    return out


def mpc_events() -> list[dict]:
    """One event per MPC statement, with the decision if we parsed it."""
    folder = CORPUS / "mpc"
    if not folder.exists():
        return []
    out = []
    for path in sorted(folder.glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append(
            {
                "date": doc["date"],
                "type": "mpc",
                "label": doc.get("title"),
                "decision": doc.get("decision"),
                "rates": {
                    k: doc[k]
                    for k in ("deposit_rate", "lending_rate", "main_operation_rate", "discount_rate")
                    if k in doc
                },
                "url": doc.get("url"),
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=FX_THRESHOLD_PCT)
    args = ap.parse_args()

    # Preserve hand-written labels across re-runs.
    previous: dict[tuple[str, str], dict] = {}
    if EVENTS.exists():
        for e in json.loads(EVENTS.read_text(encoding="utf-8")).get("events", []):
            previous[(e["date"], e["type"])] = e

    events = detect_fx_events(args.threshold) + mpc_events()
    for e in events:
        old = previous.get((e["date"], e["type"]))
        if old and old.get("label"):
            e["label"] = old["label"]
        if old and old.get("note"):
            e["note"] = old["note"]

    events.sort(key=lambda e: (e["date"], e["type"]))

    EVENTS.write_text(
        json.dumps(
            {
                "generated": dt.date.today().isoformat(),
                "note": (
                    "FX events are detected from a >%.1f%% single-day move in %s. "
                    "Labels are added by hand and preserved across regeneration."
                    % (args.threshold, FX_SERIES)
                ),
                "fx_regimes": [
                    {"from": a, "to": b, "label": c} for a, b, c in FX_REGIMES
                ],
                "events": events,
            },
            indent=1,
        ),
        encoding="utf-8",
    )

    by_type = collections.Counter(e["type"] for e in events)
    print(f"wrote events.json: {len(events)} events {dict(by_type)}")

    fx = [e for e in events if e["type"] == "fx_move"]
    if fx:
        print(f"\nFX moves over {args.threshold}%:")
        for e in sorted(fx, key=lambda e: -abs(e["evidence"]["pct_change"]))[:10]:
            ev = e["evidence"]
            flag = "" if e.get("label") else "   <- needs a label"
            print(
                f"  {e['date']}  {ev['from']:9.4f} -> {ev['to']:9.4f}  "
                f"{ev['pct_change']:+7.1f}%{flag}"
            )

    unlabelled = sum(1 for e in fx if not e.get("label"))
    if unlabelled:
        print(f"\n{unlabelled} FX events still need a human label in events.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
