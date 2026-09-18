"""Publish every page of the site as a real file, not just a hash.

The front end is one document and a hash router, which is the right shape for a
static archive and the wrong shape for being found. A crawler asking for
`/egypt-macro/` is handed one page whose body is a loading skeleton; everything
that matters -- 1,317 series, 1,478 documents, 53,006 pages of extracted text --
lives behind a fragment, and a fragment is not a URL as far as an index is
concerned. The sitemap could only ever list the eight routes, and those eight
collapse to one.

So the same document is written out again per entity, with three things changed:

  - the head. Title, description, canonical, and the Open Graph and Twitter
    tags, so a link pasted anywhere unfurls as itself rather than as the
    dollar chart every link currently shows.
  - the body. The number, the change, the coverage and the last two dozen
    readings, as ordinary HTML. A crawler that never runs the script still
    reads the figure, and so does a reader with JavaScript off.
  - two globals, MIQYAS_ROOT and MIQYAS_PAGE, read by core.js and app.js. The
    first tells the front end how far down it is sitting, because the usual
    detection reads the path and these pages have a path of their own. The
    second is the route the page was rendered for: arriving with no hash it
    routes to itself, and navigating anywhere else it hands off to the real
    app document rather than leaving a reader at /s/<id>/#/rates.

The script then takes over and re-renders in place, so what a person sees is
exactly what they saw before.

Run:  python ingest/prerender.py        (build_site.py calls it directly)
"""

from __future__ import annotations

import html as html_mod
import json
import math
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DIST = ROOT / "dist"

SITE_URL = "https://mogh0neim.github.io/egypt-macro/"

# Written per build; every directory here is pruned before it is rewritten, so a
# renamed series cannot leave a page behind that outlives it.
OWNED = ("s", "topic", "docs", "series", "favourites", "rates", "money-market", "data", "about", "tools", "changes")

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]

ARABIC = re.compile(r"[؀-ۿ]")


# ---------- small shared formatting ----------
#
# Deliberately a thin echo of core.js rather than a port of it. These pages are
# replaced by the real views within a few hundred milliseconds, so what is
# needed here is a figure a crawler can read, not the whole instrument. Keeping
# it small is what stops the two drifting in ways anyone would notice.

def esc(value) -> str:
    return html_mod.escape("" if value is None else str(value), quote=True)


def fmt(value, unit: str | None = None) -> str:
    """Decimals by magnitude, matching core.js `fmt` closely enough to read."""
    if value is None:
        return "-"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    a = abs(v)
    if v == 0:
        digits = 0
    elif a >= 1000:
        digits = 0
    elif a >= 10:
        digits = 2
    elif a >= 1:
        digits = 3
    else:
        digits = 4
    out = f"{v:,.{digits}f}"
    if unit and "percent" in unit.lower():
        out += "%"
    return out


# Kept in step with UNIT_SHORT in core.js. Only the units that actually reach a
# headline figure need to be here; anything else falls through to itself.
UNIT_SHORT = {
    "USD million": "$ mn", "USD billion": "$ bn", "EUR million": "€ mn",
    "GBP million": "£ mn", "EGP million": "EGP mn", "EGP billion": "EGP bn",
    "EGP per USD": "EGP / $", "EGP per unit of foreign currency": "EGP",
    "percent per annum": "p.a.", "percent": "%", "ratio": "ratio",
    "index": "index", "thousand": "thousands", "number": "count", "EGP": "EGP",
}


