# Miqyas: the design

Notes for whoever touches the front end next, including me in six months. This
records the decisions and the reasons, so they do not have to be re-derived or
accidentally reversed. It is not shipped: `build_site.py` copies `web/` by file
extension and `.md` is not on the list.

## The idea

The design is built on the Nilometer on Rhoda Island: the graduated marble column
Cairo read the flood against for eleven centuries to forecast the harvest and set
the tax rate. Egypt's first macroeconomic indicator, in service by 861 AD, and the
thing the site is named after.

That gives the palette an object to come from rather than a brand deck, and it
gives the site one ornament that does real work.

## Palette

Defined once at the top of `styles.css` as custom properties, then redefined in
two places for dark: a `prefers-color-scheme` block guarded with
`:root:not([data-theme="light"])`, and a `:root[data-theme="dark"]` block so the
toggle wins in both directions. **Never give a colour its only definition inside
a media query** or the explicit light choice cannot override the system.

| Token | Light | Role |
|---|---|---|
| `--ink` `#101b33` | text | the ink of a stone well |
| `--marble-2` `#f4f4f1` | page | marble |
| `--brass` `#a8823a` → `--gold` | structure | brass inscription |
| `--faience` `#1f6f6b` → `--accent` | measurement | the era's blue-green tilework |
| `--clay` `#a6412e` → `--down` | a fall | - |

The rule that keeps it coherent, and the one worth defending:

> **Gold is structure. Teal is measurement. Red is only ever a fall.**

So gold carries eyebrows, group headings, section rules, the `wide-card` left
edge, event markers, the corridor band, the graduation marks. Teal carries data:
lines, sparklines, the gauge fill and mark, a rise. Red appears only on a
negative change and on `.badge.hike` - a rate rise is a fall for the reader
holding the pound, which is why that one looks inverted and is not.

Never introduce a fourth accent. If something needs to be distinguished and the
three do not cover it, use weight, size or dash pattern instead - `--text-3` with
`stroke-dasharray` is what `.chart .line.s2` does.

## Type

Three faces, from Google Fonts, one `@import` at the top of `styles.css`:

- `--display` **IBM Plex Sans Condensed** 600/700. Headlines, card titles,
  wordmark, accordion names. Condensed because the headlines are long sentences
  and want to stay on two lines.
- `--body` **IBM Plex Sans** 400/450/600. Prose. `450` exists and is used for
  table-cell links - a real weight, not a synthetic one.
- `--mono` **IBM Plex Mono** 400/500. **Every number on the site**, plus
  eyebrows, units, dates, chips, metadata, code. Always with
  `font-variant-numeric: tabular-nums` where figures stack in a column.
- `--arabic` **Almarai** 400/700/800. The wordmark and every Arabic title.
  **This is the typeface CBE itself uses**: cbe.org.eg loads Almarai at 300, 400,
  700 and 800 and sets every Arabic word on the site in it. Checked in their
  stylesheet, not guessed. **None of the IBM Plex faces carry Arabic at all**, so
  before this the wordmark and all 1,095 Arabic titles fell through to whatever
  the operating system picked.

  CBE's *logo* is a separate thing and is not reproduced: bespoke interlocked
  calligraphy drawn for the mark, which no typeface renders, and copying it would
  be taking a trademark rather than matching a typeface.

  An earlier pass used Amiri, the Naskh revival from the Amiria Press at Bulaq.
  Better provenance, wrong answer: CBE's own type is a modern geometric sans, and
  Almarai also pairs far better with IBM Plex than a book face did.

Almarai carries a Latin-sized x-height, so it needs almost none of the
compensation a Naskh does: `.ar` sits at `0.95em` with `line-height: 1.6`, and
`.mark-ar` is nudged `0.02em` onto the shared baseline rather than the `0.06em`
Amiri needed.

Body is `15px / 1.55`. Headline sizes are all `clamp()` so nothing needs a
breakpoint to be readable.

## Components

The vocabulary, in the order a reader meets it. Reuse these rather than inventing
neighbours.

