"""Assemble the MPC statement archive and diff consecutive statements.

Of the 178 MPC releases going back to June 2005, only 28 are HTML pages; the
rest link straight to a PDF. Both are pulled together here -- the HTML ones from
corpus/mpc (written by fetch_press) and the PDF ones from the extracted page
text -- so the archive is continuous rather than starting in 2023.

The diff is the point. Consecutive MPC statements are largely boilerplate, so
what changed between them *is* the news: the sentence where "inflationary
pressures have eased" becomes "inflationary pressures persist" is the signal
that a rate move is coming. Analysts do this by hand for the Fed. Nobody does
it for Egypt.

Diffing is sentence-level rather than word-level, because a word diff on
reflowed text produces noise that reads as change when nothing moved.

Run:  python ingest/mpc_archive.py
"""

from __future__ import annotations

import difflib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
MPC_HTML = CORPUS / "mpc"
PAGES = CORPUS / "pages"
MANIFEST = CORPUS / "manifest.json"
OUT = CORPUS / "mpc_archive.json"

_RE_RATES = re.compile(
    r"overnight deposit rate,?\s*(?:the\s*)?overnight lending rate,?\s*and the "
    r"rate of the main operation[^.]*?at\s*([\d.]+)\s*percent,?\s*([\d.]+)\s*"
    r"percent,?\s*and\s*([\d.]+)\s*percent",
    re.I,
)
_RE_BPS = re.compile(r"by\s*([\d,]+)\s*basis points", re.I)
_RE_DECISION = re.compile(
    r"decided to\s+(keep|maintain|raise|cut|lower|reduce|increase)", re.I
)
DECISION_MAP = {
    "keep": "hold", "maintain": "hold",
    "raise": "hike", "increase": "hike",
    "cut": "cut", "lower": "cut", "reduce": "cut",
}


def sentences(text: str) -> list[str]:
    """Split on sentence ends, keeping only substantive ones."""
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", re.sub(r"\s+", " ", text))
    return [p.strip() for p in parts if len(p.strip()) > 40]


def parse_meta(text: str) -> dict:
    out: dict[str, object] = {}
    m = _RE_RATES.search(text)
    if m:
        out["deposit_rate"] = float(m.group(1))
        out["lending_rate"] = float(m.group(2))
        out["main_operation_rate"] = float(m.group(3))
    b = _RE_BPS.search(text)
    if b:
        out["basis_points"] = int(b.group(1).replace(",", ""))
    d = _RE_DECISION.search(text)
    if d:
        out["decision"] = DECISION_MAP.get(d.group(1).lower(), d.group(1).lower())
    return out


def collect() -> list[dict]:
    """All MPC statements, HTML and PDF-derived, sorted by date."""
    found: dict[str, dict] = {}

    for path in sorted(MPC_HTML.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        found[doc["date"]] = {
            "date": doc["date"],
            "title": doc.get("title"),
            "url": doc.get("url"),
            "format": "html",
            "text": doc.get("text", ""),
            **{k: v for k, v in doc.items()
               if k in ("deposit_rate", "lending_rate", "main_operation_rate",
                        "discount_rate", "decision")},
        }

    if MANIFEST.exists() and PAGES.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["documents"]
        mpc_docs = [
            d for d in manifest
            if "MPC Press Release" in (d.get("categories") or [])
            and (PAGES / f"{d['id']}.json").exists()
        ]
        for doc in mpc_docs:
            if doc["date"] in found:
                continue  # the HTML version is cleaner
            pages = json.loads((PAGES / f"{doc['id']}.json").read_text(encoding="utf-8"))
            text = " ".join(p["text"] for p in pages["pages"])
            if len(text) < 200:
                continue  # a scan we cannot read yet
            found[doc["date"]] = {
                "date": doc["date"],
                "title": doc.get("title"),
                "url": "https://www.cbe.org.eg" + doc["url"],
                "format": "pdf",
                "text": text,
                **parse_meta(text),
            }

    return sorted(found.values(), key=lambda d: d["date"])


def diff(previous: dict, current: dict) -> dict:
    """Sentence-level diff, plus the rate move if both statements state one."""
    a, b = sentences(previous["text"]), sentences(current["text"])
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)

    added, removed, changed = [], [], []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "insert":
            added += b[j1:j2]
        elif tag == "delete":
            removed += a[i1:i2]
        elif tag == "replace":
            # Pair them up so the UI can show before and after side by side.
            for k in range(max(i2 - i1, j2 - j1)):
                changed.append(
                    {
                        "before": a[i1 + k] if i1 + k < i2 else None,
                        "after": b[j1 + k] if j1 + k < j2 else None,
                    }
                )

    move = None
    for key in ("deposit_rate", "lending_rate", "main_operation_rate"):
        if key in previous and key in current:
            move = move or {}
            move[key] = {
                "from": previous[key],
                "to": current[key],
                "change": round(current[key] - previous[key], 2),
            }

    return {
        "from_date": previous["date"],
        "to_date": current["date"],
        "similarity": round(sm.ratio(), 3),
        "sentences_added": added,
        "sentences_removed": removed,
        "sentences_changed": changed,
        "rate_move": move,
    }


def main() -> int:
    statements = collect()
    if not statements:
        print("no MPC statements found; run fetch_press.py and extract_text.py first",
              file=sys.stderr)
        return 1

    diffs = [diff(statements[i - 1], statements[i]) for i in range(1, len(statements))]

    OUT.write_text(
        json.dumps(
            {
                "count": len(statements),
                "range": [statements[0]["date"], statements[-1]["date"]],
                "statements": [
                    {k: v for k, v in s.items() if k != "text"} | {"chars": len(s["text"])}
                    for s in statements
                ],
                "diffs": diffs,
            },
            indent=1,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    html = sum(1 for s in statements if s["format"] == "html")
    print(f"{len(statements)} MPC statements ({html} HTML, {len(statements) - html} from PDF)")
    print(f"range {statements[0]['date']} to {statements[-1]['date']}")
    print(f"{len(diffs)} diffs -> corpus/mpc_archive.json")

    moves = [d for d in diffs if d["rate_move"]]
    print(f"{len(moves)} consecutive pairs where both statements name their rates")
    if diffs:
        avg = sum(d["similarity"] for d in diffs) / len(diffs)
        print(f"mean similarity between consecutive statements: {avg:.0%}")
        loud = max(diffs, key=lambda d: len(d["sentences_changed"]) + len(d["sentences_added"]))
        print(
            f"\nmost changed: {loud['from_date']} -> {loud['to_date']} "
            f"({len(loud['sentences_changed'])} rewritten, {len(loud['sentences_added'])} added)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
