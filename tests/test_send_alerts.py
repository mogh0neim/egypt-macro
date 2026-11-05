"""Tests for the push-alert sender (ingest/send_alerts.py). No network, no credentials.

    python -m pytest tests/test_send_alerts.py
    python tests/test_send_alerts.py
"""

from __future__ import annotations

import io
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))

import send_alerts as s  # noqa: E402

TB = "EG.TB.EGP.3M.YLD.WAVG"
USD = "EG.FX.OFF.USD.SELL"
EUR = "EG.FX.OFF.EUR.SELL"


def row(period, value, pp=None, pv=None):
    r = {"period": period, "value": value}
    if pp:
        r["previous_period"], r["previous_value"] = pp, pv
    return r


BEFORE = {TB: row("2026-10-27", 24.316), USD: row("2026-10-29", 100.0), EUR: row("2026-10-29", 100.0)}
AFTER = {TB: row("2026-11-03", 25.0, "2026-10-27", 24.316),
         USD: row("2026-11-01", 101.4, "2026-10-29", 100.0),   # +1.4%: 0p5 and 1
         EUR: row("2026-11-01", 100.3, "2026-10-29", 100.0)}   # +0.3%: nothing


def write(tmp, name, doc):
    p = pathlib.Path(tmp) / name
    p.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return str(p)


def run(argv, tmp, **kw):
    args = s.parser().parse_args(["--state", str(pathlib.Path(tmp) / "sent.json"), *argv])
    out = io.StringIO()
    code = s.run(args, out=out, **kw)
    return code, [json.loads(line) for line in out.getvalue().splitlines()]


def files(tmp):
    return ["--before-file", write(tmp, "b.json", {"series": BEFORE}),
            "--after-file", write(tmp, "a.json", {"series": AFTER})]


def mpc(**over):
    a = {"kind": "mpc", "date": "2026-10-29", "url": "https://cbe.example/mpc", "status": "full",
         "decision": "hike", "change_bp": 100, "deposit_rate": 20.0, "lending_rate": 21.0,
         "main_operation_rate": 20.5, "previous_main_rate": 19.5}
    return a | over


def with_account():
    os.environ["FIREBASE_SERVICE_ACCOUNT"] = '{"project_id": "demo"}'


def without_account():
    os.environ.pop("FIREBASE_SERVICE_ACCOUNT", None)


def test_dry_run_prints_exact_messages_and_sends_nothing():
    posted = []
    with tempfile.TemporaryDirectory() as tmp:
        code, lines = run(["--dry-run", *files(tmp)], tmp, post=lambda *a: posted.append(a) or 200)
        assert code == 0 and posted == []
        assert not (pathlib.Path(tmp) / "sent.json").exists()  # a dry run writes no memory
    by_topic = {m["topic"]: m for m in lines}
    assert by_topic["tbill-3m.en"] == {
        "topic": "tbill-3m.en", "title": "3-month T-bill auction",
        "body": "Average yield 25% (+68 bps from the last auction).",
        "data": {"url": f"miqyas://series/{TB}", "kind": "tbill", "series_id": TB,
                 "period": "2026-11-03", "title": "3-month T-bill auction",
                 "body": "Average yield 25% (+68 bps from the last auction).", "lang": "en"}}
    assert by_topic["tbill-3m.ar"]["data"]["lang"] == "ar"


def test_fx_threshold_fan_out():
    with tempfile.TemporaryDirectory() as tmp:
        _, lines = run(files(tmp), tmp)
    topics = {m["topic"] for m in lines if m["topic"].startswith("fx-")}
    assert topics == {"fx-usd-0p5.en", "fx-usd-0p5.ar", "fx-usd-1.en", "fx-usd-1.ar"}  # not 2, nothing for EUR


def test_arabic_present():
    with tempfile.TemporaryDirectory() as tmp:
        _, lines = run(files(tmp), tmp)
    ar = [m for m in lines if m["topic"].endswith(".ar")]
    assert ar and all(any("؀" <= c <= "ۿ" for c in m["title"] + m["body"]) for m in ar)
    usd = next(m for m in ar if m["topic"] == "fx-usd-1.ar")
    assert "الدولار الأمريكي" in usd["title"]


def test_mpc_full_message():
    with tempfile.TemporaryDirectory() as tmp:
        _, lines = run(["--mpc-file", write(tmp, "m.json", mpc())], tmp)
    en = next(m for m in lines if m["topic"] == "mpc.en")
    assert en["title"] == "CBE raised rates by 100 bps"
    assert en["data"]["url"] == "miqyas://mpc" and en["data"]["status"] == "full"
    assert any(m["topic"] == "mpc.ar" for m in lines)


