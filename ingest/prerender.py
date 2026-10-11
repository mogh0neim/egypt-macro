"""Publish every page of the site as a real file, not just a hash.

The front end is one document and a hash router, which is the right shape for a
static archive and the wrong shape for being found. A crawler asking for the
site root is handed one page whose body is a loading skeleton; everything
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
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DIST = ROOT / "dist"

# The public address, from site.toml, the one place it is set.
from site_config import SITE_URL  # noqa: E402  (same directory; not a package)

# The one attribution sentence. The same words are ATTRIBUTION in web/core.js
# and in ingest/build_exports.py; change all three together. The Arabic is in
# the dictionary in web/i18n.js, keyed on this.
ATTRIBUTION = ("Source: Central Bank of Egypt (https://www.cbe.org.eg). Republished by Miqyas, "
               "an independent project not affiliated with, endorsed by, or connected to the "
               "Central Bank of Egypt. Values are cleaned and dated by Miqyas; check against CBE "
               "before citing.")

# Written per build; every directory here is pruned before it is rewritten, so a
# renamed series cannot leave a page behind that outlives it.
OWNED = ("ar", "s", "topic", "docs", "series", "favourites", "rates",
         "money-market", "data", "about", "tools", "changes")

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]

# The month names CBE itself prints in Arabic. Written out rather than
# abbreviated: Arabic has no convention for a three-letter month.
MONTHS_AR = ["\u064a\u0646\u0627\u064a\u0631", "\u0641\u0628\u0631\u0627\u064a\u0631",
             "\u0645\u0627\u0631\u0633", "\u0623\u0628\u0631\u064a\u0644",
             "\u0645\u0627\u064a\u0648", "\u064a\u0648\u0646\u064a\u0648",
             "\u064a\u0648\u0644\u064a\u0648", "\u0623\u063a\u0633\u0637\u0633",
             "\u0633\u0628\u062a\u0645\u0628\u0631", "\u0623\u0643\u062a\u0648\u0628\u0631",
             "\u0646\u0648\u0641\u0645\u0628\u0631", "\u062f\u064a\u0633\u0645\u0628\u0631"]

# The language currently being rendered. Module state rather than an argument
# on thirty call sites: this is a single-pass build script, and a date is
# formatted in a dozen places that have no other reason to know the language.
_LANG = "en"


def months():
    return MONTHS_AR if _LANG == "ar" else MONTHS

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
    names = months()
    try:
        name = names[int(m) - 1]
        return f"{int(d)} {name if _LANG == 'ar' else name[:3]} {y}"
    except (ValueError, IndexError):
        return iso


def short_date(iso: str | None) -> str:
    """Month and the year in full. `Aug 26` reads as the 26th of August."""
    if not iso or len(iso) < 7:
        return ""
    names = months()
    try:
        name = names[int(iso[5:7]) - 1]
        return f"{name if _LANG == 'ar' else name[:3]} {iso[:4]}"
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
    # `name` and `blurb` are wrapped in t() now, so the optional call is part
    # of the shape. The English inside it is still the source of truth: the
    # dictionary is keyed on it, so what is parsed here is also what looks the
    # translation up.
    for block in re.finditer(r"\{\s*key:\s*\"(.*?)\".*?"
                             r"name:\s*(?:t\()?\"(.*?)\".*?"
                             r"blurb:\s*(?:t\()?\"(.*?)\".*?"
                             r"families:\s*\[(.*?)\]", match.group(1), re.S):
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

def load_ar() -> dict[str, str]:
    """Read the Arabic dictionary out of web/i18n.js.

    One dictionary, two readers. The front end uses it for everything it
    renders; this uses it for the parts of the document that are already HTML
    before any script runs -- the navigation, the footer, the skip link -- so an
    Arabic page is Arabic in its first paint rather than flashing English while
    the script catches up.

    Parsed rather than duplicated, for the same reason TOPICS is: a second copy
    in Python would drift, and it would drift silently.
    """
    source = (WEB / "i18n.js").read_text(encoding="utf-8")
    start = source.find("const AR = {")
    end = source.find("\n};", start)
    if start < 0 or end < 0:
        raise SystemExit("prerender: could not find the AR dictionary in web/i18n.js")
    body = source[start:end]
    pairs = re.findall(r'^  "((?:[^"\\]|\\.)*)":\s*\n?\s*"((?:[^"\\]|\\.)*)",\s*$',
                       body, re.M)
    out = {k.replace('\\"', '"'): v.replace('\\"', '"') for k, v in pairs}
    if len(out) < 100:
        raise SystemExit(f"prerender: only {len(out)} translations parsed from i18n.js; "
                         "the file has changed shape")
    return out


_AR: dict[str, str] = {}


def _bare(text: str) -> str:
    """The text without its disambiguator. Only a pipe with no space before it
    is one: " | Miqyas" in a page title is part of the title, and cutting there
    left every English title ending in a space with the site's name gone."""
    m = re.search(r"[^ ]\|", text)
    return text[:m.start() + 1] if m else text


