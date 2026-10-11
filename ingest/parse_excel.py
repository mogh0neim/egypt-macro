"""Turn the Excel time-series archive into tidy long series.

Every file in the archive is one table, laid out the same broad way:

    A                    B                 C        D        E      ...
1   Banking Survey: ...  المسح المصرفي     2017                       2018   <- year row, MERGED
2   (LE mn)              (بالمليون جنيه)   Jul.     Aug.     Sept.    Jan.   <- period row
3   Total Deposits       إجمالى الودائع    2940     3003     3050     3254   <- data
4     Government Dep.    الودائع الحكومية  582      575      621      602    <- indent = child

The rule this parser keeps is **one slot holds one number**. A series id names
one measure, and every (series, date) pair can hold only one value from any one
file. The earlier parser broke that rule in four ways, and each is now part of
the id instead of being overwritten:

  * The column, not just the row. Many tables put several columns under one
    period: Exports / Imports / Balance, Public / Private / Total, Budget
    Sector / General Government, Inflows / Outflows / Net. That header row is
    the column label, and it goes into the id.
  * The heading path, not just the row label. "Lending and discount" appears
    six times in the domestic-credit sheet, once per sector and currency. A
    label that repeats inside a file is qualified by the rows it sits under.
  * The base year. Constant-price GDP comes in 2001/02, 2006/07, 2011/12,
    2016/17 and 2021/22 prices, and price indices in several bases. A base is
    part of the id and the unit, so blocks of different bases never merge.
  * The kind of period. A fiscal-year total is a different number from the
    fourth quarter that ends on the same 30 June, so annual figures get ids
    ending .A, and fiscal-year-to-date budget figures ids ending .YTD.

How a column is dated: the header cells above it are read together, so "Jul."
under a merged "2017", "Q3" under "2016/2017", and "Jan./Mar. 2015" all resolve
to one date. Of the rows that could be the period row, the one whose columns
resolve to the most *different* dates wins. That is what stops "2015/2016"
repeated over twelve month columns, or an "at 2001/2002 prices" caption, from
being read as the period.

If two different values still land on one series and date from the same file,
the run fails rather than keeping either. Differences *between* files are
normal (a later file revises an earlier one); the newest file wins and every
such difference is written to data/clean/excel_conflicts.csv.

Values are period-end stocks or flows over the period, dated to the end of
their window; `period_basis` says so.

Run:  python ingest/parse_excel.py [--limit N] [--category "GDP"] [--allow-retired]
      --limit and --category only report, they never write a partial archive.
"""

from __future__ import annotations

import argparse
import collections
import csv
import dataclasses
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import re
import statistics
import sys

import openpyxl

# Bump whenever a change here changes what the parser writes. The What changed
# page reads it, so a re-read of the same CBE files is labelled as ours rather
# than reported as CBE news.
PARSER_VERSION = "2026.10.11.2"

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXCEL = ROOT / "data" / "raw" / "excel"
MANIFEST = ROOT / "catalog" / "excel_manifest.json"
OUT_SERIES = ROOT / "data" / "clean" / "series" / "excel_archive.csv"
OUT_CONFLICTS = ROOT / "data" / "clean" / "excel_conflicts.csv"
OUT_CATALOG = ROOT / "catalog" / "series.json"
QUARANTINE = ROOT / "catalog" / "excel_quarantine.json"
ID_MAP = ROOT / "catalog" / "id_map.json"

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
MONTH_ABBR = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
LAST_DAY = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
            7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}

ARABIC = re.compile(r"[؀-ۿ]")
ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

# Short codes keep series IDs readable. Anything not listed falls back to a
# slug of the name, so a new category or table still produces valid IDs.
CATEGORY_CODES = {
    "CBE": "CBE", "Domestic Debt": "DDEBT", "External Debt": "XDEBT",
    "GDP": "GDP", "Interest Rates": "IRATE", "Investments": "INV",
    "Net Foreign Direct Investment": "FDI", "Tourism": "TOUR",
    "Foreign Trade": "TRADE", "Stocks": "STOCK", "Banking Surveys": "BANK",
    "BOP": "BOP", "Inflation": "PRICE", "State Budget": "BUDGET",
}
# One code per CBE table (the archive's subcategory). Empty where the category
# holds a single table, so the id does not say "BOP.BOP".
TABLE_CODES = {
    "Egypt's Balance of Payments": "",
    "Deposits in Local and Foreign Currency": "DEPOSITS",
    "Domestic Credit": "CREDIT",
    "Domestic Liquidity and Counterpart Assets": "M2",
    "Foreign Assets and Liabilities": "NFA",
    "Net Balancing Items": "NBI",
    "Central Bank of Egypt Clearing House Activities": "CLEARING",
    "Currency In Circulation Outside CBE By Denomination": "CURRENCY",
    "Note Issued Including Cash In CBE Vault By Denomination": "NOTES",
    "Reserve Money and Counterpart Assets": "M0",
    "Domestic Debt of Both Government and Economic Authorities": "GROSS",
    "National Investment Bank": "NIB",
    "The Outstanding Balance of Treasury Bills (Quarterly)": "TBILLS",
    "External Debt by Debtor Sector": "SECTOR",
    "External debt by type": "TYPE",
    "Exports by Geographical Distribution": "XGEO",
    "Imports by Geographical Distribution": "MGEO",
    "Main Merchandise Balances": "BALANCES",
    "Payments for Merchandise Imports by Degree of Use": "MUSE",
    "Proceeds of Merchandise Exports by degree of Processing": "XPROC",
    "GDP at Factor Cost (Constant Prices)": "FCK",
    "GDP at Factor Cost (Current Prices)": "FC",
    "GDP by Expenditure (Constant Prices)": "EXPK",
    "GDP by Expenditure (Current Prices)": "EXP",
    "CPI": "CPI",
    "WPI and PPI": "WPI_PPI",
    "Domestic Interest Rates on 3 months Deposits of Major Currencies": "FX3M",
    "The Discount Rate and Interest Rates on Deposits and Loans in Egyptian Pound": "EGP",
    "Investments By Economic Sectors": "",
    "Net Foreign Direct Investment": "",
    "Deficit and Sources of Financing": "DEFICIT",
    "Expenditures": "EXPENDITURE",
    "Revenues": "REVENUE",
    "Stock Market Main Indicators": "",
    "Number of Tourist Nights By Group": "NIGHTS",
    "Number of Tourists By Group": "ARRIVALS",
}
# The unit when neither the row nor the sheet caption names one.
TABLE_UNITS = {
    "CPI": "index", "WPI and PPI": "index",
    "GDP at Factor Cost (Constant Prices)": "EGP million",
    "GDP at Factor Cost (Current Prices)": "EGP million",
    "GDP by Expenditure (Constant Prices)": "EGP billion",
    "GDP by Expenditure (Current Prices)": "EGP billion",
    "Investments By Economic Sectors": "EGP million",
    "Domestic Interest Rates on 3 months Deposits of Major Currencies": "percent",
    "The Discount Rate and Interest Rates on Deposits and Loans in Egyptian Pound": "percent",
    "Number of Tourist Nights By Group": "thousand nights",
    "Number of Tourists By Group": "thousand tourists",
}

