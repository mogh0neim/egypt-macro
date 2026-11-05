"""Work out which push alerts a data change deserves, and send them through Firebase.

Plain version: compare the published numbers before and after an update, decide
which alerts that earns (an MPC decision, a T-bill auction result, a big move in
a currency, a CBE revision), and send one short message per language to a
Firebase "topic". A phone follows a topic; we never keep a list of phones
(miqyas-app decision 0003).

Safe by default. Without --send nothing leaves this machine: it prints the exact
messages it would send, one JSON object per line.

Topics (each one is sent twice, once per language, as `<base>.en` and `<base>.ar`):
  mpc                    an MPC decision (cut, hold, raise) or the link-only fallback
  tbill-3m, -6m, -9m, -12m   an EGP T-bill auction result for that tenor
  fx-<ccy>-<0p5|1|2>     a currency moved more than 0.5%, 1% or 2% on the day; a move
                         is sent to every threshold it passes (1.4% goes to 0p5 and 1)
  rev-<SERIES_ID>        CBE changed a number it had already published
  rehearsal              the manual test (--rehearsal)

A wrong alert is worse than a late one, so:
  * An MPC alert is re-checked against the new rates before it goes out. If the
    decision word disagrees with the rates, or anything cannot be read, the
    message is the plain "CBE published an MPC statement" with the link.
  * alerts_sent.json remembers what was sent, so running twice never double-sends.
  * A run that would send more than 50 messages is refused unless --force.

Run (from the repo root):
  python -m ingest.send_alerts --before-file old/latest.json --after-file new/latest.json
  python -m ingest.send_alerts --before-rev <git sha>            # compare the saved data now with that commit
  python -m ingest.send_alerts --mpc-file mpc_alert.json         # the result of ingest/watch_mpc.py
  python -m ingest.send_alerts --changes-file dist/api/v1/changes.json --since 2026-11-05
  python -m ingest.send_alerts --rehearsal [--send]
Add --send to really send. That needs the Firebase service-account JSON in the
environment variable FIREBASE_SERVICE_ACCOUNT (a GitHub Actions secret; it is
never written to the repo or the log) and `pip install google-auth requests`.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import pathlib
import re
import subprocess
import sys
from typing import Callable

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import watch_mpc  # noqa: E402  (its check() is the MPC cross-check, reused as is)

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES_DIR = ROOT / "data" / "clean" / "series"
STATE = ROOT / "data" / "alerts_sent.json"
SERIES_INDEX = ROOT / "dist" / "api" / "v1" / "series.json"

LANGS = ("en", "ar")
MAX_MESSAGES = 50
KEEP_STATE = 5000  # how many sent keys to remember
TOPIC_OK = re.compile(r"^[a-zA-Z0-9\-_.~%]+$")

TENORS = ("3m", "6m", "9m", "12m")  # the EGP auction tenors that exist in the data
# Percent moves that earn an FX alert, as (topic suffix, threshold).
FX_THRESHOLDS = (("0p5", 0.5), ("1", 1.0), ("2", 2.0))
# Which official rate stands for "the currency": the selling rate.
FX_SERIES = re.compile(r"^EG\.FX\.OFF\.([A-Z]+?)(?:100)?\.SELL$")
FX_NAMES = {  # code: (English, Arabic)
    "USD": ("US dollar", "الدولار الأمريكي"), "EUR": ("Euro", "اليورو"),
    "GBP": ("British pound", "الجنيه الإسترليني"), "SAR": ("Saudi riyal", "الريال السعودي"),
    "AED": ("UAE dirham", "الدرهم الإماراتي"), "KWD": ("Kuwaiti dinar", "الدينار الكويتي"),
    "CHF": ("Swiss franc", "الفرنك السويسري"), "JPY": ("Japanese yen", "الين الياباني"),
    "CNY": ("Chinese yuan", "اليوان الصيني"), "CAD": ("Canadian dollar", "الدولار الكندي"),
    "AUD": ("Australian dollar", "الدولار الأسترالي"), "BHD": ("Bahraini dinar", "الدينار البحريني"),
    "JOD": ("Jordanian dinar", "الدينار الأردني"), "QAR": ("Qatari riyal", "الريال القطري"),
    "OMR": ("Omani rial", "الريال العماني"), "DKK": ("Danish krone", "الكرون الدنماركي"),
    "NOK": ("Norwegian krone", "الكرون النرويجي"), "SEK": ("Swedish krona", "الكرونة السويدية"),
}


# ---------- reading the data ----------

def load_latest(path: pathlib.Path) -> dict:
    """A latest.json (or just its `series` map) as {series_id: {period, value, previous_*}}."""
    doc = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    return doc.get("series", doc) if isinstance(doc, dict) else {}


def latest_from_csv(texts: list[str]) -> dict:
    """The same shape as latest.json, built from series CSV text (series_id,period,value)."""
    points: dict[str, dict[str, float]] = {}
    for text in texts:
        for row in csv.DictReader(io.StringIO(text)):
            sid = row.get("series_id", "")
            if not (sid.startswith("EG.FX.OFF.") or sid.startswith("EG.TB.EGP.")):
                continue  # the only series that can earn a data alert
            try:
                points.setdefault(sid, {})[row["period"]] = float(row["value"])
            except (KeyError, ValueError):
                continue
    out = {}
    for sid, by_period in points.items():
        periods = sorted(by_period)
        entry = {"period": periods[-1], "value": by_period[periods[-1]]}
        if len(periods) > 1:
            entry["previous_period"], entry["previous_value"] = periods[-2], by_period[periods[-2]]
        out[sid] = entry
    return out


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout


def latest_at_rev(rev: str) -> dict:
    """The data as it stood at a git commit."""
    names = _git("ls-tree", "--name-only", rev, "data/clean/series/").split()
    return latest_from_csv([_git("show", f"{rev}:{n}") for n in names if n.endswith(".csv")])


def latest_now() -> dict:
    return latest_from_csv([p.read_text(encoding="utf-8") for p in sorted(SERIES_DIR.glob("*.csv"))])


def load_titles(path: pathlib.Path | None) -> dict:
    path = pathlib.Path(path) if path else SERIES_INDEX
    if not path.exists():
        return {}
    return {s["series_id"]: s for s in json.loads(path.read_text(encoding="utf-8"))}


# ---------- numbers in words ----------

def fmt(v: float, places: int = 2) -> str:
    return f"{v:,.{places}f}".rstrip("0").rstrip(".") if places else f"{v:,.0f}"


def pct_text(p: float) -> str:
    return f"{abs(p):.1f}%".replace(".0%", "%")


# ---------- building alerts ----------
# An alert is {"key", "base", "link", "en": (title, body), "ar": (title, body), "data"}.

def make(key: str, base: str, link: str, en: tuple[str, str], ar: tuple[str, str], **data) -> dict:
    return {"key": key, "base": base, "link": link, "en": en, "ar": ar,
            "data": {"link": link, **{k: str(v) for k, v in data.items()}}}


def mpc_alert(alert: dict | None) -> list[dict]:
    """From watch_mpc's result. Anything that does not add up becomes the link-only message."""
    if not alert:
        return []
    url = alert.get("url", "")
    day = alert.get("date", "")
    key = f"mpc:{day}"
    link_only = make(
        key, "mpc", "miqyas://mpc",
        ("MPC statement", "CBE published an MPC statement. Tap for the details."),
        ("بيان لجنة السياسة النقدية", "نشر البنك المركزي المصري بيان لجنة السياسة النقدية. اضغط للتفاصيل."),
        kind="mpc", status="link_only", date=day, url=url)
    if alert.get("status") != "full":
        return [link_only]
    # Check the decision words against the rates again, here, before trusting them.
    parsed = {k: alert.get(k) for k in ("decision", "deposit_rate", "lending_rate", "main_operation_rate")}
    parsed = {k: v for k, v in parsed.items() if v is not None}
    try:
        reason = watch_mpc.check(parsed, alert.get("previous_main_rate"), None)
        if reason is None:
            move = round((alert["main_operation_rate"] - alert["previous_main_rate"]) * 100)
            if alert.get("change_bp") != move:
                reason = "change_bp does not match the rates"
    except (TypeError, KeyError):
        reason = "unreadable"
    if reason:
        return [link_only]
    d, m, dep, lend = alert["decision"], alert["main_operation_rate"], alert["deposit_rate"], alert["lending_rate"]
    bp = abs(alert["change_bp"])
    en_word = {"hike": f"CBE raised rates by {bp} bps", "cut": f"CBE cut rates by {bp} bps",
               "hold": "CBE held rates"}[d]
    ar_word = {"hike": f"رفع البنك المركزي أسعار الفائدة {bp} نقطة أساس",
               "cut": f"خفض البنك المركزي أسعار الفائدة {bp} نقطة أساس",
               "hold": "أبقى البنك المركزي أسعار الفائدة دون تغيير"}[d]
    return [make(
        key, "mpc", "miqyas://mpc",
        (en_word, f"Main operation rate {fmt(m)}%. Deposit {fmt(dep)}%, lending {fmt(lend)}%."),
        (ar_word, f"سعر العملية الرئيسية {fmt(m)}%. الإيداع {fmt(dep)}% والإقراض {fmt(lend)}%."),
        kind="mpc", status="full", decision=d, date=day, url=url)]


