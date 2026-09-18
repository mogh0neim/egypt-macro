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
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import prerender  # noqa: E402  (same directory; the ingest scripts are not a package)

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DIST = ROOT / "dist"
CATALOG = ROOT / "catalog"

SITE_URL = "https://mogh0neim.github.io/egypt-macro/"

# The routes that exist as pages of their own rather than per entity. Series,
# subjects and documents are enumerated from the catalogue instead. Keep this in
# step with the `fixed` list in prerender.py: a slug here with no file written
# for it is a sitemap entry pointing at a 404.
PAGE_ROUTES = ["tools", "tools/salary", "tools/savings", "tools/dollar", "changes",
               "series", "favourites", "rates", "money-market", "docs", "data", "about"]


def copy_front_end() -> list[str]:
    copied = []
    for path in sorted(WEB.iterdir()):
        if path.is_file() and path.suffix in {".html", ".css", ".js", ".svg", ".png", ".ico", ".webmanifest"}:
            shutil.copy2(path, DIST / path.name)
            copied.append(path.name)
    return copied


def stamp_html(html: str, assets: list[str], stamp: str) -> str:
    """Point every asset reference in one document at the stamped URL.

    Split out of version_assets so the pre-renderer can apply the same stamp to
    the two thousand documents it writes. They reference the same scripts and
    the same stylesheet, so they need the same guarantee: whichever copy of a
    page a reader holds, it points at the assets that belong with it.
    """
    for name in assets:
        html = html.replace('src="' + name + '"', 'src="' + name + "?v=" + stamp + '"')
        html = html.replace('href="' + name + '"', 'href="' + name + "?v=" + stamp + '"')
    return html


def hashable_assets(names: list[str]) -> list[str]:
    return sorted(x for x in names if x.endswith((".js", ".css")))


def version_assets(names: list[str]) -> str:
    """Stamp the script and stylesheet URLs in index.html with a content hash.

    Pages serves these with `max-age=600` and no version in the filename, so for
    ten minutes after a deploy a returning reader can hold a mixture: a new
    index.html that references views-mydesk.js and links to #/favourites, with an
    old app.js that has never heard of either. That is not a stale site, it is a
    broken one, and renaming a route is exactly when it bites.

    A stamp fixes the mixing rather than the staleness. index.html is cached too,
    so someone can still be a few minutes behind, but whichever copy they hold
    points at the assets that belong with it.

    The stamp is a hash of the asset bytes, not the build time: the archive is
    rebuilt every morning and the front end is not, so a timestamp would throw
    away every reader's cache daily for nothing.
    """
    assets = hashable_assets(names)
    digest = hashlib.sha256()
    for name in assets:
        digest.update((DIST / name).read_bytes())
    stamp = digest.hexdigest()[:10]

    html_path = DIST / "index.html"
    html_path.write_text(
        stamp_html(html_path.read_text(encoding="utf-8"), assets, stamp),
        encoding="utf-8",
    )
    return stamp


def write_sitemaps() -> int:
    """One sitemap per kind of thing, behind an index.

    The old sitemap listed eight hash URLs, which is the only kind there was to
    give while the site was one document: a fragment is not a URL to a crawler,
    and all eight collapsed to the root. Now that prerender.py writes real
    files, this lists them -- about 2,800 of them, against a 50,000 ceiling per
    file, so the split is for legibility rather than for the limit.

    `lastmod` is the build date on everything, which is honest: the archive is
    rebuilt every morning, and a page whose series did not move is still
    regenerated. Claiming a per-series modification date would mean tracking
    one, and guessing it would be worse than saying today.
    """
    today = dt.date.today().isoformat()

    def urlset(urls: list[str]) -> str:
        return ('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "".join(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls)
                + "</urlset>\n")

    series = json.loads((DIST / "api" / "v1" / "series.json").read_text(encoding="utf-8"))
    docs_path = DIST / "search" / "documents.json"
    documents = json.loads(docs_path.read_text(encoding="utf-8")) if docs_path.exists() else []
    topics = sorted(p.name for p in (DIST / "topic").iterdir()) if (DIST / "topic").is_dir() else []

    pages = [SITE_URL] + [SITE_URL + slug + "/" for slug in PAGE_ROUTES] \
        + [f"{SITE_URL}topic/{k}/" for k in topics]

    parts = {
        "sitemap-pages.xml": pages,
        "sitemap-series.xml": [f"{SITE_URL}s/{s['series_id']}/" for s in series],
        "sitemap-docs.xml": [f"{SITE_URL}docs/{d['id']}/" for d in documents],
    }
    for name, urls in parts.items():
        (DIST / name).write_text(urlset(urls), encoding="utf-8")

    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <sitemap><loc>{SITE_URL}{n}</loc><lastmod>{today}</lastmod></sitemap>\n"
                  for n in parts)
        + "</sitemapindex>\n",
        encoding="utf-8",
    )
    total = sum(len(u) for u in parts.values())
    print(f"sitemap: {total:,} URLs across {len(parts)} files, behind one index")
    return total


def main() -> int:
    if not (DIST / "api").exists():
        print("dist/api is missing. Run ingest/build_exports.py first.")
        return 1
    DIST.mkdir(parents=True, exist_ok=True)

    copied = copy_front_end()
    stamp = version_assets(copied)
    print(f"front end: {len(copied)} files -> dist/, versioned {stamp}")

    # Before the pre-render, because every page it writes points at a card, and
    # before the manifest is folded in below, so the cards are hashed with
    # everything else. A missing image library must not take the site down:
    # without cards the pages still publish, they just unfurl as the site.
    try:
        import build_og  # imported here: it needs Pillow, and nothing else does
        build_og.main()
    except ImportError as err:
        print(f"share cards skipped: {err}. pip install Pillow to draw them.")

    # Every route again, as a real file. The hash router is the right shape for
    # a static archive and the wrong shape for being found: without this, the
    # site is one URL and everything in it is a fragment.
    prerender.main(
        template_html=(DIST / "index.html").read_text(encoding="utf-8"),
        assets=copied,
    )

    # GitHub Pages runs Jekyll over an uploaded site unless told not to, and
    # Jekyll silently drops any file or folder whose name starts with an
    # underscore. Nothing here does today, but a build step should not depend
    # on that staying true.
    (DIST / ".nojekyll").write_text("", encoding="utf-8")

    (DIST / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nSitemap: " + SITE_URL + "sitemap.xml\n",
        encoding="utf-8",
    )

    write_sitemaps()

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

    # The freshness strip is the entry point to the change log, because the nav
    # was full at eight and the nav must never be what gives way. It already
    # fetches this file, so the last day's counts ride along here rather than
    # making every page on the site fetch a few hundred kilobytes of changes.
    changes_path = DIST / "api" / "v1" / "changes.json"
    if changes_path.exists():
        days = json.loads(changes_path.read_text(encoding="utf-8")).get("days") or []
        if days:
            status["changed"] = {
                "date": days[0]["date"],
                "moved": days[0].get("moved_total", 0),
                "revised": len(days[0].get("revised", [])),
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
    BULK_PREFIXES = ("api/v1/series/", "pages/", "search/", "og/")
    downloads = [m for m in manifest if not m["path"].startswith(BULK_PREFIXES)]
    # Pre-rendering adds 2,800 index.html files, which are pages rather than
    # anything anyone downloads. Leaving them in put downloads.json back to
    # 481 KB, which is the exact problem this file was split out to solve.
    downloads = [m for m in downloads if not m["path"].endswith("/index.html")]

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
