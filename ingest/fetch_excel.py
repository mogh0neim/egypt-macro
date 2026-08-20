"""Enumerate and mirror the 982-file Excel time-series archive.

The archive is browsed through /api/sitecore/DownloadList/DownloadListFilter,
one call per category. Each response is a list of cards; a card is one
(subcategory, frequency) pair holding one download link per fiscal year:

    <span class="tag">Annual</span>                  <- frequency
    <h2 class="title">Domestic Debt of Both ...</h2>  <- subcategory
      <a href="....xlsx"><span>All Years</span></a>   <- one per year

That structure is the only place the frequency and subcategory of a file are
recorded -- the filenames are inconsistent (`,-d-,` for a dot, `xls.xlsx`,
stray underscores), so the card metadata is what makes the files identifiable.
It is captured into the manifest alongside each download.

The endpoint answers in whichever language the session last visited, so an
English page is fetched first. Arabic labels are collected in a second pass,
because both are wanted: the Arabic ones are free bilingual metadata.

Run:  python ingest/fetch_excel.py --manifest-only
      python ingest/fetch_excel.py --download
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import html
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import CBEClient  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ROOT / "data" / "raw" / "excel"
MANIFEST = ROOT / "catalog" / "excel_manifest.json"

# Category GUIDs from the Time Series landing page. Kept literal so a change
# upstream shows up as a missing category rather than a silent short read.
CATEGORIES = {
    "CBE": "099EFD590A274C8F9259740B4FE96AAD",
    "Domestic Debt": "F016705643D24C51959577587914DA5C",
    "External Debt": "2596CC0C64D5474C865C49E48A24D483",
    "GDP": "DEF6421CA1354B128A1113D7A5BBFC66",
    "Interest Rates": "909707CDAD5C47529817D6146659E054",
    "Investments": "A6ACD7B25BE64045A90660B320ECFA32",
    "Net Foreign Direct Investment": "623F34508AE148C1969795A8F78FDA49",
    "Tourism": "B928771A1D1A4550A1B08F9386DDC0FA",
    "Foreign Trade": "F0324992E95741438C789A669E5194F4",
    "Stocks": "3EB4667B01F04C41ADCF7D96039037A4",
    "Banking Surveys": "F9F37F0E98A54C3684790C4037AA4BE3",
    "BOP": "232131B16F15454BB1E1933B2BFEB041",
    "Inflation": "706A9057F8454F7284BE8143070D88C4",
    "State Budget": "97805EA8534C4134B65BDE9621E187AF",
}

_RE_CARD = re.compile(r'<div class="data-list dlList-item".*?(?=<div class="data-list dlList-item"|\Z)', re.S)
_RE_TAG = re.compile(r'<span class="tag">\s*(.*?)\s*</span>', re.S)
_RE_TITLE = re.compile(r'<h2 class="title">(.*?)</h2>', re.S)
_RE_DOC = re.compile(r'<a href="(/-/media/[^"]+)"[^>]*class="uploaded-doc">(.*?)</a>', re.S)


def clean(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def braced(guid: str) -> str:
    g = guid.replace("-", "").replace("{", "").replace("}", "")
    return f"{{{g[0:8]}-{g[8:12]}-{g[12:16]}-{g[16:20]}-{g[20:32]}}}"


def parse_cards(fragment: str) -> list[dict]:
    """-> one entry per download link, carrying its card's metadata."""
    out = []
    for card in _RE_CARD.findall(fragment):
        tag = _RE_TAG.search(card)
        title = _RE_TITLE.search(card)
        for url, label in _RE_DOC.findall(card):
            out.append(
                {
                    "url": html.unescape(url),
                    "period_label": clean(label),
                    "frequency": clean(tag.group(1)) if tag else None,
                    "subcategory": clean(title.group(1)) if title else None,
                }
            )
    return out


def enumerate_archive(client: CBEClient, lang: str = "en") -> dict[str, dict]:
    """-> {url: entry}. Visits a page in `lang` first so labels come back in it."""
    found: dict[str, dict] = {}
    for name, guid in CATEGORIES.items():
        # The filter endpoint answers in the session's last-visited language.
        client.get(f"/{lang}/economic-research/time-series/downloadlist?category={guid}")
        fragment = client.download_list(braced(guid), page_size=2000)
        entries = parse_cards(fragment)
        for e in entries:
            e["category"] = name
            found.setdefault(e["url"], e)
        print(f"  {name:32s} {len(entries):4d} links")
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    client = CBEClient(delay=args.delay)

    print("enumerating (English labels) ...")
    docs = enumerate_archive(client, "en")
    print(f"\n{len(docs)} unique files\n")

    print("enumerating (Arabic labels) ...")
    arabic = enumerate_archive(client, "ar")
    for url, entry in arabic.items():
        if url in docs:
            docs[url]["subcategory_ar"] = entry.get("subcategory")
            docs[url]["frequency_ar"] = entry.get("frequency")
            docs[url]["period_label_ar"] = entry.get("period_label")

    # Carry forward hashes so a re-run only fetches what is new or changed.
    previous: dict[str, dict] = {}
    if MANIFEST.exists():
        previous = {
            d["url"]: d for d in json.loads(MANIFEST.read_text(encoding="utf-8"))["files"]
        }

    ordered = sorted(docs.values(), key=lambda d: (d["category"], d["url"]))
    for entry in ordered:
        entry["id"] = hashlib.sha1(entry["url"].encode()).hexdigest()[:16]
        prev = previous.get(entry["url"])
        if prev:
            for key in ("sha256", "bytes", "local"):
                if prev.get(key):
                    entry[key] = prev[key]

    failed = 0
    if args.download and not args.manifest_only:
        FILES.mkdir(parents=True, exist_ok=True)
        todo = [e for e in ordered if not e.get("sha256")]
        print(f"\ndownloading {len(todo)} files ...")
        for i, entry in enumerate(todo, 1):
            ext = pathlib.Path(entry["url"].split("?")[0]).suffix.lower() or ".xlsx"
            name = f"{entry['id']}{ext}"
            try:
                blob = client.get_bytes(entry["url"])
            except Exception as exc:  # noqa: BLE001
                print(f"  FAIL {entry['url'][-70:]}: {type(exc).__name__}", file=sys.stderr)
                failed += 1
                continue
            (FILES / name).write_bytes(blob)
            entry["local"] = f"data/raw/excel/{name}"
            entry["sha256"] = hashlib.sha256(blob).hexdigest()
            entry["bytes"] = len(blob)
            if i % 50 == 0:
                print(f"  [{i}/{len(todo)}]")
        print(f"downloaded {len(todo) - failed}, failed {failed}")

    MANIFEST.parent.mkdir(exist_ok=True)
    MANIFEST.write_text(
        json.dumps(
            {
                "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "count": len(ordered),
                "files": ordered,
            },
            indent=1,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    by_cat = collections.Counter(e["category"] for e in ordered)
    by_freq = collections.Counter(e.get("frequency") or "?" for e in ordered)
    have = sum(1 for e in ordered if e.get("sha256"))
    print(f"\n{len(ordered)} files | mirrored {have}")
    print(f"by frequency: {dict(by_freq)}")
    for cat, n in by_cat.most_common():
        subs = len({e["subcategory"] for e in ordered if e["category"] == cat})
        print(f"  {cat:32s} {n:4d} files  {subs} subcategories")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