def tbill_alerts(before: dict, after: dict, titles: dict) -> list[dict]:
    out = []
    for t in TENORS:
        sid = f"EG.TB.EGP.{t.upper()}.YLD.WAVG"
        new, old = after.get(sid), before.get(sid)
        if not new or (old and old.get("period") == new["period"]):
            continue  # no new auction since the last snapshot
        months = t[:-1]
        y, prev = new["value"], new.get("previous_value")
        change_en = change_ar = ""
        if prev is not None:
            bp = round((y - prev) * 100)
            sign = "+" if bp > 0 else ""
            change_en = f" ({sign}{bp} bps from the last auction)" if bp else " (unchanged from the last auction)"
            change_ar = f" ({sign}{bp} نقطة أساس عن المزاد السابق)" if bp else " (دون تغيير عن المزاد السابق)"
        out.append(make(
            f"tbill-{t}:{new['period']}", f"tbill-{t}", f"miqyas://series/{sid}",
            (f"{months}-month T-bill auction", f"Average yield {fmt(y, 3)}%{change_en}."),
            (f"مزاد أذون الخزانة لأجل {months} أشهر", f"متوسط العائد {fmt(y, 3)}%{change_ar}."),
            kind="tbill", series_id=sid, period=new["period"]))
    return out


def fx_alerts(before: dict, after: dict, titles: dict) -> list[dict]:
    out = []
    for sid in sorted(after):
        m = FX_SERIES.match(sid)
        new = after[sid]
        if not m or new.get("previous_value") in (None, 0):
            continue
        old = before.get(sid)
        if old and old.get("period") == new["period"]:
            continue  # same reading as before, nothing new today
        ccy = m.group(1)
        pct = (new["value"] / new["previous_value"] - 1) * 100
        en_name, ar_name = FX_NAMES.get(ccy, (ccy, ccy))
        up = pct > 0
        for suffix, limit in FX_THRESHOLDS:
            if abs(pct) <= limit:
                continue
            out.append(make(
                f"fx-{ccy.lower()}-{suffix}:{new['period']}", f"fx-{ccy.lower()}-{suffix}",
                f"miqyas://series/{sid}",
                (f"{en_name} {'up' if up else 'down'} {pct_text(pct)}",
                 f"The {en_name} {'rose' if up else 'fell'} {pct_text(pct)} against the pound to "
                 f"{fmt(new['value'], 2)} EGP (official selling rate, {new['period']})."),
                (f"{ar_name} {'ارتفع' if up else 'انخفض'} {pct_text(pct)}",
                 f"{'ارتفع' if up else 'انخفض'} سعر {ar_name} {pct_text(pct)} مقابل الجنيه إلى "
                 f"{fmt(new['value'], 2)} جنيه (سعر البيع الرسمي، {new['period']})."),
                kind="fx", series_id=sid, period=new["period"], move_pct=f"{pct:.2f}"))
    return out


