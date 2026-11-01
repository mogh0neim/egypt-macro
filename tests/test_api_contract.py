"""Tests for the api/v1 contract check (ingest/check_api.py).

Builds a tiny api/v1 that keeps the contract, then breaks it one way at a time
and makes sure the check notices. The publish job runs the same check on the
real build, so a change that would break old copies of the phone app stops
the deploy.

    python -m pytest tests
    python tests/test_api_contract.py
"""

from __future__ import annotations

import copy
import json
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))

import check_api as c  # noqa: E402

SID = "EG.FX.OFF.USD.SELL"
GOOD = {
    "series.json": [{
        "series_id": SID, "title_en": "US Dollar Sell", "title_ar": None, "family": "fx",
        "freq": "D", "unit": "EGP", "n": 2, "first": "2026-10-29", "last": "2026-11-01",
        "latest_value": 47.9, "highest": {"value": 47.9, "period": "2026-11-01"},
        "lowest": {"value": 47.8, "period": "2026-10-29"}, "previous": 47.8, "median": 47.85,
    }],
    "sparks.json": {SID: [47.8, 47.9]},
    "latest.json": {"api": "v1", "data_version": "0123456789abcdef", "built": "2026-11-01T00:00:00+00:00",
                    "series": {SID: {"period": "2026-11-01", "value": 47.9,
                                     "previous_period": "2026-10-29", "previous_value": 47.8}}},
    "mpc.json": {"count": 1, "range": ["2026-10-29", "2026-10-29"], "diffs": [],
                 "statements": [{"date": "2026-10-29", "title": "MPC", "url": "https://cbe.org.eg/x",
                                 "format": "html", "decision": "hike", "main_operation_rate": 20.5}]},
    "mpc_calendar.json": {"source_url": "https://cbe.org.eg", "checked_on": "2026-10-11",
                          "meetings": [{"date": "2026-12-17", "year": 2026}]},
    "events.json": {"fx_regimes": [{"from": "2024-03-06", "to": None, "label": "Float"}], "events": []},
    "changes.json": {"generated": "2026-11-01", "window_days": 180, "days": []},
}
SERIES = {
    "series_id": SID, "title_en": "US Dollar Sell", "title_ar": None, "unit": "EGP", "freq": "D",
    "family": "fx", "source_url": None, "derived": None, "count": 2, "attribution": "Source: CBE",
    "observations": [["2026-10-29", 47.8], ["2026-11-01", 47.9]],
}


def build(files=None, series=None) -> pathlib.Path:
    api = pathlib.Path(tempfile.mkdtemp())
    (api / "series").mkdir()
    for name, body in (files or GOOD).items():
        (api / name).write_text(json.dumps(body), encoding="utf-8")
    if series is not False:
        (api / "series" / f"{SID}.json").write_text(json.dumps(series or SERIES), encoding="utf-8")
    return api


def problems_with(change=None, series=None):
    files = copy.deepcopy(GOOD)
    if change:
        change(files)
    return c.check(build(files, series))


# The index needs 1,000 rows to pass its own floor; the tiny fixture has one.
# Every test lowers the floor so the rest of the contract is what is tested.
c_index = json.loads((c.CONTRACT / "series-index.schema.json").read_text(encoding="utf-8"))
_real_load = c.load


def _load(path):
    if path.name == "series-index.schema.json":
        return {**c_index, "minItems": 1}
    return _real_load(path)


c.load = _load


def test_good_build_passes():
    assert c.check(build()) == []


def test_index_floor_is_real():
    assert c_index["minItems"] == 1000


def test_missing_field_breaks():
    def drop(f):
        del f["series.json"][0]["latest_value"]
    assert any("latest_value" in p for p in problems_with(drop))


def test_changed_type_breaks():
    def retype(f):
        f["latest.json"]["series"][SID]["value"] = "47.9"
    assert any("expected number" in p for p in problems_with(retype))


def test_new_field_is_allowed():
    def add(f):
        f["series.json"][0]["new_thing"] = 1
        f["mpc.json"]["statements"][0]["new_rate"] = 1.0
    assert problems_with(add) == []


def test_unknown_decision_breaks():
    def word(f):
        f["mpc.json"]["statements"][0]["decision"] = "raise"
    assert any("decision" in p for p in problems_with(word))


def test_bad_date_breaks():
    bad = {**SERIES, "observations": [["29/10/2026", 47.8]]}
    assert any("does not match" in p for p in problems_with(series=bad))


def test_missing_series_file_breaks():
    assert any("no file" in p for p in problems_with(series=False))


def test_latest_must_agree_with_index():
    def stale(f):
        f["latest.json"]["series"][SID]["value"] = 1.0
    assert any("disagrees" in p for p in problems_with(stale))


def test_missing_file_breaks():
    def gone(f):
        del f["latest.json"]
    assert any("latest.json: missing" in p for p in problems_with(gone))


def test_every_schema_uses_only_checked_keywords():
    # validate() raises on a keyword it does not understand, so walking each
    # schema with a value of every shape proves none promises an unchecked rule.
    for path in c.CONTRACT.glob("*.schema.json"):
        schema = json.loads(path.read_text(encoding="utf-8"))
        stack = [schema]
        while stack:
            node = stack.pop()
            assert not set(node) - c.KNOWN, f"{path.name}: {set(node) - c.KNOWN}"
            for key in ("properties",):
                stack += list(node.get(key, {}).values())
            for key in ("items", "additionalProperties"):
                if isinstance(node.get(key), dict):
                    stack.append(node[key])
            stack += node.get("prefixItems", [])


def test_every_file_has_a_schema():
    for schema in [*c.FILES.values(), c.SERIES_SCHEMA]:
        assert (c.CONTRACT / schema).exists(), schema


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
        print(f"ok  {test.__name__}")
    print(f"{len(tests)} passed")