def fmt_change(value, unit: str | None = None) -> str:
    """Two significant figures, and `pp` where the level is itself a percentage.

    A change carries far less precision than the level it is a change in, and
    25 basis points is a real decision, so the percentage case keeps a decimal.
    `g` is not usable here: it reaches for scientific notation at a thousand,
    and these are reserves in millions of dollars as often as they are rates.
    """
    if value is None:
        return "-"
    a = abs(value)
    if a == 0:
        return "no change"
    if unit and "percent" in unit.lower():
        out = f"{value:+,.2f}pp"
    elif a >= 100:
        out = f"{value:+,.0f}"
    elif a >= 1:
        out = f"{value:+,.2f}"
    else:
        # Below one, two significant figures means counting past the leading
        # zeros first, or 0.0069 prints as 0.01 and the move disappears.
        digits = min(6, int(math.floor(-math.log10(a))) + 2)
        out = f"{value:+,.{digits}f}"
    return out


def unit_tag(unit: str | None) -> str:
    """The unit after a figure, or nothing when `fmt` has already said it.
    `14.90%` needs no `%` after it."""
    if not unit or "percent" == unit.lower():
        return ""
    return " " + UNIT_SHORT.get(unit, unit)


def nice_date(iso: str | None) -> str:
    if not iso or len(iso) < 10:
        return ""
    y, m, d = iso[:4], iso[5:7], iso[8:10]
    try:
        return f"{int(d)} {MONTHS[int(m) - 1][:3]} {y}"
    except (ValueError, IndexError):
        return iso


def short_date(iso: str | None) -> str:
    """Month and the year in full. `Aug 26` reads as the 26th of August."""
    if not iso or len(iso) < 7:
        return ""
    try:
        return f"{MONTHS[int(iso[5:7]) - 1][:3]} {iso[:4]}"
    except (ValueError, IndexError):
        return iso


def clamp(text: str, limit: int = 155) -> str:
    """A meta description longer than this is truncated by every search engine
    that shows one, and truncated mid-word by most of them."""
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(".,;:") + "..."


def dir_attr(text: str) -> str:
    """A few hundred CBE rows are labelled only in Arabic. Rendered
    left-to-right they are mangled, exactly as in core.js `titleHTML`."""
    return ' dir="auto"' if ARABIC.search(str(text or "")) else ""


# ---------- the topic taxonomy, read from the front end ----------

def load_topics() -> list[dict]:
    """Read TOPICS out of core.js rather than keeping a second copy here.

    The taxonomy is thirteen editorial decisions about what belongs with what,
    and it is the front end's to own. A duplicate in Python would drift the
    first time a family moved, and it would drift silently: the pre-rendered
    page and the page the reader ends up looking at would disagree about which
    subject a series is in. Parsing is the lesser evil, and it is checked hard
    enough below that a change in shape fails the build rather than quietly
    producing twelve topics.
    """
    source = (WEB / "core.js").read_text(encoding="utf-8")
    match = re.search(r"^const TOPICS = \[(.*?)^\];", source, re.S | re.M)
    if not match:
        raise SystemExit("prerender: could not find TOPICS in web/core.js")

    topics = []
    for block in re.finditer(r"\{\s*key:\s*\"(.*?)\".*?name:\s*\"(.*?)\".*?"
                             r"blurb:\s*\"(.*?)\".*?families:\s*\[(.*?)\]", match.group(1), re.S):
        key, name, blurb, families = block.groups()
        topics.append({
            "key": key,
            "name": name,
            "blurb": blurb,
            "families": re.findall(r"\"(.*?)\"", families),
        })

    if len(topics) < 10 or not all(t["key"] and t["name"] and t["families"] for t in topics):
        raise SystemExit(f"prerender: TOPICS parsed as {len(topics)} usable entries; core.js has changed shape")
    return topics


def topic_of(series: dict, by_family: dict[str, str]) -> str | None:
    return by_family.get(series.get("family") or "")


# ---------- the template ----------