def revision_alerts(changes: dict | None, since: str, titles: dict) -> list[dict]:
    out = []
    for day in (changes or {}).get("days", []):
        if day.get("date", "") < since:
            continue
        for r in day.get("revised", []):
            sid = r.get("series_id")
            # Only a figure that changed value (not one withdrawn, and not an auction table row).
            if not sid or r.get("withdrawn") or r.get("now") is None or r.get("source") == "auction tables":
                continue
            meta = titles.get(sid, {})
            en_t = meta.get("title_en") or r.get("title") or sid
            ar_t = meta.get("title_ar") or en_t
            out.append(make(
                f"rev-{sid}:{r['period']}:{r['now']}", f"rev-{sid}", f"miqyas://series/{sid}",
                ("CBE revised a published figure",
                 f"{en_t}, {r['period']}: was {fmt(r['was'], 4)}, now {fmt(r['now'], 4)}."),
                ("عدّل البنك المركزي رقمًا سبق نشره",
                 f"{ar_t}، {r['period']}: كان {fmt(r['was'], 4)} وأصبح {fmt(r['now'], 4)}."),
                kind="revision", series_id=sid, period=r["period"]))
    return out


def rehearsal_alert() -> list[dict]:
    return [make("rehearsal", "rehearsal", "miqyas://mpc",
                 ("Miqyas test alert", "This is a rehearsal. No action needed."),
                 ("تنبيه تجريبي من مقياس", "هذا اختبار فقط. لا حاجة لأي إجراء."), kind="rehearsal")]


