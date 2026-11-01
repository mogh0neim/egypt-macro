"""Tests for the MPC fast watch (ingest/watch_mpc.py) and the MPC rates parser.

Replays real statements saved under corpus/mpc. A move says "raised to" or
"by 100 bps to" where a hold says "unchanged at"; until 1 November 2026 only the
hold wording parsed, so every hike and cut lost its corridor rates.

    python -m pytest tests
    python tests/test_watch_mpc.py
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))

import watch_mpc as w  # noqa: E402
from fetch_press import parse_mpc  # noqa: E402

# Decisions as CBE announced them: (decision, change in bps, new main operation rate).
KNOWN = {
    "2024-02-01": ("hike", 200, 21.75),
    "2025-04-17": ("cut", -225, 25.5),
    "2025-08-28": ("cut", -200, 22.5),
    "2025-12-25": ("cut", -100, 20.5),
    "2026-04-02": ("hold", 0, 19.5),
    "2026-10-29": ("hike", 100, 20.5),
}


def statement(day: str) -> dict:
    return json.loads((w.STATEMENTS / f"{day}.json").read_text(encoding="utf-8"))


def alert(day: str, text: str | None = None) -> dict:
    doc = statement(day)
    return w.build_alert(doc["text"] if text is None else text, doc["title"], doc["url"], day)


def test_rate_moves_parse():
    assert parse_mpc(statement("2026-10-29")["text"]) == {
        "deposit_rate": 20.0, "lending_rate": 21.0, "main_operation_rate": 20.5,
        "discount_rate": 20.5, "decision": "hike"}


def test_known_decisions_give_full_alerts():
    for day, (decision, bp, main) in KNOWN.items():
        a = alert(day)
        assert a["status"] == "full", (day, a.get("reason"))
        assert (a["decision"], a["change_bp"], a["main_operation_rate"]) == (decision, bp, main), day


def test_wrong_decision_word_falls_back_to_link():
    text = statement("2026-10-29")["text"].replace("decided to raise", "decided to cut")
    a = alert("2026-10-29", text)
    assert a["status"] == "link_only" and "decision 'cut'" in a["reason"]


def test_stated_bps_must_match_the_move():
    text = statement("2026-10-29")["text"].replace("by 100 bps", "by 200 bps")
    assert alert("2026-10-29", text)["status"] == "link_only"


def test_unreadable_release_still_sends_the_link():
    a = alert("2026-10-29", "")
    assert a["status"] == "link_only" and a["url"].startswith("https://www.cbe.org.eg/")


def test_cancellation_notice_is_link_only():
    assert alert("2024-03-20")["status"] == "link_only"


def test_find_release_matches_day_and_mpc_only():
    items = [
        {"title": "Governor Meets Someone", "customDate": "2026-12-17T16:00:00", "url": "/a"},
        {"title": "MPC Press Release 29 October 2026", "customDate": "2026-10-29T19:27:00", "url": "/b"},
        {"title": "MPC Press Release 17 December 2026", "customDate": "2026-12-17T18:30:00", "url": "/c"},
    ]
    assert w.find_release(items, "2026-12-17")["url"] == "/c"
    assert w.find_release(items, "2026-12-18") is None


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
        print(f"ok  {test.__name__}")
    print(f"{len(tests)} passed")