class Template:
    """The stamped dist/index.html, with the places that change found once."""

    def __init__(self, html: str, assets: list[str]):
        self.html = html
        # Longest first: replacing "core.js" before "views-docs.js" is fine, but
        # a prefix collision between two asset names would not be.
        self.assets = sorted(assets, key=len, reverse=True)

    def _sub(self, pattern: str, replacement: str, html: str, what: str) -> str:
        out, n = re.subn(pattern, lambda _m: replacement, html, count=1, flags=re.S)
        if n != 1:
            raise SystemExit(f"prerender: could not rewrite {what}; web/index.html has changed shape")
        return out

    def render(self, *, root: str, page: str, title: str, description: str,
               url: str, image: str, image_alt: str, body: str,
               head_extra: str = "") -> str:
        html = self.html

        html = self._sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", html, "the title")
        html = self._sub(r'<meta name="description" content=".*?">',
                         f'<meta name="description" content="{esc(description)}">', html, "the description")
        html = self._sub(r'<link rel="canonical" href=".*?">',
                         f'<link rel="canonical" href="{esc(url)}">', html, "the canonical link")
        html = self._sub(r'<meta property="og:title" content=".*?">',
                         f'<meta property="og:title" content="{esc(title)}">', html, "og:title")
        html = self._sub(r'<meta property="og:description" content=".*?">',
                         f'<meta property="og:description" content="{esc(description)}">', html, "og:description")
        html = self._sub(r'<meta property="og:url" content=".*?">',
                         f'<meta property="og:url" content="{esc(url)}">', html, "og:url")
        html = self._sub(r'<meta property="og:image" content=".*?">',
                         f'<meta property="og:image" content="{esc(image)}">', html, "og:image")
        html = self._sub(r'<meta property="og:image:alt" content=".*?">',
                         f'<meta property="og:image:alt" content="{esc(image_alt)}">', html, "og:image:alt")

        # X reads og: tags when its own are missing, but Slack, LinkedIn and a
        # few others do not, and the card is the whole point of this pass.
        html = self._sub(
            r'<meta name="twitter:card" content="summary_large_image">',
            '<meta name="twitter:card" content="summary_large_image">\n'
            f'<meta name="twitter:title" content="{esc(title)}">\n'
            f'<meta name="twitter:description" content="{esc(description)}">\n'
            f'<meta name="twitter:image" content="{esc(image)}">',
            html, "the twitter card")

        if head_extra:
            html = self._sub(r"</head>", head_extra + "\n</head>", html, "the end of the head")

        # The template's asset URLs are relative to a document at the root. This
        # one is not at the root.
        prefix = "" if root == "." else root + "/"
        if prefix:
            for name in self.assets:
                html = html.replace(f'src="{name}', f'src="{prefix}{name}')
                html = html.replace(f'href="{name}', f'href="{prefix}{name}')

        # Before the first script, because core.js reads MIQYAS_ROOT on its
        # first line. window.* rather than a const: a const declared in one
        # script is a global binding but not a window property, and `typeof` on
        # it from a script that ran first would be a temporal-dead-zone throw
        # rather than the "undefined" the fallback needs.
        html = self._sub(
            r'<script src="',
            "<script>window.MIQYAS_ROOT=" + json.dumps(root) +
            ";window.MIQYAS_PAGE=" + json.dumps(page) + ";</script>\n<script src=\"",
            html, "the script block")

        html = self._sub(r'<main id="app">.*?</main>',
                         f'<main id="app">{body}</main>', html, "the app container")
        return html


# ---------- the bodies ----------
#
# What a crawler reads, and what a reader with no JavaScript is left with. Every
# one of these carries the source link and the attribution, because these pages
# are as public as the rest of the site and the disclaimer is a condition of
# republishing rather than a footer decoration.

ATTRIBUTION = (
    '<p class="foot-note">Source: Central Bank of Egypt. Republished by Miqyas, an unofficial mirror, '
    'which is not affiliated with, endorsed by, or connected to the Central Bank of Egypt.</p>'
)