| | |
|---|---|
| `.masthead` | Sticky, 62px, `--surface`. **The nav must never be what gives way** - it is the only route to most pages. `.quick` is the flexible item and disappears at 1150px; the nav keeps its width. |
| `.freshness` | Thin strip under the masthead, from `status.json`. Turns gold and warns when the build is over 36h old. Scrolls away; the footer repeats it permanently. |
| `.hero` | `--surface`, bottom border, headline + `.standfirst` + a full-bleed chart (`.hero-chart` negates the gutter) + `.readout`. |
| `.section` / `.section.band` | Alternating page bands. `.band` is `--surface` with rules top and bottom. |
| `.band-inset` | A bordered card *inside* a section, for a self-contained aside (the API block). |
| `.eyebrow` | Mono, gold, uppercase, tracked. Labels a section above its `h2`. |
| `.starter` | The home cards. Grid areas `q / answer spark / delta asof / note`. Answers the question on the card face, so it is useful before it is clicked. |
| `.topic-card` | The browse grid. `.desk` variant is gold-bordered because it is *not* one of the thirteen subjects and should not pretend to be. |
| `.wide-card` | Full-width promo with a 3px gold left edge. Eyebrow, `h3`, prose, `.go` arrow. |
| `table.indicators` | The workhorse. Mono right-aligned cells, `td.name` in body font and left-aligned, `.group-head` rows in gold mono. `.compact` for denser variants. |
| `.gauge` | **The one ornament, and it does work.** Where a value sits between its own record low and high, with quarter notches. 82×20 SVG from `gauge()`. |
| `.spark` | Values only, no axis. Its job is to say *rising, flat, or a cliff in 2016* at a glance. |
| `.chart` | From `lineChart()`. See below. |
| `.readout` | The figure under a chart. Becomes live on hover via `wireHover()`. |
| `.chip` | Every control. `aria-pressed="true"` for the selected state; `.solid` for a primary action. |
| `details.group` | Topic accordions, gold `▸` marker, first one open. |
| `.crumbs` | Mono breadcrumbs from `crumbs()`. |
| `details.add-panel` | Search the whole catalogue from inside Favourites, so a list can be built without leaving the page it is on. Open by default until the list is the reader's own. |
| `.near` | The "did you mean" list, on a missing series id and on an address nothing lives at. Plain `.result` stacks its two spans inline, which is right where the sub is a page reference and wrong where it is an 88-character id running into the title. |
| `.tool-form` | The only form on the site a reader types into expecting an answer back. Native `number`, `month` and `date` inputs, 44px tall, labelled above rather than placeheld. Submitting writes the values into the hash rather than rendering in place: the answer becomes a link, the back button works, and there is one path into the render instead of two. Note `button.chip` in the phone block is (0,1,1) and later in the file, so the submit button needs `.tool-form button.chip` or it loses and comes out at 38px. |
| `.call` | The next-decision panel at the top of `#/rates`. A `band-inset`, because it is a self-contained aside rather than a section of the page. The only thing on the site pointing at a date that has not happened yet. |
| `.nilometer` | The band on the overview that says where the name comes from. Its gauge is the only one on the site that is the subject rather than a summary, so it is sized up to 260px and reads today's dollar rate against its own twenty-year range - which is what the column did. |

## Charts

`lineChart()` in `core.js`. The non-obvious decisions, each of which was a bug
first:

- **The viewBox is sized to roughly the CSS pixels it will occupy**
  (`min(1000, max(340, innerWidth * 0.9))`), so one SVG unit is about one screen
  pixel and a 10px axis label renders at 10px. A fixed 1000-unit box looks right
  on a desktop and shrinks the type to three pixels on a phone, which is the
  same as not drawing it.
- **Y guides land on a 1/2/5 ladder**, not on fifths of the range, or labels read
  `57.566`.
- **A zero line only appears when the series crosses zero.** On a trade balance
  it is the whole story; anywhere else it is clutter.
- **Stepped series get square corners.** A policy rate holds at the level the
  committee set it to; joining two decisions with a sloped line says it drifted
  between them, which is a lie about how the corridor works. `opts.step` is per
  set, because the corridor chart puts stepped policy rates and a daily
  benchmark on one frame.
- **A rate still in force reaches today**, not the day it last moved.
- **Two series on one axis are always rebased to 100 first.** A level in pounds
  and a level in dollars on one axis is a lie told with a straight line.
- **Two sets that bound a third are a band**, not two lines (`opts.band`).
- **Event labels are dropped rather than allowed to overprint.** November 2016
  had three devaluations in three weeks.