def tr(text: str, lang: str) -> str:
    """The Arabic for a string, or the string. Mirrors `t()` in i18n.js."""
    if lang != "ar":
        return _bare(text)
    if text in _AR:
        return _AR[text]
    return _bare(text)


# The parts of the document that are HTML before any script runs, and therefore
# the parts the front end's own `t()` cannot reach in time. Ordered longest
# first so "Rate decisions" is not half-replaced by "Rates".
CHROME = [
    "Independent project. Not affiliated with, endorsed by, or connected to the Central Bank of Egypt. Official figures:",
    "Search series, topics, documents and pages",
    "Search series, topics, documents, pages…",
    "Search Miqyas",
    "Switch between light, dark and system theme",
    "Egypt's macroeconomic record from the Central Bank's own publications, updated daily.",
    "Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.",
    "Revisions to published figures",
    "Work out what yours is worth",
    "What is and is not here",
    "The Central Bank of Egypt ↗",
    "↑ ↓ to move · return to open · esc to close",
    "Find or browse series",
    "Downloads and API",
    "Source on GitHub ↗",
    "Rate decisions",
    "Your favourites",
    "Skip to content",
    "This project",
    "What changed",
    "Work it out",
    "Favourites",
    "Documents",
    "Independent",
    "Overview",
    "Results",
    "Series",
    "Search",
    "Rates",
    "About",
    "Menu",
    "Data",
    "Auto",
]

# Chrome that is prose, wrapped across lines in the template, so it is matched
# with any run of whitespace between its words. The footer's second sentence
# stayed English on every Arabic page because the plain match above never saw
# it whole.
CHROME_PROSE = [
    "The CBE is the source of every number here. Any error in the cleaning is ours. For official figures go to",
]


def translate_chrome(html: str) -> str:
    """Put the navigation, the footer and the skip link into Arabic.

    The front end translates everything it renders, but the masthead, the
    footer and the palette are already in the document before the first script
    runs. Translating them here means an Arabic page is Arabic in its first
    paint, rather than showing a row of English nav items until the script
    catches up and swaps them.

    Substring replacement on a whole document is normally a bad idea. It is
    safe in this one because the strings are long, specific, and none of them
    appears inside an attribute name, a class or a URL. The list is ordered
    longest first so "Rates" cannot eat the tail of "Rate decisions".
    """
    for english in CHROME:
        arabic = _AR.get(english)
        if not arabic:
            continue
        html = html.replace(">" + english + "<", ">" + arabic + "<")
        html = html.replace('="' + english + '"', '="' + arabic + '"')
    for english in CHROME_PROSE:
        arabic = _AR.get(english)
        if not arabic:
            continue
        pattern = r"\s+".join(re.escape(word) for word in english.split())
        html = re.sub(r"(>|\s)" + pattern + r"(?=\s*<)", lambda m, a=arabic: m.group(1) + a, html)
    return html


