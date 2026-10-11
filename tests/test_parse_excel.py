"""Golden-file tests for the Excel-archive parser.

Each fixture under tests/fixtures/excel is a real CBE workbook, one per layout
that has gone wrong before: trade (Exports / Imports / Balance columns), GDP at
factor cost (two base years side by side), the budget (Budget Sector and
General Government, fiscal year to date), FDI (countries under Inflows), the
monthly CPI (a repeated fiscal-year row over the months, a mistyped year, a
second table with a new base under the first), domestic credit (one label six
times), balance of payments, imports by geography (a header lower down the
sheet), external debt and the stock market (units per row).

The expected numbers were read off the sheets by hand. Run either way:

    python -m pytest tests
    python tests/test_parse_excel.py
"""

from __future__ import annotations

import collections
import datetime as dt
import functools
import json
import pathlib
import re
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))

import parse_excel as pe  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures" / "excel"


@functools.lru_cache(maxsize=1)
def parsed():
    manifest = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))["files"]
    files = [(next(FIXTURES.glob(m["id"] + ".*")), m) for m in manifest]
    result = pe.parse_files(files)
    series = collections.defaultdict(dict)
    for sid, period, value in result.rows:
        series[sid][period] = value
    return result, series


def value(sid: str, period: str) -> float:
    _, series = parsed()
    assert sid in series, f"missing series {sid}"
    assert period in series[sid], f"{sid} has no {period}"
    return series[sid][period]


def test_no_two_numbers_in_one_slot():
    result, _ = parsed()
    assert result.clashes == []


def test_annual_equals_sum_of_quarters():
    # Trade and balance of payments: the fiscal-year figure is its own series
    # (.A) and equals the four quarters that make it up.
    result, series = parsed()
    checked = 0
    for sid in result.catalog:
        if not (sid.startswith(("EG.XL.TRADE.", "EG.XL.BOP.")) and sid.endswith(".A")):
            continue
        quarters = series.get(sid[:-2], {})
        for period, total in series[sid].items():
            y = int(period[:4])
            qs = [f"{y - 1}-09-30", f"{y - 1}-12-31", f"{y}-03-31", f"{y}-06-30"]
            if all(q in quarters for q in qs):
                assert abs(sum(quarters[q] for q in qs) - total) <= max(1.0, 0.005 * abs(total)), (sid, period)
                checked += 1
    assert checked >= 100, checked


def test_trade_columns_are_separate_series():
    base = "EG.XL.TRADE.BALANCES.OIL_MERCHANDISE_BALANCE"
    assert value(base + ".EXPORTS", "2017-09-30") == 1782.5
    assert value(base + ".IMPORTS", "2017-09-30") == 2752.9
    assert value(base + ".SURPLUS_DEFICIT", "2017-09-30") == -970.4
    assert value(base + ".EXPORTS.A", "2018-06-30") == 8773.0


def test_gdp_base_years_never_merge():
    result, _ = parsed()
    old = "EG.XL.GDP.FCK.B2011_12.SUEZ_CANAL.TOTAL"
    new = "EG.XL.GDP.FCK.B2016_17.SUEZ_CANAL.TOTAL"
    # The 2016/17 sheet prints both bases for the same quarters.
    assert value(old, "2016-09-30") == 8815.4
    assert value(new, "2016-09-30") == 11503.1
    assert result.catalog[new]["unit"] == "EGP million, constant 2016/17 prices"
    assert result.catalog[new]["base_period"] == "2016/17"


def test_budget_sector_and_general_government():
    # Review example: FY2006/07 total revenues, 180,215 for the Budget Sector
    # and 205,654 for General Government, both kept.
    assert value("EG.XL.BUDGET.REVENUE.TOTAL_REVENUES.BUDGET_SECTOR.A", "2007-06-30") == 180215
    assert value("EG.XL.BUDGET.REVENUE.TOTAL_REVENUES.GENERAL_GOVT.A", "2007-06-30") == 205654
    # Quarterly files are cumulative from July: July/Sept, July/Dec, ...
    ytd = "EG.XL.BUDGET.REVENUE.TOTAL_REVENUES.BUDGET_SECTOR.YTD"
    assert value(ytd, "2010-09-30") == 36832
    assert value(ytd, "2010-12-31") == 99745
    assert value(ytd, "2011-06-30") == 265286
    result, _ = parsed()
    assert "fiscal year to date" in result.catalog[ytd]["title_en"]


def test_fdi_countries_under_inflows():
    assert value("EG.XL.FDI.USA.INFLOWS", "2020-09-30") == 384.6
    # "UK++" (after Brexit) and "UK" inside the EU list are different lines.
    assert value("EG.XL.FDI.UK.INFLOWS", "2020-09-30") == 477.1
    assert value("EG.XL.FDI.EU.UK.INFLOWS", "2020-09-30") == 0


