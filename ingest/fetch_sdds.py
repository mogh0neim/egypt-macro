"""Mirror the Excel files on CBE's SDDS page.

https://www.cbe.org.eg/en/economic-research/sdds is the page CBE keeps for the
IMF's Special Data Dissemination Standard. It links the current files for
reserve money, domestic liquidity (M2), deposits, domestic credit, foreign
assets and liabilities, and international reserves, all monthly to the latest
month. The Excel archive's copies of the same tables stop in June 2023.

The page is a list of sections (h2) with one link per file (h3):

    <h2 class="heading-2 ssd-heading ...">International Reserves</h2>
      <a href="/-/media/.../internationalreserves-sept-2026.xlsx">International Reserves</a>

Each file's address carries its month (`...-aug,-d-,-2026.xlsx`), so the
address changes every time CBE brings a table up to date. What stays put is the
link's title, and that is what a file is known by here: its key is the title
as a slug, and its copy is `data/raw/sdds/<key>.xlsx`. A new month is then the
same file changed in git, which is how build_changes.py tells CBE replacing a
file from a file arriving for the first time.

Each run checks every file: one whose address moved is downloaded, and one at
the same address gets the one-byte check for Last-Modified and size
(remote_files.py). A copy is rewritten only when its bytes changed, and then
dated `changed_on` in the manifest. A file CBE no longer links keeps its entry
with `withdrawn_on`. PDFs (the IMF metadata sheets) are not kept.

Run:  python ingest/fetch_sdds.py [--delay 1.0]
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import CBEClient, WAFRejected, looks_blocked  # noqa: E402
from remote_files import heartbeat, probe, replaced, today, withdrawn  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ROOT / "data" / "raw" / "sdds"
MANIFEST = ROOT / "catalog" / "sdds_manifest.json"
PAGE = "/en/economic-research/sdds"
SOURCE_PAGE = "https://www.cbe.org.eg" + PAGE

# The page listed 15 Excel files on 11 October 2026. Far fewer is a page that
# failed to load or changed its layout, not CBE taking most of them down, and
# then nothing is written rather than every file dated as withdrawn.
MIN_FILES = 8

_RE_HEADING = re.compile(r'<h2[^>]*class="[^"]*ssd-heading[^"]*"[^>]*>(.*?)</h2>', re.S)
_RE_LINK = re.compile(r'<a href="([^"]+\.xlsx?)"[^>]*>(.*?)</a>', re.S | re.I)


def clean(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def slug(text: str) -> str:
    """'II. Predetermined Short-term Net Drains on ...' -> a name of at most 60, cut between words."""
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s if len(s) <= 60 else s[:61].rsplit("-", 1)[0]


def parse_page(page: str) -> list[dict]:
    """-> one entry per Excel link, with its section and a key from its title."""
    marks = [(m.start(), clean(m.group(1))) for m in _RE_HEADING.finditer(page)]
    out: dict[str, dict] = {}
    for m in _RE_LINK.finditer(page):
        section = next((name for at, name in reversed(marks) if at < m.start()), "")
        title = clean(m.group(2))
        key = slug(title)
        if key in out:
            # Two links with one title: the section tells them apart.
            key = slug(f"{section} {title}")
        out[key] = {"key": key, "title": title, "section": section,
                    "url": html.unescape(m.group(1))}
    return list(out.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    client = CBEClient(delay=args.delay)
    listed = parse_page(client.get(PAGE))
    print(f"{len(listed)} Excel files on {PAGE}")
    if len(listed) < MIN_FILES:
        print(f"FAILED: expected at least {MIN_FILES}; the page did not load as it should. "
              "Nothing written.", file=sys.stderr)
        return 1

    previous: dict[str, dict] = {}
    if MANIFEST.exists():
        previous = {e["key"]: e for e in json.loads(MANIFEST.read_text(encoding="utf-8"))["files"]}

    FILES.mkdir(parents=True, exist_ok=True)
    failed = 0
    renewed: list[str] = []
    for entry in listed:
        prev = previous.get(entry["key"], {})
        for k in ("sha256", "bytes", "local", "last_modified", "changed_on"):
            if prev.get(k):
                entry[k] = prev[k]
        ext = pathlib.Path(entry["url"]).suffix.lower()
        local = FILES / f"{entry['key']}{ext}"
        stamp = None
        if prev.get("url") == entry["url"] and prev.get("sha256") and local.exists():
            # Same address: has CBE replaced the file behind it?
            try:
                seen = probe(client, entry["url"])
            except WAFRejected:
                raise
            except Exception as exc:  # noqa: BLE001
                print(f"  CHECK FAIL {entry['key']}: {type(exc).__name__}", file=sys.stderr)
                failed += 1
                continue
            if not replaced(prev, seen):
                if seen.get("last_modified"):
                    entry["last_modified"] = seen["last_modified"]
                print(f"  same     {entry['key']}")
                continue
            stamp = seen.get("last_modified")
        try:
            blob = client.get_bytes(entry["url"], referer=PAGE)
        except WAFRejected:
            raise
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL     {entry['key']}: {type(exc).__name__}", file=sys.stderr)
            failed += 1
            # Keep the address of the copy held, so next week tries again.
            if prev.get("url"):
                entry["url"] = prev["url"]
            continue
        digest = hashlib.sha256(blob).hexdigest()
        if digest != entry.get("sha256") or not local.exists():
            if entry.get("sha256"):
                # The old copy stays in git history; this is the day it changed.
                entry["changed_on"] = today()
                renewed.append(entry["key"])
            local.write_bytes(blob)
        entry.update(sha256=digest, bytes=len(blob), local=local.relative_to(ROOT).as_posix())
        if stamp:
            entry["last_modified"] = stamp
        else:
            # One byte more, for Last-Modified: the download itself does not
            # hand the headers back.
            try:
                seen = probe(client, entry["url"])
                if seen.get("last_modified"):
                    entry["last_modified"] = seen["last_modified"]
            except WAFRejected:
                raise
            except Exception:  # noqa: BLE001 - a missing date is not a failed download
                pass
        print(f"  {'replaced' if entry['key'] in renewed else 'fetched ':8s} {entry['key']}  "
              f"{entry['bytes']:,} bytes, Last-Modified {entry.get('last_modified')}")

    gone = withdrawn(previous, {e["key"] for e in listed}, today())
    n_gone = sum(1 for e in gone if e.get("withdrawn_on"))
    MANIFEST.parent.mkdir(exist_ok=True)
    # No timestamp, keys sorted: an unchanged manifest is byte for byte the same.
    MANIFEST.write_text(
        json.dumps({"source": SOURCE_PAGE, "count": len(listed), "withdrawn": n_gone,
                    "files": sorted(listed + gone, key=lambda e: e["key"])},
                   indent=1, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8")
    heartbeat("sdds", {"files": len(listed), "replaced": len(renewed), "withdrawn": n_gone,
                       "check_failed": failed})
    print(f"{len(listed)} files, {len(renewed)} replaced by CBE, {n_gone} withdrawn, {failed} failed")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")
    return 1 if looks_blocked(failed, len(listed)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
