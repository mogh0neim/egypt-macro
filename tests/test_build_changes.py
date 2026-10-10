"""Whose change was it: build_changes.classify on a small made-up history.

A false "revised by CBE" is the one mistake the revision record cannot afford,
so each way a change can be ours rather than CBE's has a case here.

Run:  python tests/test_build_changes.py      (or pytest, if installed)
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "ingest"))

import build_changes as bc  # noqa: E402

BOT, MO = "egypt-macro-bot", "Mohamed Ghoneim"
DAY = 86400
T0 = 1787227200  # 20 Aug 2026 12:00 UTC


def commit(n, author, subject, series=None, records=None, raw=None, parser=None):
    c = {
        "sha": f"{n:040x}", "ts": T0 + n * DAY, "date": bc.utc_day(T0 + n * DAY),
        "author": author, "subject": subject,
        "by_scraper": author == BOT or bool(bc.SCRAPE_SUBJECT.match(subject)),
        "series": series or {}, "records": records or {}, "raw": raw or {},
    }
    if parser is not None:
        c["parser"] = parser
    return c


def rows(added=None, removed=None):
    return {"added": dict(added or {}), "removed": dict(removed or {})}


def history():
    fx = {("EG.FX.A", f"2026-08-{d:02d}"): 50.0 + d / 100 for d in range(1, 20)}
    xl = {("EG.XL.B", f"20{y}-06-30"): float(y) for y in range(10, 25)}
    return [
        # 0: the record begins
        commit(0, MO, "first", {"fx_official": rows(fx), "excel_archive": rows(xl)},
               parser=(None, "p1")),
        # 1: CBE revises one rate and publishes a new one
        commit(1, BOT, "data: x", {"fx_official": rows(
            {("EG.FX.A", "2026-08-05"): 51.5, ("EG.FX.A", "2026-08-20"): 50.3},
            {("EG.FX.A", "2026-08-05"): 50.05})},
            raw={"data/raw/series/fx_official.html.gz": "M"}),
        # 2: the table changed but CBE's response did not: ours
        commit(2, BOT, "data: x", {"fx_official": rows(
            {("EG.FX.A", "2026-08-06"): 99.0}, {("EG.FX.A", "2026-08-06"): 50.06})}),
        # 3: a person changed the parser and the data with it
        commit(3, MO, "Fix the parser", {"fx_official": rows(
            {("EG.FX.A", "2026-08-07"): 1.0}, {("EG.FX.A", "2026-08-07"): 50.07})}),
        # 4: the weekly archive re-read after a parser change, whatever the count
        commit(4, BOT, "archive: x", {"excel_archive": rows(
            {("EG.XL.B", "2010-03-31"): 10.0}, {("EG.XL.B", "2010-06-30"): 10.0})},
            parser=(None, "p2")),
        # 5: a new CBE series, and new archive readings from a new file
        commit(5, BOT, "archive: x", {"excel_archive": rows(
            {("EG.XL.NEW", "2025-06-30"): 1.0, ("EG.XL.B", "2025-06-30"): 25.0})},
            raw={"data/raw/excel/abc.xlsx": "A"}, parser=(None, "p2")),
        # 6: an id change under a new PARSER_VERSION: re-read, never new series
        commit(6, BOT, "archive: x", {"excel_archive": rows(
            {("EG.XL.NEW2", "2025-06-30"): 1.0}, {("EG.XL.NEW", "2025-06-30"): 1.0})},
            raw={"data/raw/excel/abc.xlsx": "M"}, parser=("2", "p3")),
    ]


def run(commits, conflicts=frozenset()):
    days = bc.classify(commits, {"EG.FX.A": {"title_en": "A", "unit": "EGP"}}, set(conflicts))
    return {d["date"]: d for d in days}


def test_start_is_not_news():
    day = run(history()[:1])[bc.utc_day(T0)]
    assert day["start"] == {"series": 2, "readings": 34}
    assert not day["revised"] and not day["new_series"] and "reread" not in day


def test_cbe_revision_and_new_reading():
    day = run(history()[:2])[bc.utc_day(T0 + DAY)]
    assert [(r["period"], r["was"], r["now"]) for r in day["revised"]] == [("2026-08-05", 50.05, 51.5)]
    assert day["moved_total"] == 1 and day["moved"][0]["previous"] == 50.19


def test_no_raw_change_is_ours():
    day = run(history()[:3])[bc.utc_day(T0 + 2 * DAY)]
    assert not day["revised"] and day["reread"]["why"] == ["no_source_change"]


def test_person_is_ours():
    day = run(history()[:4])[bc.utc_day(T0 + 3 * DAY)]
    assert not day["revised"] and day["reread"]["why"] == ["miqyas"]


def test_parser_change_is_ours():
    day = run(history()[:5])[bc.utc_day(T0 + 4 * DAY)]
    assert not day["revised"] and day["reread"]["why"] == ["parser"]
    assert (day["reread"]["added"], day["reread"]["removed"]) == (1, 1)


def test_new_series_and_archive_update():
    day = run(history()[:6])[bc.utc_day(T0 + 5 * DAY)]
    assert [n["series_id"] for n in day["new_series"]] == ["EG.XL.NEW"]
    assert day["archive"]["added"] == 1 and day["moved_total"] == 0


def test_id_change_is_reread_not_new_series():
    day = run(history()[:7])[bc.utc_day(T0 + 6 * DAY)]
    assert not day["new_series"] and not day["revised"]
    assert (day["reread"]["series_new"], day["reread"]["series_gone"]) == (1, 1)


def test_archive_revision_needs_a_replaced_file_and_a_versioned_parser():
    change = {"excel_archive": rows({("EG.XL.B", "2020-06-30"): 21.0}, {("EG.XL.B", "2020-06-30"): 20.0})}
    unversioned = commit(7, BOT, "archive: x", change, raw={"data/raw/excel/b.xlsx": "M"},
                         parser=(None, "p2"))
    day = run(history()[:6] + [unversioned])[bc.utc_day(T0 + 7 * DAY)]
    assert not day["revised"] and day["archive"]["changed"] == 1
    versioned = commit(7, BOT, "archive: x", change, raw={"data/raw/excel/b.xlsx": "M"},
                       parser=("2", "p3"))
    day = run(history()[:7] + [versioned])[bc.utc_day(T0 + 7 * DAY)]
    assert [(r["was"], r["now"], r["source"]) for r in day["revised"]] == [(20.0, 21.0, "Excel archive")]
    only_new_files = commit(7, BOT, "archive: x", change, raw={"data/raw/excel/new.xlsx": "A"},
                            parser=("2", "p3"))
    day = run(history()[:7] + [only_new_files])[bc.utc_day(T0 + 7 * DAY)]
    assert not day["revised"] and day["archive"]["changed"] == 1


def test_id_map_turns_new_and_dropped_into_renamed():
    days = bc.classify(history()[:7], {}, set(), {"EG.XL.NEW": ["EG.XL.NEW2"]})
    day = next(d for d in days if d["date"] == bc.utc_day(T0 + 6 * DAY))
    assert (day["reread"]["renamed"], day["reread"]["series_new"], day["reread"]["series_gone"]) == (1, 0, 0)
    assert not day["new_series"]


def test_conflict_date_is_ours():
    day = run(history()[:2], conflicts={("EG.FX.A", "2026-08-05")})[bc.utc_day(T0 + DAY)]
    assert not day["revised"] and day["reread"]["why"] == ["conflict"]


def test_bulk_is_held_back():
    c = commit(1, BOT, "data: x", {"fx_official": rows(
        {("EG.FX.A", f"2026-08-{d:02d}"): 1.0 for d in range(1, 20)},
        {("EG.FX.A", f"2026-08-{d:02d}"): 50.0 + d / 100 for d in range(1, 20)})},
        raw={"data/raw/series/fx_official.html.gz": "M"})
    old = bc.REPARSE_SUSPECT
    bc.REPARSE_SUSPECT = 10
    try:
        day = run([history()[0], c])[bc.utc_day(T0 + DAY)]
    finally:
        bc.REPARSE_SUSPECT = old
    assert not day["revised"] and day["held_back"] == 19


def test_float_noise_is_not_a_revision():
    c = commit(1, BOT, "data: x", {"fx_official": rows(
        {("EG.FX.A", "2026-08-05"): 50.05000000000001}, {("EG.FX.A", "2026-08-05"): 50.05})},
        raw={"data/raw/series/fx_official.html.gz": "M"})
    day = run([history()[0], c])[bc.utc_day(T0 + DAY)]
    assert not day["revised"] and "reread" not in day


def test_auction_row_revised_and_reordered():
    head = "Date,Auction Number,Total Amount for the Auction,Weighted Average Rate for the Auction"
    first = commit(0, MO, "first", {"fx_official": rows({("EG.FX.A", "2026-08-01"): 1.0})},
                   records={"auction_fx_regular": {"added": ["30/12/2012,1,74.9,6.2526",
                                                             "31/12/2012,2,74.7,6.3107"],
                                                   "removed": []}})
    later = commit(1, BOT, "data: x", records={"auction_fx_regular": {
        "added": ["31/12/2012,2,74.7,6.3107", "30/12/2012,1,75.0,6.2526", "01/01/2013,3,70,6.4"],
        "removed": ["30/12/2012,1,74.9,6.2526", "31/12/2012,2,74.7,6.3107"]}},
        raw={"data/raw/series/auction_fx_regular.html.gz": "M"})
    assert bc.record_headers().get("auction_fx_regular") == head.split(",")
    day = run([first, later])[bc.utc_day(T0 + DAY)]
    assert [(r["was"], r["now"]) for r in day["revised"]] == [(74.9, 75.0)]
    assert day["records"]["added"] == 1


def test_vintages_answer_as_of():
    rows_ = bc.vintages(history()[:2])
    held = {(r[1], r[2]) for r in rows_ if r[0] == "EG.FX.A" and r[1] == "2026-08-05"}
    assert held == {("2026-08-05", 50.05), ("2026-08-05", 51.5)}
    old = next(r for r in rows_ if r[1] == "2026-08-05" and r[2] == 50.05)
    assert old[3] == bc.utc_day(T0) and old[4] == bc.utc_day(T0)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
        print(f"ok  {test.__name__}")
    print(f"{len(tests)} passed")
