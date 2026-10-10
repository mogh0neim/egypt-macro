"""Notice when CBE replaces or withdraws a file it has already published.

The Excel archive and the document corpus are mirrored once and then carried
forward by URL. A file CBE replaced at the same address was never fetched
again, and a file it took down simply dropped out of the next manifest. Those
are the two things a revision record most needs to see.

CBE's firewall refuses HEAD requests (403), so the check is a one-byte ranged
GET instead: the 206 answer carries Last-Modified and, in Content-Range, the
file's full size. A file is fetched again only when either has moved, which
keeps the weekly run to one tiny request per file at the usual politeness.

Used by fetch_excel.py and fetch_docs.py.
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import time
import urllib.error
import urllib.request

from cbe_client import BASE, BROWSER_HEADERS, REJECTED_MARKER, CBEClient, WAFRejected

ROOT = pathlib.Path(__file__).resolve().parent.parent
# The weekly job's heartbeat, as catalog/last_run.json is the daily one. Kept
# out of the manifests so that an unchanged manifest is byte-identical.
HEARTBEAT = ROOT / "catalog" / "weekly_run.json"

# Carried forward from one manifest to the next for a file still listed.
CARRIED = ("sha256", "bytes", "local", "last_modified", "changed_on")


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def probe(client: CBEClient, url: str) -> dict:
    """-> {"last_modified": str | None, "size": int | None}, from one byte of the file.

    Uses the client's own session, throttle and headers, so it looks and paces
    exactly like a download. A 403 or 404 is final and raised at once: CBE has
    broken links of its own, and retrying them only spends the delay.
    """
    headers = dict(BROWSER_HEADERS)
    headers["Range"] = "bytes=0-0"
    full = url if url.startswith("http") else BASE + url
    req = urllib.request.Request(client._encode(full), headers=headers)
    last: Exception | None = None
    for attempt in range(client.retries):
        client._throttle()
        try:
            with client._opener.open(req, timeout=client.timeout) as resp:
                status = resp.status
                head = resp.read(1000)
                modified = resp.headers.get("Last-Modified")
                span = resp.headers.get("Content-Range") or ""
                length = resp.headers.get("Content-Length") or ""
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403, 404, 410):
                raise
            last = exc
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
        else:
            # The firewall answers 200 with a rejection page, never 206.
            if status != 206 and REJECTED_MARKER.encode() in head:
                raise WAFRejected(f"WAF rejected {full}")
            total = re.search(r"/(\d+)\s*$", span)
            size = int(total.group(1)) if total else (
                int(length) if status == 200 and length.isdigit() else None)
            return {"last_modified": modified, "size": size}
        time.sleep(2 ** attempt)
    raise RuntimeError(f"{full}: no answer after {client.retries} attempts") from last


def replaced(entry: dict, seen: dict) -> bool:
    """Whether the file now at this address is not the copy mirrored.

    A different size settles it. A different Last-Modified counts only when
    one was recorded before; the first check after this was added records it
    and compares sizes alone.
    """
    if seen.get("size") is not None and entry.get("bytes") is not None \
            and seen["size"] != entry["bytes"]:
        return True
    before, now = entry.get("last_modified"), seen.get("last_modified")
    return bool(before and now and before != now)


def withdrawn(previous: dict[str, dict], live: set[str], when: str) -> list[dict]:
    """Entries from the last manifest that CBE no longer lists, kept and dated.

    The mirrored copy stays where it is and stays parsed. Dropping the entry
    would make the series built from it vanish, as though CBE had never
    published it.

    A listing that comes back short is not CBE withdrawing a tenth of its
    files at once. Then the missing entries are kept as they were, undated,
    and the next full listing decides.
    """
    missing = [key for key in previous if key not in live]
    listed_before = sum(1 for e in previous.values() if not e.get("withdrawn_on"))
    newly = sum(1 for key in missing if not previous[key].get("withdrawn_on"))
    short = newly > max(20, listed_before // 10)
    if short:
        print(f"  {newly} of {listed_before} files missing from the listing; that looks like a "
              "short listing, not withdrawals, so none is dated this run")
    out = []
    for key in missing:
        kept = dict(previous[key])
        if not short:
            kept.setdefault("withdrawn_on", when)
        out.append(kept)
    return out


def heartbeat(part: str, info: dict) -> None:
    """Record that this half of the weekly job ran, and what it found."""
    beat = {}
    if HEARTBEAT.exists():
        try:
            beat = json.loads(HEARTBEAT.read_text(encoding="utf-8"))
        except ValueError:
            beat = {}
    beat[part] = {"checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                  **info}
    HEARTBEAT.write_text(json.dumps(beat, indent=1, sort_keys=True) + "\n", encoding="utf-8")
