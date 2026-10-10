"""Extract searchable text from the document corpus, one record per page.

Page granularity is deliberate. It makes `viewer.html#page=14` deep links free,
it matches how people cite a central bank document, and it means a 180-page
statistical bulletin surfaces as three precise hits rather than one useless one.

Arabic needs care that Latin text does not:

  * PyMuPDF is used rather than pdfplumber or pypdf because it is the only
    common extractor that performs bidi reordering. The others hand back
    visual-order characters that read backwards.
  * Both a raw and a normalised form of every page are stored. The normalised
    form strips tashkeel and tatweel and folds alef and yeh variants and the
    Persian letter forms, which is what makes search work -- a query typed with
    different hamza forms should still match. The raw form is what gets
    displayed. A stored normalised form is only as new as the run that wrote
    it; build_search.py normalises it again, so a later fold still applies.
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
# Harakat, Quranic marks, superscript alef, tatweel, the Arabic letter mark and
# the zero-width and direction marks. None of them is a letter, and left in
# they split a word in two.
_TASHKEEL = re.compile(r"[ؐ-ؚ؜ً-ٰٟۖ-ۭـ​-‏]")
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_FOLD = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
    # Persian and Urdu letter forms. A fifth of CBE's Arabic pages are set in
    # fonts that map yeh and heh to these, so "المستهلكين" was two words in the
    # index, and the one a reader types was on fewer pages than the other.
    "ی": "ي", "ې": "ي", "ے": "ي", "ک": "ك", "گ": "ك",
    "ھ": "ه", "ہ": "ه", "ۀ": "ه", "ە": "ه",
    # Arabic punctuation separates words, it is never part of one. Left alone,
    # "التضخم،" was its own index word on 93 pages a search for التضخم missed.
    "،": " ", "؛": " ", "؟": " ", "۔": " ",
    # The Arabic decimal and thousands separators and percent sign, so "9٫5"
    # and "9.5" are the same number.
    "٫": ".", "٬": ",", "٪": "%",
})


def normalise(text: str) -> str:
    """Index form: folded, undecorated, ASCII digits, single-spaced.

    Idempotent, which build_search.py relies on: it normalises the stored
    text_norm again, so a fold added here reaches the index without
    re-extracting a single PDF.
    """
    t = unicodedata.normalize("NFKC", text)
    t = _TASHKEEL.sub("", t)
    t = t.translate(_FOLD).translate(_ARABIC_INDIC)
    return re.sub(r"\s+", " ", t).strip().lower()


# ---------- the split lam-alef ----------
#
# About half of the Arabic documents come out of PyMuPDF with every lam-alef
# reversed. The font draws لا as one glyph, the glyph maps back to two
# characters, and the bidi pass then turns them round as if they were two
# glyphs. "خلال" comes out as "خالل", "العملاء" as "العمالء", "الإدارة" as
# "اإلدارة", and a query typed correctly matches none of them.
#
# It cannot be undone a character at a time, because the damaged pair is also
# how ordinary text looks: "ال" is the article. So it is undone by vocabulary.
# A document is damaged when its words start "اال" (the article in front of a
# hamza word, reversed) more often than "الا" (the same thing, intact). Every
# word in it containing "ال" is tried with those pairs turned back into "لا",
# and a spelling wins only if the undamaged documents use it far more often.
# "اجمالي" really does contain "ال" and stays as it is, because nobody writes
# "اجملاي".
#
# The repair runs where the text is used, in build_search.py and
# build_pages.py, over the text already in corpus/pages. Nothing has to be
# extracted again for it to take effect.

_AR_LETTERS = "ء-غف-يٱ-ۓ"
_AR_WORD = re.compile(f"[{_AR_LETTERS}]+")
# A display word: letters plus the marks normalise() drops.
_AR_DISPLAY_WORD = re.compile(f"[{_AR_LETTERS}ؐ-ًؚ-ٰٟە-ۭـ]+")
_DAMAGED_START, _INTACT_START = "اال", "الا"
# A repair needs the intact spelling this many times in undamaged documents,
# and this many times more often than the spelling it replaces.
_REPAIR_MIN, _REPAIR_RATIO = 3, 4


class LamAlef:
    def __init__(self, pages: pathlib.Path) -> None:
        self.damaged: set[str] = set()
        self.clean: collections.Counter = collections.Counter()
        self._memo: dict[str, str] = {}
        for path in sorted(pages.glob("*.json.gz")):
            doc = json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))
            words = collections.Counter()
            for page in doc.get("pages", []):
                words.update(_AR_WORD.findall(normalise(page.get("text_norm", ""))))
            bad = sum(n for w, n in words.items() if w.startswith(_DAMAGED_START))
            good = sum(n for w, n in words.items() if w.startswith(_INTACT_START))
            if bad > good:
                self.damaged.add(doc["id"])
            else:
                self.clean.update(words)

    def word(self, w: str) -> str:
        """The repaired spelling of one normalised word."""
        if w in self._memo:
            return self._memo[w]
        spots = [i for i in range(len(w) - 1) if w[i] == "ا" and w[i + 1] == "ل"][:4]
        best, best_n = w, 0
        for mask in range(1, 1 << len(spots)):
            c = list(w)
            for k, i in enumerate(spots):
                if mask >> k & 1:
                    c[i], c[i + 1] = "ل", "ا"
            n = self.clean.get("".join(c), 0)
            if n > best_n:
                best, best_n = "".join(c), n
        if best_n < _REPAIR_MIN or best_n <= _REPAIR_RATIO * self.clean.get(w, 0):
            best = w
            # The article in front of a hamza word is never written "اال",
            # with or without و ب ف ك before it, so that one is safe to turn
            # round even in a word nobody else used.
            at = 1 if w[:1] in ("و", "ب", "ف", "ك") else 0
            if w.startswith(_DAMAGED_START, at) and len(w) > at + 3:
                best = w[:at] + _INTACT_START + w[at + 3:]
        self._memo[w] = best
        return best

    def normalised(self, doc_id: str, text: str) -> str:
        """Repair normalised text, if it came from a damaged document."""
        if doc_id not in self.damaged:
            return text
        return _AR_WORD.sub(lambda m: self.word(m.group(0)), text)

    def display(self, doc_id: str, text: str) -> str:
        """Repair display text the same way, keeping every character CBE set."""
        if doc_id not in self.damaged:
            return text

        def fix(m: re.Match) -> str:
            raw = m.group(0)
            keep = [i for i, ch in enumerate(raw) if normalise(ch)]
            folded = "".join(normalise(raw[i]) for i in keep)
            fixed = self.word(folded)
            if fixed == folded or len(fixed) != len(keep):
                return raw
            out = list(raw)
            for k in range(len(folded) - 1):
                if folded[k:k + 2] == "ال" and fixed[k:k + 2] == "لا":
                    a, b = keep[k], keep[k + 1]
                    out[a], out[b] = raw[b], raw[a]
            return "".join(out)

        return _AR_DISPLAY_WORD.sub(fix, text)


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
