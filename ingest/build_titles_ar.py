"""Compose an Arabic title for the series CBE never named in Arabic.

CBE publishes `title_ar` for the Excel archive and for nothing else. That
leaves 223 series unnamed in Arabic: every exchange rate, every policy rate,
every treasury bill auction, all of inflation, the reserves, the remittances.
Which is to say: everything on the front page.

An Arabic site whose headline figures are labelled in English is not an Arabic
site. So these are written here -- and because they are ours and not the
Bank's, `build_exports.py` marks them `title_ar_source: "miqyas"` and the
series page says so. Passing our translation off as CBE's name for a figure
would be exactly the kind of small lie this project cannot afford.

CBE's English titles are "<table> - <line>", so the Arabic is composed the same
way from a vocabulary of 19 table names and about 110 line names rather than
written out 223 times. That keeps the terms consistent across every page and
makes a new CBE series show up as a gap rather than silently staying English:
anything this cannot compose is listed, and `--check` makes that an error.

Run:  python ingest/build_titles_ar.py [--check]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "catalog"
VOCAB = CATALOG / "titles_ar_vocab.json"
OUT = CATALOG / "titles_ar.json"

AUCTION = re.compile(r"^(EGP|USD|EUR) treasury bill (\d+-month) auction, (.+)$")


def compose(title: str, vocab: dict) -> str | None:
    tables = vocab["tables"]
    lines = vocab["lines"]
    auction = vocab["auction"]

    m = AUCTION.match(title)
    if m:
        currency, tenor, measure = m.groups()
        parts = (auction["currency"].get(currency),
                 auction["tenor"].get(tenor),
                 auction["measure"].get(measure))
        if all(parts):
            return (auction["join"]
                    .replace("{currency}", parts[0])
                    .replace("{tenor}", parts[1])
                    .replace("{measure}", parts[2]))
        return None

    if " - " in title:
        table, line = title.split(" - ", 1)
        if table in tables and line in lines:
            return tables[table] + " - " + lines[line]
        return None

    return tables.get(title)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if any series CBE named only in English is still unnamed")
    args = ap.parse_args()

    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    series = json.loads((CATALOG / "series.json").read_text(encoding="utf-8"))

    written, gaps = {}, []
    for s in series:
        if s.get("title_ar"):
            continue  # CBE named it; theirs wins, always
        arabic = compose(s.get("title_en") or "", vocab)
        if arabic:
            written[s["series_id"]] = arabic
        else:
            gaps.append((s["series_id"], s.get("title_en") or ""))

    OUT.write_text(json.dumps({
        "note": ("Arabic titles written by Miqyas for the series CBE named only in English. "
                 "Composed by ingest/build_titles_ar.py from catalog/titles_ar_vocab.json. "
                 "These are not CBE's names and the site says so."),
        "count": len(written),
        "titles": dict(sorted(written.items())),
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    covered = len(written) + len(gaps)
    print(f"Arabic titles: {len(written):,} of {covered:,} series CBE left unnamed")
    if gaps:
        print(f"\n{len(gaps)} still unnamed. Add the missing words to "
              f"catalog/titles_ar_vocab.json:", file=sys.stderr)
        for sid, title in gaps[:20]:
            print(f"  {sid:44s} {title}", file=sys.stderr)
        if len(gaps) > 20:
            print(f"  ... and {len(gaps) - 20} more", file=sys.stderr)
        if args.check:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
