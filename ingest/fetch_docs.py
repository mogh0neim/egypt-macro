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
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import CBEClient  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
FILES = CORPUS / "files"
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
                if did in seen:
                    # An item can appear under more than one listing; merge
                    # the categories rather than letting the last one win.
                    merged = {
                        c["value"]
                        for c in (seen[did].get("categories") or [])
                        + (item.get("categories") or [])
                    }
                    seen[did]["categories"] = sorted(merged)
                    continue
                seen[did] = {
                    "id": did,
                    "source": kind,
                    "title": (item.get("title") or "").strip(),
                    "date": (item.get("customDate") or "")[:10],
                    "url": url,
                    "is_file": not url.startswith("/en/") and not url.startswith("/ar/"),
                    "categories": sorted(
                        {c["value"] for c in (item.get("categories") or [])}
                    ),
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


def download(client: CBEClient, docs: list[dict], limit: int | None) -> int:
    FILES.mkdir(parents=True, exist_ok=True)
    todo = [d for d in docs if d["is_file"] and not d.get("sha256")]
    if limit:
        todo = todo[:limit]
    print(f"\ndownloading {len(todo)} files ...")

    ok = failed = 0
    for i, doc in enumerate(todo, 1):
        name = local_name(doc["url"], doc["id"])
        target = FILES / name
        try:
            blob = client.get_bytes(doc["url"])
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i}/{len(todo)}] FAIL {doc['url'][:80]}: {type(exc).__name__}", file=sys.stderr)
            failed += 1
            continue
        target.write_bytes(blob)
        doc["local"] = f"corpus/files/{name}"
        doc["sha256"] = hashlib.sha256(blob).hexdigest()
        doc["bytes"] = len(blob)
        ok += 1
        if i % 25 == 0:
            print(f"  [{i}/{len(todo)}] {ok} ok, {failed} failed")
    print(f"downloaded {ok}, failed {failed}")
    return failed


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
    if MANIFEST.exists():
        old = {d["id"]: d for d in json.loads(MANIFEST.read_text(encoding="utf-8"))["documents"]}
        for doc in docs:
            prev = old.get(doc["id"])
            if prev and prev.get("sha256"):
                doc.update(
                    {k: prev[k] for k in ("local", "sha256", "bytes") if prev.get(k)}
                )

    failed = 0
    if args.download and not args.manifest_only:
        failed = download(client, docs, args.limit)

    by_source = collections.Counter(d["source"] for d in docs)
    by_ext = collections.Counter(
        pathlib.Path(d["url"].split("?")[0]).suffix.lower() or "(page)" for d in docs
    )
    dates = sorted(d["date"] for d in docs if d["date"])

    MANIFEST.write_text(
        json.dumps(
            {
                "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "count": len(docs),
                "by_source": dict(by_source),
                "date_range": [dates[0], dates[-1]] if dates else None,
                "documents": docs,
            },
            indent=1,
        ),
        encoding="utf-8",
    )

    print(f"\n{len(docs)} documents  {dict(by_source)}")
    print(f"formats: {dict(by_ext)}")
    if dates:
        print(f"dates: {dates[0]} to {dates[-1]}")
    have = sum(1 for d in docs if d.get("sha256"))
    print(f"mirrored locally: {have}/{sum(1 for d in docs if d['is_file'])} files")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