- **`armLines()` measures the real path length** for the draw-on animation. The
  stylesheet can only guess it from the chart width, which is fine for a smooth
  line and badly wrong for a spiky one - CONIA's overnight volume covers 19,838
  units inside a 1,485-unit guess, and the dash repeats, punching thirteen
  permanent holes through the stroke. It also removes the dash on a 2s timer
  whether the animation ran or not, because a hidden tab holds the animation
  clock at zero and the chart is then blank rather than half-drawn.

## Formatting

All in `core.js`, and all of it is about not spending precision on nothing:

- `fmt` - decimals by magnitude; exact zero gets none, because `0.0000%` is four
  digits saying nothing and CBE publishes a lot of zeros.
- `fmtTick` - as many decimals as the gap between guides needs, and never `-0`.
- `fmtChange` - two significant figures for levels, a decimal kept for
  percentages, because 25 basis points is a real decision.
- `isFlat` / `changeCell` - **a change that rounds away to nothing is not a rise.**
  Ask `fmtChange` rather than inventing a threshold: whatever it prints as zeros
  gets the word `flat`, no arrow, no colour.
- `shortDate` - **writes the year in full.** `Aug 26` is read as the 26th of
  August by most people and means August 2026.
- `unitTag` - empty when `fmt` has already said it. `14.90%` needs no `%` after it.
- `changeLabel` - market phrasing off the frequency: *on the day*, *on the
  quarter*, *since it moved*. "Since the previous reading" is true of every
  series and therefore tells you nothing.
- `titleHTML` - a few hundred CBE rows are labelled only in Arabic; rendering
  those left-to-right mangles them, so anything containing Arabic is wrapped in
  `dir="auto"`.

## Responsive

Measured empirically, 360–1920px. The breakpoints and what each is actually for:

| | |
|---|---|
| **1150px** | `.quick` and `.unofficial` go. Between here and a comfortable desktop there is room in the masthead for the nav or the search box, not both, and the nav wins. |
| **980px** | `.two-col` and `.foot-cols` collapse. |
| **820px** | Phone. Nav becomes a `.menu`-toggled panel, `hide-sm` columns drop, `.result.rich` and `.mpc-row` reflow, the freshness strip keeps only its first item and any warning. |
| **560px** | Narrow phone. Topic cards go two-up and drop their blurbs, the palette stacks its kind label above the row, the gauge narrows. |

**Forty pixels is the floor for anything tappable.** Measured at 390px, almost
every control was under it: search and menu at 29 square, chips at 27 tall, and
the stars at 19 by 18, of which a topic page has a hundred and one. The
`max-width: 820px` block raises sizes and hides nothing. Two techniques worth
reusing:

- A link inside a table cell was 17px tall in a cell twice that, so half of every
  row did nothing. `display: block` plus `padding-block` and a matching negative
  `margin-block` grows the target into padding the cell already had, without
  moving anything.
- Inline links inside a sentence are exempt. They are meant to be text-sized, and
  a 40px inline link breaks the paragraph.

The search affordance must keep its **label at every width**. An unlabelled
magnifier was the only route to 1,317 series on a phone. "Find a series" is also
back in the navigation, `display: none` above 820px, because the panel has
vertical room the desktop row does not and ctrl-K does not exist on a phone.

Measure before optimising a long page. The overview ran to 8,621px at 390px wide
and the obvious suspect was the seven full-height starter cards; they were
1,360px of it, and the thirteen topic cards were 2,371px. Two columns and no
blurbs on the cards took the page to 6,879px.

Standing rules:

- **`documentElement.scrollWidth` must equal `clientWidth` at 360px on every
  route.** Wide content scrolls inside its own `overflow-x: auto` container
  (`.table-scroll`, `pre.code`), and the page body never scrolls sideways.
- **Sweep populated states, not empty ones**, and sweep the error states too.
  CBE's Excel-derived ids run to 88 characters, and an unbroken mono string that
  long pushes a phone sideways on its own. Four separate places have now needed
  `overflow-wrap: anywhere` for exactly that reason (`.series-id`, `.result .sub`,
  `.psub`, `.empty` / `code`), and the first sweep missed the one on `#/find`
  because it loaded the page with no query, which renders no ids at all.
