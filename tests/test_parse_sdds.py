"""Golden-file tests for the SDDS parser.

Each fixture under tests/fixtures/sdds is a real file from CBE's SDDS page,
as downloaded on 11 October 2026: domestic liquidity (M2, with "2005" typed
over May 2006 and figures stored as text with footnote marks), international
reserves (the first months stored as text with no-break spaces, the latest
marked "+ Provisional") and deposits in foreign currencies ("Apirl" for April
2008, January 2007 left out, two more mistyped years).

The expected numbers were read off the sheets by hand. Run either way:

    python -m pytest tests
    python tests/test_parse_sdds.py
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import functools
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))

import parse_sdds as ps  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures" / "sdds"
SPECS = {s.key: s for s in ps.SPECS}


@functools.lru_cache(maxsize=1)
def parsed():
    manifest = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))["files"]
    series, catalog = {}, {}
    for meta in manifest:
        rows, cat = ps.build(SPECS[meta["key"]], meta, FIXTURES / f"{meta['key']}.xlsx")
        for sid, period, value in rows:
            series.setdefault(sid, {})[period] = value
        catalog.update(cat)
    return series, catalog


def value(sid: str, period: str) -> float:
    series, _ = parsed()
    assert sid in series, f"missing series {sid}"
    assert period in series[sid], f"{sid} has no {period}"
    return series[sid][period]


def test_m2_first_and_latest():
    assert value("EG.SDDS.M2.TOTAL", "2004-08-31") == 447171
    assert value("EG.SDDS.M2.TOTAL", "2026-08-31") == 15665518
    assert value("EG.SDDS.M2.M1.CURRENCY", "2026-08-31") == 1618905
    series, catalog = parsed()
    assert len(series["EG.SDDS.M2.TOTAL"]) == 265
    assert catalog["EG.SDDS.M2.TOTAL"]["unit"] == "EGP million"


def test_mistyped_years_are_read_from_the_month_order():
    # "2005" over May 2006 in the M2 sheet; "2011" over January 2012 and "2016"
    # over April 2015 in foreign-currency deposits.
    assert value("EG.SDDS.M2.TOTAL", "2006-05-31") == 551179
    assert value("EG.SDDS.DEP.FC.TOTAL", "2012-01-31") == 184623
    assert value("EG.SDDS.DEP.FC.TOTAL", "2015-04-30") == 259163


def test_text_cells_with_marks_and_spaces():
    # '1682225+' (the March 2015 footnote), '\xa014237', '122282\xa0'.
    assert value("EG.SDDS.M2.TOTAL", "2015-03-31") == 1682225
    assert value("EG.SDDS.RES.NIR", "2004-02-29") == 14237
    assert value("EG.SDDS.DEP.FC.TOTAL", "2005-02-28") == 122282


def test_misspelt_month_and_a_month_cbe_left_out():
    assert value("EG.SDDS.DEP.FC.TOTAL", "2008-04-30") == 168124
    series, _ = parsed()
    assert "2007-01-31" not in series["EG.SDDS.DEP.FC.TOTAL"]
    assert len(series["EG.SDDS.DEP.FC.TOTAL"]) == 264


def test_reserves():
    series, catalog = parsed()
    nir = series["EG.SDDS.RES.NIR"]
    assert len(nir) == 272 and min(nir) == "2004-02-29" and max(nir) == "2026-09-30"
    assert value("EG.SDDS.RES.NIR", "2026-09-30") == 57348
    # End of May 2015: the figure the press release of 23 June 2015 gave as 19,559.7.
    assert value("EG.SDDS.RES.NIR", "2015-05-31") == 19560
    parts = ("GOLD", "SDR", "FOREIGN_CURRENCIES", "IMF_LOANS")
    assert sum(value(f"EG.SDDS.RES.{p}", "2026-09-30") for p in parts) == value("EG.SDDS.RES.GROSS", "2026-09-30")
    assert catalog["EG.SDDS.RES.NIR"]["unit"] == "USD million"
    assert "EG.RES.NIR" in catalog["EG.SDDS.RES.NIR"]["note"]


def test_preliminary_and_provisional_marks():
    _, catalog = parsed()
    assert catalog["EG.SDDS.M2.TOTAL"]["marked"] == {
        "as": "preliminary", "periods": ["2026-06-30", "2026-07-31", "2026-08-31"]}
    assert catalog["EG.SDDS.RES.NIR"]["marked"] == {
        "as": "provisional", "periods": ["2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]}


def test_source_file_and_provenance():
    _, catalog = parsed()
    entry = catalog["EG.SDDS.M2.TOTAL"]
    assert entry["source_file"].startswith("https://www.cbe.org.eg/-/media/") and entry["source_file"].endswith(".xlsx")
    assert entry["source_url"] == ps.PAGE
    assert entry["provenance"] == "Dated by Miqyas from the sheet's month labels"
    assert entry["title_en"].startswith("Domestic Liquidity and Counterpart Assets (SDDS) - ")


def test_ids_and_dates_are_well_formed():
    series, catalog = parsed()
    assert set(series) == set(catalog)
    for sid, points in series.items():
        assert sid.startswith("EG.SDDS.") and sid == sid.upper() and len(sid) <= 64, sid
        for period in points:
            day = dt.date.fromisoformat(period)
            assert (day + dt.timedelta(days=1)).day == 1, (sid, period)


def test_a_line_not_named_stops_the_parse():
    spec = SPECS["international-reserves"]
    short = dataclasses.replace(spec, lines=spec.lines[:-1])
    try:
        ps.build(short, {}, FIXTURES / "international-reserves.xlsx")
    except ps.ParseError:
        return
    raise AssertionError("a sheet with a line the parser does not name was read anyway")


def test_wrong_unit_stops_the_parse():
    spec = dataclasses.replace(SPECS["international-reserves"], unit="EGP million")
    try:
        ps.build(spec, {}, FIXTURES / "international-reserves.xlsx")
    except ps.ParseError:
        return
    raise AssertionError("a USD sheet was read as EGP")


def test_cells_and_labels():
    assert ps.number("\xa014237") == 14237
    assert ps.number(" -136462+") == -136462
    assert ps.number("303680x") == 303680
    assert ps.number(" - ") is None
    assert ps.number(158158.46049828) == 158158
    assert ps.clean_label("Net claims on banks (A-B):+") == "net claims on banks"
    assert ps.clean_label("  B- deposits in Foreign currency with CBE  ") == "deposits in foreign currency with cbe"
    assert ps.clean_label("Reserve Money (M0)**") == "reserve money (m0)"


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
