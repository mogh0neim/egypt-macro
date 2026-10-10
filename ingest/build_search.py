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
folded, Persian letter forms folded, Arabic-Indic digits converted -- so a
query typed with a different hamza still matches. The display text keeps its
original characters.

Every step from page text to index term has a twin in web/core.js, and the
two must agree or a query silently finds nothing:

  normalise()   extract_text.py         normaliseQuery / normaliseWithMap
  _TOKEN        here                    SEARCH_TOKEN
  stem()        here                    stemArabic
  shard_of()    here                    shardFor (views-docs.js)

Run:  python ingest/build_search.py
"""

from __future__ import annotations

import collections
import gzip
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from extract_text import LamAlef, normalise  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
PAGES = CORPUS / "pages"
MANIFEST = CORPUS / "manifest.json"
OUT = ROOT / "dist" / "search"

# 512, not 256, since numbers went in and the per-term cap came off: the index
# tripled in postings, and twice the shards keeps one shard, which is what a
# query term costs to look up, smaller than it was before either change.
SHARDS = 512
MIN_TERM = 2
MAX_TERM = 28
# A term on more than this share of pages carries no information and would
# dominate the index by size ("the", "central", "bank"). These are listed in
# meta.json, and the search page ignores them in a query and says so, rather
# than requiring a word the index cannot have.
MAX_DOC_FRACTION = 0.28
# There is no cap on how many pages one term may list. There was one, 4,000
# pages kept by term frequency, and it cut a third of the pages from the words
# people search for most ("external" kept 4,000 of 14,102), so a page that said
# "external debt" once was not in the index for either word.

# Numbers first, so "18136.2" and "9.5" stay whole instead of splitting at the
# point; a comma grouping thousands is dropped afterwards, so "18,136.2" is the
# same term. Then words: Latin letters and digits, or Arabic letters. Arabic
# punctuation is not a letter, so "التضخم،" is the word التضخم.
_TOKEN = re.compile(
    r"[0-9]+(?:,[0-9]{3})+(?:\.[0-9]+)?(?![0-9])"
    r"|[0-9]+\.[0-9]+"
    r"|[a-z0-9ء-غف-يٱ-ۓ]+"
)

# Light Arabic stemming: the article, with the one-letter words that fuse to
# it, and the sound plurals. Without it "التضخم" and "تضخم" were different
# words, and the one a reader typed decided which pages they saw. The stem is
# always a stretch of the word as printed, which is what lets the search page
# find it again in the text to highlight it.
_AR_PREFIXES = ("وال", "بال", "كال", "فال", "لل", "ال")
_AR_SUFFIXES = ("ات", "ون", "ين")

STOP_WORDS = {
    "the", "and", "for", "with", "that", "this", "from", "was", "were", "has",
    "have", "had", "its", "their", "which", "been", "are", "not", "but", "all",
    "any", "may", "can", "will", "shall", "such", "into", "than", "then",
    "also", "other", "these", "those", "there", "over", "under", "per", "out",
    "one", "two", "new", "end", "due", "each", "more", "most", "some", "only",
    "في", "من", "على", "الى", "عن", "مع", "هذا", "هذه", "التي", "الذي", "كما",
    "ذلك", "بين", "قد", "ما", "لا", "أن", "ان", "او", "الا", "به", "له",
}


def stem(term: str) -> str:
    if not "ء" <= term[0] <= "ۓ":
        return term
    for p in _AR_PREFIXES:
        if term.startswith(p) and len(term) - len(p) >= 2:
            term = term[len(p):]
            break
    for s in _AR_SUFFIXES:
        if term.endswith(s) and len(term) - len(s) >= 4:
            term = term[: -len(s)]
            break
    return term


# In index form, so "على" is the "علي" that normalised text actually holds.
STOP = {stem(normalise(w)) for w in STOP_WORDS}


def tokens(text: str) -> list[str]:
    """Index terms in normalised text."""
    out = []
    for t in _TOKEN.findall(text):
        t = t.replace(",", "")
        if MIN_TERM <= len(t) <= MAX_TERM:
            t = stem(t)
            if t not in STOP:
                out.append(t)
    return out


def packed(plist: list) -> list[int]:
    """[doc, page, tf] postings, in order, as one flat list of gaps.

    Each posting is three numbers: how many documents on from the last one, the
    page (or, in the same document, how many pages on), and the count. Most
    gaps are a single digit, which takes a third off the index against writing
    every posting out in full.
    """
    out: list[int] = []
    doc = page = 0
    for d, p, tf in sorted(plist):
        out += [d - doc, p - page if d == doc else p, tf]
        doc, page = d, p
    return out


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
    lam_alef = LamAlef(PAGES)

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
        # in passing. The stored text_norm is normalised again because it was
        # written by whatever normalise() said at extraction time.
        for page in doc.get("pages", []):
            page_total += 1
            text = lam_alef.normalised(doc["id"], normalise(page.get("text_norm", "")))
            counts = collections.Counter(tokens(text))
            for term, tf in counts.items():
                postings[term].append([n, page["page"], min(tf, 255)])

    # Drop the terms that are too common to help.
    dropped: list[str] = []
    ceiling = max(1, int(page_total * MAX_DOC_FRACTION))
    final: dict[str, list] = {}
    for term, plist in postings.items():
        if len(plist) > ceiling:
            dropped.append(term)
            continue
        final[term] = packed(plist)

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
                "terms_dropped_as_too_common": len(dropped),
                # Words a query should skip rather than require: the stop
                # words and the terms too common to index, in index form.
                "ignored": sorted(STOP | set(dropped)),
                "lam_alef_repaired_documents": len(lam_alef.damaged),
                "notes": (
                    "Terms are normalised: lowercase, Arabic tashkeel and tatweel "
                    "stripped, alef/yeh/teh-marbuta and Persian letter forms folded, "
                    "Arabic punctuation a separator, Arabic-Indic digits converted. "
                    "Numbers are terms, decimals included, with thousands commas "
                    "dropped. Arabic terms lose the article and a sound-plural "
                    "ending. Apply the same steps to a query before looking it up, "
                    "and skip the terms listed under ignored. A term's postings "
                    "are one flat list of triples (document gap, page, term "
                    "frequency): the document gap counts on from the previous "
                    "posting's document_index, starting at 0, and where it is 0 "
                    "the page counts on from the previous posting's page."
                ),
            },
            indent=1,
        ),
        encoding="utf-8",
    )

    total = sum(sizes) + (OUT / "documents.json").stat().st_size
    print(f"{len(documents):,} documents, {page_total:,} pages")
    print(f"{len(final):,} terms indexed, {len(dropped):,} dropped as too common: "
          f"{', '.join(sorted(dropped))}")
    print(f"{len(lam_alef.damaged):,} documents had their split lam-alef repaired")
    print(f"{len(shards)} shards, {total/1e6:.1f} MB total, "
          f"median shard {sorted(sizes)[len(sizes)//2]/1024:.0f} KB, "
          f"largest {max(sizes)/1024:.0f} KB" if sizes else "")
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