def series_body(meta: dict, full: dict, topic: dict | None, root: str) -> str:
    obs = full.get("observations") or []
    unit = full.get("unit")
    latest = meta.get("latest_value")
    previous = meta.get("previous")
    change = None
    if latest is not None and previous is not None:
        change = latest - previous

    rows = "".join(
        f"<tr><td>{esc(nice_date(p))}</td><td>{esc(fmt(v, unit))}</td></tr>"
        for p, v in reversed(obs[-24:])
    )

    title = full.get("title_en") or meta.get("series_id")
    arabic = full.get("title_ar")

    facts = [
        ("Latest", f"{fmt(latest, unit)}{unit_tag(unit)} on {nice_date(meta.get('last'))}"),
        ("Previous", fmt(previous, unit) if previous is not None else "-"),
        ("Change", fmt_change(change, unit)),
        ("Unit", unit or "not stated by CBE"),
        ("Readings", f"{meta.get('n', 0):,}"),
        ("Coverage", f"{nice_date(meta.get('first'))} to {nice_date(meta.get('last'))}"),
    ]
    if meta.get("highest"):
        facts.append(("Highest", f"{fmt(meta['highest']['value'], unit)} ({short_date(meta['highest']['period'])})"))
    if meta.get("lowest"):
        facts.append(("Lowest", f"{fmt(meta['lowest']['value'], unit)} ({short_date(meta['lowest']['period'])})"))

    source = full.get("source_url")
    method = full.get("method")

    return (
        '<div class="wrap"><section class="section">'
        f'<p class="eyebrow">{esc(topic["name"]) if topic else "Series"}</p>'
        f"<h1{dir_attr(title)}>{esc(title)}</h1>"
        + (f'<p class="ar" dir="rtl" lang="ar">{esc(arabic)}</p>' if arabic else "")
        + f'<p class="lede"><b>{esc(fmt(latest, unit))}</b> as of {esc(nice_date(meta.get("last")))}, '
          f'from the Central Bank of Egypt. {meta.get("n", 0):,} readings covering '
          f'{esc(nice_date(meta.get("first")))} to {esc(nice_date(meta.get("last")))}.</p>'
        + '<table class="indicators"><tbody>'
        + "".join(f"<tr><td class='name'>{esc(k)}</td><td>{esc(v)}</td></tr>" for k, v in facts)
        + "</tbody></table>"
        + (f'<p class="foot-note">How this is worked out: {esc(method)}</p>' if method else "")
        + "<h2>The last two dozen readings</h2>"
        + f'<table class="indicators"><thead><tr><th>Period</th><th>{esc(unit or "Value")}</th></tr></thead>'
        + f"<tbody>{rows}</tbody></table>"
        + f'<p><a href="{root}/api/v1/series/{esc(meta["series_id"])}.json">The whole series as JSON</a>'
          f' · <a href="{root}/#/data">CSV, Parquet, SQLite and the API</a>'
        + (f' · <a href="{esc(source)}" rel="noopener">The CBE page this came from</a>' if source else "")
        + "</p>"
        + ATTRIBUTION
        + "</section></div>"
    )


def series_jsonld(meta: dict, full: dict, url: str) -> str:
    """Schema.org Dataset, which is what Google Dataset Search reads.

    Worth the twenty lines: it is a route to this data that almost nobody
    competing for these queries has bothered with, and the fields it wants --
    temporal coverage, creator, distribution, licence -- are ones this
    catalogue already carries honestly.
    """
    data = {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": full.get("title_en") or meta["series_id"],
        "description": clamp(
            f"{full.get('title_en') or meta['series_id']}. "
            f"{meta.get('n', 0):,} observations from {nice_date(meta.get('first'))} to "
            f"{nice_date(meta.get('last'))}, published by the Central Bank of Egypt and "
            f"republished by Miqyas.", 300),
        "identifier": meta["series_id"],
        "url": url,
        "temporalCoverage": f"{meta.get('first', '')}/{meta.get('last', '')}",
        "isAccessibleForFree": True,
        "license": "https://github.com/mogh0neim/egypt-macro/blob/main/LICENSE",
        "creator": {"@type": "Organization", "name": "Central Bank of Egypt",
                    "url": "https://www.cbe.org.eg/en/"},
        "publisher": {"@type": "Organization", "name": "Miqyas", "url": SITE_URL},
        "distribution": [
            {"@type": "DataDownload", "encodingFormat": "application/json",
             "contentUrl": f"{SITE_URL}api/v1/series/{meta['series_id']}.json"},
            {"@type": "DataDownload", "encodingFormat": "application/vnd.apache.parquet",
             "contentUrl": f"{SITE_URL}parquet/all.parquet"},
        ],
    }
    if full.get("unit"):
        data["variableMeasured"] = {"@type": "PropertyValue",
                                    "name": full.get("title_en"), "unitText": full["unit"]}
    if full.get("source_url"):
        data["isBasedOn"] = full["source_url"]
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + "</script>"