# The real paths the navigation and the footer in web/index.html link to. Each
# is a page this script writes, in both languages.
NAV_PATHS = ("changes/", "data/", "series/", "rates/", "docs/", "about/", "tools/", "favourites/")


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
               head_extra: str = "", lang: str = "en", alternate: str = "") -> str:
        html = self.html

        if lang == "ar":
            html = self._sub(r'<html lang="en">', '<html lang="ar" dir="rtl">',
                             html, "the html element")
            html = self._sub(r'<meta property="og:locale" content=".*?">',
                             '<meta property="og:locale" content="ar_EG">', html, "og:locale")
            html = translate_chrome(html)

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

        # Each page names its counterpart in the other language, and the pair
        # names an x-default, so a crawler reads them as one page in two
        # languages rather than as two pages competing with each other.
        if alternate:
            other = "ar" if lang == "en" else "en"
            default = url if lang == "en" else alternate
            head_extra = (
                f'<link rel="alternate" hreflang="{lang}" href="{esc(url)}">\n'
                f'<link rel="alternate" hreflang="{other}" href="{esc(alternate)}">\n'
                f'<link rel="alternate" hreflang="x-default" href="{esc(default)}">\n'
            ) + head_extra

        if head_extra:
            html = self._sub(r"</head>", head_extra + "\n</head>", html, "the end of the head")

        # The navigation and the footer link to real paths, changes/ and the
        # rest, written relative to a home page. This document may be deeper,
        # and an Arabic one links to the Arabic pages, so each is pointed at
        # this language's home from here. Done before the body goes in, so
        # nothing in the body can match.
        nav = ("" if root == "." else root + "/") + lang_prefix(lang)
        if nav:
            for path in NAV_PATHS:
                html = html.replace(f'href="{path}"', f'href="{nav}{path}"')
            html = html.replace('href="./"', f'href="{nav}"')

        # The template's asset URLs are relative to a document at the root. This
        # one is not at the root.
        prefix = "" if root == "." else root + "/"
        if prefix:
            # The feeds are linked from the head relatively, exactly like the
            # stylesheet, so they need the same treatment or every page below
            # the root advertises an RSS feed that 404s.
            for name in self.assets + ["changes.xml", "changes-revisions.xml"]:
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
            ";window.MIQYAS_PAGE=" + json.dumps(page) +
            ";window.MIQYAS_LANG=" + json.dumps(lang) + ";</script>\n<script src=\"",
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

def attribution(lang: str = "en") -> str:
    return '<p class="foot-note">' + esc(tr(ATTRIBUTION, lang)) + "</p>"



def series_body(meta: dict, full: dict, topic: dict | None, root: str, lang: str = "en") -> str:
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
    arabic = " ".join(str(full.get("title_ar") or "").split())
    ours = full.get("title_ar_source") == "miqyas"

    facts = [
        (tr("Latest", lang), f"{fmt(latest, unit)}{unit_tag(unit)} {tr('on', lang)} {nice_date(meta.get('last'))}"),
        (tr("Previous", lang), fmt(previous, unit) if previous is not None else "-"),
        (tr("Change", lang), fmt_change(change, unit)),
        (tr("Unit", lang), unit or tr("not stated by CBE", lang)),
        (tr("Readings", lang), f"{meta.get('n', 0):,}"),
        (tr("Coverage", lang), f"{nice_date(meta.get('first'))} {tr('to', lang)} {nice_date(meta.get('last'))}"),
    ]
    if meta.get("highest"):
        facts.append((tr("Highest", lang), f"{fmt(meta['highest']['value'], unit)} ({short_date(meta['highest']['period'])})"))
    if meta.get("lowest"):
        facts.append((tr("Lowest", lang), f"{fmt(meta['lowest']['value'], unit)} ({short_date(meta['lowest']['period'])})"))

    source = full.get("source_url")
    method = full.get("method")

    # On /ar/ the Arabic title is the heading and CBE's English title the line
    # under it, the other way round from the English page; an Arabic title
    # Miqyas wrote says so. The links stay inside the Arabic site.
    if lang == "ar" and arabic:
        heading = (f"<h1>{esc(arabic)}</h1>"
                   + (f'<p class="alt-en" dir="ltr" lang="en">{esc(title)}</p>' if title != arabic else "")
                   + (f'<p class="foot-note">{esc(tr("Translated by Miqyas. CBE publishes no Arabic name for this series.", lang))}</p>'
                      if ours else ""))
    else:
        heading = (f"<h1{dir_attr(title)}>{esc(title)}</h1>"
                   + (f'<p class="ar" dir="rtl" lang="ar">{esc(arabic)}</p>' if arabic else ""))
    figure = f'<b dir="ltr">{esc(fmt(latest, unit))}</b>'
    lede = (esc(tr("{v} as of {d}, from the Central Bank of Egypt. {n} readings covering {from} to {to}.", lang))
            .replace("{v}", figure).replace("{d}", esc(nice_date(meta.get("last"))))
            .replace("{n}", f'{meta.get("n", 0):,}').replace("{from}", esc(nice_date(meta.get("first"))))
            .replace("{to}", esc(nice_date(meta.get("last")))))
    app = f"{root}/{lang_prefix(lang)}"
    method_html = esc(tr(method, lang)) if method else ""
    if method and lang == "ar" and not ARABIC.search(method_html):
        method_html = f'<span dir="ltr" lang="en">{method_html}</span>'

    return (
        '<div class="wrap"><section class="section">'
        f'<p class="eyebrow">{esc(tr(topic["name"], lang)) if topic else esc(tr("Series", lang))}</p>'
        + heading
        + f'<p class="lede">{lede}</p>'
        + '<table class="indicators"><tbody>'
        + "".join(f"<tr><td class='name'>{esc(k)}</td><td>{esc(v)}</td></tr>" for k, v in facts)
        + "</tbody></table>"
        + (f'<p class="foot-note">{esc(tr("How this is worked out:", lang))} {method_html}</p>' if method else "")
        + f'<h2>{esc(tr("The last two dozen readings", lang))}</h2>'
        + f'<table class="indicators"><thead><tr><th>{esc(tr("Period", lang))}</th>'
          f'<th>{esc(unit or tr("Value", lang))}</th></tr></thead>'
        + f"<tbody>{rows}</tbody></table>"
        + f'<p><a href="{root}/api/v1/series/{esc(meta["series_id"])}.json">{esc(tr("The whole series as JSON", lang))}</a>'
          f' · <a href="{app}#/data">{esc(tr("CSV, Parquet, SQLite and the API", lang))}</a>'
        + (f' · <a href="{esc(source)}" rel="noopener">{esc(tr("The CBE page this came from", lang))}</a>' if source else "")
        + "</p>"
        + attribution(lang)
        + "</section></div>"
    )