def to_messages(alerts: list[dict]) -> list[dict]:
    """One message per alert per language, in the shape printed in dry-run."""
    msgs = []
    for a in alerts:
        for lang in LANGS:
            topic = f"{a['base']}.{lang}"
            if not TOPIC_OK.match(topic):
                raise ValueError(f"not a valid FCM topic name: {topic!r}")
            title, body = a[lang]
            msgs.append({"id": f"{a['key']}|{lang}", "topic": topic, "title": title, "body": body,
                         "data": {**a["data"], "lang": lang}})
    return msgs


# ---------- memory of what was sent ----------

def load_state(path: pathlib.Path) -> dict:
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8")).get("sent", {})
    except (OSError, ValueError):
        return {}


def save_state(path: pathlib.Path, sent: dict) -> None:
    keep = dict(sorted(sent.items(), key=lambda kv: kv[1])[-KEEP_STATE:])
    pathlib.Path(path).write_text(json.dumps({"sent": keep}, indent=1, ensure_ascii=False), encoding="utf-8")


# ---------- sending ----------

def fcm_body(msg: dict) -> dict:
    return {"message": {
        "topic": msg["topic"],
        "notification": {"title": msg["title"], "body": msg["body"]},
        "data": msg["data"],
        "android": {"priority": "HIGH"},
        "apns": {"headers": {"apns-priority": "10"}},
    }}


def google_token(account: dict) -> str:
    """An access token from the service account. Needs `pip install google-auth requests`."""
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(
        account, scopes=["https://www.googleapis.com/auth/firebase.messaging"])
    creds.refresh(Request())
    return creds.token