# Where CBE's indentation does not show the hierarchy (it is applied by hand
# and drifts from file to file), the section rows are named here instead.
# Each entry is one level, outermost first; a row whose English label matches
# a level's pattern opens a section at that level.
SECTIONS = {
    "Domestic Credit": [
        r"^domestic credit",
        r"^(net claims on government|claims on)",
    ],
    "Deposits in Local and Foreign Currency": [
        r"^(non-)?government deposits",
        r"^in (local|foreign) currenc",
    ],
    "External Debt by Debtor Sector": [
        r"^(government|general government|central and local government|central bank"
        r"|monetary authority|banks|other sectors)$",
        r"^(long|short|medium)\b",
    ],
    "Net Foreign Direct Investment": [
        r"^(inflows?|outflows?|net foreign direct investment|total flows)\b",
        r"^(eu|european union|arab countries|other countries|rest of the world)$",
    ],
    "Revenues": [
        r"^(tax revenues|grants|other revenues)$",
        # (opens a section, or sits at this level without opening one)
        (r"^(taxes on|property income)", r"^(sales of goods|financing investment|other taxes)"),
    ],
    "Expenditures": [
        r"^((wages (and|&) )?compensations? of employees|purchases of goods|interests?$"
        r"|subsidies, grants|other expenditures|purchases of non-financial)",
        r"^(domestic interests?|foreign interests?|subsidies|grants|social benefits)$",
    ],
    "Number of Tourist Nights By Group": [
        r"^(european countries|the middle east countries|african countries|americas"
        r"|asia (&|and) pacific|other countries)$",
        r"^(eastern|western) europe$",
    ],
}
SECTIONS["Number of Tourists By Group"] = SECTIONS["Number of Tourist Nights By Group"]
# Sections that are really a column label printed down the page: the newer FDI
# sheets list countries under an "Inflows" row where older ones and the annual
# sheet have an Inflows column. Read that way, USA inflows is one series.
DIM_SECTIONS = {"Net Foreign Direct Investment": r"^(inflows?|outflows?)$"}

# Footnotes and source lines carry a label and no numbers, exactly like a
# section heading, and must not become one.
FOOTNOTE = re.compile(
    r"^\s*(\*|\+|#|\(\+|\.\.|source\b|notes?\s*:|المصدر|provisional\.?\s*$|preliminary\.?\s*$|-\s*$)",
    re.I)

STOPWORDS = {"THE", "OF", "AND", "ON", "IN", "FOR", "TO", "BY", "AT", "FROM", "WITH", "AN", "A", "AS"}
MAX_ID = 64


class ParseError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Cells.

