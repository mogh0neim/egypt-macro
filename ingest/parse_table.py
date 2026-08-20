"""Parse the HTML table fragments returned by the historical-data endpoints.

Three wrinkles the endpoints throw at us:

  1. Header rows repeat throughout the body (the markup restates <th> rows
     every so often). Only the leading header block is the real header.
  2. Two datasets use a grouped two-row header -- e.g. the T-bill secondary
     market table has tenor buckets on row 1 and "W. A. Yield %" / "Volume"
     on row 2. Those are flattened to "1 Month (Up to 30 Days) - W. A. Yield %".
  3. Cells carry colspan/rowspan, so a naive cell list misaligns with the
     data rows.

`parse_table` returns (columns, rows) with every row the same width as
`columns`, or raises TableParseError rather than returning something subtly
misaligned.
"""

from __future__ import annotations

import html
import re

_RE_TABLE = re.compile(r"<table[^>]*>(.*?)</table>", re.S)
_RE_ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
_RE_CELL = re.compile(r"<(th|td)([^>]*)>(.*?)</\1>", re.S)
_RE_SPAN = re.compile(r'colspan="(\d+)"')
_RE_NO_RESULTS = re.compile(r"There are no matching results", re.I)


class TableParseError(RuntimeError):
    pass


def _clean(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _cells(row_html: str) -> list[tuple[str, str, int]]:
    """-> [(tag, text, colspan)]"""
    out = []
    for tag, attrs, body in _RE_CELL.findall(row_html):
        span = _RE_SPAN.search(attrs)
        out.append((tag, _clean(body), int(span.group(1)) if span else 1))
    return out


def _expand(cells: list[tuple[str, str, int]]) -> list[str]:
    """Repeat a cell's text across the columns its colspan covers."""
    out: list[str] = []
    for _tag, text, span in cells:
        out.extend([text] * span)
    return out


def parse_tables(fragment: str) -> list[tuple[list[str], list[list[str]]]]:
    """Every <table> in the response, in document order.

    Responses are not single-table. Auction results split into one table per
    tenor (all with identical columns, meant to be concatenated), while the
    interbank endpoints return two genuinely different panels -- rates, then
    volumes. Callers decide which; parsing them all is the only safe default,
    because taking the first silently discarded the volumes for months.
    """
    if _RE_NO_RESULTS.search(fragment):
        return []
    out = []
    for body in _RE_TABLE.findall(fragment):
        cols, rows = _parse_one(body)
        if cols or rows:
            out.append((cols, rows))
    if not out:
        raise TableParseError("no parseable <table> in response")
    return out


def parse_table(fragment: str) -> tuple[list[str], list[list[str]]]:
    """The first table only. Prefer `parse_tables` unless you know there is one."""
    tables = parse_tables(fragment)
    return tables[0] if tables else ([], [])


def concat_tables(
    tables: list[tuple[list[str], list[list[str]]]]
) -> tuple[list[str], list[list[str]]]:
    """Concatenate tables that share a column layout, e.g. auctions by tenor."""
    if not tables:
        return [], []
    cols = tables[0][0]
    rows: list[list[str]] = []
    for i, (c, r) in enumerate(tables):
        if c != cols:
            raise TableParseError(
                f"table {i} has columns {c!r}, expected {cols!r}; "
                "these panels are not concatenable"
            )
        rows.extend(r)
    return cols, rows


def _parse_one(table_body: str) -> tuple[list[str], list[list[str]]]:
    rows = [_cells(r) for r in _RE_ROW.findall(table_body)]
    rows = [r for r in rows if r]
    if not rows:
        return [], []

    def is_header(cells: list[tuple[str, str, int]]) -> bool:
        return all(tag == "th" for tag, _, _ in cells)

    # Leading run of header rows -- one row normally, two when grouped.
    header_rows: list[list[str]] = []
    idx = 0
    while idx < len(rows) and is_header(rows[idx]):
        header_rows.append(_expand(rows[idx]))
        idx += 1
    if not header_rows:
        raise TableParseError("no header row found")

    data_rows = [
        [text for _tag, text, _span in r] for r in rows[idx:] if not is_header(r)
    ]
    if not data_rows:
        return _flatten(header_rows), []

    width = max(len(r) for r in data_rows)
    columns = _flatten(header_rows, width)

    if len(columns) < width:
        columns += [f"col{i}" for i in range(len(columns), width)]
    columns = columns[:width]

    normalised = [r + [""] * (width - len(r)) for r in data_rows]
    return columns, normalised


def _flatten(header_rows: list[list[str]], width: int | None = None) -> list[str]:
    """Combine one or more header rows into a single column list.

    With a grouped header the top row carries the group label (repeated across
    its colspan) and the bottom row the measure. Empty parts are dropped so a
    single-row header passes through unchanged.
    """
    if len(header_rows) == 1:
        cols = header_rows[0]
    else:
        depth = max(len(r) for r in header_rows)
        padded = [r + [""] * (depth - len(r)) for r in header_rows]
        cols = []
        for i in range(depth):
            parts, seen = [], set()
            for row in padded:
                part = row[i]
                # A group label repeated across a colspan should appear once.
                if part and part not in seen:
                    parts.append(part)
                    seen.add(part)
            cols.append(" - ".join(parts))

    if width is not None and len(cols) > width:
        # Repeated header blocks inflate the list; the first `width` are real.
        cols = cols[:width]
    return cols


_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def to_number(raw: str) -> float | None:
    """CBE mixes thousands separators, percent signs and Arabic-Indic digits."""
    if raw is None:
        return None
    s = raw.translate(_ARABIC_INDIC).strip()
    s = s.replace(",", "").replace("%", "").replace(" ", "").strip()
    if s in {"", "-", "--", "N/A", "n/a", "NA", ".."}:
        return None
    try:
        return float(s)
    except ValueError:
        return None