def topic_body(topic: dict, members: list[dict], root: str) -> str:
    rows = "".join(
        f'<tr><td class="name"><a href="{root}/s/{esc(s["series_id"])}/"{dir_attr(s.get("title_en"))}>'
        f'{esc(s.get("title_en") or s["series_id"])}</a></td>'
        f'<td>{esc(fmt(s.get("latest_value"), s.get("unit")))}</td>'
        f'<td>{esc(short_date(s.get("last")))}</td></tr>'
        for s in members[:400]
    )
    return (
        '<div class="wrap"><section class="section">'
        '<p class="eyebrow">Subject</p>'
        f'<h1>{esc(topic["name"])}</h1>'
        f'<p class="lede">{esc(topic["blurb"])} {len(members):,} series, '
        "from the Central Bank of Egypt, rebuilt every morning.</p>"
        '<table class="indicators"><thead><tr><th>Series</th><th>Latest</th><th>As of</th></tr></thead>'
        f"<tbody>{rows}</tbody></table>"
        + (f'<p class="foot-note">Showing the first 400 of {len(members):,}.</p>' if len(members) > 400 else "")
        + ATTRIBUTION + "</section></div>"
    )


def document_body(doc: dict, snippet: str, root: str) -> str:
    bits = []
    if doc.get("date"):
        bits.append(nice_date(doc["date"]))
    if doc.get("pages"):
        bits.append(f"{doc['pages']:,} pages")
    if doc.get("source"):
        bits.append(str(doc["source"]))
    return (
        '<div class="wrap"><section class="section">'
        '<p class="eyebrow">Document</p>'
        f'<h1{dir_attr(doc.get("title"))}>{esc(doc.get("title") or doc["id"])}</h1>'
        f'<p class="lede">{esc(" · ".join(bits))}. Published by the Central Bank of Egypt, '
        "indexed here so its text can be searched and quoted.</p>"
        + (f'<p{dir_attr(snippet)}>{esc(snippet)}</p>' if snippet else "")
        + (f'<p><a href="{esc(doc["url"])}" rel="noopener">The document on cbe.org.eg</a>'
           f' · <a href="{root}/#/docs">Search inside all 1,478 documents</a></p>'
           if doc.get("url") else "")
        + (
            '<p class="foot-note">This document is a scan with no text layer of its own. '
            "Its text was read by OCR and is not as reliable as the rest.</p>"
            if doc.get("ocr") or doc.get("needs_ocr") else ""
        )
        + ATTRIBUTION + "</section></div>"
    )


# ---------- the run ----------

def prune() -> None:
    for name in OWNED:
        path = DIST / name
        if path.is_dir():
            shutil.rmtree(path)


