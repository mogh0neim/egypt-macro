"""Extract series and statement text from CBE press releases.

CBE publishes net international reserves and remittances only as prose inside
press releases -- there is no downloadable series for either, anywhere. Both
are among the most-watched numbers in the Egyptian economy. Parsing them out
makes this the only machine-readable source.

Also captures MPC statements. Of the 178 MPC releases going back to June 2005,
only 28 are HTML pages -- the other 150 link straight to a PDF and are picked
up by fetch_docs.py instead. Consecutive statements are largely boilerplate,
which is what makes diffing them worthwhile once the PDFs are extracted.

Outputs:
  data/raw/press/<slug>.html.gz        each release as served
  data/clean/series/press_derived.csv  NIR and remittances as tidy series
  corpus/mpc/<date>.json               statement text plus parsed rates
  corpus/news_index.json               all 782 items with categories

Run:  python ingest/fetch_press.py [--limit N] [--skip-cached]
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import gzip
import html
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import CBEClient  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "press"
SERIES = ROOT / "data" / "clean" / "series"
CORPUS = ROOT / "corpus"

NEWS_DATASOURCE = "{DE996AEC-03FB-4E24-BDB0-EF64F75FD5AD}"


def page_text(page_html: str) -> str:
    """Body text of a news page, with markup and chrome stripped."""
    start = page_html.find("</header>")
    end = page_html.find("<footer")
    body = page_html[start if start > 0 else 0 : end if end > 0 else len(page_html)]
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    body = re.sub(r"<style.*?</style>", " ", body, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", body))
    text = re.sub(r"\s+", " ", text).strip()
    # Every page ends with this; it is not part of the release.
    return re.sub(r"This page was last updated.*$", "", text).strip()


# --- reserves -------------------------------------------------------------
# Two formats over the years:
#   "Reserves reached US$ 56,293."           (current, millions)
#   "reached US $ 16,564.4 mn at the end of" (pre-2017, spaces around the $)
_RE_NIR = re.compile(
    r"[Rr]eserves?\s+(?:reached|recorded|registered|amounted to|stood at)\s*"
    r"(?:about\s+|around\s+|approximately\s+)?US\s*\$?\s*([\d,]+(?:\.\d+)?)",
)

# --- remittances ----------------------------------------------------------
# CBE reports remittances cumulatively from the start of the fiscal year, not
# as a monthly flow: "surging by 31.2% during July/May of FY 2025/2026, to
# register about USD 43.1 billion". Both figures are captured where present.
# Amounts are in USD billion and scaled to millions to match NIR.
_RE_REMIT_FYTD = re.compile(
    r"during\s+(?:the\s+period\s+)?July\s*/\s*(\w+)\s*(?:of\s*)?(?:FY\s*)?"
    r"(\d{4})\s*/\s*(\d{4})[^.]{0,80}?USD?\s*([\d.]+)\s*billion"
    r"|USD?\s*([\d.]+)\s*billion\s+during\s+(?:the\s+period\s+)?July\s*/\s*(\w+)\s*"
    r"(?:of\s*)?(?:FY\s*)?(\d{4})\s*/\s*(\d{4})",
    re.I,
)
_RE_REMIT_MONTH = re.compile(
    r"remittances\s+(?:increased|decreased|rose|fell|grew)[^.]*?"
    r"in\s+(\w+)\s+(\d{4})[^.]{0,40}?USD?\s*([\d.]+)\s*billion",
    re.I,
)

_MONTHS_FULL = {
    m.lower(): i
    for i, m in enumerate(
        ["January", "February", "March", "April", "May", "June", "July",
         "August", "September", "October", "November", "December"],
        start=1,
    )
}


def parse_nir(text: str) -> float | None:
    m = _RE_NIR.search(text)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _month_end(month_name: str, fy_start: int, fy_end: int) -> str | None:
    """Last day of the cumulative window, e.g. May of FY2025/2026 -> 2026-05-31."""
    mnum = _MONTHS_FULL.get(month_name.lower())
    if not mnum:
        return None
    # Egypt's fiscal year runs July-June: months Jul-Dec fall in the first
    # calendar year, Jan-Jun in the second.
    year = fy_start if mnum >= 7 else fy_end
    last = 31
    if mnum in (4, 6, 9, 11):
        last = 30
    elif mnum == 2:
        last = 29 if (year % 4 == 0 and (year % 100 or year % 400 == 0)) else 28
    return f"{year}-{mnum:02d}-{last:02d}"


def parse_remittances(text: str) -> dict[str, tuple[str, float]]:
    """-> {series_id: (period, USD million)}, whichever figures are present."""
    out: dict[str, tuple[str, float]] = {}

    m = _RE_REMIT_FYTD.search(text)
    if m:
        groups = m.groups()
        month, y1, y2, amount = groups[:4] if groups[0] else (
            groups[5], groups[6], groups[7], groups[4]
        )
        period = _month_end(month, int(y1), int(y2)) if month else None
        if period:
            out["EG.EXT.REMIT.FYTD"] = (period, float(amount) * 1000)

    m = _RE_REMIT_MONTH.search(text)
    if m:
        mnum = _MONTHS_FULL.get(m.group(1).lower())
        if mnum:
            out["EG.EXT.REMIT.M"] = (
                f"{int(m.group(2))}-{mnum:02d}-01",
                float(m.group(3)) * 1000,
            )
    return out


# --- MPC ------------------------------------------------------------------
_RE_MPC_RATES = re.compile(
    r"overnight deposit rate,?\s*(?:the\s*)?overnight lending rate,?\s*and the "
    r"rate of the main operation[^.]*?at\s*([\d.]+)\s*percent,?\s*([\d.]+)\s*"
    r"percent,?\s*and\s*([\d.]+)\s*percent",
    re.I,
)
_RE_MPC_DISCOUNT = re.compile(r"discount rate[^.]*?([\d.]+)\s*percent", re.I)
_RE_MPC_DECISION = re.compile(
    r"decided to\s+(keep|maintain|raise|cut|lower|reduce|increase)", re.I
)


def parse_mpc(text: str) -> dict:
    out: dict[str, object] = {}
    m = _RE_MPC_RATES.search(text)
    if m:
        out["deposit_rate"] = float(m.group(1))
        out["lending_rate"] = float(m.group(2))
        out["main_operation_rate"] = float(m.group(3))
    d = _RE_MPC_DISCOUNT.search(text)
    if d:
        out["discount_rate"] = float(d.group(1))
    v = _RE_MPC_DECISION.search(text)
    if v:
        verb = v.group(1).lower()
        out["decision"] = {
            "keep": "hold", "maintain": "hold",
            "raise": "hike", "increase": "hike",
            "cut": "cut", "lower": "cut", "reduce": "cut",
        }.get(verb, verb)
    return out


def slugify(url: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", url.lower().strip("/")).strip("-")[-90:]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="only the N most recent items")
    ap.add_argument("--skip-cached", action="store_true", help="reuse data/raw/press")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    client = CBEClient(delay=args.delay)
    print("fetching news index ...")
    index = client.listing("News", NEWS_DATASOURCE, page_size=2000)
    items = index["results"]
    print(f"{len(items)} news items ({index.get('totalResultsCount')} reported)")

    CORPUS.mkdir(exist_ok=True)
    (CORPUS / "news_index.json").write_text(json.dumps(items, indent=1), encoding="utf-8")

    def has_category(item: dict, name: str) -> bool:
        return any(c["value"] == name for c in (item.get("categories") or []))

    wanted = [
        it
        for it in items
        if any(
            has_category(it, c)
            for c in ("International Reserves", "Remittances", "MPC Press Release")
        )
        and it.get("url", "").startswith("/en/")
    ]
    wanted.sort(key=lambda i: i["customDate"], reverse=True)
    if args.limit:
        wanted = wanted[: args.limit]
    print(f"{len(wanted)} releases to parse\n")

    RAW.mkdir(parents=True, exist_ok=True)
    (CORPUS / "mpc").mkdir(exist_ok=True)

    observations: list[tuple[str, str, float]] = []
    misses: list[dict] = []
    dead: list[dict] = []
    mpc_count = 0

    for item in wanted:
        url = item["url"]
        cache = RAW / f"{slugify(url)}.html.gz"

        if args.skip_cached and cache.exists():
            with gzip.open(cache, "rt", encoding="utf-8") as fh:
                page = fh.read()
        else:
            try:
                blob = client.get_bytes(url)
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {url}: {type(exc).__name__}", file=sys.stderr)
                continue
            page = blob.decode("utf-8", "replace")
            # mtime=0 and raw bytes, so an unchanged page compresses to
            # identical output on any machine. See fetch_series for why.
            cache.write_bytes(gzip.compress(blob, compresslevel=9, mtime=0))

        text = page_text(page)
        period = item["customDate"][:10]

        # CBE's own index links to pages it has since removed. That is a dead
        # link on their side, not something we failed to parse, so it is
        # counted separately.
        if "Page not found" in text or "that's an error" in text:
            dead.append({"date": period, "title": item.get("title"), "url": url})
            continue

        if has_category(item, "International Reserves"):
            value = parse_nir(text)
            if value is not None:
                observations.append(("EG.RES.NIR", period, value))
            else:
                misses.append({"kind": "NIR", "url": url, "excerpt": text[:300]})

        if has_category(item, "Remittances"):
            found = parse_remittances(text)
            for sid, (obs_period, value) in found.items():
                observations.append((sid, obs_period, value))
            if not found:
                misses.append({"kind": "remittances", "url": url, "excerpt": text[:300]})

        if has_category(item, "MPC Press Release"):
            parsed = parse_mpc(text)
            (CORPUS / "mpc" / f"{period}.json").write_text(
                json.dumps(
                    {
                        "date": period,
                        "title": item.get("title"),
                        "url": "https://www.cbe.org.eg" + url,
                        "text": text,
                        **parsed,
                    },
                    indent=1,
                ),
                encoding="utf-8",
            )
            mpc_count += 1

    if observations:
        observations.sort()
        SERIES.mkdir(parents=True, exist_ok=True)
        with (SERIES / "press_derived.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["series_id", "period", "value"])
            w.writerows(observations)

        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        entries = [
            {
                "series_id": "EG.RES.NIR",
                "title_en": "Net International Reserves",
                "dataset": "press_derived",
                "family": "external",
                "freq": "M",
                "unit": "USD million",
                "derived": True,
                "method": (
                    "Parsed from the monthly CBE press release text. CBE does not "
                    "publish this as a downloadable series."
                ),
            },
            {
                "series_id": "EG.EXT.REMIT.FYTD",
                "title_en": "Workers' Remittances, cumulative fiscal year to date",
                "dataset": "press_derived",
                "family": "external",
                "freq": "M",
                "unit": "USD million",
                "derived": True,
                "method": (
                    "Parsed from CBE remittances press releases, which report a running "
                    "total from the start of the fiscal year (1 July). The period is the "
                    "last day of the cumulative window, not a monthly flow."
                ),
            },
            {
                "series_id": "EG.EXT.REMIT.M",
                "title_en": "Workers' Remittances, monthly",
                "dataset": "press_derived",
                "family": "external",
                "freq": "M",
                "unit": "USD million",
                "derived": True,
                "method": "Parsed from CBE remittances press releases (reported in USD billion).",
            },
        ]
        cat_path = ROOT / "catalog" / "series.json"
        existing = json.loads(cat_path.read_text(encoding="utf-8")) if cat_path.exists() else []
        by_id = {c["series_id"]: c for c in existing}
        # Only advertise series that actually have observations. The monthly
        # remittances figure appears in some releases and not others, so its
        # entry should come and go with the data rather than sit there empty.
        with_data = {o[0] for o in observations}
        for e in entries:
            if e["series_id"] in with_data:
                by_id[e["series_id"]] = e
            else:
                by_id.pop(e["series_id"], None)
        cat_path.write_text(
            json.dumps(sorted(by_id.values(), key=lambda c: c["series_id"]), indent=1),
            encoding="utf-8",
        )

    nir = [o for o in observations if o[0] == "EG.RES.NIR"]
    rem = [o for o in observations if o[0].startswith("EG.EXT.REMIT")]
    print(f"\nNIR         {len(nir):3d} points  {nir[0][1] if nir else '-'} to {nir[-1][1] if nir else '-'}")
    print(f"remittances {len(rem):3d} points")
    print(f"MPC         {mpc_count:3d} statements -> corpus/mpc/")
    if misses:
        (CORPUS / "unparsed_releases.json").write_text(
            json.dumps(misses, indent=1, ensure_ascii=False), encoding="utf-8"
        )
        counts = collections.Counter(m["kind"] for m in misses)
        print(f"\nunparsed -> corpus/unparsed_releases.json")
        for kind, n in counts.most_common():
            print(f"   {kind}: {n}")
        if counts.get("remittances"):
            # CBE alternates between calendar-year and fiscal-year cumulative
            # reporting for remittances. Forcing both into one series would
            # produce a wrong number, so the ambiguous ones are left out.
            print(
                "   (remittances releases mix calendar-year and fiscal-year\n"
                "    cumulative windows; only unambiguous ones are parsed)"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
