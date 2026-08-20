"""Build the document search index.

Two layers, because the two questions people ask are different shapes.

  documents.json   Every document: title, date, type, categories, page count.
                   Small enough to hold in memory, so filtering by "circulars
                   about foreign exchange in 2023" is instant and offline.

  shards/NN.json   A sharded inverted index over the page text. A term maps to
                   the pages it appears on, so a query fetches only the shards
                   for its own terms rather than a 50 MB index. Two-term
                   queries pull a few hundred kilobytes.

Postings are page-level, which is what makes a hit useful: a 180-page
statistical bulletin should surface as "page 42", not as itself.

Arabic is indexed in its normalised form -- tashkeel stripped, alef and yeh
folded, Arabic-Indic digits converted -- so a query typed with a different
hamza still matches. The display text keeps its original characters.

Run:  python ingest/build_search.py
"""

from __future__ import annotations

import collections
import gzip
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
PAGES = CORPUS / "pages"
MANIFEST = CORPUS / "manifest.json"
OUT = ROOT / "dist" / "search"

SHARDS = 256
MIN_TERM = 2
MAX_TERM = 28
# A term on more than this share of pages carries no information and would
# dominate the index by size ("the", "central", "bank").
MAX_DOC_FRACTION = 0.28
# Cap the postings for one term. Beyond a few thousand pages the list is not
# a search result, it is a scan.
MAX_POSTINGS = 4000

_TOKEN = re.compile(r"[a-z0-9؀-ۿ]+")
STOP = {
    "the", "and", "for", "with", "that", "this", "from", "was", "were", "has",
    "have", "had", "its", "their", "which", "been", "are", "not", "but", "all",
    "any", "may", "can", "will", "shall", "such", "into", "than", "then",
    "also", "other", "these", "those", "there", "over", "under", "per", "out",
    "one", "two", "new", "end", "due", "each", "more", "most", "some", "only",
    "في", "من", "على", "الى", "عن", "مع", "هذا", "هذه", "التي", "الذي", "كما",
    "ذلك", "بين", "قد", "ما", "لا", "أن", "ان", "او", "الا", "به", "له",
}


def tokens(text: str) -> list[str]:
    return [
        t for t in _TOKEN.findall(text)
        if MIN_TERM <= len(t) <= MAX_TERM and t not in STOP and not t.isdigit()
    ]


def shard_of(term: str) -> int:
    """djb2 over UTF-16 code units, so the browser can compute it identically.

    Shipping a term -> shard map instead would mean sending 200k entries before
    the first search. A hash both sides can reproduce costs nothing.
    """
    h = 5381
    for ch in term:
        h = ((h * 33) + ord(ch)) & 0xFFFFFFFF
    return h % SHARDS


def main() -> int:
    if not MANIFEST.exists():
        print("no corpus/manifest.json; run fetch_docs.py first")
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["documents"]
    by_id = {d["id"]: d for d in manifest}

    documents: list[dict] = []
    postings: dict[str, list] = collections.defaultdict(list)
    page_total = 0
    doc_index: dict[str, int] = {}

    for path in sorted(PAGES.glob("*.json.gz")):
        doc = json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))
        meta = by_id.get(doc["id"], {})
        n = len(documents)
        doc_index[doc["id"]] = n
        documents.append(
            {
                "i": n,
                "id": doc["id"],
                "title": doc.get("title") or meta.get("title"),
                "date": doc.get("date") or meta.get("date"),
                "source": doc.get("source") or meta.get("source"),
                "categories": doc.get("categories") or meta.get("categories") or [],
                "pages": doc.get("page_count", 0),
                "needs_ocr": bool(doc.get("needs_ocr")),
                # A scan that has been through OCR is still a scan, but its
                # text is now in the index and the reader should be told
                # which of the two they are looking at.
                "ocr": bool(doc.get("ocr")),
                "url": "https://www.cbe.org.eg" + (doc.get("url") or meta.get("url", "")),
            }
        )

        # Index the page, not the document. Term frequency is kept so a page
        # that mentions the query term six times outranks one that mentions it
        # in passing.
        for page in doc.get("pages", []):
            page_total += 1
            counts = collections.Counter(tokens(page.get("text_norm", "")))
            for term, tf in counts.items():
                postings[term].append([n, page["page"], min(tf, 255)])

    # Drop the terms that are too common to help, and cap the rest.
    dropped = 0
    ceiling = max(1, int(page_total * MAX_DOC_FRACTION))
    final: dict[str, list] = {}
    for term, plist in postings.items():
        if len(plist) > ceiling:
            dropped += 1
            continue
        if len(plist) > MAX_POSTINGS:
            plist = sorted(plist, key=lambda p: -p[2])[:MAX_POSTINGS]
        final[term] = plist

    OUT.mkdir(parents=True, exist_ok=True)
    for path in OUT.glob("*.json"):
        path.unlink()

    shards: dict[int, dict] = collections.defaultdict(dict)
    for term, plist in final.items():
        shards[shard_of(term)][term] = plist

    (OUT / "documents.json").write_text(
        json.dumps(documents, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    sizes = []
    for shard, terms in shards.items():
        p = OUT / f"{shard:03d}.json"
        p.write_text(json.dumps(terms, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        sizes.append(p.stat().st_size)

    (OUT / "meta.json").write_text(
        json.dumps(
            {
                "documents": len(documents),
                "pages": page_total,
                "terms": len(final),
                "shards": SHARDS,
                "shard_hash": "djb2 over UTF-16 code units, mod shards",
                "terms_dropped_as_too_common": dropped,
                "notes": (
                    "Terms are normalised: lowercase, Arabic tashkeel and tatweel "
                    "stripped, alef/yeh/teh-marbuta folded, Arabic-Indic digits "
                    "converted. Apply the same normalisation to a query before "
                    "looking it up. Postings are [document_index, page, term_frequency]."
                ),
            },
            indent=1,
        ),
        encoding="utf-8",
    )

    total = sum(sizes) + (OUT / "documents.json").stat().st_size
    print(f"{len(documents):,} documents, {page_total:,} pages")
    print(f"{len(final):,} terms indexed, {dropped:,} dropped as too common")
    print(f"{len(shards)} shards, {total/1e6:.1f} MB total, "
          f"median shard {sorted(sizes)[len(sizes)//2]/1024:.0f} KB" if sizes else "")
    read_by_ocr = sum(1 for d in documents if d["ocr"])
    unread = sum(1 for d in documents if d["needs_ocr"] and not d["ocr"])
    if read_by_ocr:
        print(f"\n{read_by_ocr} scanned documents were read by OCR and are fully indexed.")
    if unread:
        print(f"{unread} documents have no text layer and are indexed by title only. "
              f"Run ingest/ocr_scans.py to read them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
