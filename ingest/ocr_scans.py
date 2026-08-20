"""Read the scanned documents that have no text layer.

77 documents in the corpus are images of paper. extract_text.py finds them and
records them in corpus/extraction_report.json under needs_ocr, but leaves them
unsearchable: they can be found by title and by nothing else.

This closes that hole with Tesseract, through PyMuPDF's own OCR binding, in
Arabic and English. No API key and no bill -- the whole set is a few hundred
pages, which a CI runner gets through in minutes.

It writes into the same corpus/pages/<id>.json.gz that extract_text.py owns,
with `ocr: true` on the record, so the search index picks the text up with no
change at all and a reader can still tell a machine-read page from a real
text layer.

Tesseract is not a Python dependency and is not in requirements.txt. Where it
is missing this exits cleanly saying so, rather than failing a workflow that
had nothing to do with OCR.

Run:  python ingest/ocr_scans.py [--limit N] [--force] [--dpi 300]
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import pathlib
import sys

import fitz  # PyMuPDF

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cbe_client import CBEClient  # noqa: E402
from extract_text import language_of, normalise, tidy  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
MANIFEST = CORPUS / "manifest.json"
PAGES = CORPUS / "pages"
FILES = CORPUS / "files"
REPORT = CORPUS / "extraction_report.json"

# Tesseract on a 300 dpi render is the point where Arabic stops guessing.
# Below about 250 it starts folding similar letterforms together.
DEFAULT_DPI = 300

# A page that OCRs to less than this is blank, a cover, or a photograph. It is
# recorded rather than dropped, so the page numbering stays honest.
MIN_CHARS = 25


# Where Tesseract keeps its language models. PyMuPDF reads TESSDATA_PREFIX and
# nothing else, and the path moves between distributions, so look for it.
TESSDATA_CANDIDATES = [
    "/usr/share/tesseract-ocr/5/tessdata",
    "/usr/share/tesseract-ocr/4.00/tessdata",
    "/usr/share/tessdata",
    "/opt/homebrew/share/tessdata",
    "/usr/local/share/tessdata",
]


def tesseract_available() -> bool:
    if not os.environ.get("TESSDATA_PREFIX"):
        for candidate in TESSDATA_CANDIDATES:
            if (pathlib.Path(candidate) / "eng.traineddata").exists():
                os.environ["TESSDATA_PREFIX"] = candidate
                break
    try:
        return bool(fitz.get_tessdata())
    except Exception:  # noqa: BLE001
        return False


def ocr_pdf(path: pathlib.Path, dpi: int) -> list[dict]:
    pages: list[dict] = []
    with fitz.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            try:
                tp = page.get_textpage_ocr(language="ara+eng", dpi=dpi, full=True)
                raw = page.get_text("text", textpage=tp) or ""
            except Exception:  # noqa: BLE001
                raw = ""
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
    return pages


def ensure_local(client: CBEClient, doc: dict) -> pathlib.Path | None:
    """The mirrored PDFs are gitignored, so a CI runner starts without them.
    Re-fetch just the scans, and check the hash the manifest already holds."""
    local = doc.get("local")
    if local and (ROOT / local).exists():
        return ROOT / local
    FILES.mkdir(parents=True, exist_ok=True)
    target = FILES / f"{doc['id']}.pdf"
    try:
        blob = client.get_bytes(doc["url"])
    except Exception as exc:  # noqa: BLE001
        print(f"  could not fetch {doc['id']}: {exc}")
        return None
    if doc.get("sha256") and hashlib.sha256(blob).hexdigest() != doc["sha256"]:
        print(f"  {doc['id']} no longer matches the hash in the manifest; skipping")
        return None
    target.write_bytes(blob)
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true", help="re-OCR documents already done")
    ap.add_argument("--dpi", type=int, default=DEFAULT_DPI)
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    if not tesseract_available():
        print(
            "Tesseract is not installed, or TESSDATA_PREFIX is not set.\n"
            "  Ubuntu:  sudo apt-get install -y tesseract-ocr tesseract-ocr-ara\n"
            "  macOS:   brew install tesseract tesseract-lang\n"
            "Nothing to do."
        )
        return 0

    if not REPORT.exists():
        print("No extraction report. Run ingest/extract_text.py first.")
        return 1
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    scanned = report.get("needs_ocr", [])
    by_id = {d["id"]: d for d in json.loads(MANIFEST.read_text(encoding="utf-8"))["documents"]}

    todo = []
    for entry in scanned:
        doc = by_id.get(entry["id"])
        if not doc:
            continue
        page_file = PAGES / f"{entry['id']}.json.gz"
        if not args.force and page_file.exists():
            existing = json.loads(gzip.decompress(page_file.read_bytes()).decode("utf-8"))
            if existing.get("ocr"):
                continue
        todo.append(doc)
    if args.limit:
        todo = todo[: args.limit]

    print(f"{len(todo)} scanned documents to read ({len(scanned)} flagged in total)\n")
    if not todo:
        return 0

    client = CBEClient(delay=args.delay)
    done = 0
    total_pages = 0
    total_chars = 0
    empty: list[str] = []

    for i, doc in enumerate(todo, 1):
        path = ensure_local(client, doc)
        if not path:
            continue
        pages = ocr_pdf(path, args.dpi)
        if not pages:
            continue
        chars = sum(p["chars"] for p in pages)
        if chars < MIN_CHARS * len(pages):
            empty.append(doc["id"])
        page_file = PAGES / f"{doc['id']}.json.gz"
        record = {}
        if page_file.exists():
            record = json.loads(gzip.decompress(page_file.read_bytes()).decode("utf-8"))
        record.update(
            {
                "id": doc["id"],
                "title": doc.get("title"),
                "date": doc.get("date"),
                "source": doc.get("source"),
                "categories": doc.get("categories"),
                "url": doc["url"],
                # The page still has no text layer of its own. What changed is
                # that we can now read it. Both facts belong on the record.
                "needs_ocr": True,
                "ocr": True,
                "ocr_dpi": args.dpi,
                "page_count": len(pages),
                "pages": pages,
            }
        )
        # mtime=0 or every run rewrites every byte and the diff becomes noise.
        page_file.write_bytes(
            gzip.compress(
                json.dumps(record, ensure_ascii=False).encode("utf-8"),
                compresslevel=9,
                mtime=0,
            )
        )
        done += 1
        total_pages += len(pages)
        total_chars += chars
        print(f"  [{i}/{len(todo)}] {doc['id']}  {len(pages)} pages, {chars:,} characters")

    report["ocr"] = {
        "documents": done,
        "pages": total_pages,
        "characters": total_chars,
        "dpi": args.dpi,
        "engine": "tesseract via PyMuPDF, ara+eng",
        "produced_almost_nothing": empty,
    }
    REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"\n{done} documents, {total_pages:,} pages, {total_chars:,} characters of text")
    if empty:
        print(f"{len(empty)} produced almost nothing -- probably blank or photographic")
    print("Rebuild the index next:  python ingest/build_search.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