- Find the culprit by looking for elements whose **own content** overflows them,
  not for boxes wider than the viewport. The wide box is usually an ancestor;
  the offender is the leaf:

  ```js
  [...d.querySelectorAll("body *")]
    .filter(e => e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0)
    .filter(e => getComputedStyle(e).overflowX === "visible")
  ```

  SVG `<text>` shows up as a false positive here; its `className` is an
  `SVGAnimatedString`, which is how to spot it.
- **Asset URLs are stamped with a content hash** by `version_assets()` in
  `build_site.py`. Pages serves the front end with `max-age=600` and no version
  in the filename, so for ten minutes after a deploy a returning reader could
  hold a mixture: a new `index.html` referencing `views-mydesk.js` and linking to
  `#/favourites`, with an old cached `app.js` that has heard of neither. That is
  not a stale site, it is a broken one, and it is exactly what renaming a route
  produced. The stamp fixes the *mixing*, not the staleness: whichever
  `index.html` a reader holds points at the assets that belong with it. It hashes
  the asset bytes rather than the build time, because the archive rebuilds every
  morning and the front end does not.
- `--gutter` is `clamp(1rem, 4vw, 3.5rem)`; `--measure` caps the wrap at 1180px.
- `--radius` is 3px. Everywhere. Chips and badges use 2px.

### Testing at a breakpoint on this machine

Chrome here reports `devicePixelRatio: 1` in a 1920px window, so the window
cannot be resized down to a phone width usefully. Nest an iframe instead:

```js
document.documentElement.innerHTML =
  '<body><iframe src="http://localhost:8899/dist/#/" width="390" height="1400"></iframe></body>';
```

`state` is declared with `const`, so it is a global binding but **not** a
`window` property - to poke at it inside a frame, use `frame.contentWindow.eval(...)`.
Function declarations (`renderFreshness`, `route`) *are* window properties.

## Constraints and things already ruled out

- **No framework, no build step.** Views are global functions in `views-*.js`,
  rendering by string concatenation into `innerHTML`. `build_site.py` copies
  `web/*.{html,css,js,svg,png,ico,webmanifest}` by extension, so a new `.js`
  file needs only a `<script>` tag in `index.html`.
- **Hash routing, not history routing.** The site is static files on a CDN with
  nothing to rewrite a deep URL back to `index.html`. A hash also survives being
  pasted into a chat window, which is how most of these links travel.
- **`ROOT` is detected, not configured** (`core.js`), so serving the repo root
  and serving `dist/` both work with no flag.
- **The nav has no room for an eighth item.** Seven links plus the theme toggle
  already fill the row at 1150px.
- **The wrap caps at 1180px** and widening it has not been tried. Tables that
  need more room scroll inside `.table-scroll`.
- **Every animation sits behind `prefers-reduced-motion`.** The chart draw-on is
  the one orchestrated moment; the skeleton shimmer stops too.
- **`localStorage` reads and writes must be inside `try/catch`.** A private
  window throws on access and the page must still render.
- **Search and browse are one page**, `#/series`. They were two, Browse and
  Find, which is why the site could not say where series lived: the navigation
  had no item meaning "series" at all. `#/browse` and `#/find` still route there,
  because they are in shared links.
- **Favourites, not "the desk".** The old name described what the page is for
  rather than what it is, and the star already looked like a favourites star.
  `#/desk` and `#/desk?s=` still work.
- **One vocabulary for the groups**, shared by the overview's headline table and
  the Favourites defaults: Foreign exchange, Policy rates, Money market, Treasury
  bills, Prices, External. Policy rates and money market are kept apart on
  purpose: the corridor is an instrument CBE sets, an interbank fixing is where
  money actually cleared, and calling both "money market" would be wrong.
- Search reaches series, documents, topics and the site's own pages, all through
  the palette. Its page entries carry the old names as hidden synonyms, so
  someone typing "desk" or "browse" still lands in the right place.
- **Two normalisations, and they must agree.** `normaliseQuery` folds a string
  with regexes; `normaliseWithMap` does the same folding a character at a time
  and records which input character produced each output character, which is what
  lets a search hit be highlighted in the text CBE printed rather than in our
  folded copy of it. Both must match `normalise()` in `ingest/extract_text.py`
  and `shard_of()` in `ingest/build_search.py`, or Arabic queries silently return
  nothing. The fast one exists because it runs over the whole catalogue; the slow
  one because it runs over a handful of pages.
