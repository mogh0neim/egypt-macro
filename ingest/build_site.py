"""Assemble dist/ into a deployable site root.

build_exports.py writes the data under dist/ and build_search.py writes the
index. This copies the front end in beside them, so dist/ is a directory that
can be handed to GitHub Pages, an S3 bucket or a CDN with nothing else done
to it. index.html at the root, api/ and search/ as its siblings.

The front end detects that layout at runtime, so the same files also work
served from the top of a clone, where index.html sits in web/.

Run:  python ingest/build_site.py
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DIST = ROOT / "dist"
CATALOG = ROOT / "catalog"

SITE_URL = "https://mogh0neim.github.io/egypt-macro/"

# Hash routing means every page in the site is the same document, so a sitemap
# of hash URLs is the only kind there is to give. Search engines largely index
# the root; the rest is here so a crawler that does follow fragments finds the
# structure rather than guessing at it.
ROUTES = ["", "#/browse", "#/rates", "#/money-market", "#/docs", "#/data", "#/about", "#/find"]


def copy_front_end() -> list[str]:
    copied = []
    for path in sorted(WEB.iterdir()):
        if path.is_file() and path.suffix in {".html", ".css", ".js", ".svg", ".png", ".ico", ".webmanifest"}:
            shutil.copy2(path, DIST / path.name)
            copied.append(path.name)
    return copied


def main() -> int:
    if not (DIST / "api").exists():
        print("dist/api is missing. Run ingest/build_exports.py first.")
        return 1
    DIST.mkdir(parents=True, exist_ok=True)

    copied = copy_front_end()
    print(f"front end: {len(copied)} files -> dist/")

    # GitHub Pages runs Jekyll over an uploaded site unless told not to, and
    # Jekyll silently drops any file or folder whose name starts with an
    # underscore. Nothing here does today, but a build step should not depend
    # on that staying true.
    (DIST / ".nojekyll").write_text("", encoding="utf-8")

    (DIST / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nSitemap: " + SITE_URL + "sitemap.xml\n",
        encoding="utf-8",
    )

    today = dt.date.today().isoformat()
    urls = "".join(
        f"  <url><loc>{SITE_URL}{r}</loc><lastmod>{today}</lastmod></url>\n" for r in ROUTES
    )
    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
        encoding="utf-8",
    )

    # A wrong path on a static host serves 404.html. Serving the app itself
    # means a stale or mistyped deep link still lands somewhere useful rather
    # than on the host's default page.
    shutil.copy2(DIST / "index.html", DIST / "404.html")

    # A tiny status file, so anyone can check how fresh the site is without
    # reading the commit log.
    last_run = {}
    if (CATALOG / "last_run.json").exists():
        last_run = json.loads((CATALOG / "last_run.json").read_text(encoding="utf-8"))
    series = json.loads((DIST / "api" / "v1" / "series.json").read_text(encoding="utf-8"))
    docs_path = DIST / "search" / "documents.json"
    documents = json.loads(docs_path.read_text(encoding="utf-8")) if docs_path.exists() else []
    status = {
        "built_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "last_scrape": last_run.get("retrieved_at"),
        "series": len(series),
        "observations": sum(s.get("n", 0) for s in series),
        "documents": len(documents),
        "source": "Central Bank of Egypt",
        "affiliation": "None. Miqyas is an unofficial mirror.",
    }
    (DIST / "status.json").write_text(json.dumps(status, indent=1), encoding="utf-8")

    # build_exports wrote the manifest before the front end existed. Fold the
    # rest of the tree into it, so "every published file with its hash" stays
    # a true description of manifest.json rather than nearly true.
    manifest_path = DIST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    # Drop anything the last build listed that is no longer on disk. A rename
    # otherwise leaves a phantom entry, and the download page reads its sizes
    # straight off this file -- it would offer a link to a file that is gone.
    manifest = [m for m in manifest if (DIST / m["path"]).exists()]
    known = {m["path"] for m in manifest}
    for path in sorted(DIST.rglob("*")):
        rel = path.relative_to(DIST).as_posix()
        if path.is_file() and rel not in known and rel != "manifest.json":
            manifest.append({
                "path": rel,
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    manifest.sort(key=lambda m: m["path"])
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    # The downloads page needs the size of about thirty files and was fetching
    # all 3,087 entries to find them: 518 KB, and it blocked the render. Most of
    # that is one entry per series, per page of document text and per search
    # shard, none of which anyone downloads by hand.
    #
    # manifest.json stays complete, because "every published file with its
    # SHA-256, so a mirror can check itself" has to remain true. This is the
    # same data with the bulk left out, at 4 KB.
    BULK_PREFIXES = ("api/v1/series/", "pages/", "search/")
    downloads = [m for m in manifest if not m["path"].startswith(BULK_PREFIXES)]

    # manifest.json cannot contain its own hash, and its size is only known once
    # it has been written, so the entry build_exports left behind was stale: the
    # download page was offering a 519 KB file and calling it 293 KB. Measure it
    # here, where the answer is real, and leave the hash out rather than record a
    # wrong one.
    downloads = [m for m in downloads if m["path"] != "manifest.json"]
    downloads.append({
        "path": "manifest.json",
        "bytes": manifest_path.stat().st_size,
        "sha256": None,
    })
    downloads.sort(key=lambda m: m["path"])
    (DIST / "downloads.json").write_text(json.dumps(downloads, indent=1), encoding="utf-8")

    print(f"  manifest.json  {manifest_path.stat().st_size/1e3:.0f} KB, {len(manifest):,} files")
    print(f"  downloads.json {(DIST / 'downloads.json').stat().st_size/1e3:.0f} KB, "
          f"{len(downloads)} files a person might fetch by hand")

    total = sum(p.stat().st_size for p in DIST.rglob("*") if p.is_file())
    files = sum(1 for p in DIST.rglob("*") if p.is_file())
    print(f"dist/ is a deployable site root: {files:,} files, {total/1e6:.0f} MB")
    print(f"  {status['series']:,} series · {status['observations']:,} observations · "
          f"{status['documents']:,} documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
