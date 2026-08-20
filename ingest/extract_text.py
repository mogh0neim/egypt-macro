"""Extract searchable text from the document corpus, one record per page.

Page granularity is deliberate. It makes `viewer.html#page=14` deep links free,
it matches how people cite a central bank document, and it means a 180-page
statistical bulletin surfaces as three precise hits rather than one useless one.

Arabic needs care that Latin text does not:

  * PyMuPDF is used rather than pdfplumber or pypdf because it is the only
    common extractor that performs bidi reordering. The others hand back
    visual-order characters that read backwards.
  * Both a raw and a normalised form of every page are stored. The normalised
    form strips tashkeel and tatweel and folds alef and yeh variants, which is
    what makes search work -- a query typed with different hamza forms should
    still match. The raw form is what gets displayed.
  * Arabic-Indic digits are folded to ASCII, because CBE mixes both.

A PDF with almost no extractable text is a scan. Those are counted and listed
rather than silently indexed as empty, because they need OCR to be useful and
pretending otherwise would leave a hole in the search index that nobody sees.

Run:  python ingest/extract_text.py [--limit N] [--force]
"""

from __future__ import annotations

import argparse
import collections
import gzip
import json
import pathlib
import re
import sys
import unicodedata

import fitz  # PyMuPDF

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
MANIFEST = CORPUS / "manifest.json"
PAGES = CORPUS / "pages"
REPORT = CORPUS / "extraction_report.json"

# Below this many characters per page, a PDF is a scan rather than a document
# with a text layer.
SCAN_THRESHOLD = 90

ARABIC = re.compile(r"[؀-ۿ]")
_TASHKEEL = re.compile(r"[ً-ْٰـ]")  # harakat + tatweel
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_FOLD = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
})


def normalise(text: str) -> str:
    """Index form: folded, undecorated, ASCII digits, single-spaced."""
    t = unicodedata.normalize("NFKC", text)
    t = _TASHKEEL.sub("", t)
    t = t.translate(_FOLD).translate(_ARABIC_INDIC)
    return re.sub(r"\s+", " ", t).strip().lower()


def tidy(text: str) -> str:
    """Display form: keep the characters, just fix the whitespace."""
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()


def language_of(text: str) -> str:
    arabic = len(ARABIC.findall(text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if arabic > latin * 1.5:
        return "ar"
    if latin > arabic * 1.5:
        return "en"
    return "mixed" if (arabic or latin) else "unknown"


def extract_pdf(path: pathlib.Path) -> tuple[list[dict], bool]:
    """-> (pages, needs_ocr)."""
    pages: list[dict] = []
    with fitz.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            raw = page.get_text("text") or ""
            display = tidy(raw)
            pages.append(
                {
                    "page": i,
                    "chars": len(display),
                    "lang": language_of(display),
                    "text": display,
                    "text_norm": normalise(display),
                }
            )
    if not pages:
        return [], True
    avg = sum(p["chars"] for p in pages) / len(pages)
    return pages, avg < SCAN_THRESHOLD


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true", help="re-extract already-done docs")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    docs = manifest["documents"]
    PAGES.mkdir(parents=True, exist_ok=True)

    todo = [
        d
        for d in docs
        if d.get("local")
        and d["local"].lower().endswith(".pdf")
        and (args.force or not (PAGES / f"{d['id']}.json.gz").exists())
    ]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} PDFs to extract\n")

    scanned: list[dict] = []
    failed: list[dict] = []
    stats = collections.Counter()
    total_pages = 0

    for i, doc in enumerate(todo, 1):
        path = ROOT / doc["local"]
        if not path.exists():
            failed.append({"id": doc["id"], "reason": "file missing", "url": doc["url"]})
            continue
        try:
            pages, needs_ocr = extract_pdf(path)
        except Exception as exc:  # noqa: BLE001
            failed.append(
                {"id": doc["id"], "reason": f"{type(exc).__name__}: {exc}", "url": doc["url"]}
            )
            continue

        total_pages += len(pages)
        stats[collections.Counter(p["lang"] for p in pages).most_common(1)[0][0] if pages else "empty"] += 1
        if needs_ocr:
            scanned.append(
                {
                    "id": doc["id"],
                    "title": doc.get("title"),
                    "date": doc.get("date"),
                    "url": doc["url"],
                    "pages": len(pages),
                }
            )

        # Gzipped: ~100k pages of text is 200 MB raw and about a tenth of that
        # compressed, and this is committed.
        (PAGES / f"{doc['id']}.json.gz").write_bytes(
            gzip.compress(json.dumps(
                {
                    "id": doc["id"],
                    "title": doc.get("title"),
                    "date": doc.get("date"),
                    "source": doc.get("source"),
                    "categories": doc.get("categories"),
                    "url": doc["url"],
                    "needs_ocr": needs_ocr,
                    "page_count": len(pages),
                    "pages": pages,
                },
                ensure_ascii=False,
            ).encode("utf-8"), compresslevel=9, mtime=0)
        )
        if i % 100 == 0:
            print(f"  [{i}/{len(todo)}] {total_pages:,} pages, {len(scanned)} scanned, {len(failed)} failed")

    REPORT.write_text(
        json.dumps(
            {
                "extracted": len(todo) - len(failed),
                "pages": total_pages,
                "by_language": dict(stats),
                "needs_ocr_count": len(scanned),
                "needs_ocr": scanned,
                "failed": failed,
            },
            indent=1,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print(f"\n{len(todo) - len(failed)} documents, {total_pages:,} pages")
    print(f"dominant language: {dict(stats)}")
    if scanned:
        print(
            f"\n{len(scanned)} documents are scans with no text layer -- they need OCR "
            f"to be searchable.\nListed in corpus/extraction_report.json."
        )
    if failed:
        print(f"{len(failed)} failed to open (see the report)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