def series_jsonld(meta: dict, full: dict, url: str, lang: str = "en") -> str:
    """Schema.org Dataset, which is what Google Dataset Search reads.

    Worth the twenty lines: it is a route to this data that almost nobody
    competing for these queries has bothered with, and the fields it wants --
    temporal coverage, creator, distribution -- are ones this catalogue
    already carries honestly.

    No `license`. The repository's MIT licence covers the code, and putting it
    here told every dataset catalogue that CBE's numbers were Mo's to license.
    `usageInfo` points at the terms on the About page instead, which say the
    code is MIT and the data is CBE's.

    The JSON is escaped for a script element: json.dumps leaves "<" alone, so a
    title containing "</script>" would have closed the block and run whatever
    followed it on every series page.
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
        "usageInfo": f"{SITE_URL}about/",
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
    # The Arabic page names the dataset in Arabic, and says which language it
    # is in; CBE's English title stays as an alternate name.
    if lang == "ar" and full.get("title_ar"):
        data["name"] = " ".join(str(full["title_ar"]).split())
        data["alternateName"] = full.get("title_en") or meta["series_id"]
    data["inLanguage"] = lang
    payload = (json.dumps(data, ensure_ascii=False)
               .replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e"))
    return '<script type="application/ld+json">' + payload + "</script>"


def topic_body(topic: dict, members: list[dict], root: str, lang: str = "en") -> str:
    # Each series by its title in the page's language, linked within that site.
    def name(s):
        if lang == "ar" and s.get("title_ar"):
            return " ".join(str(s["title_ar"]).split())
        return s.get("title_en") or s["series_id"]
    rows = "".join(
        f'<tr><td class="name"><a href="{root}/{lang_prefix(lang)}s/{esc(s["series_id"])}/"{dir_attr(name(s))}>'
        f'{esc(name(s))}</a></td>'
        f'<td>{esc(fmt(s.get("latest_value"), s.get("unit")))}</td>'
        f'<td>{esc(short_date(s.get("last")))}</td></tr>'
        for s in members[:400]
    )
    count = f"{len(members):,}"
    return (
        '<div class="wrap"><section class="section">'
        f'<p class="eyebrow">{esc(tr("Topic", lang))}</p>'
        f'<h1>{esc(tr(topic["name"], lang))}</h1>'
        f'<p class="lede">{esc(tr(topic["blurb"], lang))} '
        + esc(tr("{n} series, from the Central Bank of Egypt, updated daily.", lang)).replace("{n}", count) + "</p>"
        f'<table class="indicators"><thead><tr><th>{esc(tr("Series|one row of a table", lang))}</th>'
        f'<th>{esc(tr("Latest", lang))}</th><th>{esc(tr("As of", lang))}</th></tr></thead>'
        f"<tbody>{rows}</tbody></table>"
        + (f'<p class="foot-note">{esc(tr("Showing the first 400 of {n}.", lang)).replace("{n}", count)}</p>'
           if len(members) > 400 else "")
        + attribution(lang) + "</section></div>"
    )


def document_body(doc: dict, snippet: str, root: str, lang: str = "en") -> str:
    bits = []
    if doc.get("date"):
        bits.append(nice_date(doc["date"]))
    if doc.get("pages"):
        bits.append(tr("{n} pages", lang).replace("{n}", f"{doc['pages']:,}"))
    if doc.get("source"):
        bits.append(str(doc["source"]))
    title = doc.get("title") or doc["id"]
    # CBE lists its documents under English titles only. On /ar/ the title is
    # held left to right and said to be English, rather than passed through
    # half translated.
    if lang == "ar" and not ARABIC.search(title):
        heading = (f'<h1 dir="ltr" lang="en">{esc(title)}</h1>'
                   f'<p class="foot-note">{esc(tr("The title is available in English only, as CBE lists it.", lang))}</p>')
    else:
        heading = f'<h1{dir_attr(title)}>{esc(title)}</h1>'
    return (
        '<div class="wrap"><section class="section">'
        f'<p class="eyebrow">{esc(tr("Document", lang))}</p>'
        + heading
        + f'<p class="lede">{esc(" · ".join(bits))}. '
        + esc(tr("Published by the Central Bank of Egypt, indexed here so its text can be searched and quoted.", lang)) + "</p>"
        + (f'<p{dir_attr(snippet)}>{esc(snippet)}</p>' if snippet else "")
        + (f'<p><a href="{esc(doc["url"])}" rel="noopener">{esc(tr("The document on cbe.org.eg", lang))}</a>'
           f' · <a href="{root}/{lang_prefix(lang)}#/docs">{esc(tr("Search the whole archive", lang))}</a></p>'
           if doc.get("url") else "")
        + (
            f'<p class="foot-note">{esc(tr("This document is a scan with no text layer of its own. Its text was read by OCR and is not as reliable as the rest.", lang))}</p>'
            if doc.get("ocr") or doc.get("needs_ocr") else ""
        )
        + attribution(lang) + "</section></div>"
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


LANGS = ("en", "ar")


def lang_prefix(lang: str) -> str:
    """English at the root, Arabic under /ar/.

    Two documents rather than one with a switch, because a hash cannot be
    indexed and a query string is a different page to nobody. /ar/ is a real
    directory with real files, so Google can index the Arabic site separately,
    and an Arabic link pasted into a chat opens in Arabic.
    """
    return "" if lang == "en" else lang + "/"


def other(lang: str) -> str:
    return "ar" if lang == "en" else "en"


# What the home page carries before the script draws it. The cards and the
# chart are the script's to draw, but a crawler that never runs it used to find
# a loading skeleton and no heading or link at all. So it gets the overview's
# own heading and two buttons, and a plain link to each subject, as real paths
# from the language's home.
def home_body(topics: list[dict], lang: str) -> str:
    subjects = "".join(f'<li><a href="topic/{esc(t["key"])}/">{esc(tr(t["name"], lang))}</a></li>'
                       for t in topics)
    return (
        '<section class="hero"><div class="wrap">'
        '<h1 class="hero-line">'
        + esc(tr("Central Bank of Egypt statistics as one clean dataset, with a dated daily "
                 "archive of its live tables.", lang)) + "</h1>"
        '<div class="controls hero-actions">'
        f'<a class="chip solid" href="data/">{esc(tr("Download the data", lang))}</a>'
        f'<a class="chip" href="changes/">{esc(tr("See what changed", lang))}</a>'
        "</div></div></section>"
        '<section class="section"><div class="wrap">'
        f'<h2>{esc(tr("Everything, by subject", lang))}</h2>'
        f"<ul>{subjects}</ul>"
        "</div></section>"
    )


def render_language(template, lang, *, index, topics, by_family, by_key, documents, counts):
    """Every page of the site, in one language."""
    global _LANG
    _LANG = lang
    prefix = lang_prefix(lang)
    # An Arabic page sits one directory deeper than its English counterpart, so
    # everything it points at is one more level up.
    extra = 0 if lang == "en" else 1

    def up(depth):
        return "/".join([".."] * (depth + extra)) or "."

    def urls(path):
        return (SITE_URL + prefix + path,
                SITE_URL + lang_prefix(other(lang)) + path)

    written = 0
    members = {t["key"]: [] for t in topics}

    # --- the home document ---
    #
    # This is the one page that is not pre-rendered content: it is the app
    # itself, and every hash route inside a language renders into it. So it
    # deliberately carries no MIQYAS_PAGE. Setting one would make the Arabic
    # home bounce to the English root the moment anybody clicked a nav item,
    # because a pre-rendered page hands off to the app document and this *is*
    # the app document.
    #
    # English keeps dist/index.html, which copy_front_end already wrote and
    # version_assets already stamped, so only the head needs the hreflang pair.
    # Arabic gets a whole document of its own at dist/ar/.
    home_url, home_alt = urls("")
    home = template.render(
        root=up(0), page="", lang=lang, alternate=home_alt,
        title=tr("Miqyas: Egypt's economy in numbers", lang),
        description=tr("Central Bank of Egypt statistics as one clean dataset: exchange rates, "
                       "treasury auctions, inflation, policy rates and the CBE Excel archive, with "
                       "a free API, bulk files and a daily record of changes. Independent; not "
                       "affiliated with CBE.", lang),
        url=home_url, image=f"{SITE_URL}og.png",
        image_alt=tr("Miqyas: Egypt's economy in numbers", lang),
        body=home_body(topics, lang))
    # render() injects MIQYAS_PAGE; an empty one has to go rather than be
    # believed, or app.js treats the home page as a pre-rendered sub-page.
    home = home.replace(';window.MIQYAS_PAGE="";', ";")
    write(DIST / "ar" / "index.html" if lang == "ar" else DIST / "index.html", home)
    written += 1

    # --- series ---
    for meta in index:
        sid = meta["series_id"]
        key = topic_of(meta, by_family)
        if key:
            members[key].append(meta)
        full_path = DIST / "api" / "v1" / "series" / f"{sid}.json"
        if not full_path.exists():
            continue
        full = json.loads(full_path.read_text(encoding="utf-8"))

        # The Arabic title on /ar/: CBE's where it published one, which is the
        # Excel archive, and Miqyas's translation, marked on the page, for every
        # FX, price, policy rate and treasury bill series, which CBE names in
        # English only.
        title = (" ".join(str(full.get("title_ar") or "").split()) if lang == "ar" else None) \
            or full.get("title_en") or sid
        url, alt = urls(f"s/{sid}/")
        unit = full.get("unit")
        reading = fmt(meta.get("latest_value"), unit) + unit_tag(unit)
        description = clamp(
            f"{title}: {reading} " + tr("on", lang) + f" {nice_date(meta.get('last'))}. "
            f"{meta.get('n', 0):,} " + tr("readings back to", lang) +
            f" {short_date(meta.get('first'))}.")
        write(DIST / prefix.rstrip("/") / "s" / sid / "index.html" if prefix
              else DIST / "s" / sid / "index.html",
              template.render(
                  root=up(2), page=f"/s/{sid}", lang=lang, alternate=alt,
                  title=f"{title} | " + tr("Miqyas", lang),
                  description=description, url=url,
                  image=f"{SITE_URL}og/{sid}.png",
                  image_alt=f"{title}, {reading}",
                  body=series_body(meta, full, by_key.get(key or ""), up(2), lang),
                  head_extra=series_jsonld(meta, full, url, lang)))
        written += 1

    # --- topics ---
    for topic in topics:
        rows = sorted(members[topic["key"]], key=lambda s: -(s.get("n") or 0))
        name = tr(topic["name"], lang)
        blurb = tr(topic["blurb"], lang)
        url, alt = urls(f"topic/{topic['key']}/")
        write(DIST / prefix.rstrip("/") / "topic" / topic["key"] / "index.html" if prefix
              else DIST / "topic" / topic["key"] / "index.html",
              template.render(
                  root=up(2), page=f"/topic/{topic['key']}", lang=lang, alternate=alt,
                  title=f"{name}: {len(rows):,} " + tr("series from Egypt's central bank", lang) + " | " + tr("Miqyas", lang),
                  description=clamp(blurb + f" {len(rows):,} " + tr("series, updated daily.", lang)),
                  url=url,
                  image=f"{SITE_URL}og/topic-{topic['key']}.png",
                  image_alt=name + ", Miqyas",
                  body=topic_body(topic, rows, up(2), lang)))
        written += 1

    # --- documents ---
    for doc in documents:
        snippet = snippet_for(doc["id"])
        title = doc.get("title") or doc["id"]
        url, alt = urls(f"docs/{doc['id']}/")
        write(DIST / prefix.rstrip("/") / "docs" / doc["id"] / "index.html" if prefix
              else DIST / "docs" / doc["id"] / "index.html",
              template.render(
                  root=up(2), page=f"/docs/{doc['id']}", lang=lang, alternate=alt,
                  title=f"{title} | " + tr("Miqyas", lang),
                  description=clamp(
                      f"{title}. {doc.get('pages', 0):,} " + tr("pages from the Central Bank of Egypt", lang) +
                      f", {nice_date(doc.get('date'))}. " + (snippet or "")),
                  url=url,
                  image=f"{SITE_URL}og.png",
                  image_alt="Miqyas",
                  body=document_body(doc, snippet, up(2), lang)))
        written += 1

    # --- the fixed pages ---
    #
    # Counts are filled from this build's own files, never typed: typed ones
    # went stale within weeks and four different page counts were live at once.
    # The {placeholders} sit inside the dictionary keys, so the Arabic carries
    # them too and both languages are filled the same way.
    fixed = [
        ("series", "/series", "Find or browse {series} Egyptian economic series | Miqyas",
         "Central Bank of Egypt statistics in thirteen subjects, searchable in English and Arabic."),
        ("favourites", "/favourites", "Your favourites | Miqyas",
         "One screen of the numbers you check most, with no prose in the way."),
        ("rates", "/rates", "Every CBE rate decision since 2005 | Miqyas",
         "{decisions} Monetary Policy Committee statements back to June 2005, with the corridor and what changed in the wording each time."),
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
        ("changes", "/changes", "Revisions to published figures | Miqyas",
         "Daily record of CBE figures as published, and any revisions to figures already published. "
         "Independent; not affiliated with CBE."),
        ("docs", "/docs", "Search {documents} Central Bank of Egypt publications | Miqyas",
         "CBE publications in PDF, {pages} pages of text indexed so you can search inside them in "
         "English and Arabic. Each result links to the original on cbe.org.eg."),
        ("money-market", "/money-market", "Egypt's money market: the corridor, the tenors, the bill curve | Miqyas",
         "Where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover."),
        ("data", "/data", "Download Egypt's macroeconomic data: Parquet, SQLite, CSV and a keyless API | Miqyas",
         "All {series} series in whichever shape suits you, updated daily. No key and no account."),
        ("about", "/about", "About Miqyas: an independent dataset of Egyptian central bank data",
         "Who made Miqyas and why, what is here and what is not, and the terms. Miqyas is an "
         "independent project, not affiliated with the Central Bank of Egypt."),
    ]

    def filled(text):
        for name, value in counts.items():
            text = text.replace("{" + name + "}", value)
        return text

    for slug, page, title, description in fixed:
        title = filled(tr(title, lang))
        description = filled(tr(description, lang))
        url, alt = urls(slug + "/")
        # "tools/salary" sits a directory deeper than "about", so the root it
        # declares counts the separators rather than assuming one.
        target = DIST / prefix.rstrip("/") / slug if prefix else DIST / slug
        write(target / "index.html", template.render(
            root=up(slug.count("/") + 1), page=page, lang=lang, alternate=alt,
            title=title, description=clamp(description),
            url=url, image=f"{SITE_URL}og.png",
            image_alt="Miqyas",
            body='<div class="wrap"><section class="section">'
                 f"<h1>{esc(title.split(' | ')[0])}</h1>"
                 f'<p class="lede">{esc(description)}</p>'
                 + (about_lines(lang) if slug == "about" else "")
                 + attribution(lang) + "</section></div>"))
        written += 1

    return written


# Who made it and on what terms, readable on the pre-rendered About page before
# any script runs. The Dataset markup on every series page points its
# usageInfo here, so the terms have to be in the HTML a crawler reads.
ABOUT_LINES = (
    "Miqyas is made by Mohamed Ghoneim, as an independent project.",
    "The code is MIT-licensed. The data is the Central Bank of Egypt's, and Miqyas claims no "
    "rights in it: cite CBE as the source, and check against CBE before citing.",
)


def about_lines(lang: str) -> str:
    return "".join(f"<p>{esc(tr(line, lang))}</p>" for line in ABOUT_LINES)


def main(template_html: str | None = None, assets: list[str] | None = None) -> int:
    global _AR
    if template_html is None:
        template_html = (DIST / "index.html").read_text(encoding="utf-8")
    if assets is None:
        assets = [p.name for p in DIST.iterdir()
                  if p.is_file() and p.suffix in {".js", ".css", ".svg", ".png"}]

    _AR = load_ar()
    template = Template(template_html, assets)
    index = json.loads((DIST / "api" / "v1" / "series.json").read_text(encoding="utf-8"))
    topics = load_topics()
    by_family = {f: t["key"] for t in topics for f in t["families"]}
    by_key = {t["key"]: t for t in topics}
    docs_path = DIST / "search" / "documents.json"
    documents = json.loads(docs_path.read_text(encoding="utf-8")) if docs_path.exists() else []
    mpc_path = DIST / "api" / "v1" / "mpc.json"
    decisions = json.loads(mpc_path.read_text(encoding="utf-8")).get("count") if mpc_path.exists() else None
    counts = {
        "series": f"{len(index):,}",
        "documents": f"{len(documents):,}",
        "pages": f"{sum(d.get('pages') or 0 for d in documents):,}",
        "decisions": f"{decisions:,}" if decisions else "All",
    }

    prune()
    total = 0
    for lang in LANGS:
        n = render_language(template, lang, index=index, topics=topics,
                            by_family=by_family, by_key=by_key, documents=documents,
                            counts=counts)
        print(f"  {lang}: {n:,} pages")
        total += n

    write_not_found(template)

    print(f"pre-rendered {total:,} pages across {len(LANGS)} languages: "
          f"{len(index):,} series, {len(topics)} subjects, {len(documents):,} documents")
    return total


def write_not_found(template: Template) -> None:
    """dist/404.html, which GitHub Pages serves for any address with no file.

    It used to be a copy of index.html, whose asset links are relative. At
    /s/NOPE/ the browser asked for /s/NOPE/styles.css and every script, got a
    404 for each, and drew a blank page in Times New Roman with no way back.
    This one names its assets, the API and the way home from the site root,
    so it works at any depth, and it declares MIQYAS_MISSING so app.js reads
    the address that was asked for rather than showing the overview under it.

    The root is the path part of SITE_URL, so a move to the site's own domain
    changes nothing here.
    """
    global _LANG
    _LANG = "en"
    site_path = urllib.parse.urlsplit(SITE_URL).path.rstrip("/")
    html = template.render(
        root=site_path, page="", lang="en",
        title="Page not found | Miqyas",
        description=tr("Central Bank of Egypt statistics as one clean dataset: exchange rates, "
                       "treasury auctions, inflation, policy rates and the CBE Excel archive, with "
                       "a free API, bulk files and a daily record of changes. Independent; not "
                       "affiliated with CBE.", "en"),
        url=SITE_URL, image=f"{SITE_URL}og.png", image_alt="Miqyas",
        head_extra='<meta name="robots" content="noindex">',
        # What a reader with no script sees; app.js replaces it with the
        # nearest series to whatever the address carried.
        body='<div class="wrap"><section class="section">'
             "<h1>Nothing lives at that address</h1>"
             '<p class="lede">The link may be from an older version of the site. '
             f'<a href="{esc(site_path)}/">Start from the overview</a>.</p>'
             + attribution("en") + "</section></div>")
    html = html.replace(';window.MIQYAS_PAGE="";', ";window.MIQYAS_MISSING=true;")
    write(DIST / "404.html", html)


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
