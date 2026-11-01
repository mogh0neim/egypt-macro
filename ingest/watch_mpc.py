"""Watch CBE's news list on an MPC day and raise the alert the moment the decision is posted.

The daily scrape picks up an MPC decision the next afternoon. This is the fast
path: on a meeting day it reads the newest items of CBE's news list every 60
seconds, and when the MPC press release for that day appears it reads the
decision and the new rates and writes mpc_alert.json.

A wrong alert is worse than a late one, so the reading is cross-checked before
it is trusted: the corridor must be the right shape (deposit < main operation <
lending), the move must agree with the decision word against the last
statement's main rate, and a stated "by N bps" must equal that move. Anything
off, or a release that cannot be read (a postponement notice, a changed page),
gives a link-only alert: "CBE published an MPC statement", with the link.

When CBE posts: 17:08 to 20:04 Cairo time for the last 12 decisions, as early
as 14:26 before that. The window is 11:00 to 22:00 UTC, which is 14:00 to
midnight Cairo in summer or winter.

Run:  python ingest/watch_mpc.py [--date YYYY-MM-DD] [--any-day] [--stop-at HH:MM]
                                 [--max-minutes N] [--interval S]
      python ingest/watch_mpc.py --replay YYYY-MM-DD   (rebuild an alert from corpus/mpc, no network)

Exit codes: 0 alert written; 3 window over, nothing posted; 4 this run's time
is up but the window is not (the workflow starts a fresh run); 5 not a meeting day.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import BASE, CBEClient, WAFRejected  # noqa: E402
from fetch_press import NEWS_DATASOURCE, page_text, parse_mpc  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CALENDAR = ROOT / "data" / "mpc_calendar.json"
STATEMENTS = ROOT / "corpus" / "mpc"
OUT = ROOT / "mpc_alert.json"

_RE_BPS = re.compile(r"by\s*([\d,]+)\s*(?:basis points|bps)", re.I)


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def previous_main_rate(day: str) -> float | None:
    """Main operation rate from the last saved statement before `day`, read from its text."""
    for path in sorted(STATEMENTS.glob("*.json"), reverse=True):
        if path.stem >= day:
            continue
        rate = parse_mpc(json.loads(path.read_text(encoding="utf-8")).get("text", "")).get("main_operation_rate")
        if rate is not None:
            return rate
    return None


def check(parsed: dict, previous: float | None, stated_bp: int | None) -> str | None:
    """None when the reading can be trusted, else the reason it cannot."""
    keys = ("decision", "deposit_rate", "lending_rate", "main_operation_rate")
    missing = [k for k in keys if k not in parsed]
    if missing:
        return "could not read " + ", ".join(missing)
    d, l, m = parsed["deposit_rate"], parsed["lending_rate"], parsed["main_operation_rate"]
    if not d < m < l:
        return f"corridor out of shape: deposit {d}, main {m}, lending {l}"
    if previous is None:
        return "no earlier main rate to compare against"
    move = round((m - previous) * 100)
    expected = {"hike": move > 0, "cut": move < 0, "hold": move == 0}.get(parsed["decision"])
    if not expected:
        return f"decision '{parsed['decision']}' but main rate went {previous} -> {m}"
    if stated_bp is not None and stated_bp != abs(move):
        return f"statement says {stated_bp} bps, rates moved {abs(move)} bps"
    return None


def build_alert(text: str, title: str, url: str, day: str) -> dict:
    parsed = parse_mpc(text)
    previous = previous_main_rate(day)
    bp = _RE_BPS.search(text)
    reason = check(parsed, previous, int(bp.group(1).replace(",", "")) if bp else None)
    alert = {"kind": "mpc", "date": day, "title": title, "url": url,
             "found_at_utc": utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}
    if reason:
        return alert | {"status": "link_only", "reason": reason,
                        "headline": "CBE published an MPC statement"}
    m = parsed["main_operation_rate"]
    move = round((m - previous) * 100)
    word = {"hike": f"raised rates by {move} bps", "cut": f"cut rates by {-move} bps",
            "hold": "held rates"}[parsed["decision"]]
    return alert | {
        "status": "full", "decision": parsed["decision"], "change_bp": move,
        "deposit_rate": parsed["deposit_rate"], "lending_rate": parsed["lending_rate"],
        "main_operation_rate": m, "discount_rate": parsed.get("discount_rate"),
        "previous_main_rate": previous,
        "headline": f"CBE {word}: main rate {m}%, corridor {parsed['deposit_rate']}% to {parsed['lending_rate']}%",
    }


def find_release(items: list[dict], day: str) -> dict | None:
    for it in items:
        if (it.get("customDate") or "")[:10] == day and "MPC" in (it.get("title") or ""):
            return it
    return None


def watch(day: str, stop_at: dt.datetime, run_until: dt.datetime, interval: int) -> tuple[int, dict | None]:
    client = CBEClient(delay=1.0, retries=2, timeout=30)
    polls = 0
    while True:
        now = utcnow()
        if now >= stop_at:
            print(f"window over at {now:%H:%M} UTC after {polls} checks; no MPC release for {day}")
            return 3, None
        if now >= run_until:
            print(f"this run's time is up at {now:%H:%M} UTC after {polls} checks; window open until {stop_at:%H:%M}")
            return 4, None
        wait = interval
        try:
            polls += 1
            items = client.listing("News", NEWS_DATASOURCE, page_size=20)["results"]
            hit = find_release(items, day)
            if hit:
                url = BASE + hit["url"]
                print(f"{now:%H:%M:%S} UTC found: {hit['title']}")
                try:
                    text = page_text(client.get(hit["url"]))
                except Exception as exc:  # noqa: BLE001  the link alone is still worth sending
                    print(f"could not read the release ({type(exc).__name__}); sending the link", file=sys.stderr)
                    text = ""
                return 0, build_alert(text, hit["title"], url, day)
        except WAFRejected as exc:
            print(f"{now:%H:%M:%S} UTC blocked by CBE's firewall: {exc}; backing off 5 minutes", file=sys.stderr)
            wait = 300
        except Exception as exc:  # noqa: BLE001  keep watching through a bad request
            print(f"{now:%H:%M:%S} UTC check failed ({type(exc).__name__}: {exc})", file=sys.stderr)
            wait = interval * 2
        if polls % 30 == 0:
            print(f"{now:%H:%M} UTC still watching ({polls} checks)")
        time.sleep(wait)


def write(alert: dict) -> None:
    OUT.write_text(json.dumps(alert, indent=1), encoding="utf-8")
    print(json.dumps(alert, indent=1))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"### {alert['headline']}\n\n{alert['url']}\n\nStatus: {alert['status']}"
                     + (f" ({alert['reason']})" if alert.get("reason") else "") + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--date", default="", help="meeting day, default today (UTC)")
    ap.add_argument("--any-day", action="store_true", help="watch even if the day is not on the MPC calendar")
    ap.add_argument("--stop-at", default="22:00", help="UTC time the window closes (22:00 = midnight Cairo in summer)")
    ap.add_argument("--max-minutes", type=int, default=340, help="how long this run may watch (GitHub stops jobs at 6 hours)")
    ap.add_argument("--interval", type=int, default=60, help="seconds between checks")
    ap.add_argument("--replay", metavar="DATE", help="build the alert from corpus/mpc/DATE.json, no network")
    args = ap.parse_args()

    if args.replay:
        doc = json.loads((STATEMENTS / f"{args.replay}.json").read_text(encoding="utf-8"))
        write(build_alert(doc["text"], doc["title"], doc["url"], args.replay))
        return 0

    day = args.date or utcnow().strftime("%Y-%m-%d")
    meetings = {m["date"] for m in json.loads(CALENDAR.read_text(encoding="utf-8"))["meetings"]}
    if day not in meetings and not args.any_day:
        print(f"{day} is not an MPC meeting day in data/mpc_calendar.json; nothing to watch")
        return 5

    h, m = (int(x) for x in args.stop_at.split(":"))
    stop_at = dt.datetime.fromisoformat(day).replace(hour=h, minute=m, tzinfo=dt.timezone.utc)
    if day < utcnow().strftime("%Y-%m-%d"):  # a past day tested by hand: give it one run's worth
        stop_at = utcnow() + dt.timedelta(minutes=args.max_minutes + 1)
    run_until = utcnow() + dt.timedelta(minutes=args.max_minutes)
    print(f"watching CBE news for the {day} MPC release until {min(stop_at, run_until):%H:%M} UTC")
    code, alert = watch(day, stop_at, run_until, args.interval)
    if alert:
        write(alert)
    return code


if __name__ == "__main__":
    sys.exit(main())