def test_mpc_cross_check_falls_back_to_link_only():
    bad = [mpc(decision="cut"),                         # says cut, rates went up
           mpc(main_operation_rate=19.5, change_bp=0),  # says hike, rates unchanged
           mpc(change_bp=50),                           # size does not match the rates
           mpc(deposit_rate=22.0),                      # corridor out of shape
           mpc(previous_main_rate=None),                # nothing to compare to
           mpc(status="link_only", reason="could not read decision")]
    for alert in bad:
        with tempfile.TemporaryDirectory() as tmp:
            _, lines = run(["--mpc-file", write(tmp, "m.json", alert)], tmp)
        en = next(m for m in lines if m["topic"] == "mpc.en")
        assert en["body"].startswith("CBE published an MPC statement"), alert
        assert en["data"]["status"] == "link_only" and "raised" not in en["title"]


def test_idempotency():
    posted = []

    def ok(url, headers, body):
        posted.append(body)
        return 200

    with tempfile.TemporaryDirectory() as tmp:
        with_account()
        try:
            code, _ = run(["--send", *files(tmp)], tmp, post=ok, token=lambda a: "tok")
            first = len(posted)
            assert code == 0 and first == 6  # tbill + usd 0p5 + usd 1, two languages each
            code, _ = run(["--send", *files(tmp)], tmp, post=ok, token=lambda a: "tok")
            assert code == 0 and len(posted) == first  # the second run sends nothing
        finally:
            without_account()
    assert posted[0]["message"]["topic"] == "tbill-3m.en"
    for body in posted:
        m = body["message"]
        assert "notification" not in m  # data-only
        assert m["android"]["priority"] == "HIGH"
        assert m["apns"]["payload"]["aps"]["content-available"] == 1
        assert m["apns"]["headers"]["apns-push-type"] == "background"
        assert set(m["data"]) >= {"kind", "title", "body", "url"}
        assert all(isinstance(v, str) for v in m["data"].values())
    assert posted[0]["message"]["data"]["title"] == "3-month T-bill auction"
    assert {b["message"]["data"]["kind"] for b in posted} == {"tbill", "fx"}


def test_message_cap():
    after = {f"EG.FX.OFF.Q{chr(65 + i)}.SELL": row("2026-11-01", 110.0, "2026-10-29", 100.0) for i in range(26)}
    before = {k: row("2026-10-29", 100.0) for k in after}
    posted = []

    def ok(url, headers, body):
        posted.append(body)
        return 200

    with tempfile.TemporaryDirectory() as tmp:
        argv = ["--before-file", write(tmp, "b.json", before), "--after-file", write(tmp, "a.json", after)]
        with_account()
        try:
            code, _ = run(["--send", *argv], tmp, post=ok, token=lambda a: "t")
            assert code == 2 and posted == []  # 26 currencies x 3 thresholds x 2 languages: refused
            code, _ = run(["--send", "--force", *argv], tmp, post=ok, token=lambda a: "t")
            assert code == 0 and len(posted) == 156
        finally:
            without_account()


def test_revisions_and_rehearsal():
    changes = {"days": [{"date": "2026-11-05", "revised": [
        {"series_id": TB, "title": "T-bill", "period": "2026-10-27", "was": 24.0, "now": 24.3,
         "source": "daily tables"},
        {"series_id": "X", "period": "2026-10-27", "was": 1, "now": None, "withdrawn": True}]}]}
    with tempfile.TemporaryDirectory() as tmp:
        path = write(tmp, "c.json", changes)
        _, lines = run(["--changes-file", path, "--since", "2026-11-05"], tmp)
        assert [m["topic"] for m in lines] == [f"rev-{TB}.en", f"rev-{TB}.ar"]
        _, lines = run(["--changes-file", path, "--since", "2026-11-06"], tmp)
        assert lines == []
        _, lines = run(["--rehearsal"], tmp)
        assert [m["topic"] for m in lines] == ["rehearsal.en", "rehearsal.ar"]
        assert lines[0]["data"]["kind"] == "rehearsal" and lines[0]["data"]["url"] == "miqyas://mpc"
        assert lines[0]["data"]["title"] == lines[0]["title"]


def test_send_without_credentials_refuses():
    without_account()
    with tempfile.TemporaryDirectory() as tmp:
        code, _ = run(["--send", "--rehearsal"], tmp)
    assert code == 2


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
        print(f"ok  {test.__name__}")
    print(f"{len(tests)} passed")
