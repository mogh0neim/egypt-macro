"""Turn the money, banking and reserves files on CBE's SDDS page into series.

fetch_sdds.py keeps the files under data/raw/sdds/. Seven of them are read
here, the tables the Excel archive stopped extending in June 2023:

    reserve money (M0)               EG.SDDS.M0.*        EGP million
    domestic liquidity (M2)          EG.SDDS.M2.*        EGP million
    deposits in local currency       EG.SDDS.DEP.LC.*    EGP million
    deposits in foreign currencies   EG.SDDS.DEP.FC.*    EGP million
    domestic credit                  EG.SDDS.CREDIT.*    EGP million
    foreign assets and liabilities   EG.SDDS.NFA.*       EGP million
    international reserves           EG.SDDS.RES.*       USD million

The others on the page (balance of payments, the IIP, external debt and the
IMF reserves template) are kept as raw files but not parsed: the archive
already carries the first three to 2026.

Each file is one sheet laid out the same way: a year row (merged over the
months of each year), a month row under it, then one line per row with its
label in column A. A second sheet, "Historical Data", repeats the same
figures to December 2025 and is not read.

    A                          D        E        ...  JH
5   End of                     2004                   (2026, merged)
6                              Aug.     Sept.    ...  Aug.**
7   Domestic Liquidity (M2)    447171   450914   ...  15665518

**Every line is named here**, with the id it gets, in the order CBE prints
it. Ids are permanent once published, so they are chosen by hand rather than
made from labels CBE may reword, and a sheet whose lines no longer match this
list stops the parse instead of minting new ids or dropping old ones.

Dates are the last day of the month, read from the sheet's own month and year
labels. The unit is read from the sheet's "(LE mn)" or "(US $mn)" caption and
must be the one named here. The latest months carry a mark ("June**") whose
footnote says "Preliminary" or "Provisional": each series records which of its
periods are marked, as `marked` in the catalogue, rather than a second value.

Run:  python ingest/parse_sdds.py [--allow-retired]
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import datetime as dt
import json
import math
import pathlib
import re
import sys

import openpyxl

# Bump whenever a change here changes what the parser writes. build_changes.py
# reads it, so a re-read of the same CBE files is put down to Miqyas, not CBE.
PARSER_VERSION = "2026.10.11"

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "catalog" / "sdds_manifest.json"
OUT_SERIES = ROOT / "data" / "clean" / "series" / "sdds.csv"
OUT_CATALOG = ROOT / "catalog" / "series.json"
ID_MAP = ROOT / "catalog" / "id_map.json"
PAGE = "https://www.cbe.org.eg/en/economic-research/sdds"
PREFIX = "EG.SDDS."

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    "apirl": 4,  # as typed over April 2008 in the foreign-currency deposits
}
UNITS = [
    (re.compile(r"\(\s*(?:L\.?\s*E\.?|LE)\s*mn\s*\)", re.I), "EGP million"),
    (re.compile(r"\(\s*US\s*\$\s*mn\s*\)", re.I), "USD million"),
]
MARK_NOTE = re.compile(r"^\s*([*+]+)\s*(preliminary|provisional)\b", re.I)
NIR_NOTE = (
    "CBE's current monthly series, dated to the last day of each month, from the International "
    "Reserves file on its SDDS page. CBE marks the latest months provisional and revises them. "
    "EG.RES.NIR keeps instead the first figure from each month's press release, dated by the day "
    "the release came out."
)


@dataclasses.dataclass
class Spec:
    """One CBE file: the table it holds and every line in it, in order."""

    key: str           # the file's key in catalog/sdds_manifest.json
    prefix: str        # the id family
    table: str         # the title's first half, "<table> - <line>"
    family: str        # the site's topic group
    unit: str
    lines: list        # (pattern on the cleaned label, id suffix or None to skip, line title)


GOVT = [
    (r"^net claims on (the )?government", "GOVT.NET", "Net claims on government"),
    (r"^securities", "GOVT.SECURITIES", "Net claims on government - Securities"),
    (r"^credit facilities", "GOVT.CREDIT", "Net claims on government - Credit facilities"),
    (r"^(government )?deposits", "GOVT.DEPOSITS", "Net claims on government - Deposits"),
    (r"^net claims on public economic authorities", "PUB_AUTH.NET",
     "Net claims on public economic authorities"),
    (r"^claims on public economic authorities", "PUB_AUTH.CLAIMS",
     "Net claims on public economic authorities - Claims"),
    (r"^deposits", "PUB_AUTH.DEPOSITS", "Net claims on public economic authorities - Deposits"),
]


def deposits(which: str) -> list:
    word = {"LC": "local currency", "FC": "foreign currencies"}[which]
    return [
        (rf"^total deposits in {word}", "TOTAL", f"Total deposits in {word}"),
        (r"^demand deposits", "DEMAND", "Demand deposits"),
        (r"^public business sector", "DEMAND.PUBLIC_BUSINESS", "Demand deposits - Public business sector"),
        (r"^private business sector", "DEMAND.PRIVATE_BUSINESS", "Demand deposits - Private business sector"),
        (r"^household sector", "DEMAND.HOUSEHOLD", "Demand deposits - Household sector"),
        (r"^minus:? purchased cheques", "DEMAND.LESS_CHEQUES",
         "Demand deposits - Less purchased cheques and drafts"),
        (r"^time and saving deposits", "TIME_SAVING", "Time and saving deposits"),
        (r"^public business sector", "TIME_SAVING.PUBLIC_BUSINESS",
         "Time and saving deposits - Public business sector"),
        (r"^private business sector", "TIME_SAVING.PRIVATE_BUSINESS",
         "Time and saving deposits - Private business sector"),
        (r"^household sector", "TIME_SAVING.HOUSEHOLD", "Time and saving deposits - Household sector"),
    ]


SPECS = [
    Spec("reserve-money-m0", "EG.SDDS.M0", "Reserve Money and Counterpart Assets (SDDS)", "cbe",
         "EGP million", [
             (r"^reserve money \(m0\)", "TOTAL", "Reserve money (M0)"),
             (r"^currency in circulation outside the cbe", "CURRENCY",
              "Currency in circulation outside the CBE"),
             (r"^banks'? deposits in local currency with (the )?cbe", "BANK_DEPOSITS_LC",
              "Banks' deposits in local currency with the CBE"),
             # The sum of the counterparts, which is reserve money again.
             (r"^counterpart assets of reserve money", None, None),
             (r"^net foreign assets", "NFA", "Net foreign assets"),
             (r"^net domestic assets", "NDA", "Net domestic assets"),
             *GOVT,
             (r"^net claims on banks", "BANKS.NET", "Net claims on banks"),
             (r"^claims on banks", "BANKS.CLAIMS", "Net claims on banks - Claims"),
             (r"^deposits in foreign currency with (the )?cbe", "BANKS.DEPOSITS_FC",
              "Net claims on banks - Deposits in foreign currency with the CBE"),
             (r"^net claims on other banking institutions", "OTHER_BANKING.NET",
              "Net claims on other banking institutions"),
             (r"^claims on other banking institution", "OTHER_BANKING.CLAIMS",
              "Net claims on other banking institutions - Claims"),
             (r"^deposit other banking institution", "OTHER_BANKING.DEPOSITS_FC",
              "Net claims on other banking institutions - Deposits in foreign currency with the CBE"),
             (r"^other items \(net\)", "OTHER_ITEMS", "Other items (net)"),
             (r"^unclassified assets and liabilities", "OTHER_ITEMS.UNCLASSIFIED",
              "Other items (net) - Unclassified assets and liabilities"),
             (r"^open market operations", "OTHER_ITEMS.OPEN_MARKET",
              "Other items (net) - Open market operations"),
         ]),
    Spec("domestic-liquidity-m2", "EG.SDDS.M2", "Domestic Liquidity and Counterpart Assets (SDDS)",
         "banking_surveys", "EGP million", [
             (r"^domestic liquidity \(m2\)", "TOTAL", "Domestic liquidity (M2)"),
             (r"^money supply \(m1\)", "M1", "Money supply (M1)"),
             (r"^currency in circulation outside the banking system", "M1.CURRENCY",
              "Money supply (M1) - Currency in circulation outside the banking system"),
             (r"^demand deposits in local currency", "M1.DEMAND_LC",
              "Money supply (M1) - Demand deposits in local currency"),
             (r"^quasi-money", "QUASI", "Quasi-money"),
             (r"^time & saving deposits in local currency", "QUASI.TIME_SAVING_LC",
              "Quasi-money - Time and saving deposits in local currency"),
             (r"^demand ?, time & saving deposits in foreign currencies", "QUASI.DEPOSITS_FC",
              "Quasi-money - Demand, time and saving deposits in foreign currencies"),
             (r"^net foreign assets", "NFA", "Counterpart assets - Net foreign assets"),
             (r"^domestic assets", "DOMESTIC_ASSETS", "Counterpart assets - Domestic assets"),
             (r"^domestic credit", "DOMESTIC_CREDIT", "Counterpart assets - Domestic credit"),
             (r"^other items \(net\)", "OTHER_ITEMS", "Counterpart assets - Other items (net)"),
         ]),
    Spec("deposits-in-local-currency", "EG.SDDS.DEP.LC", "Deposits in Local Currency (SDDS)",
         "banking_surveys", "EGP million", deposits("LC")),
    Spec("deposits-in-foreign-currencies", "EG.SDDS.DEP.FC", "Deposits in Foreign Currencies (SDDS)",
         "banking_surveys", "EGP million", deposits("FC")),
    Spec("domestic-credit-and-other-items-net", "EG.SDDS.CREDIT",
         "Domestic Credit and Other Items, Net (SDDS)", "banking_surveys", "EGP million", [
             (r"^domestic credit", "TOTAL", "Domestic credit"),
             *GOVT,
             (r"^claims on public business sector", "PUBLIC_BUSINESS", "Claims on public business sector"),
             (r"^claims on private business sector", "PRIVATE_BUSINESS", "Claims on private business sector"),
             (r"^claims on household sector", "HOUSEHOLD", "Claims on household sector"),
             (r"^other items \(net\)", "OTHER_ITEMS", "Other items (net)"),
             (r"^capital accounts", "OTHER_ITEMS.CAPITAL", "Other items (net) - Capital accounts"),
             (r"^net unclassified assets and liabilities", "OTHER_ITEMS.UNCLASSIFIED",
              "Other items (net) - Net unclassified assets and liabilities"),
         ]),
    Spec("foreign-assets-and-liabilities", "EG.SDDS.NFA", "Foreign Assets and Liabilities (SDDS)",
         "banking_surveys", "EGP million", [
             (r"^net foreign assets", "TOTAL", "Net foreign assets"),
             (r"^foreign assets", "ASSETS", "Foreign assets"),
             (r"^central bank of egypt", "ASSETS.CBE", "Foreign assets - Central Bank of Egypt"),
             (r"^banks", "ASSETS.BANKS", "Foreign assets - Banks"),
             (r"^foreign liabilities", "LIABILITIES", "Foreign liabilities"),
             (r"^central bank of egypt", "LIABILITIES.CBE", "Foreign liabilities - Central Bank of Egypt"),
             (r"^banks", "LIABILITIES.BANKS", "Foreign liabilities - Banks"),
         ]),
    Spec("international-reserves", "EG.SDDS.RES", "International Reserves (SDDS)", "external",
         "USD million", [
             (r"^net international reserves", "NIR", "Net international reserves"),
             (r"^gross official reserves", "GROSS", "Gross official reserves"),
             (r"^gold", "GOLD", "Gold"),
             (r"^sdrs?\b", "SDR", "SDRs"),
             (r"^foreign currencies", "FOREIGN_CURRENCIES", "Foreign currencies"),
             (r"^loans to (the )?imf", "IMF_LOANS", "Loans to the IMF"),
         ]),
]


class ParseError(RuntimeError):
    pass


def text(value) -> str:
    return re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip() if value is not None else ""


def clean_label(value) -> str:
    """'  B- deposits in Foreign currency with CBE  ' -> 'deposits in foreign currency with cbe'."""
    s = text(value).lower()
    s = re.sub(r"^[a-c]\s*-\s*", "", s)              # the A / B / C of a sum
    s = re.sub(r"[\s*+]+$", "", s)                     # footnote marks
    s = re.sub(r"\s*\([a-c\s+\-]+\)\s*:?\s*$", "", s)   # "(A + B - C ):"
    return re.sub(r"\s+", " ", s.rstrip(" :")).strip()


def number(value) -> float | None:
    """A cell as a number. CBE types some as text: '\xa014237', '1682225+', '303680x', ' - '."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return round6(float(value)) if math.isfinite(value) else None
    s = text(value).replace(",", "")
    s = re.sub(r"[*+xX]+$", "", s).strip()
    return round6(float(s)) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None


