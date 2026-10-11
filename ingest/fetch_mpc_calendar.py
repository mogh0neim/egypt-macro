"""Read the MPC meeting schedule from CBE into data/mpc_calendar.json.

CBE's schedule page renders the dates client-side. The page itself carries one
button per year with that year's id (data-mpc-year-id="{GUID}"), and the dates
come from POST /api/sitecore/MPCMeetings/GetMPCMeetingsDetails?mpcYearID=...
A GET to the same address answers 404, which is why this file was typed in by
hand until October 2026.

This reads the current year and any later one CBE has published, replaces
those years in the file, and keeps every other entry as it was. If anything
goes wrong (CBE unreachable, the WAF, a page that no longer parses), it says
so and leaves the file alone: the hand-entered dates stay the fallback, and
summarise.py --calendar still warns when they run low. It never fails the run.

Run:  python ingest/fetch_mpc_calendar.py [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.parse

from cbe_client import CBEClient

ROOT = pathlib.Path(__file__).resolve().parent.parent
CALENDAR = ROOT / "data" / "mpc_calendar.json"
PAGE = "/en/monetary-policy/mpc-meetings-schedule"
API = "/api/sitecore/MPCMeetings/GetMPCMeetingsDetails"

_RE_YEAR = re.compile(r'data-mpc-year-id="(\{[0-9A-Fa-f-]{36}\})"[^>]*>\s*((?:19|20)\d{2})\s*<')
_RE_MEETING = re.compile(r'<div class="meeting-date">(.*?)</div>\s*</div>', re.S)
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def meeting_dates(html: str, year: int) -> list[str]:
    """ISO dates from one year's schedule fragment ("12 Feb 26" blocks)."""
    out = []
    for block in _RE_MEETING.findall(html):
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", block)).strip()
        m = re.fullmatch(r"(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{2}|\d{4})", text)
        if not m:
            raise ValueError(f"unreadable meeting date {text!r}")
        day, month = int(m.group(1)), _MONTHS[m.group(2).lower()]
        printed = int(m.group(3)) % 100
        if printed != year % 100:
            raise ValueError(f"{text!r} listed under {year}")
        out.append(dt.date(year, month, day).isoformat())
    return sorted(set(out))


def fetch(client: CBEClient, today: dt.date) -> dict[int, list[str]]:
    page = client.get(PAGE)
    years = {int(y): gid for gid, y in _RE_YEAR.findall(page)}
    if not years:
        raise ValueError("no year buttons on the schedule page")
    found = {}
    for year in sorted(y for y in years if y >= today.year):
        query = urllib.parse.urlencode({"mpcYearID": years[year], "language": "en"})
        body = client._post(f"{API}?{query}", [], PAGE).decode("utf-8", "replace")
        dates = meeting_dates(body, year)
        # CBE has met six to twelve times a year; fewer means a broken read.
        if not 4 <= len(dates) <= 12:
            raise ValueError(f"{len(dates)} meetings read for {year}")
        found[year] = dates
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print what would change, write nothing")
    args = ap.parse_args()

    calendar = json.loads(CALENDAR.read_text(encoding="utf-8"))
    today = dt.date.today()
    try:
        found = fetch(CBEClient(delay=1.0, retries=3, timeout=60), today)
    except Exception as exc:  # noqa: BLE001 -- any failure leaves the typed dates in place
        print(f"::warning::could not read the MPC schedule from CBE ({type(exc).__name__}: {exc}); "
              f"keeping data/mpc_calendar.json as it is", file=sys.stderr)
        return 0

    kept = [m for m in calendar.get("meetings", []) if m.get("year") not in found]
    fetched = [{"date": d, "year": y} for y, ds in found.items() for d in ds]
    meetings = sorted(kept + fetched, key=lambda m: m["date"])
    changed = meetings != calendar.get("meetings")
    for year, dates in found.items():
        print(f"{year}: {len(dates)} meetings from CBE, next "
              f"{next((d for d in dates if d >= today.isoformat()), 'none left this year')}")
    if args.dry_run:
        print("dry run: " + ("the meeting list would change" if changed else "no change"))
        return 0
    if not changed:
        print("data/mpc_calendar.json already matches CBE's schedule")
        return 0
    calendar["meetings"] = meetings
    calendar["checked_on"] = today.isoformat()
    CALENDAR.write_text(json.dumps(calendar, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("updated data/mpc_calendar.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