- **Page text is published, gzipped, and inflated in the browser.** GitHub Pages
  serves a `.gz` as an opaque binary rather than sending `Content-Encoding:
  gzip`, so `DecompressionStream` does the work. Where it is missing, a result
  keeps its page number and loses only its quote.
- A snippet window goes where the **most distinct query terms fall together**,
  not at the first match. Search "reserve requirement ratio" and the first hit on
  a page is usually "ratio", in a sentence about something else.

## Being found, and being shared

Two things were true of this site for its first month, and both of them were
fatal to anyone ever seeing it.

**It was one URL.** Hash routing means every page is the same document, so the
sitemap could only list eight fragments and a crawler collapsed all eight to the
root. 1,317 series, 1,478 documents and 53,006 pages of extracted text were
invisible: not ranked badly, absent. `ingest/prerender.py` now writes every
route again as a real file - `dist/s/<id>/index.html`, `dist/topic/<key>/`,
`dist/docs/<id>/` - with a head of its own and a body that carries the figure,
the coverage and the last two dozen readings as ordinary HTML. The script then
takes over and re-renders in place, so nothing a reader sees changes.

Three things make that work, and each of them is load-bearing:

- **`MIQYAS_ROOT`.** `ROOT` in `core.js` is detected from the path, which cannot
  survive a page two directories down. Every pre-rendered document declares
  `window.MIQYAS_ROOT` before the first script. `window.*` rather than a
  `const`: a `const` in one script is a global binding but **not** a window
  property, so `typeof` on it from a script that ran first is a temporal dead
  zone throw rather than the `"undefined"` the fallback needs.
- **`MIQYAS_PAGE`.** The route the page was rendered for. With no hash it routes
  to itself; navigating anywhere else it `location.replace`s onto the real app
  document. Without that a reader ends up at `/s/<id>/#/rates`, which renders
  correctly and lies to the canonical link, the share card and everyone they
  paste it to.
- **The same stamp.** `stamp_html()` is split out of `version_assets()` so all
  2,800 documents point at the same hashed assets. A pre-rendered page that
  skipped it would reintroduce exactly the mixed-version breakage the stamp
  exists to prevent.

**Every link unfurled as the same picture.** One `og.png` of the dollar chart,
hard-coded, whatever the link pointed at. `ingest/build_og.py` draws one
1200x630 card per series and per subject, from `series.json` and `sparks.json`
only - never the observation arrays, which is what keeps a full pass under a
minute. Notes worth keeping:

- The arrows are **drawn as polygons, not typed**. U+25B2 and U+25BC are not in
  IBM Plex Mono, and a tofu box next to the number is the one thing on a share
  card nobody can explain away.
- Pillow here is built **without Raqm** (`PIL.features.check("raqm")` is False),
  so it cannot shape Arabic. `arabic-reshaper` plus `python-bidi` do it in pure
  Python, with no system dependency, which is what makes them safe on a runner.
- `use_unshaped_instead_of_isolated` is not optional. The reshaper emits Arabic
  Presentation Forms and **Almarai does not carry every isolated form in that
  block**: `(أ+ب+ج+د+هـ+و)`, which is how CBE labels the parts of a total, came
  out as six tofu boxes. Falling back to the plain letter is correct here
  because these are single letters with no join to preserve.
- **Wrap the logical string, shape each line.** Shaping first puts the text in
  visual order, and breaking a visual-order line leaves the halves of an Arabic
  title in the wrong sequence. Measure on the shaped form, though, or joined
  Arabic wraps early.
- The fonts are committed under `assets/fonts/`, about 560 KB of static IBM Plex
  and Almarai, so a runner draws in the site's own type. The fallback chain is
  still there and must stay: a card in DejaVu beats no card, and a missing image
  library must never be why a publish fails.

`sitemap.xml` is now an index over `sitemap-pages`, `sitemap-series` and
`sitemap-docs`. `lastmod` is the build date on everything, which is honest: the
archive rebuilds every morning whether a series moved or not, and inventing a
per-page date would mean tracking one.

Each series page also carries a **JSON-LD `Dataset`**. It is twenty lines, and
it is a route into Google Dataset Search that essentially nobody competing for
these queries has bothered with.

## Asking the questions people actually have

Everything above answers an analyst's question. Those are the right questions
and they are nobody's first one. The first one is personal and it is always a
version of the same thing: is this worth less than it used to be, and by how
much. `web/views-tools.js` answers three of them, on data the site already had.