def round6(v: float) -> float:
    """Six significant figures, never rounding away a whole number (as parse_excel.py).

    A few cells carry spreadsheet noise (158158.46049828); CBE prints whole
    millions of pounds, and those keep every digit.
    """
    if v == 0 or not math.isfinite(v):
        return v
    digits = math.floor(math.log10(abs(v))) + 1
    return round(v, max(0, 6 - digits)) + 0.0


def month_of(value) -> int | None:
    if not isinstance(value, str):
        return None
    return MONTHS.get(re.sub(r"[^a-z]", "", value.lower()))


def month_end(year: int, month: int) -> str:
    nxt = dt.date(year + month // 12, month % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def trailing_mark(value) -> str:
    m = re.search(r"([*+]+)\s*$", text(value))
    return m.group(1) if m else ""


def read_sheet(path: pathlib.Path) -> list[list]:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        sheets = [ws for ws in wb.worksheets if not ws.title.strip().lower().startswith("historical")]
        if not sheets:
            raise ParseError("no sheet other than Historical Data")
        return [list(row) for row in sheets[0].iter_rows(values_only=True)]
    finally:
        wb.close()


@dataclasses.dataclass
class Read:
    unit: str
    periods: dict[int, str]           # column -> period
    marked: dict[str, list[str]]      # "preliminary" -> periods carrying that mark
    lines: list[tuple[str, dict[str, float]]]   # (raw label, {period: value})


def read_table(path: pathlib.Path) -> Read:
    grid = read_sheet(path)
    width = max((len(r) for r in grid), default=0)
    grid = [r + [None] * (width - len(r)) for r in grid]

    # The month row is the one with the most month names in it.
    counts = [sum(1 for v in row if month_of(v)) for row in grid]
    head = max(range(len(grid)), key=counts.__getitem__) if grid else 0
    if not grid or counts[head] < 12:
        raise ParseError("no row of month labels")
    columns = [c for c, v in enumerate(grid[head]) if month_of(v)]
    first = columns[0]
    # A label that is not a month would drop its column without a word.
    odd = [text(grid[head][c]) for c in range(first, columns[-1] + 1)
           if text(grid[head][c]) and not month_of(grid[head][c])]
    if odd:
        raise ParseError(f"month row holds labels that are not months: {odd[:5]}")

    # The year row is the nearest one above holding years over the months.
    years_row = next((r for r in range(head - 1, -1, -1)
                      if any(isinstance(grid[r][c], (int, float)) and 1990 <= grid[r][c] <= 2100
                             for c in columns)), None)
    if years_row is None:
        raise ParseError("no row of years above the months")
    # The months run in order, so the year turns where the month goes back.
    # The year row is the check: CBE has typed 2005 over May 2006 and 2011
    # over January 2012, and a few slips like that are reported and read
    # through, while more than a few means the sheet is not what it seems.
    def year_at(c):
        y = grid[years_row][c]
        return int(y) if isinstance(y, (int, float)) and 1990 <= y <= 2100 else None

    year = year_at(first)
    if year is None:
        raise ParseError("no year over the first month")
    periods: dict[int, str] = {}
    slips = []
    previous = None
    for c in columns:
        m = month_of(grid[head][c])
        if previous is not None and m <= previous:
            year += 1
        previous = m
        if year_at(c) not in (None, year):
            slips.append(f"{year_at(c)} over {text(grid[head][c])} {year} (column {c + 1})")
        periods[c] = month_end(year, m)
    if len(slips) > 3:
        raise ParseError(f"the year row disagrees with the month order {len(slips)} times: {slips[:5]}")
    for slip in slips:
        print(f"    note: {path.name}: CBE's year row has {slip}; read from the month order")

    # The unit, from the captions above the months: one kind, or stop.
    found = {unit for row in grid[:head] for v in row if isinstance(v, str)
             for pattern, unit in UNITS if pattern.search(v)}
    if len(found) != 1:
        raise ParseError(f"unit not stated once above the table: {sorted(found) or 'none'}")

    # Which mark means preliminary or provisional, from the footnotes.
    notes = {}
    for row in grid[head + 1:]:
        for v in row[:first]:
            m = MARK_NOTE.match(text(v))
            if m:
                notes[m.group(1)] = m.group(2).lower()
    marked: dict[str, list[str]] = {}
    for c, period in periods.items():
        word = notes.get(trailing_mark(grid[head][c]))
        if word:
            marked.setdefault(word, []).append(period)

    lines = []
    for row in grid[head + 1:]:
        label = next((v for v in row[:first] if text(v)), None)
        values = {p: number(row[c]) for c, p in periods.items()}
        values = {p: v for p, v in values.items() if v is not None}
        if label is not None and values:
            lines.append((text(label), values))
    return Read(found.pop(), periods, marked, lines)


def build(spec: Spec, meta: dict, path: pathlib.Path) -> tuple[list[tuple], dict[str, dict]]:
    """-> rows (series_id, period, value) and catalogue entries, for one file."""
    got = read_table(path)
    if got.unit != spec.unit:
        raise ParseError(f"the sheet says {got.unit}, expected {spec.unit}")
    if len(got.lines) != len(spec.lines):
        raise ParseError(f"{len(got.lines)} lines in the sheet, {len(spec.lines)} named "
                         f"here: {[label for label, _ in got.lines]}")
    url = meta.get("url") or ""
    rows, catalog = [], {}
    for (label, values), (pattern, suffix, line) in zip(got.lines, spec.lines):
        if not re.search(pattern, clean_label(label)):
            raise ParseError(f"line {label!r} where {pattern!r} was expected")
        if suffix is None:
            continue
        sid = f"{spec.prefix}.{suffix}"
        rows += [(sid, p, v) for p, v in sorted(values.items())]
        entry = {
            "series_id": sid,
            "title_en": f"{spec.table} - {line}",
            "dataset": "sdds",
            "family": spec.family,
            "freq": "M",
            "unit": spec.unit,
            "period_basis": "end",
            "provenance": "Dated by Miqyas from the sheet's month labels",
            "source_url": PAGE,
            "source_file": ("https://www.cbe.org.eg" + url) if url.startswith("/") else url,
        }
        marks = {word: [p for p in periods if p in values] for word, periods in got.marked.items()}
        marks = {word: periods for word, periods in marks.items() if periods}
        if marks:
            word, periods = next(iter(marks.items()))
            entry["marked"] = {"as": word, "periods": periods}
        if sid == "EG.SDDS.RES.NIR":
            entry["note"] = NIR_NOTE
        catalog[sid] = entry
    return rows, catalog


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-retired", action="store_true",
                    help="write even if published ids disappear without an entry in catalog/id_map.json")
    args = ap.parse_args()

    files = {e["key"]: e for e in json.loads(MANIFEST.read_text(encoding="utf-8"))["files"]}
    print(f"parser {PARSER_VERSION}: {len(SPECS)} of {len(files)} SDDS files to parse\n")
    rows: list[tuple] = []
    catalog: dict[str, dict] = {}
    failed = []
    for spec in SPECS:
        meta = files.get(spec.key) or {}
        path = ROOT / meta["local"] if meta.get("local") else None
        if not path or not path.exists():
            failed.append(f"{spec.key}: no copy on disk")
            continue
        try:
            got_rows, got_cat = build(spec, meta, path)
        except Exception as exc:  # noqa: BLE001
            failed.append(f"{spec.key}: {type(exc).__name__}: {exc}")
            continue
        rows += got_rows
        catalog.update(got_cat)
        periods = sorted({p for _, p, _ in got_rows})
        print(f"  {spec.prefix:16s} {len(got_cat):3d} series  {periods[0]} to {periods[-1]}  "
              f"{len(got_rows):,} readings")
    if failed:
        print("\nFAILED, nothing written:", file=sys.stderr)
        for line in failed:
            print("  " + line, file=sys.stderr)
        return 1

    # Ids are a promise once published, as in parse_excel.py.
    if OUT_SERIES.exists() and not args.allow_retired:
        with OUT_SERIES.open(encoding="utf-8") as fh:
            before = {r["series_id"] for r in csv.DictReader(fh)}
        mapped = json.loads(ID_MAP.read_text(encoding="utf-8")).get("ids", {}) if ID_MAP.exists() else {}
        gone = sorted(before - set(catalog) - set(mapped))
        if gone:
            print(f"\nFAILED: {len(gone)} published series ids would disappear. Map each to its new "
                  f"id (or null) in catalog/id_map.json, or rerun with --allow-retired: "
                  f"{', '.join(gone[:10])}", file=sys.stderr)
            return 1

    rows.sort()
    OUT_SERIES.parent.mkdir(parents=True, exist_ok=True)
    with OUT_SERIES.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["series_id", "period", "value"])
        w.writerows(rows)

    existing = json.loads(OUT_CATALOG.read_text(encoding="utf-8")) if OUT_CATALOG.exists() else []
    # This script owns the EG.SDDS.* namespace, as parse_excel.py owns EG.XL.*.
    by_id = {c["series_id"]: c for c in existing if not c["series_id"].startswith(PREFIX)}
    by_id.update(catalog)
    OUT_CATALOG.write_text(
        json.dumps(sorted(by_id.values(), key=lambda c: c["series_id"]), indent=1, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\n{len(catalog)} series, {len(rows):,} readings -> {OUT_SERIES.relative_to(ROOT)}")
    print(f"catalog now holds {len(by_id):,} series")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
