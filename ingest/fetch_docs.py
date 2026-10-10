"""Enumerate and mirror the CBE document corpus.

Three listing APIs cover everything CBE publishes as a document:

  publications  ~1,383  bulletins, monetary policy reports, annual reports,
                        financial statements, soundness indicators
  News            782   press releases across 23 categories
  circulars       396   regulatory circulars across 22 categories

This module builds the manifest and downloads the files. Text extraction and
indexing are separate steps, because extraction is the expensive part and
should not be repeated for documents we already have -- the manifest records a
content hash so a re-run only fetches what is new or changed.

Run:  python ingest/fetch_docs.py --manifest-only    # enumerate, don't download
      python ingest/fetch_docs.py --download         # fetch missing files
      python ingest/fetch_docs.py --download --limit 50
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import CBEClient, WAFRejected, looks_blocked  # noqa: E402
from remote_files import CARRIED, heartbeat, probe, replaced, today, withdrawn  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
FILES = CORPUS / "files"
PAGES = CORPUS / "pages"
MANIFEST = CORPUS / "manifest.json"

SOURCES = [
    ("publications", "{91B10D09-89CC-4E8F-984D-41A679139864}", "/en/news-publications/publications"),
    ("News", "{DE996AEC-03FB-4E24-BDB0-EF64F75FD5AD}", "/en/news-publications/news"),
    ("circulars", "{A626C190-EF07-46A5-8112-2AFC18FF6D76}", "/en/laws-regulations/regulations/circulars"),
]

# Listing APIs cap out well below the reported total, so pages are walked.
PAGE_SIZE = 500


def doc_id(url: str) -> str:
    """Stable id from the URL, so re-runs match previous entries."""
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def local_name(url: str, did: str) -> str:
    ext = pathlib.Path(url.split("?")[0]).suffix.lower()
    if ext not in {".pdf", ".xlsx", ".xls", ".doc", ".docx", ".zip"}:
        ext = ".html"
    return f"{did}{ext}"


def enumerate_all(client: CBEClient) -> list[dict]:
    seen: dict[str, dict] = {}
    for kind, datasource, referer in SOURCES:
        page = 0
        while True:
            payload = client.listing(kind, datasource, page_size=PAGE_SIZE, page_no=page)
            results = payload.get("results") or []
            if not results:
                break
            for item in results:
                url = item.get("url") or ""
                if not url:
                    continue
                did = doc_id(url)
                # Categories arrive as [{key, value}] and are stored as plain
                # strings, so normalise before merging -- reading the stored
                # form as dicts again is how this broke the first time.
                cats = {
                    c["value"] if isinstance(c, dict) else c
                    for c in (item.get("categories") or [])
                }
                if did in seen:
                    # An item can appear under more than one listing; merge
                    # the categories rather than letting the last one win.
                    seen[did]["categories"] = sorted(
                        set(seen[did].get("categories") or []) | cats
                    )
                    continue
                seen[did] = {
                    "id": did,
                    "source": kind,
                    "title": (item.get("title") or "").strip(),
                    "date": (item.get("customDate") or "")[:10],
                    "url": url,
                    "is_file": not url.startswith("/en/") and not url.startswith("/ar/"),
                    "categories": sorted(cats),
                    "local": None,
                    "sha256": None,
                    "bytes": None,
                }
            total = payload.get("totalResultsCount") or 0
            print(f"  {kind}: page {page} -> {len(results)} items ({len(seen)} unique so far)")
            page += 1
            if len(results) < PAGE_SIZE or (page * PAGE_SIZE) >= total + PAGE_SIZE:
                break
    return sorted(seen.values(), key=lambda d: (d["date"], d["title"]), reverse=True)


def check(client: CBEClient, docs: list[dict]) -> tuple[set[str], int, int]:
    """-> (ids CBE replaced since they were mirrored, checks failed, checked).

    One byte of each file, for its Last-Modified and size (remote_files.py).
    """
    files = [d for d in docs if d["is_file"]]
    print(f"\nchecking {len(files)} files for replacements ...")
    refetch: set[str] = set()
    failed = 0
    for i, doc in enumerate(files, 1):
        try:
            seen = probe(client, doc["url"])
        except WAFRejected:
            raise
        except Exception as exc:  # noqa: BLE001
            print(f"  CHECK FAIL {doc['url'][:80]}: {type(exc).__name__}", file=sys.stderr)
            failed += 1
            continue
        # Recorded now only for a file that is not being fetched again, so a
        # download that fails is retried next week rather than forgotten.
        if doc.get("sha256") and replaced(doc, seen):
            refetch.add(doc["id"])
            doc["_last_modified"] = seen.get("last_modified")
        elif seen.get("last_modified"):
            doc["last_modified"] = seen["last_modified"]
        if i % 100 == 0:
            print(f"  [{i}/{len(files)}] {len(refetch)} replaced so far")
    return refetch, failed, len(files)


def download(client: CBEClient, docs: list[dict], limit: int | None,
             refetch: set[str] = frozenset()) -> tuple[int, int, list[str]]:
    FILES.mkdir(parents=True, exist_ok=True)
    todo = [d for d in docs if d["is_file"] and (not d.get("sha256") or d["id"] in refetch)]
    if limit:
        todo = todo[:limit]
    print(f"\ndownloading {len(todo)} files ({len(refetch)} replaced by CBE) ...")

    ok = failed = 0
    renewed: list[str] = []
    for i, doc in enumerate(todo, 1):
        name = local_name(doc["url"], doc["id"])
        target = FILES / name
        try:
            blob = client.get_bytes(doc["url"])
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i}/{len(todo)}] FAIL {doc['url'][:80]}: {type(exc).__name__}", file=sys.stderr)
            failed += 1
            continue
        digest = hashlib.sha256(blob).hexdigest()
        if doc.get("sha256") and digest != doc["sha256"]:
            doc["changed_on"] = today()
            renewed.append(doc["url"])
            # Its text was extracted from the old file. Removing it here is
            # what makes extract_text.py read the new one; the old text stays
            # in git history.
            (PAGES / f"{doc['id']}.json.gz").unlink(missing_ok=True)
        target.write_bytes(blob)
        doc["local"] = f"corpus/files/{name}"
        doc["sha256"] = digest
        doc["bytes"] = len(blob)
        if doc.get("_last_modified"):
            doc["last_modified"] = doc["_last_modified"]
        ok += 1
        if i % 25 == 0:
            print(f"  [{i}/{len(todo)}] {ok} ok, {failed} failed")
    print(f"downloaded {ok}, failed {failed}; {len(renewed)} replaced by CBE with different content")
    for url in renewed:
        print(f"  replaced: {url}")
    return failed, len(todo), renewed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    client = CBEClient(delay=args.delay)
    CORPUS.mkdir(exist_ok=True)

    print("enumerating document listings ...")
    docs = enumerate_all(client)

    # Carry forward hashes from a previous manifest so we do not re-download.
    old: dict[str, dict] = {}
    if MANIFEST.exists():
        old = {d["id"]: d for d in json.loads(MANIFEST.read_text(encoding="utf-8"))["documents"]}
        for doc in docs:
            prev = old.get(doc["id"])
            if prev and prev.get("sha256"):
                doc.update({k: prev[k] for k in CARRIED if prev.get(k)})
    # A document CBE stopped listing keeps its entry, dated, and its text stays
    # searchable.
    gone = withdrawn(old, {d["id"] for d in docs}, today())
    n_gone = sum(1 for d in gone if d.get("withdrawn_on"))

    failed = attempted = 0
    check_failed = checked = 0
    if args.download and not args.manifest_only:
        refetch, check_failed, checked = check(client, docs)
        failed, attempted, renewed = download(client, docs, args.limit, refetch)
        for doc in docs:
            doc.pop("_last_modified", None)
        heartbeat("documents", {"files": checked, "replaced": len(renewed),
                                "withdrawn": n_gone, "check_failed": check_failed})

    by_source = collections.Counter(d["source"] for d in docs)
    by_ext = collections.Counter(
        pathlib.Path(d["url"].split("?")[0]).suffix.lower() or "(page)" for d in docs
    )
    dates = sorted(d["date"] for d in docs if d["date"])

    # No timestamp in here, and keys in a fixed order: a manifest that did not
    # change must come out byte for byte the same, or every week is a commit.
    MANIFEST.write_text(
        json.dumps(
            {
                "count": len(docs),
                "withdrawn": n_gone,
                "by_source": dict(sorted(by_source.items())),
                "date_range": [dates[0], dates[-1]] if dates else None,
                "documents": sorted(docs + gone, key=lambda d: (d["date"], d["title"], d["id"]),
                                    reverse=True),
            },
            indent=1,
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    print(f"\n{len(docs)} documents  {dict(by_source)}  withdrawn by CBE {n_gone}")
    print(f"formats: {dict(by_ext)}")
    if dates:
        print(f"dates: {dates[0]} to {dates[-1]}")
    have = sum(1 for d in docs if d.get("sha256"))
    print(f"mirrored locally: {have}/{sum(1 for d in docs if d['is_file'])} files")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")
    return 1 if looks_blocked(failed, attempted) or looks_blocked(check_failed, checked) else 0


if __name__ == "__main__":
    raise SystemExit(main())