def http_post(url: str, headers: dict, body: dict) -> int:
    import urllib.error
    import urllib.request
    req = urllib.request.Request(url, json.dumps(body).encode(), headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code


def send_all(msgs: list[dict], account: dict, sent: dict, state_path: pathlib.Path | None,
             post: Callable = http_post, token: Callable = google_token) -> int:
    """Send each message, writing the memory after every success. Returns how many failed."""
    url = f"https://fcm.googleapis.com/v1/projects/{account['project_id']}/messages:send"
    headers = {"Authorization": f"Bearer {token(account)}", "Content-Type": "application/json; charset=utf-8"}
    failed = 0
    for m in msgs:
        status = post(url, headers, fcm_body(m))
        if 200 <= status < 300:
            sent[m["id"]] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if state_path:
                save_state(state_path, sent)
            print(f"sent {m['topic']}: {m['title']}")
        else:
            failed += 1
            print(f"FAILED {m['topic']} (HTTP {status})", file=sys.stderr)  # never print the token or account
    return failed


# ---------- the run ----------

def collect(args, before: dict, after: dict) -> list[dict]:
    titles = load_titles(args.series_file)
    alerts: list[dict] = []
    if args.rehearsal:
        return rehearsal_alert()
    if args.mpc_file:
        alerts += mpc_alert(json.loads(pathlib.Path(args.mpc_file).read_text(encoding="utf-8")))
    if before is not None:
        alerts += tbill_alerts(before, after, titles) + fx_alerts(before, after, titles)
    if args.changes_file:
        changes = json.loads(pathlib.Path(args.changes_file).read_text(encoding="utf-8"))
        alerts += revision_alerts(changes, args.since, titles)
    return alerts


def run(args, post: Callable = http_post, token: Callable = google_token, out=sys.stdout) -> int:
    before = after = None
    if args.before_file or args.before_rev:
        before = load_latest(args.before_file) if args.before_file else latest_at_rev(args.before_rev)
        after = load_latest(args.after_file) if args.after_file else latest_now()
    state_path = pathlib.Path(args.state)
    sent = {} if args.rehearsal else load_state(state_path)

    msgs = [m for m in to_messages(collect(args, before, after)) if m["id"] not in sent]
    if len(msgs) > args.max_messages and not args.force:
        print(f"REFUSED: {len(msgs)} messages is more than the limit of {args.max_messages}. "
              "That looks like a bug. Check the input, or pass --force.", file=sys.stderr)
        return 2 if args.send else 0  # a dry run only warns, so the workflow does not go red

    account = None
    if args.send:
        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
        if not raw:
            print("--send needs the FIREBASE_SERVICE_ACCOUNT environment variable", file=sys.stderr)
            return 2
        account = json.loads(raw)

    if not account:  # dry run: show, send nothing, write nothing
        for m in msgs:
            print(json.dumps({k: m[k] for k in ("topic", "title", "body", "data")}, ensure_ascii=False), file=out)
        print(f"dry run: {len(msgs)} message(s) would be sent, none were", file=sys.stderr)
        return 0
    return 1 if send_all(msgs, account, sent, None if args.rehearsal else state_path, post, token) else 0


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--send", action="store_true", help="really send (default is a dry run that sends nothing)")
    ap.add_argument("--dry-run", action="store_true", help="print the messages only (this is the default)")
    ap.add_argument("--before-file", help="latest.json from before the update")
    ap.add_argument("--after-file", help="latest.json from after the update (default: the saved data now)")
    ap.add_argument("--before-rev", help="git commit to read the 'before' data from")
    ap.add_argument("--mpc-file", help="the mpc_alert.json written by watch_mpc.py")
    ap.add_argument("--changes-file", help="changes.json from build_changes.py, for CBE revisions")
    ap.add_argument("--since", default=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
                    help="only revisions from this day on (default today, UTC)")
    ap.add_argument("--series-file", help="series.json for titles (default dist/api/v1/series.json)")
    ap.add_argument("--state", default=str(STATE), help="the file remembering what was sent")
    ap.add_argument("--max-messages", type=int, default=MAX_MESSAGES)
    ap.add_argument("--force", action="store_true", help="allow more than --max-messages in one run")
    ap.add_argument("--rehearsal", action="store_true", help="one test message to rehearsal.en and rehearsal.ar")
    return ap


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.send and args.dry_run:
        print("choose one of --send and --dry-run", file=sys.stderr)
        return 2
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