def write(path: pathlib.Path, html: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")


def snippet_for(doc_id: str, limit: int = 320) -> str:
    """The opening of a document's first page, as its own summary.

    The text is already extracted and already published for search snippets, so
    this costs a gzip read. It is what turns a document page from a title and a
    link into something worth indexing.
    """
    import gzip
    path = DIST / "pages" / f"{doc_id}.json.gz"
    if not path.exists():
        return ""
    try:
        pages = json.loads(gzip.decompress(path.read_bytes()).decode("utf-8")).get("pages", {})
    except (OSError, ValueError):
        return ""
    for key in sorted(pages, key=lambda k: int(k) if str(k).isdigit() else 0):
        text = " ".join(str(pages[key]).split())
        if len(text) > 80:
            return clamp(text, limit)
    return ""


def main(template_html: str | None = None, assets: list[str] | None = None) -> int:
    if template_html is None:
        template_html = (DIST / "index.html").read_text(encoding="utf-8")
    if assets is None:
        assets = [p.name for p in DIST.iterdir() if p.is_file() and p.suffix in {".js", ".css", ".svg", ".png"}]

    template = Template(template_html, assets)
    index = json.loads((DIST / "api" / "v1" / "series.json").read_text(encoding="utf-8"))
    topics = load_topics()
    by_family = {f: t["key"] for t in topics for f in t["families"]}
    by_key = {t["key"]: t for t in topics}

    prune()
    written = 0

    # --- series ---
    members: dict[str, list[dict]] = {t["key"]: [] for t in topics}
    for meta in index:
        sid = meta["series_id"]
        key = topic_of(meta, by_family)
        if key:
            members[key].append(meta)
        full_path = DIST / "api" / "v1" / "series" / f"{sid}.json"
        if not full_path.exists():
            continue
        full = json.loads(full_path.read_text(encoding="utf-8"))
        title = full.get("title_en") or sid
        url = f"{SITE_URL}s/{sid}/"
        unit = full.get("unit")
        reading = fmt(meta.get("latest_value"), unit) + unit_tag(unit)
        # Search engines cut a description around 155 characters, and cut it
        # mid-word. Say the number, the date and the span, in that order, so
        # what survives the cut is the part someone searched for.
        description = clamp(
            f"{title}: {reading} on {nice_date(meta.get('last'))}. "
            f"{meta.get('n', 0):,} readings back to {short_date(meta.get('first'))}, "
            "free to chart or download.")
        write(DIST / "s" / sid / "index.html", template.render(
            root="../..", page=f"/s/{sid}",
            title=f"{title} | Miqyas",
            description=description, url=url,
            image=f"{SITE_URL}og/{sid}.png",
            image_alt=f"{title}, {reading} on {nice_date(meta.get('last'))}",
            body=series_body(meta, full, by_key.get(key or ""), "../.."),
            head_extra=series_jsonld(meta, full, url)))
        written += 1

    # --- topics ---
    for topic in topics:
        rows = sorted(members[topic["key"]], key=lambda s: -(s.get("n") or 0))
        write(DIST / "topic" / topic["key"] / "index.html", template.render(
            root="../..", page=f"/topic/{topic['key']}",
            title=f"{topic['name']}: {len(rows):,} series from Egypt's central bank | Miqyas",
            description=clamp(topic["blurb"] + f" {len(rows):,} series, rebuilt every morning."),
            url=f"{SITE_URL}topic/{topic['key']}/",
            image=f"{SITE_URL}og/topic-{topic['key']}.png",
            image_alt=topic["name"] + ", on Miqyas",
            body=topic_body(topic, rows, "../..")))
        written += 1

    # --- documents ---
    docs_path = DIST / "search" / "documents.json"
    documents = json.loads(docs_path.read_text(encoding="utf-8")) if docs_path.exists() else []
    for doc in documents:
        snippet = snippet_for(doc["id"])
        title = doc.get("title") or doc["id"]
        write(DIST / "docs" / doc["id"] / "index.html", template.render(
            root="../..", page=f"/docs/{doc['id']}",
            title=f"{title} | Miqyas",
            description=clamp(
                f"{title}. {doc.get('pages', 0):,} pages from the Central Bank of Egypt, "
                f"{nice_date(doc.get('date'))}, searchable in English and Arabic. "
                + (snippet or "")),
            url=f"{SITE_URL}docs/{doc['id']}/",
            image=f"{SITE_URL}og.png",
            image_alt="Miqyas: Egypt's economy in numbers",
            body=document_body(doc, snippet, "../..")))
        written += 1

    # --- the fixed pages ---
    fixed = [
        ("series", "/series", "Find or browse 1,317 Egyptian economic series | Miqyas",
         "Every series the Central Bank of Egypt publishes, in thirteen subjects, searchable in English and Arabic."),
        ("favourites", "/favourites", "Your favourites | Miqyas",
         "One screen of the numbers you read every morning, with no prose in the way."),
        ("rates", "/rates", "Every CBE rate decision since 2005 | Miqyas",
         "172 Monetary Policy Committee decisions back to June 2005, with the corridor and what changed in the wording each time."),
        ("tools", "/tools", "Egyptian inflation calculator: what is your money worth? | Miqyas",
         "Three calculators on the Central Bank's own numbers: what a salary from any month is worth "
         "today, what savings kept as pounds still buy, and the dollar rate on any date since 2005."),
        ("tools/salary", "/tools/salary", "What is your Egyptian salary worth today? | Miqyas",
         "A salary from any month since 2005, priced in today's money using the Central Bank's own "
         "inflation. Free, and the answer is a link you can send."),
        ("tools/savings", "/tools/savings", "What happened to your Egyptian pound savings? | Miqyas",
         "What pounds set aside on any date since 2005 still buy, against what the same money would "
         "be worth had it been swapped for dollars that day."),
        ("tools/dollar", "/tools/dollar", "What was the dollar worth in Egypt on any date? | Miqyas",
         "The Central Bank's official EGP/USD rate on any date since January 2005, and on the same "
         "calendar day in every year since."),
        ("changes", "/changes", "What the Central Bank of Egypt quietly restated | Miqyas",
         "CBE overwrites its files when it revises a figure, with no changelog. This keeps every "
         "copy, so it can say what a number read last month and what was changed after publication."),
        ("docs", "/docs", "Search 1,478 Central Bank of Egypt publications | Miqyas",
         "Every statistical bulletin, circular, annual report and press release CBE has put out as a PDF, "
         "53,006 pages of it, searchable in English and Arabic."),
        ("money-market", "/money-market", "Egypt's money market: the corridor, the tenors, the bill curve | Miqyas",
         "Where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover."),
        ("data", "/data", "Download Egypt's macroeconomic data: Parquet, SQLite, CSV and a keyless API | Miqyas",
         "All 1,317 series in whichever shape suits you, rebuilt every morning. No key, no account, no rate limit."),
        ("about", "/about", "About Miqyas: an unofficial mirror of Egypt's central bank data",
         "What is here, what is not, and how it is built. Miqyas is not affiliated with the Central Bank of Egypt."),
    ]
    for slug, page, title, description in fixed:
        # "tools/salary" sits a directory deeper than "about", so the root it
        # declares has to count the separators rather than assume one.
        root = "/".join([".."] * (slug.count("/") + 1))
        write(DIST / slug / "index.html", template.render(
            root=root, page=page, title=title, description=clamp(description),
            url=f"{SITE_URL}{slug}/", image=f"{SITE_URL}og.png",
            image_alt="Miqyas: Egypt's economy in numbers",
            body='<div class="wrap"><section class="section">'
                 f"<h1>{esc(title.split(' | ')[0])}</h1>"
                 f'<p class="lede">{esc(description)}</p>' + ATTRIBUTION + "</section></div>"))
        written += 1

    print(f"pre-rendered {written:,} pages: {len(index):,} series, {len(topics)} subjects, "
          f"{len(documents):,} documents, {len(fixed)} fixed")
    return written


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