def test_cpi_keeps_every_month_and_its_base():
    result, series = parsed()
    new = "EG.XL.PRICE.CPI.B2018_19.ALL_ITEMS"
    fy = [p for p in series[new] if "2021-07-01" <= p <= "2022-06-30"]
    assert len(fy) == 12
    assert value(new, "2021-07-31") == 114.0
    assert result.catalog[new]["unit"] == "index, 2018/19=100"
    # The 2006/07 sheet types "Aug.2007" between July and Sept 2006.
    assert value("EG.XL.PRICE.CPI.B1999_00.ALL_ITEMS", "2006-08-31") == 147.9
    # The 2007/08 sheet has the Jan 2007 = 100 table under the old one.
    assert value("EG.XL.PRICE.CPI.B1999_00.ALL_ITEMS", "2007-07-31") == 158.7
    assert value("EG.XL.PRICE.CPI.BJAN2007.ALL_ITEMS", "2007-09-30") == 105.0


def test_domestic_credit_heading_path():
    # Review example: July 2017 private-sector lending is 663,533 in total;
    # 273,782 is only its foreign-currency part.
    assert round(value("EG.XL.BANK.CREDIT.DOMESTIC_CREDIT.CLAIMS_PRIVATE.LENDING", "2017-07-31")) == 663533
    assert round(value("EG.XL.BANK.CREDIT.FOREIGN.CLAIMS_PRIVATE.LENDING_DISCOUNT", "2017-07-31")) == 273782


def test_header_lower_down_the_sheet():
    # Imports by geography FY2005/06 opens with an empty exports template.
    assert value("EG.XL.TRADE.MGEO.TOTAL_IMPORTS", "2005-09-30") == 7348.3


def test_external_debt_dates():
    assert value("EG.XL.XDEBT.TYPE.TOTAL_EXTERNAL_DEBT", "2024-03-31") == 160607.41
    assert value("EG.XL.XDEBT.TYPE.TOTAL_EXTERNAL_DEBT", "2024-06-30") == 152885.2


def test_units_per_row():
    result, _ = parsed()
    units = {sid: rec["unit"] for sid, rec in result.catalog.items()}
    assert units["EG.XL.STOCK.EGX_30"] == "index"
    assert units["EG.XL.STOCK.P_E_RATIO_MOST_ACTIVE_COMPANIES"] == "ratio"
    assert units["EG.XL.STOCK.LISTING.NO_LISTED_COMPANIES_UNIT"] == "number"
    assert units["EG.XL.STOCK.MARKET_CAPITALIZATION_LE"] == "EGP million"
    money = ("EGP", "USD", "EUR", "GBP")
    not_money = re.compile(r"\bratio\b|\bindex\b|\bindices\b|\bno\. of\b|\bnumber of\b|\begx\b", re.I)
    for sid, rec in result.catalog.items():
        if not_money.search(rec["title_en"]):
            assert not (rec["unit"] or "").startswith(money), (sid, rec["unit"])


def test_frequency_matches_spacing():
    result, series = parsed()
    for sid, rec in result.catalog.items():
        days = sorted(dt.date.fromisoformat(p).toordinal() for p in series[sid])
        if len(days) < 3:
            continue
        gap = statistics.median(b - a for a, b in zip(days, days[1:]))
        assert rec["freq"] == ("M" if gap <= 45 else "Q" if gap <= 135 else "A"), sid


def test_values_keep_cbe_digits_without_float_noise():
    # Noise in the last float digits goes; every digit CBE typed stays.
    assert pe.round6(83435.71299999999) == 83435.713
    assert pe.round6(0.03451234) == 0.03451234
    assert pe.round6(160607.41) == 160607.41
    assert pe.round6(3069622.677152216) == 3069622.6772
    assert pe.round6(11503.1000227) == 11503.1
    _, series = parsed()
    for points in series.values():
        for v in points.values():
            assert v == pe.round6(v)


def test_header_cells():
    assert pe.fy_of("2016/2017prices") == (2017, "FY2016/17")
    assert pe.base_of("at 2016/2017prices") == "2016/17"
    assert pe.base_of("CPI & Weights for main Groups, Urban Egypt(Jan 2007 =100)") == "Jan 2007"
    assert pe.range_of("Jan./Mar. 2015*") == (1, 3, 2015)
    assert pe.range_of("July/Dec.") == (7, 12, None)
    assert pe.year_of(120913) is None
    assert pe.base_segment("2016/17") == "B2016_17"
    assert pe.base_segment("Jan 2010") == "BJAN2010"


def test_ids_are_short_and_stable_shaped():
    result, _ = parsed()
    for sid in result.catalog:
        assert sid.startswith("EG.XL.") and sid == sid.upper(), sid
        assert len(sid) <= 80, sid


if __name__ == "__main__":
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_")]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"ok    {name}")
        except AssertionError as err:
            failed += 1
            print(f"FAIL  {name}: {err}")
    print(f"\n{len(tests) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