**There was no price index, and there still is not one from CBE.** Inflation is
published as a rate and never as a level, which is fine for the news and
useless for "what is my salary worth". The 32 `EG.XL.PRICE.CPI.*` series in the
Excel archive are not a substitute: annual June snapshots, three to eleven
points each, two visible rebasings and a twelve-year hole. `ingest/derive_prices.py`
chains `EG.CPI.HDL.MOM` instead, from 100 in December 2004, and **refuses to
write if the result stops reproducing `EG.CPI.HDL.YOY`**. Today the median
disagreement across 248 months is 0.001pp. That check is the whole warrant for
putting a number about somebody's salary on a public page.

It does disagree in 2009 and 2010, by up to 1.8pp. That is CAPMAS rebasing the
basket, seen from the other side of the same event that drops
`EG.XL.PRICE.CPI.ALL_ITEMS` from 133.6 to 102.4 between those two Junes. A
chained index cannot see a rebasing and CBE never published the link, so the
calculators say so rather than hiding it.

**The MPC calendar is the one hand-entered file in the repository.**
`data/mpc_calendar.json`. CBE renders the year's meeting dates client-side and
`/api/sitecore/MPCMeetings/GetMPCMeetingsDetails` returns 404 to anything
outside their page, so there is nothing to scrape. Everything else here fails
loudly when it goes stale because a fetch stops returning rows; this cannot, it
just quietly stops having a next meeting. So `summarise.py --check` fails when
fewer than two meetings remain ahead, and every entry records the day it was
checked.

**Calls go nowhere.** The guess at the next decision lives in `localStorage`
under `miqyas.calls` and is scored against the archive, which arrives by itself
the morning after the meeting. No server, so no leaderboard, and also nothing
to explain about what happens to it.

## The revision record

`#/changes` is the one page here that no other source could publish even if it
wanted to, and it took thirty lines of `git log` parsing that had been sitting
unread since the first commit.

CBE overwrites its files in place when it revises a figure. There is no
changelog, no vintage, and no way to ask what a number read last month. This
repository commits every clean file every morning, so its own history *is* the
record of revisions. `ingest/build_changes.py` reads it.

It works because `data/clean/series/*.csv` is tidy long (`series_id,period,value`)
and `fetch_series.py` sorts by `(series_id, period)` before writing, so each
series is a contiguous block and a new reading appends inside its own block.
`git log -p --unified=0` then yields lone `+` lines for new readings and `-`/`+`
pairs for restatements.

**The thing that matters more than any of that: whose change was it.** A change
in a scraper commit means CBE published something different, which is a
revision. A change in a human commit means this project's parser changed and
the *reading* changed, which is our correction. The first pass conflated them
and reported **34,877 "CBE revisions" in one day**; they were commit `5ae8e0b`
recovering units for the Excel archive. The two are now counted separately and
never merged, because calling ours theirs is the one lie that would make the
page worthless. A scraper commit restating more than 500 values is also treated
as a reparse: CBE does not restate five hundred figures in a morning, and the
alternative is trusting a parser change that landed on the wrong side of a
commit boundary.

Two consequences worth stating plainly:

- **Publishing needs the full history.** `actions/checkout@v4` clones at depth 1
  and this then sees nothing at all, so `publish.yml` sets `fetch-depth: 0`.
- **The record is a month old and has caught no revisions yet.** The page says
  so rather than padding itself. That is the proposition: it starts here, and
  every morning the scrape does not run is a day that cannot be recovered.

`data/clean/anomalies.csv` gives the page something real on day one: seven dates
where CBE published two different values for the same figure *inside one file*,
which needs no history to catch.

**The entry point is the freshness strip, not the nav.** The nav was full at
eight items and it must never be what gives way; the strip is already on every
page and already about how fresh it is. The counts ride along in `status.json`,
which `renderFreshness` already fetches, so no page that is not the change log
pays for `changes.json`.

## Voice

Short declaratives. Say the limitation rather than hiding it - "Honesty is
cheaper than a footnote later" is the About page and also the rule. Name the
source. Never claim more than the data supports: the site is rebuilt every
morning, but 961 of 1,317 series are quarterly, so *most numbers do not move
daily* and the copy should not imply they do.

**No em dashes.** Use a spaced hyphen. Grep before declaring anything done.