def clean_label(text) -> str:
    """A label as a reader should see it: no enumerator, footnote mark or formula."""
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    s = re.sub(r"\((?:\+{1,2}|\*+)\)", "", s)                       # (+) (++) (*)
    s = re.sub(r"\((?=[^)]*[+-])[A-Za-z0-9+\-\s]+\)", "", s)        # (1+2-3), (a+b)
    s = re.sub(r"^(?:\(?[a-hA-H]\)|\(?\d{1,2}\s*[-.)]|[a-hA-H]\s*-|[ivxIVX]{1,4}\s*[-.)])\s*", "", s)
    s = re.sub(r"[*+#]+", "", s)
    s = re.sub(r"(?<=[a-z])X+$|\s+x{1,3}$", "", s)                  # "Capital AccountsX", "NIB xx"
    s = re.sub(r",?\s*of which\s*:?$", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip(" :,.;-'\"")


# Words shortened in ids only; titles keep CBE's wording.
ABBREVIATIONS = {"GOVERNMENT": "GOVT", "PERCENTAGE": "PCT", "PERCENT": "PCT"}


def short_slug(text, limit: int = 32) -> str:
    """Upper-case id segment, cut at a word boundary, without stopwords."""
    words = re.findall(r"[A-Za-z0-9]+", clean_label(text).upper())
    if words[:2] == ["OF", "WHICH"]:
        words = words[2:] or words  # "of which: Bonds" is the Bonds line
    words = [ABBREVIATIONS.get(w, w) for w in words]
    kept = [w for w in words if w not in STOPWORDS] or words
    out = ""
    for w in kept:
        candidate = f"{out}_{w}" if out else w
        if len(candidate) > limit:
            break
        out = candidate
    return out or (kept[0][:limit] if kept else "")


def norm_ar(text) -> str:
    """Arabic label folded so spelling drift between files does not split it."""
    s = re.sub(r"[ً-ْـ]", "", str(text or ""))                         # harakat, tatweel
    s = s.translate(str.maketrans("أإآىة", "اااىه")).replace("ى", "ي")
    s = re.sub(r"[*+#()\[\]:.,،\-/\s]+", "", s.translate(ARABIC_INDIC))
    return s


def month_of(value) -> int | None:
    if value is None or not isinstance(value, str):
        return None
    token = re.sub(r"[^A-Za-z]", "", value).lower()
    return MONTHS.get(token)


def year_of(value) -> int | None:
    if value is None:
        return None
    # Not inside a longer number. A data cell of 120913 contains "2091", and
    # reading it as a year dated 37 quarterly files to 1901-2099.
    m = re.search(r"(?<!\d)(19|20)\d{2}(?!\d)", str(value).translate(ARABIC_INDIC))
    return int(m.group(0)) if m else None


def bare_year(value) -> int | None:
    """A header cell that is nothing but a year: 2017, 2017.0, "2014*"."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if value == int(value) and 1950 <= value <= 2100 else None
    s = re.sub(r"[*+()\s]", "", str(value).translate(ARABIC_INDIC))
    return int(s) if re.fullmatch(r"(19|20)\d{2}", s) else None


def to_number(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    s = str(value).translate(ARABIC_INDIC).strip()
    s = s.replace(",", "").replace("%", "").replace(" ", "")
    s = re.sub(r"[*+#]+$", "", s)  # "4585.7++" carries a footnote mark
    if s in {"", "-", "--", "..", "...", "N/A", "n/a", "NA", "*"}:
        return None
    negative = s.startswith("(") and s.endswith(")")  # accounting negatives
    if negative:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if negative else v


def round6(v: float) -> float:
    """Strip spreadsheet noise, keeping every digit CBE typed.

    The workbooks carry noise like 83435.71299999999 in the last float digits.
    Twelve significant figures removes that, and formula cells also carry
    residue CBE never shows (11503.1000227, displayed as 11,503.1), so values
    of 1 or more keep at most four decimals, more than any CBE table types.
    Six significant figures, the rule before, cut the decimals off every value
    of 100,000 or more: total external debt for March 2024 read 160,607 where
    CBE printed 160,607.41, and 7,118 values lost digits that way. The name
    stays so callers and tests do not churn.
    """
    if v == 0 or not math.isfinite(v):
        return v
    digits = math.floor(math.log10(abs(v))) + 1
    places = max(0, 12 - digits)
    # One rounding, not two: rounding to twelve figures and then to four
    # decimals turned 3069622.677152 into ...6771.
    out = round(v, min(places, 4) if abs(v) >= 1 else places)
    return out + 0.0


# Balance-of-payments files skip the month row entirely and put fiscal years
# straight in the header: "2004/2005", "2005/06". Both widths occur.
_RE_FY = re.compile(r"(?<!\d)((?:19|20)\d{2})\s*/\s*((?:19|20)?\d{2})(?!\d)")
# "2020-2021", as two of the quarterly GDP files print the fiscal year.
_RE_FY_DASH = re.compile(r"(?<!\d)((?:19|20)\d{2})\s*-\s*((?:19|20)\d{2})(?!\d)")
_RE_QUARTER = re.compile(r"^\s*Q\s*([1-4])\s*\**\s*$", re.I)
_RE_RANGE = re.compile(r"([A-Za-z]{3,9})\.?\s*[/\-]\s*([A-Za-z]{3,9})\.?\s*,?\s*((?:19|20)\d{2})?")


def fy_of(value) -> tuple[int, str] | None:
    """-> (fiscal year end year, canonical label) for a header like 2005/06."""
    if value is None:
        return None
    s = str(value).translate(ARABIC_INDIC)
    m = _RE_FY.search(s) or _RE_FY_DASH.search(s)
    if not m:
        return None
    start = int(m.group(1))
    tail = m.group(2)
    end = int(tail) if len(tail) == 4 else start + 1
    if end - start != 1:
        return None
    return end, f"FY{start}/{str(end)[2:]}"


def quarter_of(value) -> int | None:
    if not isinstance(value, str):
        return None
    m = _RE_QUARTER.match(value.translate(ARABIC_INDIC))
    return int(m.group(1)) if m else None


def range_of(value) -> tuple[int, int, int | None] | None:
    """"Jan./Mar. 2015", "July/Dec." -> (first month, last month, year or None)."""
    if not isinstance(value, str):
        return None
    m = _RE_RANGE.search(value)
    if not m:
        return None
    a, b = MONTHS.get(m.group(1).lower()), MONTHS.get(m.group(2).lower())
    if not a or not b or a == b:
        return None
    return a, b, int(m.group(3)) if m.group(3) else year_of(value)


def base_of(value) -> str | None:
    """A base-period caption: "at 2016/2017 prices", "(Jan 2010 =100)"."""
    if not isinstance(value, str):
        return None
    s = value.translate(ARABIC_INDIC)
    # "at 2016/2017prices" occurs without the space.
    if not (re.search(r"prices?\b", s, re.I) and _RE_FY.search(s)) and not re.search(r"=\s*100|100\s*=", s):
        return None
    fy = fy_of(s)
    if fy:
        return f"{fy[0] - 1}/{str(fy[0])[2:]}"
    m = re.search(r"\b([A-Za-z]{3,9})\.?\s*((?:19|20)\d{2})\s*=", s)
    if m and MONTHS.get(m.group(1).lower()):
        return f"{MONTH_ABBR[MONTHS[m.group(1).lower()]].title()} {m.group(2)}"
    return None


def base_segment(base: str) -> str:
    """'2016/17' -> 'B2016_17'; 'Jan 2010' -> 'BJAN2010'."""
    if "/" in base:
        return "B" + base.replace("/", "_")
    month, year = base.split()
    return "B" + month.upper() + year


# ---------------------------------------------------------------------------
# Reading a sheet.

# Some sheets report max_row as 65536 -- Excel's old limit -- because of stray
# formatting far below the data, and carry thousands of merged ranges down
# there with it. Building that grid takes minutes per file for nothing. The
# largest genuine table in the archive is 347 rows.
MAX_ROWS = 1500
MAX_COLS = 120
# A merge spanning this many cells is formatting, not a header spanning its
# months, so filling it would overwrite real values.
MAX_MERGE_CELLS = 400


def load_grid_xls(path: pathlib.Path) -> list[list]:
    """Legacy binary .xls, which openpyxl cannot read at all.

    A handful of the older files in the archive are genuinely BIFF rather than
    xlsx-with-the-wrong-extension, so they get xlrd. Merged ranges are filled
    the same way.
    """
    import xlrd

    book = xlrd.open_workbook(path, formatting_info=False)
    sheet = book.sheet_by_index(0)
    nrows = min(sheet.nrows, MAX_ROWS)
    ncols = min(sheet.ncols, MAX_COLS)
    rows = [
        [sheet.cell_value(r, c) if sheet.cell_value(r, c) != "" else None
         for c in range(ncols)]
        for r in range(nrows)
    ]
    while rows and not any(v is not None and str(v).strip() for v in rows[-1]):
        rows.pop()
    return rows


def load_grid(path: pathlib.Path) -> list[list]:
    """Sheet as a list of rows, with merged ranges filled in.

    Filling the merge is the whole trick: the year sits in one merged cell
    spanning six month columns, so without this every month but the first has
    no year attached.
    """
    wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    ws = wb.active
    nrows = min(ws.max_row or 1, MAX_ROWS)
    ncols = min(ws.max_column or 1, MAX_COLS)
    rows = [
        [ws.cell(r, c).value for c in range(1, ncols + 1)]
        for r in range(1, nrows + 1)
    ]

    for rng in ws.merged_cells.ranges:
        if rng.min_row > nrows or rng.min_col > ncols:
            continue
        height = min(rng.max_row, nrows) - rng.min_row + 1
        width = min(rng.max_col, ncols) - rng.min_col + 1
        if height * width > MAX_MERGE_CELLS:
            continue
        value = ws.cell(rng.min_row, rng.min_col).value
        if value is None:
            continue
        for r in range(rng.min_row, rng.min_row + height):
            for c in range(rng.min_col, rng.min_col + width):
                rows[r - 1][c - 1] = value
    wb.close()

    # Drop the trailing empty rows the padding leaves behind.
    while rows and not any(v is not None and str(v).strip() for v in rows[-1]):
        rows.pop()
    return rows


def read_grid(path: pathlib.Path) -> list[list]:
    try:
        return load_grid(path)
    except Exception:
        return load_grid_xls(path)


# ---------------------------------------------------------------------------
# The header: which columns hold which period, column label and base.

@dataclasses.dataclass
class Column:
    period: str           # ISO date, end of the period
    kind: str             # M, Q, YTD or A
    dim: str | None       # column label: "Exports", "Public", "Budget Sector"
    base: str | None      # "2016/17", "Jan 2010"


HEADER_SCAN = 24


PLACEHOLDERS = {"-", "--", "..", "...", "N/A", "n/a", "NA", "*"}


def label_columns(grid: list[list]) -> list[int]:
    """Columns that hold row labels: mostly text below the header, at the left."""
    out = []
    body = grid[3:] or grid
    for c in range(min(5, max(len(r) for r in grid))):
        cells = [r[c] for r in body if c < len(r) and r[c] is not None and str(r[c]).strip()]
        text = sum(1 for v in cells if isinstance(v, str) and to_number(v) is None
                   and v.strip() not in PLACEHOLDERS)
        if cells and text * 2 > len(cells):
            out.append(c)
        elif out:
            break
    return out


def cell_kind(value) -> tuple | None:
    """What a header cell says about the period, if anything."""
    if value is None or base_of(value):
        return None
    r = range_of(value)
    if r:
        return ("range", r)
    q = quarter_of(value)
    if q:
        return ("quarter", q)
    m = month_of(value)
    if m:
        return ("month", m)
    fy = fy_of(value)
    if fy:
        return ("fy", fy)
    y = bare_year(value)
    if y:
        return ("year", y)
    return None


def _resolve(grid, header_rows, p, cols) -> dict[int, tuple[str, str]]:
    """Date every column in `cols` taking row p as the period row.

    -> {col: (iso date, kind)}. The year for a month or quarter comes from a
    fiscal-year label above it, else the cell itself, else other header cells
    in the same column (nearest first), else is carried from the column to
    its left.
    """
    kinds = {c: cell_kind(grid[p][c]) for c in cols}
    kinds = {c: k for c, k in kinds.items() if k}
    if not kinds:
        return {}
    # A row of ranges starting in July that run past September is cumulative
    # from the start of the fiscal year: July/Sept., July/Dec., July/March.
    ytd = any(k[0] == "range" and k[1][0] == 7 and (k[1][1] - 7) % 12 != 2 for k in kinds.values())

    def context(c):
        """(calendar year, fiscal year end) from the column's other header cells, nearest first."""
        cal = fyend = None
        for r in sorted((r for r in header_rows if r != p), key=lambda r: (abs(r - p), r > p)):
            v = grid[r][c] if c < len(grid[r]) else None
            if v is None or base_of(v):
                continue
            fy = fy_of(v)
            if fy:
                fyend = fyend or fy[0]
            elif cal is None:
                rg = range_of(v)
                cal = bare_year(v) or (rg[2] if rg else None) or (year_of(v) if isinstance(v, str) else None)
        return cal, fyend

    hint = " ".join(
        str(cell).lower() for row in grid[: p + 2] for cell in row[:4] if isinstance(cell, str)
    )
    out: dict[int, tuple[str, str]] = {}
    carry = None  # (year, month) of the last dated column
    for c in sorted(kinds):
        kind, val = kinds[c]
        cal, fyend = context(c)
        if kind == "month":
            # A merged fiscal-year label outranks the year typed in each cell:
            # the 2006/07 CPI sheet has "Aug.2007" between July and Sept 2006.
            m = val
            year = (fyend - 1 if m >= 7 else fyend) if fyend else (year_of(grid[p][c]) or cal)
            if year is None and carry:
                year = carry[0] + (1 if m < carry[1] else 0)
            if year is None:
                continue
            carry = (year, m)
            out[c] = (_month_end(year, m), "M")
        elif kind == "range":
            a, b, y = val
            year = y
            if year is None and fyend:
                year = fyend - 1 if b >= 7 else fyend
            if year is None:
                year = cal
            if year is None and carry:
                year = carry[0] + (1 if b < carry[1] else 0)
            if year is None:
                continue
            carry = (year, b)
            out[c] = (_month_end(year, b), "YTD" if ytd else "Q")
        elif kind == "quarter":
            # Egypt's fiscal quarters end Sep, Dec, Mar, Jun. A plain year or a
            # printed range ("Jan./Mar. 2024") is the calendar year the quarter
            # falls in. A fiscal label ("2016/2017") reads as the year the
            # fiscal year opens in, so its Q3 and Q4 fall a year later.
            q = val
            month = {1: 9, 2: 12, 3: 3, 4: 6}[q]
            if fyend:
                year = fyend - 1 if q in (1, 2) else fyend
            elif cal:
                year = cal
            elif carry:
                year = carry[0] + (1 if month < carry[1] else 0)
            else:
                continue
            carry = (year, month)
            out[c] = (_month_end(year, month), "Q")
        elif kind == "fy":
            out[c] = (f"{val[0]}-06-30", "A")
        elif kind == "year":
            # A bare year row, e.g. "End of June | 2005 | 2006 | ...". The month
            # is stated somewhere in the label column; Egypt's fiscal year ends
            # in June, the sensible default when nothing says otherwise.
            month = 12 if "december" in hint and "june" not in hint else 6
            out[c] = (_month_end(val, month), "A")
    return out


def _month_end(year: int, month: int) -> str:
    day = LAST_DAY[month]
    if month == 2 and year % 4 == 0 and (year % 100 or year % 400 == 0):
        day = 29
    return f"{year}-{month:02d}-{day:02d}"


def read_header(grid: list[list]) -> tuple[dict[int, Column], int, list[int]]:
    """-> ({col: Column}, first body row, label columns)."""
    labels = label_columns(grid)
    if not labels:
        raise ParseError("no label column found")
    first = max(labels) + 1
    width = max(len(r) for r in grid)
    cols = range(first, width)
    scan = range(min(HEADER_SCAN, len(grid)))

    def cells(r):
        return [c for c in cols if c < len(grid[r]) and cell_kind(grid[r][c])]

    def numeric(r):
        return [c for c in cols if c < len(grid[r]) and to_number(grid[r][c]) is not None
                and bare_year(grid[r][c]) is None]

    candidates = [r for r in scan if cells(r)]
    if not candidates:
        raise ParseError("no period row found")
    # Rows above the first data row are the header. A data row has numbers
    # that are not years; a row of years (the "End of | June" sheets put them
    # below the month) is still header.
    best = None
    for p in candidates:
        top = p
        for r in range(p + 1, min(len(grid), p + 5)):
            if numeric(r):
                break
            if any(c < len(grid[r]) and grid[r][c] is not None and str(grid[r][c]).strip() for c in cols):
                top = r
            else:
                break
        header = list(range(0, top + 1))
        dated = _resolve(grid, header, p, list(cols))
        if not dated:
            continue
        distinct = len({d for d, _ in dated.values()})
        specific = {"M": 3, "YTD": 2, "Q": 2, "A": 1}[next(iter(dated.values()))[1]]
        score = (distinct, specific, len(dated), p)
        if best is None or score > best[0]:
            best = (score, p, top, dated, header)
    if best is None:
        raise ParseError("no period row could be dated")
    _, p, top, dated, header = best

    # Column labels: a header row (not the period row) whose text differs from
    # column to column -- Exports / Imports / Balance. A row repeating one text
    # across every column is a title. Every such row in the archive has an
    # English twin; the Arabic rows are skipped because some of them are the
    # period in words ("الربع الأول", first quarter), not a column label.
    dims: dict[int, str] = {}
    for r in sorted(header, reverse=True):
        if r == p:
            continue
        texts = {}
        for c in dated:
            v = grid[r][c] if c < len(grid[r]) else None
            if isinstance(v, str) and v.strip() and not cell_kind(v) and not base_of(v) \
                    and not re.search(r"\((?:LE|US|EUR|L\.E|\$)|mn\)", v, re.I) and not ARABIC.search(v):
                texts[c] = clean_label(v)
        if len(set(texts.values())) >= 2:
            dims = texts
            break

    # Base periods: in the column's own header, else carried from the left,
    # else the sheet's caption (CPI states its base once, in the title).
    bases: dict[int, str] = {}
    sheet_base = None
    for r in header:
        for c, v in enumerate(grid[r]):
            b = base_of(v)
            if b and not ARABIC.search(str(v)):
                if c < first:
                    sheet_base = sheet_base or b
                bases.setdefault(c, b)
    out: dict[int, Column] = {}
    current = sheet_base
    for c in range(width):
        if c in bases and c >= first:
            current = bases[c]
        elif c in bases and current is None:
            current = bases[c]
        if c in dated:
            period, kind = dated[c]
            out[c] = Column(period, kind, dims.get(c) or None, current)
    return out, top + 1, labels


# ---------------------------------------------------------------------------
# The body: rows, headings and the path above each row.

@dataclasses.dataclass
class Row:
    index: int
    en: str
    ar: str
    indent: int
    heading: bool
    values: dict[int, float]
    columns: dict[int, Column]    # the header block this row sits under
    caption: str                  # that block's caption, for the unit
    parents: list[int] = dataclasses.field(default_factory=list)  # nearest first
    dim: str | None = None        # a column label printed as a section (DIM_SECTIONS)


@dataclasses.dataclass
class Table:
    meta: dict
    rows: list[Row]
    recency: str = ""     # latest period in the file, for "newest file wins"
    order: int = 0        # position in the manifest, the tie-breaker


def read_table(path: pathlib.Path, meta: dict, grid: list[list] | None = None) -> Table:
    """One file: its rows, each dated by the header block above it.

    A sheet can stack a second table under the first with its own header: the
    balance of payments continues on "(cont.)", and the 2007/08 CPI sheet puts
    the new Jan 2007 = 100 index under the old 1999/2000 one. Each block is
    read with its own header.
    """
    grid = grid if grid is not None else read_grid(path)
    if not grid:
        raise ParseError("empty sheet")
    rows: list[Row] = []
    periods: list[str] = []
    for left, right in _side_by_side(grid):
        part = [r[left:right] for r in grid]
        # The imports-by-geography sheets for FY2005/06 to FY2011/12 open
        # with an empty exports template; the real table starts lower down.
        start = 0
        if not any(sum(1 for v in r if cell_kind(v)) >= 2 for r in part[:HEADER_SCAN]):
            first = next((i for i, r in enumerate(part) if sum(1 for v in r if cell_kind(v)) >= 2), 0)
            start = max(0, first - 3)
        while start < len(part):
            columns, body, labels = read_header(part[start:])
            if not columns:
                raise ParseError("no periods resolved")
            body += start
            end = _next_block(part, body, min(columns))
            caption = " ".join(str(cell) for row in part[start:body] for cell in row if cell)
            rows += _read_rows(part, body, end, columns, labels, caption)
            periods += [col.period for col in columns.values()]
            start = end

    _place_rows(rows, meta.get("subcategory"))
    return Table(meta, rows, max(periods))


def _place_rows(rows: list[Row], table: str | None) -> None:
    """Fill in each row's parents (and its column label where DIM_SECTIONS says)."""
    sections = SECTIONS.get(table)
    if sections:
        _parents_from_sections(rows, sections)
    else:
        _parents_from_layout(rows)
    pattern = DIM_SECTIONS.get(table)
    for row in rows if pattern else []:
        row.dim = None
        hit = next((p for p in row.parents if re.search(pattern, clean_label(rows[p].en).lower())), None)
        if hit is not None:
            row.dim = clean_label(rows[hit].en)
            row.parents = [p for p in row.parents if p != hit]


def _label_cells(grid: list[list], c: int) -> int:
    """How many rows with numbers to their right column c labels; 0 unless mostly text.

    Only rows with numbers count, so a footnote merged down a block of empty
    rows does not look like a column of labels.
    """
    cells = [r[c] for r in grid[3:] if c < len(r) and r[c] is not None and str(r[c]).strip()
             and any(to_number(v) is not None for v in r[c + 1:])]
    text = sum(1 for v in cells if isinstance(v, str) and to_number(v) is None
               and v.strip() not in PLACEHOLDERS)
    return text if text * 2 > len(cells) else 0


def _side_by_side(grid: list[list]) -> list[tuple[int, int]]:
    """Column ranges of tables placed side by side, each with its own labels.

    The annual CPI sheet puts the 1999/2000 = 100 table, then the Jan 2007 =
    100 one, then the Jan 2010 = 100 one across the page, each with its own
    label columns. A column in mid-sheet starts a new table only if it labels
    about as many rows as the first table does (not a footnote spilling
    across empty columns) and period headers follow it.
    """
    width = max(len(r) for r in grid)
    counts = [_label_cells(grid, c) for c in range(width)]
    enough = max(5, max(counts[:5], default=0) // 2)
    labels = [n >= enough for n in counts]
    starts = [0]
    for c in range(5, width):
        if labels[c] and not labels[c - 1]:
            nxt = next((d for d in range(c + 1, width) if labels[d] and not labels[d - 1]), width)
            heads = sum(1 for r in grid[:HEADER_SCAN] for v in r[c:nxt] if cell_kind(v))
            if heads >= 2:
                starts.append(c)
    return list(zip(starts, starts[1:] + [width]))


def _next_block(grid: list[list], body: int, first_col: int) -> int:
    """Index where a second header block starts below `body`, or the end."""
    seen_data = False
    for r in range(body, len(grid)):
        cells = grid[r][first_col:]
        numbers = [v for v in cells if to_number(v) is not None and bare_year(v) is None]
        if numbers:
            seen_data = True
            continue
        tokens = [v for v in cells if cell_kind(v) and (isinstance(v, str) or not bare_year(v))]
        # Only a header with labelled numbers under it: stray period text in a
        # footnote area is not a second table.
        data_below = any(
            any(isinstance(v, str) and v.strip() for v in row[:first_col])
            and any(to_number(v) is not None for v in row[first_col:])
            for row in grid[r + 1: r + 8])
        if seen_data and len(tokens) >= 2 and data_below:
            # Take the block's title and captions with it.
            start = r
            while start - 1 > body and any(v is not None and str(v).strip() for v in grid[start - 1]) \
                    and not any(to_number(v) is not None for v in grid[start - 1][first_col:]):
                start -= 1
            return start
    return len(grid)


def _read_rows(grid, body, end, columns, labels, caption) -> list[Row]:
    # Which column is which is decided by script, not position, and by most
    # cells rather than any: a long Arabic footnote merged across the sheet
    # must not turn the English column Arabic.
    en_col = ar_col = None
    for c in labels:
        cells = [r[c] for r in grid[body:end] if c < len(r) and isinstance(r[c], str) and r[c].strip()]
        if not cells:
            continue
        arabic = sum(1 for v in cells if ARABIC.search(v))
        if arabic * 2 > len(cells) and ar_col is None:
            ar_col = c
        elif arabic * 2 <= len(cells) and en_col is None:
            en_col = c
    if en_col is None and ar_col is None:
        raise ParseError("no label column found")

    rows: list[Row] = []
    for i in range(body, end):
        row = grid[i]

        def text(c):
            return str(row[c]) if c is not None and c < len(row) and row[c] is not None else ""

        en, ar = text(en_col).strip(), text(ar_col).strip()
        if ARABIC.search(en):
            en, ar = "", ar or en
        if not (en or ar) or FOOTNOTE.match(en or ar):
            continue
        values = {}
        for c in columns:
            if c < len(row):
                v = to_number(row[c])
                if v is not None:
                    values[c] = v
        raw = text(en_col) if en else text(ar_col)
        indent = len(raw) - len(raw.lstrip())
        rows.append(Row(i, en, ar, indent, not values, values, columns, caption))
    return rows


_RE_ENUM = re.compile(r"^\s*([a-hA-H]|\d{1,2})\s*-")


def _enumerator(label: str) -> tuple[str, int] | None:
    """"b- Gas" -> ("lower", 2); "3 - Deposits" -> ("digit", 3)."""
    m = _RE_ENUM.match(label or "")
    if not m:
        return None
    t = m.group(1)
    if t.isdigit():
        return "digit", int(t)
    return ("lower" if t.islower() else "upper"), ord(t.lower()) - 96


def _opens(row: Row) -> bool:
    """A row ending in a colon announces the rows under it: "Treasury Bills :"."""
    return bool(re.search(r":\s*$", re.sub(r"[*+#()\s]+$", "", row.en or row.ar)))


def _parents_from_layout(rows: list[Row]) -> None:
    """Where each row sits, read from CBE's own layout.

    A lettered or numbered item ("a- Oil", "2 - Lending and discount") sits
    under the row just above its first item, as do the items after it.
    Otherwise a row sits under the nearest heading above it (a labelled row
    with no numbers), the nearest row ending in a colon, or the nearest row
    indented clearly less than it.
    """
    items: dict[str, tuple[int, int | None]] = {}  # style -> (number, parent)
    for k, row in enumerate(rows):
        parent = None
        enum = _enumerator(row.en)
        if enum and enum[1] == 1 and k > 0:
            parent = k - 1
            items[enum[0]] = (1, parent)
        elif enum and enum[0] in items and items[enum[0]][0] == enum[1] - 1:
            parent = items[enum[0]][1]
            items[enum[0]] = (enum[1], parent)
        else:
            for j in range(k - 1, -1, -1):
                p = rows[j]
                if row.heading:
                    if (j == k - 1 and p.heading) or (p.heading and p.indent < row.indent - 1):
                        parent = j  # consecutive headings nest
                        break
                elif p.heading or (_opens(p) and not _opens(row)) or p.indent < row.indent - 1:
                    parent = j
                    break
        row.parents = []
        while parent is not None and len(row.parents) < 4:
            row.parents.append(parent)
            parent = rows[parent].parents[0] if rows[parent].parents else None


def _parents_from_sections(rows: list[Row], sections: list[str]) -> None:
    """Parents from the section patterns named in SECTIONS.

    A section also closes once its rows add up to it in every column, so a
    line after the last component ("Other" under Subsidies, Grants and
    Social Benefits, after Social Benefits is complete) is not put inside the
    last section.
    """
    levels = [p if isinstance(p, tuple) else (p, None) for p in sections]
    stack: list[list] = []  # [level, row number, running sums, children]
    for k, row in enumerate(rows):
        label = clean_label(row.en).lower()
        level = next((n for n, (opens, _) in enumerate(levels, 1) if re.search(opens, label, re.I)), None)
        leaf = next((n for n, (_, sits) in enumerate(levels, 1) if sits and re.search(sits, label, re.I)), None)
        while stack and _complete(stack[-1], rows) and any(row.values.values()):
            stack.pop()
        if level is not None or leaf is not None:
            while stack and stack[-1][0] >= (level or leaf):
                stack.pop()
        row.parents = [s[1] for s in reversed(stack)]
        if stack:
            sums = stack[-1][2]
            for c, v in row.values.items():
                sums[c] = sums.get(c, 0.0) + v
            stack[-1][3] += 1
        if level is not None:
            stack.append([level, k, {}, 0])


def _complete(section: list, rows: list[Row]) -> bool:
    """Its rows add up to it in nine columns out of ten (CBE's own sums slip now and then)."""
    target, sums, n = rows[section[1]].values, section[2], section[3]
    if n < 2 or not target:
        return False
    good = sum(1 for c, v in target.items() if c in sums and abs(sums[c] - v) <= max(1.0, 5e-4 * abs(v)))
    return good >= 0.9 * len(target)

# ---------------------------------------------------------------------------
# Units.
#
# CBE puts the unit in a caption above the table -- "(LE mn)", "(US.$m.)" --
# that applies to every row, except rows that say otherwise: a count, a ratio,
# an index, a rate, or a row with its own bracket. So the row wins, then its
# headings, then the sheet caption, then the table's known default. A row that
# says ratio, index, "No. of" or percent never gets a currency unit.

UNIT_PATTERNS = [
    (r"\bus\s*\.?\s*\$\s*\.?\s*(?:bn|billion)\b", "USD billion"),
    (r"\bus\s*\.?\s*\$\s*\.?\s*(?:mn|mio|million|mill|mil|m)\b\.?", "USD million"),
    (r"\bus\s*doll?ars?\s*\.?\s*(?:mn|million)\b", "USD million"),
    (r"مليون\s*دولار", "USD million"),
    (r"\b(?:l\s*\.?\s*e|egp|eg\s*\.?\s*p)\s*\.?\s*(?:bn|billion)\b", "EGP billion"),
    (r"\b(?:mn|million)\s*(?:l\s*\.?\s*e|egp)\b", "EGP million"),
    (r"\b(?:l\s*\.?\s*e|egp|eg\s*\.?\s*p)\s*\.?\s*(?:mn|mio|million|mill|mil|m)\b\.?", "EGP million"),
    (r"بالمليار\s*جنيه|مليار\s*جنيه", "EGP billion"),
    (r"بالمليون\s*جنيه|مليون\s*جنيه", "EGP million"),
    (r"\beur\s*\.?\s*(?:mn|million)\b", "EUR million"),
    (r"\bgbp\s*\.?\s*(?:mn|million)\b", "GBP million"),
]


def _flatten(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).lower()


def _not_money(text: str) -> str | None:
    if re.search(r"\bratio\b|\bp\s*/\s*e\b", text):
        return "ratio"
    if re.search(r"\bindi(?:ces|ex)\b|\begx\b|الرقم القياسي|مؤشرات البورصة", text):
        return "index"
    if re.search(r"\bno\.\s*of\b|\bnumber of\b|\(\s*(?:in\s*)?units?\s*\)|عدد", text):
        return "thousand" if re.search(r"thousand|بالألف", text) else "number"
    if re.search(r"%|\bpercent|\bper cent|نسبة مئوية", text):
        return "percent"
    return None


def sniff_unit(caption: str, label: str, path: list[str], table: str | None) -> str | None:
    text = _flatten(label)
    unit = _not_money(text)
    if unit:
        return unit
    for pattern, u in UNIT_PATTERNS:
        if re.search(pattern, text):
            return u
    # A heading only ever says "these are indices". A valueless row that looks
    # like a heading ("No. of listed shares", empty that quarter) says nothing
    # about the rows under it.
    if any(_not_money(_flatten(h)) == "index" for h in path):
        return "index"
    cap = _flatten(caption)
    for pattern, u in UNIT_PATTERNS:
        if re.search(pattern, cap):
            return u
    if table in TABLE_UNITS:
        return TABLE_UNITS[table]
    if "%" in cap or "percentage" in cap or "نسبة مئوية" in cap:
        return "percent"
    if "(000" in cap or "thousand" in cap or "بالألف" in cap:
        return "thousand"
    if "index" in cap or "الرقم القياسي" in cap:
        return "index"
    return None


# ---------------------------------------------------------------------------
# From tables to series.

@dataclasses.dataclass
class Cell:
    sid: str
    period: str
    value: float
    file: str


def build(tables: list[Table]) -> tuple[list[Cell], dict[str, dict]]:
    """Ids, values and catalogue records for a set of parsed tables.

    Ids are decided across every file of a table at once, so a label that
    needs its heading in one year's file gets it in every year's file and one
    measure does not split into two ids.
    """
    by_table = collections.defaultdict(list)
    for t in tables:
        by_table[t.meta.get("subcategory")].append(t)

    cells: list[Cell] = []
    catalog: dict[str, dict] = {}
    for name, group in by_table.items():
        canon = _canonical_labels(group)

        def key(row):
            return canon.get((row.en, norm_ar(row.ar))) or _fallback_key(row)

        # A row with no numbers is a heading unless its line has numbers in
        # most files of the table. Then it is a line CBE left blank that
        # period ("Energy and Support Services" in one quarter), and the rows
        # under it do not belong to it.
        seen_in, valued_in = collections.Counter(), collections.Counter()
        for t in group:
            for k, has in {(key(r), not r.heading) for r in t.rows}:
                (valued_in if has else seen_in)[k] += 1
        valued = {k for k, n in valued_in.items() if n > seen_in[k]}
        for t in group:
            blank = [r for r in t.rows if r.heading and key(r) in valued]
            for r in blank:
                r.heading = False
            if blank:
                _place_rows(t.rows, name)

        # How many headings each repeated label needs to be unique in every file.
        depth: dict[str, int] = {}
        for t in group:
            seen = collections.defaultdict(list)
            for r in t.rows:
                if not r.heading:
                    seen[key(r)].append(r)
            for leaf, rs in seen.items():
                if len(rs) < 2:
                    continue
                need = 1
                while need < 4 and len({tuple(key(t.rows[p]) for p in r.parents[:need]) for r in rs}) < len(rs):
                    need += 1
                depth[leaf] = max(depth.get(leaf, 0), need)

        # A heading in an id drops the opening words the table name already
        # says: under Domestic Credit, "(a) Domestic credit in local currency"
        # is LOCAL_CURRENCY.
        table_words = short_slug(name, 200).split("_")
        pending = []
        for t in sorted(group, key=lambda t: (t.recency, t.order)):
            meta = t.meta
            fam = CATEGORY_CODES.get(meta.get("category")) or short_slug(meta.get("category"), 8)
            code = TABLE_CODES.get(name, short_slug(name, 12))
            for row in t.rows:
                if row.heading:
                    continue
                leaf = key(row)
                parents = row.parents[: depth.get(leaf, 0)][::-1]  # outermost first
                quals = [key(t.rows[p]) for p in parents]
                for c, value in row.values.items():
                    col = row.columns[c]
                    if row.dim and not col.dim:
                        col = dataclasses.replace(col, dim=row.dim)
                    full, options = _series_id(fam, code, col, quals, leaf, table_words)
                    pending.append((full, options, Cell(full, col.period, round6(value), meta["id"]),
                                    (meta, t, row, col, [t.rows[p] for p in parents])))
        chosen = _shorten({full: options for full, options, *_ in pending})
        for full, _, cell, args in pending:
            cell.sid = chosen[full]
            cells.append(cell)
            # Newest file last, so its wording and unit win.
            catalog[cell.sid] = _record(cell.sid, *args, name)
    return cells, catalog


def _shorten(options: dict[str, list[str]]) -> dict[str, str]:
    """Each id's shortest form that fits MAX_ID, backing off wherever two would meet.

    Shortening must never merge two series; an id whose every short form is
    taken keeps its full form.
    """
    pick = {full: next((i for i, o in enumerate(opts) if len(o) <= MAX_ID), len(opts) - 1)
            for full, opts in options.items()}
    while True:
        owners = collections.defaultdict(set)
        for full, i in pick.items():
            owners[options[full][i]].add(full)
        crowded = [f for fulls in owners.values() if len(fulls) > 1 for f in fulls if pick[f] > 0]
        if not crowded:
            break
        for f in crowded:
            pick[f] -= 1
    chosen = {full: options[full][i] for full, i in pick.items()}
    taken = collections.Counter(chosen.values())
    return {full: sid if taken[sid] == 1 else full for full, sid in chosen.items()}


@dataclasses.dataclass
class Result:
    rows: list[tuple[str, str, float]]   # (series_id, period, value), sorted
    catalog: dict[str, dict]
    conflicts: list[list]                # differences between files
    clashes: list[str]                   # same-file conflicts; must be empty
    dropped: set[str]                    # annual series that repeat a finer one


def assemble(tables: list[Table]) -> Result:
    """Everything from parsed tables to the rows that get written."""
    cells, catalog = build(tables)
    clashes = same_file_conflicts(cells)
    precedence = {t.meta["id"]: (t.recency, t.order) for t in tables}
    merged, conflicts = merge(cells, precedence)
    dropped = drop_redundant_annual(merged)
    rows = sorted((sid, p, v) for (sid, p), v in merged.items() if sid not in dropped)
    periods = collections.defaultdict(list)
    for sid, period, _ in rows:
        periods[sid].append(period)
    kept = {sid: catalog[sid] for sid in periods}
    for sid, rec in kept.items():
        rec["freq"] = frequency(periods[sid], rec["freq"])
    conflicts = sorted(c for c in conflicts if c[0] in kept)
    return Result(rows, kept, conflicts, clashes, dropped)


def parse_files(files: list[tuple[pathlib.Path, dict]]) -> Result:
    """Parse a list of (path, manifest entry) in manifest order. Used by the tests."""
    tables = []
    for i, (path, meta) in enumerate(files, 1):
        table = read_table(path, meta)
        table.order = i
        tables.append(table)
    return assemble(tables)


def _fallback_key(row: Row) -> str:
    # An Arabic-only label slugs to the empty string. A short digest of the
    # Arabic keeps it unique and stable across runs.
    return short_slug(row.en) or "R" + hashlib.sha1(norm_ar(row.ar).encode("utf-8")).hexdigest()[:8].upper()


def _canonical_labels(group: list[Table]) -> dict[tuple[str, str], str]:
    """One key per line of a table, across every file of it.

    CBE rewords lines from year to year ("Korea" becomes "South Korea") and
    some files carry only the Arabic. Where one Arabic label goes with several
    English ones that never appear together in a file, they are one line, and
    the newest file's wording names it. An Arabic-only row borrows the English
    its Arabic carries elsewhere.

    An English label that the table also uses with a different Arabic one is a
    line in its own right and is never renamed: the 2004/05 NIB sheet has its
    Arabic column shifted one row against the English and the numbers.
    """
    by_ar: dict[str, dict[str, str]] = collections.defaultdict(dict)  # ar -> {en slug: recency}
    together: dict[str, list[set]] = collections.defaultdict(list)
    en_with: dict[str, set] = collections.defaultdict(set)
    for t in group:
        per_file = collections.defaultdict(set)
        for r in t.rows:
            a, e = norm_ar(r.ar), short_slug(r.en)
            if a and e:
                if t.recency >= by_ar[a].get(e, ""):
                    by_ar[a][e] = t.recency
                per_file[a].add(e)
                en_with[e].add(a)
        for a, es in per_file.items():
            together[a].append(es)
    out: dict[tuple[str, str], str] = {}
    for t in group:
        for r in t.rows:
            a, e = norm_ar(r.ar), short_slug(r.en)
            options = by_ar.get(a) or {}
            if not e:
                if options:
                    out[(r.en, a)] = max(options, key=lambda k: (options[k], k))
                continue
            if len(options) > 1 and en_with[e] == {a} and not any(len(s) > 1 for s in together[a]):
                out[(r.en, a)] = max(options, key=lambda k: (options[k], k))
            else:
                out[(r.en, a)] = e
    return out


def _series_id(fam, code, col: Column, quals, leaf, table_words=()) -> tuple[str, list[str]]:
    """-> (full id, shorter forms longest first). `_shorten` picks one per id."""
    parts = ["EG", "XL", fam] + ([code] if code else [])
    if col.base:
        parts.append(base_segment(col.base))
    rest = [leaf] + ([short_slug(col.dim, 20)] if col.dim and short_slug(col.dim, 20) else [])
    rest += {"A": ["A"], "YTD": ["YTD"]}.get(col.kind, [])
    full = ".".join(parts + list(quals) + rest)
    # Long ids broke layouts before. Shorter forms, longest first: headings
    # without the table's own words, then headings cut, then the line cut.
    quals = [_drop_leading(q, table_words) for q in quals]
    options = [".".join(parts + quals + rest)]
    for limit in (16, 12):
        quals = [_cut(q, limit) for q in quals]
        options.append(".".join(parts + quals + rest))
        over = len(options[-1]) - MAX_ID
        if over > 0:
            line = [_cut(rest[0], max(8, len(rest[0]) - over))] + rest[1:]
            options.append(".".join(parts + quals + line))
    return full, list(dict.fromkeys(options))


def _drop_leading(segment: str, table: list[str]) -> str:
    """DOMESTIC_CREDIT_LOCAL_CURRENCY under Domestic Credit -> LOCAL_CURRENCY."""
    parts = segment.split("_")
    n = 0
    while n < min(len(parts), len(table)) and parts[n] == table[n]:
        n += 1
    return "_".join(parts[n:]) or segment


def _cut(segment: str, limit: int) -> str:
    out = ""
    for w in segment.split("_"):
        candidate = f"{out}_{w}" if out else w
        if len(candidate) > limit:
            break
        out = candidate
    return out or segment[:limit]


def _record(sid, meta, t: Table, row: Row, col: Column, quals: list[Row], table: str) -> dict:
    path_en = [clean_label(q.en or q.ar) for q in quals]
    label_en = clean_label(row.en or row.ar)
    head = table or ""
    # Only true headings ("The Egyptian Exchange Indices") lend a unit; a data
    # row above is a parent by layout, and layouts drift.
    headings = [clean_label(t.rows[p].en) for p in row.parents if t.rows[p].heading]
    unit = sniff_unit(row.caption, row.en or row.ar, headings, table)
    # The lines under "No. of Companies Sold, of which:" are counts too.
    opener = t.rows[row.parents[0]] if row.parents and _opens(t.rows[row.parents[0]]) else None
    if opener and not _not_money(_flatten(row.en or row.ar)):
        unit = _not_money(_flatten(opener.en)) or unit
    if col.base:
        if re.search(r"constant|prices", head, re.I):
            head = re.sub(r"\(Constant Prices\)", f"(Constant {col.base} Prices)", head, flags=re.I)
            if col.base not in head:
                head += f" ({col.base} prices)"
            unit = f"{unit or 'EGP million'}, constant {col.base} prices"
        elif unit in (None, "index"):
            head += f" ({col.base}=100)"
            unit = f"index, {col.base}=100"
    title = " - ".join([head] + path_en + [label_en] + ([col.dim] if col.dim else []))
    title += {"A": " (fiscal year)", "YTD": " (fiscal year to date)"}.get(col.kind, "")
    ar_parts = [q.ar.strip() for q in quals if q.ar] + ([row.ar.strip()] if row.ar else [])
    record = {
        "series_id": sid,
        "title_en": title,
        "title_ar": " - ".join(ar_parts) if row.ar else None,
        "dataset": "excel_archive",
        "family": (meta.get("category") or "").lower().replace(" ", "_"),
        "freq": col.kind,  # replaced by the observed spacing once merged
        "unit": unit,
        "level": len(row.parents),
        "period_basis": "end" if col.kind != "YTD" else "fiscal year to date",
        "fiscal_year_basis": "Egypt, 1 July to 30 June",
        "source_file": meta.get("url"),
    }
    if col.base:
        record["base_period"] = col.base
    return record


# ---------------------------------------------------------------------------
# Merging files.

def same_file_conflicts(cells: list[Cell]) -> list[str]:
    seen: dict[tuple[str, str, str], float] = {}
    out = []
    for c in cells:
        k = (c.file, c.sid, c.period)
        if k in seen and seen[k] != c.value:
            out.append(f"{c.file}: {c.sid} {c.period} holds {seen[k]} and {c.value}")
        seen.setdefault(k, c.value)
    return out


def merge(cells: list[Cell], precedence: dict[str, tuple]) -> tuple[dict[tuple[str, str], float], list[list]]:
    """Newest file wins; every disagreement between files is kept as a row."""
    by_slot: dict[tuple[str, str], dict[float, str]] = collections.defaultdict(dict)
    for c in cells:
        held = by_slot[(c.sid, c.period)]
        if c.value not in held or precedence[c.file] > precedence[held[c.value]]:
            held[c.value] = c.file
    merged, conflicts = {}, []
    for slot, held in by_slot.items():
        ranked = sorted(held.items(), key=lambda kv: precedence[kv[1]], reverse=True)
        merged[slot] = ranked[0][0]
        for value, file in ranked[1:]:
            conflicts.append([slot[0], slot[1], ranked[0][0], value, ranked[0][1], file])
    return merged, conflicts


def drop_redundant_annual(merged: dict[tuple[str, str], float]) -> set[str]:
    """Annual series that only repeat their own monthly or quarterly series.

    An end-of-June stock read off an annual file is the same number as June in
    the monthly file. Where every annual point matches, the .A series adds
    nothing and is dropped. Fiscal-year totals of flows never match their last
    quarter, so they stay.
    """
    series = collections.defaultdict(dict)
    for (sid, period), v in merged.items():
        series[sid][period] = v
    dropped = set()
    for sid, points in series.items():
        if not sid.endswith(".A"):
            continue
        finer = series.get(sid[:-2])
        if finer and all(p in finer and _close(finer[p], v) for p, v in points.items()):
            dropped.add(sid)
    return dropped


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= 1e-6 * max(1.0, abs(a), abs(b))


def frequency(periods: list[str], kind: str) -> str:
    """M, Q or A from the median spacing of the data itself."""
    if len(periods) < 2:
        return {"M": "M", "Q": "Q", "YTD": "Q", "A": "A"}[kind]
    days = sorted(dt.date.fromisoformat(p).toordinal() for p in periods)
    gap = statistics.median(b - a for a, b in zip(days, days[1:]))
    return "M" if gap <= 45 else "Q" if gap <= 135 else "A"


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--category")
    ap.add_argument("--allow-retired", action="store_true",
                    help="write even if published ids disappear without an entry in catalog/id_map.json")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["files"]
    on_disk = {
        os.path.splitext(os.path.basename(p))[0]: pathlib.Path(p)
        for p in EXCEL.glob("*.xls*")
    }

    todo = [m for m in manifest if m["id"] in on_disk]
    if args.category:
        todo = [m for m in todo if m["category"] == args.category]
    if args.limit:
        todo = todo[: args.limit]
    partial = bool(args.category or args.limit)
    print(f"parser {PARSER_VERSION}: {len(todo)} files to parse "
          f"({len(manifest)} in manifest, {len(on_disk)} on disk)\n")

    tables: list[Table] = []
    quarantine: list[dict] = []
    for i, meta in enumerate(todo, 1):
        try:
            table = read_table(on_disk[meta["id"]], meta)
            table.order = i
            if not any(r.values for r in table.rows):
                raise ParseError("parsed but produced no observations")
            tables.append(table)
        except Exception as exc:  # noqa: BLE001
            quarantine.append({
                "id": meta["id"], "url": meta["url"],
                "category": meta.get("category"), "subcategory": meta.get("subcategory"),
                "frequency": meta.get("frequency"), "period_label": meta.get("period_label"),
                "reason": f"{type(exc).__name__}: {exc}",
            })
        if i % 100 == 0:
            print(f"  [{i}/{len(todo)}] {len(tables)} ok, {len(quarantine)} quarantined")

    result = assemble(tables)
    if result.clashes:
        print(f"\nFAILED: {len(result.clashes)} same-file conflicts -- two different numbers for one "
              f"series and date in one file. Nothing written. First ones:", file=sys.stderr)
        for line in result.clashes[:25]:
            print("  " + line, file=sys.stderr)
        return 1
    rows, all_cat, conflicts = result.rows, result.catalog, result.conflicts

    print(f"\nparsed {len(tables)}/{len(todo)} files")
    print(f"{len(all_cat):,} series, {len(rows):,} observations, "
          f"{len(conflicts):,} differences between files, {len(result.dropped)} annual series "
          f"dropped as repeats of their monthly or quarterly series")
    if quarantine:
        reasons = collections.Counter(q["reason"].split(":")[0] for q in quarantine)
        print(f"quarantined {len(quarantine)} files")
        for reason, n in reasons.most_common(8):
            print(f"   {reason}: {n}")
    if partial:
        print("\n--limit/--category: report only, nothing written.")
        return 0

    # Ids are a promise once published. One that disappears must be mapped to
    # its successor (or to null, retired) in catalog/id_map.json first.
    if OUT_SERIES.exists() and not args.allow_retired:
        with OUT_SERIES.open(encoding="utf-8") as fh:
            before = {r["series_id"] for r in csv.DictReader(fh)}
        mapped = json.loads(ID_MAP.read_text(encoding="utf-8")).get("ids", {}) if ID_MAP.exists() else {}
        gone = sorted(before - set(all_cat) - set(mapped))
        if gone:
            print(f"\nFAILED: {len(gone)} published series ids would disappear. Map each to its "
                  f"new id (or null) in catalog/id_map.json, or rerun with --allow-retired. "
                  f"First ones: {', '.join(gone[:10])}", file=sys.stderr)
            return 1

    OUT_SERIES.parent.mkdir(parents=True, exist_ok=True)
    # LF, as the repository stores it: a CRLF file next to LF ones is skipped
    # without a word by DuckDB's multi-file read in build_exports.
    with OUT_SERIES.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["series_id", "period", "value"])
        w.writerows(rows)
    with OUT_CONFLICTS.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["series_id", "period", "kept", "discarded", "kept_file", "discarded_file"])
        w.writerows(conflicts)

    existing = json.loads(OUT_CATALOG.read_text(encoding="utf-8")) if OUT_CATALOG.exists() else []
    # This script owns the EG.XL.* namespace outright. Dropping it before the
    # merge is what stops a series that CBE has renamed or withdrawn from
    # sitting in the catalogue forever with no observations behind it.
    by_id = {c["series_id"]: c for c in existing if not c["series_id"].startswith("EG.XL.")}
    by_id.update(all_cat)
    OUT_CATALOG.write_text(
        json.dumps(sorted(by_id.values(), key=lambda c: c["series_id"]), indent=1, ensure_ascii=False),
        encoding="utf-8",
    )
    QUARANTINE.write_text(
        json.dumps({"count": len(quarantine), "parser_version": PARSER_VERSION, "files": quarantine},
                   indent=1, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"catalog now holds {len(by_id):,} series")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
