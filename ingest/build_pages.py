"""Publish the page text, so a full-text hit can show what it found.

Search already lands a reader on a page number, which is most of the work and
not quite enough: "page 42 of the November 2019 bulletin" gives no way to tell
whether page 42 is worth opening, and the only way to find out is to fetch a
200-page PDF from cbe.org.eg and scroll.

The text is already extracted. extract_text.py wrote it to corpus/pages/, and
nothing has ever copied it into dist/, so the site could search 53,006 pages
without being able to quote one of them.

What goes out is deliberately less than what is stored:

  - the original text, not the normalised copy. The index is built on the
    normalised one, but folded letters and lowercased English make a poor
    snippet, and the front end can fold a page itself when it needs to match.
  - NFKC applied. A good number of CBE's PDFs store Arabic as presentation
    forms, the isolated and medial glyph variants, which read as gibberish and
    are exactly what NFKC folds back to ordinary letters. This alone takes the
    share of pages that look broken from 22% to 12%.
  - control characters dropped, and Private Use Area code points replaced by a
    space. A PUA code point carries no meaning at all by definition: it appears
    where a PDF embeds a font with no Unicode mapping, so the text layer holds
    glyph indices rather than characters. Nothing can recover those, and showing
    the readable fragments is better than showing the noise between them.
  - whitespace collapsed. PDF extraction leaves text full of single newlines
    mid-sentence, which is fine for an index and unreadable in a quote.
  - nothing else. No title, no date, no language: documents.json already
    carries all of that and the front end has it in memory.

That comes to about 54 MB gzipped across 1,478 files, median 3 KB, against a
dist/ that is already 117 MB and a GitHub Pages limit of 1 GB. Each file is
fetched only when a result from that document needs a snippet.
"""

from __future__ import annotations

import gzip
import json
import pathlib
import re
import shutil
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "corpus" / "pages"
OUT = ROOT / "dist" / "pages"

WHITESPACE = re.compile(r"\s+")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ufffd]")
# The Private Use Area, plus the two supplementary planes reserved for it.
PRIVATE_USE = re.compile(r"[\ue000-\uf8ff\U000f0000-\U000ffffd\U00100000-\U0010fffd]")

# A page counts as damaged when this much of it was unmapped glyph codes. The
# measure has to be what was LOST, not what is left: dropping the unmapped
# characters takes them out of the denominator too, so a page that lost most of
# its words scores as perfectly readable if you only look at the survivors.
DAMAGED_AT = 0.15


# A snippet is a couple of hundred characters around a match. Keeping whole
# pages of a statistical bulletin, which are mostly numbers in columns, would
# spend most of the payload on text no query will ever hit in a readable way.
# 20,000 characters is far more than any snippet needs and still shorter than
# the longest pages.
MAX_CHARS = 20_000


def readable_text(raw: str) -> tuple[str, float]:
    """The publishable text, and the share of it that could not be mapped."""
    t = unicodedata.normalize("NFKC", raw)
    t = CONTROL.sub("", t)
    lost = len(PRIVATE_USE.findall(t))
    share = lost / len(t) if t else 0.0
    t = PRIVATE_USE.sub(" ", t)
    return WHITESPACE.sub(" ", t).strip(), share



def main() -> int:
    if not PAGES.exists():
        print("corpus/pages is missing. Run ingest/extract_text.py first.")
        return 1

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    files = sorted(PAGES.glob("*.json.gz"))
    written = pages_out = skipped = truncated = 0
    counted = unreadable = 0
    total_bytes = 0

    for path in files:
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            doc = json.load(fh)

        pages: dict[str, str] = {}
        for page in doc.get("pages", []):
            text, lost_share = readable_text(page.get("text") or "")
            if not text:
                continue
            counted += 1
            if lost_share >= DAMAGED_AT:
                unreadable += 1
            if len(text) > MAX_CHARS:
                text = text[:MAX_CHARS]
                truncated += 1
            pages[str(page["page"])] = text

        if not pages:
            skipped += 1
            continue

        blob = json.dumps({"pages": pages}, ensure_ascii=False, separators=(",", ":"))
        # mtime=0 so an unchanged page does not produce a new hash on every run.
        # The manifest is meant to say that a file changed, not that it was
        # rebuilt.
        out_path = OUT / (doc["id"] + ".json.gz")
        with gzip.GzipFile(out_path, "wb", compresslevel=9, mtime=0) as fh:
            fh.write(blob.encode("utf-8"))

        written += 1
        pages_out += len(pages)
        total_bytes += out_path.stat().st_size

    print(f"{written:,} documents, {pages_out:,} pages of text -> dist/pages/")
    print(f"  {total_bytes/1e6:.0f} MB gzipped, median "
          f"{sorted(p.stat().st_size for p in OUT.glob('*.gz'))[max(0, written // 2)]/1e3:.0f} KB")
    if skipped:
        print(f"  {skipped} documents had no extractable text and were skipped")
    if truncated:
        print(f"  {truncated:,} pages were longer than {MAX_CHARS:,} characters and were cut")
    if counted:
        print(f"  {unreadable:,} of {counted:,} pages ({unreadable/counted*100:.1f}%) lost at least "
              f"{DAMAGED_AT:.0%} of their characters to unmapped glyph codes: those PDFs embed a "
              f"font with no Unicode mapping, and nothing short of OCR can recover the text")
    return 0


if __name__ == "__main__":
    sys.exit(main())
