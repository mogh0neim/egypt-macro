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
| `--brass` `#7e6024` → `--gold` | structure | brass inscription |
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

**Every text colour reaches 4.5:1 on every background it sits on, in both
themes** (decided 11 October 2026). Measured, not eyeballed: the old quiet grey
`#8b93a7` was 2.8:1 on the page and the old brass `#a8823a` 3.2:1, and between
them they coloured every unit, date, axis label, eyebrow and note on the site.
Now light `--text-3` is `#646c82` (4.75 on the page, 5.2 on white), light brass
is `#7e6024` (5.3, and 4.5 on the stale strip's tint), dark `--text-3` is
`#8a94ae` (5.2 on `--surface-2`), and dark `--accent-quiet` is `#12292a` so the
teal on it reaches 4.7. Text on a teal fill uses `--on-accent`: white in light,
ink in dark, because white on the dark theme's lighter teal was 3.3:1. Never
put `opacity` on text; the chart's regime labels had 0.8 and read at 2.5:1.
The favicon keeps the original brass: it is a mark, not text.

## Type

Three faces, served from the site itself: `web/fonts/` holds the woff2 files
Google Fonts served for these families and weights, in the Latin, Latin
Extended and (for Almarai) Arabic subsets, and the `@font-face` rules at the top
of `styles.css` carry Google's own `unicode-range`s, so a browser fetches only
the subsets a page uses and the type looks exactly as it did. They used to come
from Google on every page load, which handed Google every reader's address and
was a second host to wait for. **No page load may ask any other host for
anything** (GoatCounter, when switched on, is the one exception, and About
says so). `build_site.py` copies the folder to `dist/fonts/`; the stylesheet
names the files relative to itself, so they resolve at any depth.

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
| `.masthead` | Sticky, 62px, `--surface`. **The nav must never be what gives way** - it is the only route to most pages. `.quick` is the flexible item and disappears at 1150px; the nav keeps its width. Seven items, led by Overview, What changed and Data, because the dataset and the revision record are what the site is for. The calculators and Favourites are off the row on purpose and reached from the overview, the footer and the search box. |
| `.independence` | One line under the masthead on every page: "Independent project. Not affiliated with, endorsed by, or connected to the Central Bank of Egypt. Official figures: cbe.org.eg." It is in `index.html`, so every pre-rendered page, `/ar/` and `404.html` inherit it, and `prerender.py` translates it with the chrome. `--text-2` on `--surface-2`, 6:1 or better in both themes; never `--text-3`, which is how the footer version ended up at 3:1. |
| `.freshness` | Thin strip under the masthead, from `status.json`. Turns gold and warns when the build is over 36h old. Scrolls away; the footer repeats it permanently. |
| `.hero` | `--surface`, bottom border, headline + `.standfirst` + a full-bleed chart (`.hero-chart` negates the gutter) + `.readout`. On the overview the headline is one sentence saying what the site is (`h1.hero-line`, set below headline size) with two `.hero-actions` buttons, Download the data and See what changed, both above the fold at 360 by 780. |
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
| `.call` | The next-decision panel at the top of `#/rates`: the date and how far off it is, nothing to press. A `band-inset`, because it is a self-contained aside rather than a section of the page. The only thing on the site pointing at a date that has not happened yet. |
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
- **Two levels on one axis are rebased to 100 at one shared date, and the
  readout names it** (`comparePair`). A level in pounds and a level in dollars
  on one axis is a lie told with a straight line. Each line used to be rebased
  at its own first reading, years apart, under a label saying they shared a
  base. The date is the first both series have a reading, or the later of the
  two starts with the earlier series read at its value in force that day. A
  rate, or anything that crosses zero, is never rebased (the rule
  `transformsFor` applies): two of those in one unit are drawn as published,
  and a pair that cannot share an axis honestly is not drawn together, with one
  line saying why.
- **Two sets that bound a third are a band**, not two lines (`opts.band`).
- **Event labels are dropped rather than allowed to overprint.** November 2016
  had three devaluations in three weeks. Room is the label's own width, never a
  fixed allowance (a fixed 42 units let two "+16%" overprint on a phone), and
  the biggest move is placed first, so the 2016 float's +67% never loses its
  label to a +14% that came earlier. Regime names are measured the same way.
- **A marker says what it marks.** A bare "+16%" told nobody what moved or when.
  When the crosshair is within a few units of a marker the readout gives its
  sentence ("Official dollar rate +16% in one business day: 19.77 to 23.00 on
  27 Oct 2022"), and it always names the regime under the crosshair, so a label
  dropped for room is still one tap away.
- **A stepped series reads the level in force.** The crosshair on a policy rate
  takes the last observation on or before the moment, with the day it was set,
  because that is what the square corners draw. Nearest-in-time showed the next
  decision's rate for the second half of every gap: 20 September 2022 read
  13.25% when 11.25% was in force. Before its first reading a stepped set has no
  value, not its first one. Smooth series keep the nearest reading.
- **A tap reads the chart.** A finger that taps and lifts sends no pointermove,
  so `pointerdown` reads it too. Nothing calls `preventDefault` and `.chart` keeps
  `touch-action: pan-y`, so a vertical swipe that starts on a chart still scrolls.
- **The axis is measured, not assumed.** Past a million the y axis counts in mn
  or bn (T-bill amounts are whole pounds and printed "0,000,000" off the left of
  a phone), and the left margin is sized from the widest label drawn. The
  multipliers stay Latin on `/ar/`, like `%` and `pp`.
- **Months under two years.** Below that span the x axis counts months off a
  ladder that always keeps January, with the year at January and on the first
  tick; "1 year" used to carry one label and "This year" none. Any x label that
  would touch its neighbour or leave the frame is dropped.
- **One or two readings are points, not a line** (`sparseChart`). One reading
  drew an empty frame with an invented axis; two drew a diagonal that reads as a
  trend. Each reading is a marked point with its value and date, and one line
  says why there is nothing more.
- **Redrawn when the width changes**, which follows from the viewBox rule: a
  phone turned on its side otherwise stretches a 340-unit chart to 718 pixels
  and 10px labels to 28. `mountChart()` draws, arms, wires and registers a chart
  with `keepSized()`; only a change in the width a chart would be drawn at
  redraws it, because a phone's address bar fires resize on every scroll.
- **Charts are pinned left to right**, and `chartText()` sets an Arabic label
  right to left on its own with its anchor swapped. An SVG label inherits the
  page's direction, and under rtl "start" is the right-hand end: "Managed peg"
  ran off the left of the dollar chart on `/ar/` and "+16%" printed as "16%+".
- **Only transformations that mean something are offered** (`transformsFor`).
  Year-on-year and rebased both divide by an earlier reading, which is nonsense
  for a rate (inflation's year-on-year change read 20.83% against 14.5%) and for
  anything that crosses zero. Decided from the unit and the values, and a
  withheld button gets one line saying why rather than just not being there.
- **Range windows count back from the series' own last reading** (`rangesFor`
  gives each window as the date it starts). Counted from today, "1 year" on a
  series that stopped in 2023 cut nothing, fell back to the whole history, and
  exported it labelled "Range: 1 year".
- **One precision per series in a readout** (`digitsFor`), from its largest
  reading, so a value does not gain and lose decimals as the crosshair moves.
- **The corridor is a band wherever it is drawn**: on the Rates page too, with
  the discount rate as the one line through it, because three step lines a
  point apart overprinted. A legend key and its name are one `.item`, so a
  wrapping legend never strands a key at the end of a line. Sparklines of
  stepped series step as well.
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
  `dir="auto"`. On `/ar/` it returns the Arabic title (see Arabic, below).
- `periodLabel` - **a reading is written at the size of its period.** A day for
  daily, weekly and irregular series, "Jun 2026" for a monthly one, "Q2 2026"
  (the calendar quarter, whatever fiscal year it falls in) for a quarterly one,
  and "FY2019/20" for a year dated 30 June. "1 Jun 2026" read as a day and
  "30 Jun 2020" read as calendar 2020. Decided from the date as well as the
  frequency: a date that is not a period end keeps its day, which catches the
  series filed as quarterly that carry month-end readings. `RELEASE_DATED`
  (net international reserves) keeps its day too, because its date is the
  press release's, not the month's.
- `whenLabel` - the newest reading on a home tile: the period it is for, or
  what kind of date it is ("released", "in force since", "issued"). Miqyas
  does not record CBE's release dates for monthly and quarterly series, so
  those say the period only, and a tile whose series has gone quiet says "no
  newer reading held" under it.
- `num` - **every count goes through it.** A bare `toLocaleString()` follows the
  browser, and a browser set to Egyptian Arabic printed "١٬٣١٨" beside "52.46".
- `isoLTR` / `bdiLTR` - a signed figure or a Latin run held left to right inside
  an Arabic line. `fmt` isolates its own negatives on `/ar/`, which is what keeps
  "-5,554" from printing as "5,554-".
- `tf` - `t()` with `{placeholders}`, so an Arabic sentence is translated whole
  and the figure goes where Arabic grammar wants it. Counts in Arabic are said
  with a colon ("القراءات: 93") wherever the noun would otherwise have to agree
  with a number the code does not know; `countWords` does the four Arabic forms
  for days, weeks, months and years.

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
- **Layout shift stays under 0.1** on home and a series page, at 360 and 1366
  (measured with a `layout-shift` PerformanceObserver: 0.0001 to 0.0008, from
  0.5 to 0.9). Two things held it there: `#app` starts `min-height: 100vh`, so
  the footer is below the fold before, during and after a view draws, and the
  freshness strip's one line is held open, invisible, until `status.json`
  fills it. Anything new that appears above the page area after the first
  paint needs its space reserved the same way.
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
- **The chrome links to real paths; a click is still a hash route.** The nav,
  the footer and the home page's static HTML say `changes/`, `data/`,
  `topic/fx/`, because a crawler follows a path and ignores a hash, and
  `prerender.py` writes a page at each one and points every deeper or Arabic
  page's copies at its own language's home. `app.js` turns a plain click on
  such a link into the hash route, so nothing a reader sees changes; a new-tab
  click, a download, the other language and other sites go to the browser.
  Links inside the views are still `#/`.
- **Only the newest navigation draws** (`routeSeq` in `app.js`). Views fetch
  before they draw, so two quick taps let the slower, older view draw last:
  Rates under an address and a highlighted nav item saying About. Every
  navigation gets a fresh `<main id="app">`, the screen moved into it, so an
  older view that finishes late writes into a node no longer in the page, and
  the error screen, the scroll and the visit count check the number first. A
  view that looks up its own elements after an await should also stop on
  `if (!app.isConnected) return;`, as the calculators and Favourites do; the
  star is delegated from the document because `#app` is replaced.
- **`ROOT` is detected, not configured** (`core.js`), so serving the repo root
  and serving `dist/` both work with no flag.
- **The nav has no room for an eighth item.** Seven links plus the language
  switch and the theme toggle fill the row at 1150px. Adding one means taking
  one off, as Work it out and Favourites were to make room for What changed.
- **The wrap caps at 1180px** and widening it has not been tried. Tables that
  need more room scroll inside `.table-scroll`.
- **Every animation sits behind `prefers-reduced-motion`.** The chart draw-on is
  the one orchestrated moment; the skeleton shimmer stops too.
- **`localStorage` reads and writes must be inside `try/catch`.** A private
  window throws on access and the page must still render.
- **Anything read back from storage is checked before it is drawn.** Any page
  on the same origin can write it (on `github.io` that is every project site
  under the account), so the palette's recent items are kept only if the
  address is a plain `#/` route and the labels are text, and the address is
  escaped like everything else.
- **A shared favourites list is added to the reader's own, never put in its
  place.** "Save these as mine" replaced a list someone had built, with no
  undo; the button now says "Add these to your favourites" and merges.
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
  one because it runs over a handful of pages. Since October 2026 there are four
  pairs, not two: `normalise()` / `normaliseQuery` and `normaliseWithMap`
  (Persian letter forms folded, Arabic punctuation a space, "٫" a decimal
  point), `_TOKEN` / `SEARCH_TOKEN` (numbers whole, decimals included,
  thousands commas dropped), `stem()` / `stemArabic` and `shard_of()` /
  `shardFor`. Checked by running both sides, Python and a headless browser,
  over 1,308 corpus pages: zero differences in index terms or shard numbers.
  Compare them on real pages again after touching any of them.
- **Light Arabic stemming, on both sides.** The article (with و ب ف ك before
  it, or as لل) and the sound plurals ات ون ين come off an Arabic term in the
  document index and in every query. A stem is always a stretch of the printed
  word, which is what lets the snippet still find and mark it. Broken plurals
  ("أسعار" for "سعر") cannot be stemmed that way; the series boxes carry a
  short table of them, the document index does not.
- **The search skips what the index cannot have, and says so.** Stop words and
  terms on more than 28% of pages are not indexed; `meta.json` lists them as
  `ignored`, and the documents page drops them from a query and prints
  "Ignored: net". Requiring them made "net international reserves" answer that
  no page had those words.
- **Numbers are terms, and no term is capped.** The 4,000-page cap kept a
  third of the pages for "external", "debt", "exchange" out of the index, and
  every number was dropped, so "18136.2" and "MPC July 2024" found nothing.
  Both changes took the index from 47.5 MB to 116.6 MB written plainly; postings
  packed as gaps (`packed()` in build_search.py) and 512 shards instead of 256
  bring it to 74.8 MB, with a median shard of 135 KB against 172 KB before.
  One shard is what a query term costs, so a search downloads less than it did.
- **Filter, then cut, then count.** The year, topic and kind filters run on
  every hit before the list is cut to 60, and the count line gives the real
  total: "Top 60 of 4,579".
- **The documents box searches inside the text by default,** after a 350 ms
  pause in typing. A title search answering "no title matches" read as "not in
  the archive".
- **The split lam-alef is repaired by vocabulary, at build time.** PyMuPDF
  reverses the لا ligature in 370 of the documents ("خالل" for "خلال"). The
  damaged pair also spells the article, so it is undone word by word against
  how the undamaged documents spell it (`LamAlef` in extract_text.py).
  build_search.py indexes the repaired words and build_pages.py publishes the
  repaired text, from the text already in `corpus/pages`, so no PDF has to be
  extracted again and the stored corpus keeps what the extractor produced.
- **Series are ranked, not listed.** `rankSeries` in core.js, used by the
  Series page, the favourites panel and the palette: words landing at the
  start of a word, then a short headline list (headline CPI, the official
  dollar rate, the corridor, net international reserves, total external debt,
  GDP at market prices, the treasury bill yields), then active over stale, then
  length of history. The headline list names daily series by id and Excel
  series by family and title, never by an `EG.XL.*` id, because those ids are
  being rebuilt. Market words CBE does not use (T-bill, 364, MPC, policy rate,
  USD, money supply, and their Arabic) are matched as if they were in the title.
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
these queries has bothered with. Two rules for it:

- **No `license`.** It used to point at the repository's MIT licence, which
  told every dataset catalogue that CBE's numbers were licensed by Mo. The code
  is MIT; the data is CBE's. `usageInfo` points at the About page, whose terms
  say exactly that, and the pre-rendered About page carries those terms in its
  HTML so a crawler reads them.
- **Escaped for a script element.** `json.dumps` leaves `<` alone, so a title
  containing `</script>` would have closed the block and run whatever came
  next. `<`, `>` and `&` go out as `\u003c`, `\u003e` and `\u0026`.

**The not-found page is written, not copied.** `404.html` used to be a copy of
`index.html`, whose asset links are relative, so at `/s/NOPE/` every stylesheet
and script 404'd and the page was blank. `prerender.py` writes it with every
asset, `MIQYAS_ROOT` and the way home taken from the site root, which it reads
off `SITE_URL`, and with `MIQYAS_MISSING` set. `app.js` then reads the address
that was asked for as a route: a series id that lost its tail gets the series
view's nearest matches, anything else the not-found screen, and a click on
anything hands off to the app document as a pre-rendered page does.

**The site's address is set once**, as `url` in `site.toml` at the top of the
repository. `ingest/site_config.py` reads it, checks it and always gives it a
trailing slash, and every script that needs it imports `SITE_URL` from there:
`prerender.py` (canonical, `og:url`, share cards, hreflang, JSON-LD, the
not-found page's root), `build_site.py` (sitemaps and `robots.txt`) and the
feeds in `build_changes.py`. `web/index.html` carries `{{SITE_URL}}` where the
canonical and share-card addresses go, and `build_site.py` fills it in before
anything is written from that template, so the source has no address typed in
it at all. The front end works out its own from `ROOT` (`siteBase()`), which is
what the copy-paste API examples are built from. A domain move is that one
line; README.md has the steps around it.

**The home page has a heading and links before any script runs.** Its static
body used to be a loading skeleton: no `h1`, no link a crawler could follow.
`home_body()` in `prerender.py` writes the overview's own heading and two
buttons and a plain link to each subject, in both languages, and the view
replaces it as it replaces every pre-rendered body.

**Counting visits is prepared and off** (`web/counter.js`, `goatcounter` in
`site.toml`). Off, nothing is sent. On, each route sends GoatCounter one
request from the site's own code, never GoatCounter's script: the route's name
and nothing after "?", because the hash is where searches, salary figures and
shared lists live; an id only when it is one the site has, anything else as
`/not-found`; `/ar` in front on the Arabic site; the referring site by its
origin, once; no cookies, no screen size, and never from `localhost`. The About
page's privacy paragraph is `privacyNote()` in the same file and is written
from the same setting, so it cannot say something the build does not do. The
order matters and was kept: fonts were self-hosted first, so the "no other
host" sentence was true before anything was allowed to break it.

**Counts are never typed.** The pre-rendered titles fill `{series}`,
`{documents}`, `{pages}` and `{decisions}` from the build's own files, and the
placeholders sit inside the dictionary keys so the Arabic carries them too. The
front end reads counts from the catalogue it has loaded. Prose that cannot do
either says "about one in twenty" or nothing. Four different page counts were
live at once before this.

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

**What is typed is read strictly, and a problem is said, not answered round.**
A month of "garbage", or one after the index ends, used to be read as the last
month and compared with itself ("EGP 8,000 then is EGP 8,000 now"); a date
before the data printed nothing; `parseFloat` read "8,000" as 8; a savings
date after the last price month was told prices had risen 1x. `readAmount`,
`readMonth` and `readDay` in `views-tools.js` return a value, nothing, or
"bad", and the page prints one line under the form saying which and what range
Miqyas holds. The savings answer names both "now" dates, the last price month
and the last dollar day, and a dollar rate taken from more than four days
before the date asked for is named as such, because the archive has holes of
seven and eight weeks in 2014 and 2015 that are not CBE's doing.

**The MPC calendar is fetched, with a hand-entered fallback.**
`ingest/fetch_mpc_calendar.py` reads CBE's schedule from
`/api/sitecore/MPCMeetings/GetMPCMeetingsDetails`, which answers a POST with
browser-like headers and returns 404 to a GET (the GET was all that had been
tried, so this file was typed by hand until October 2026).
`data/mpc_calendar.json` remains the fallback. Everything else here fails
loudly when it goes stale because a fetch stops returning rows; this cannot, it
just quietly stops having a next meeting. So `summarise.py` warns when fewer
than two meetings remain ahead, `summarise.py --calendar` turns the daily run
red once none is left, and every entry records the day it was checked. That
step runs after the commit: it used to sit inside `--check`, before the commit,
which would have stopped the daily data being saved from 30 October 2026 until
someone typed in the 2027 dates.

**No guessing game.** The Rates page used to invite a Cut / Hold / Raise guess
at the next decision, kept in `localStorage` under `miqyas.calls` and scored
against the archive. It was removed on 10 October 2026: a vote on what the
committee will do is commentary, not record, it sat above the history the page
exists for, and a neutral archive of a central bank's decisions should not be
asking its readers to bet on them. The next meeting date stays, as a plain
fact. Nothing reads `miqyas.calls` any more; a browser that still holds it
keeps a few bytes nobody looks at.

## The revision record

`#/changes` reads the dated copy of CBE's tables that every run commits, and it
took thirty lines of `git log` parsing that had been sitting unread since the
first commit. Say what it covers and no more: the daily tables from 20 August
2026, the auction tables, and the weekly archive checked by Last-Modified.

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

**The nav and the freshness strip both lead here.** What changed is the second
item in the nav, because the dated archive is one of the two things the site is
for. The strip on every page also links to it, counting new readings and
revisions apart ("159 new readings, 0 revisions"): "numbers moved" read as
values that had changed when it counted values that were new. The counts ride
along in `status.json`, which `renderFreshness` already fetches, so no page
that is not the change log pays for `changes.json`.

## Arabic

Egypt reads Arabic. The data is Egyptian, the source is Egyptian, and every
word of the site around it was English. That is not a localisation nicety, it
is most of the audience.

**`t()` is keyed on the English string itself**, not on an invented identifier.
The views build their markup by string concatenation, so `home.hero.title`
would replace readable prose with opaque tokens across five thousand readable
lines; and, more importantly, a missing translation then falls back to correct
English rather than to the word `home.hero.title`. On a site with 370 strings
and one translator, failing soft in the right language beats tidiness. An
untranslated string is English on an Arabic page: visibly unfinished, never
broken.

A key may carry a disambiguator after a pipe, because keying on the source
collides two senses of one word. `t("Series|one row of a table")` is السلسلة
where the nav item `t("Series")` is السلاسل, and both fall back to "Series".
Only a pipe with no space before it is a disambiguator: `tr()` in
`prerender.py` used to cut " | Miqyas" off every English page title too.

**`/ar/` is a directory of real files**, not a switch. A hash cannot be indexed
and a query string is a different page to nobody, so `prerender.py` runs twice
and writes 2,821 Arabic pages beside the English ones, each pair pointing at
the other with `hreflang` plus an `x-default`. The language switch is
navigation, and it carries the route across: somebody reading the dollar series
in English lands on the dollar series in Arabic, not back at the front page.

`ROOT` always points at the site root from wherever a document sits, so the
English site is `ROOT + "/"` and the Arabic one is `ROOT + "/ar/"`. Adding
another `../` for Arabic, which is the obvious-looking thing to do, walks out
above the site.

**What is not translated, on purpose:**

- **Digits stay Western.** Egyptian financial media, CBE's own releases and
  every bank statement in the country use 0-9. Arabic-Indic digits would also
  break `font-variant-numeric: tabular-nums`, which is what keeps a column of
  rates aligned.
- **Charts stay left to right.** Time runs left to right in every chart anyone
  reads, Arabic publications included. `lineChart`, `gauge` and `spark` keep
  their geometry, and `wireHover` keeps working because it maps a real
  `clientX` through the SVG's own box.
- **The Arabic title leads on `/ar/`, and the ones Miqyas wrote say so**
  (decided 11 October 2026, replacing "series titles are CBE's"). Every series
  now has an Arabic title: CBE's for the Excel archive, where it names the line
  of the table only, and Miqyas's own for the 223 FX, price, policy rate and
  treasury bill series CBE names in English alone (`title_ar_source:
  "miqyas"`). `titleHTML`, `titleText`, `lineHTML` and `tableText` give the
  Arabic in headings, tables, search results, the tab and the citation; CBE's
  English title is the second line (`titleAlt`, `.alt-en`), because it is the
  name the Bank publishes. A title Miqyas wrote carries a dotted underline and
  a tooltip wherever it appears, a visible sentence under the series heading,
  and a sentence in the citation. The Excel tables have no Arabic name, so a
  table heading stays English on `/ar/`, held left to right.
- **What stays English says so.** CBE publishes the rate statements and lists
  its documents in English only: the statement links on `/ar/` read "البيان
  بالإنجليزية" and a pre-rendered Arabic document page says its title is
  available in English only. Neither is half translated.

**The chrome is translated in Python**, by `translate_chrome()` reading the same
`AR` dictionary out of `i18n.js`. The masthead, footer and palette are HTML
before any script runs, so translating them in the front end would show a row
of English nav items until the script caught up.

**`t` is now a global**, so a local binding of that name inside a function that
needs to translate is a bug waiting for whoever adds the next string.
`applyTheme(t)` and `titleHTML`'s `const t` have been renamed. Roughly twenty
`.map((t) => …)` callbacks remain: harmless today, and the reason not to call
`t()` inside one without renaming it first.

The CSS cost was almost nothing, because the stylesheet was already logical:
twelve `text-align`, four `border-left`, the skip link and one gradient. The
`[dir="rtl"]` block at the end of `styles.css` is the whole of the rest.

## Citing it, and finding the page again

Decided 11 October 2026, for the people who save and cite pages.

- **One series, one address.** `seriesURL(id)` is the pre-rendered page,
  `/s/<id>/` (or `/ar/s/<id>/`), which carries the series' own title and share
  card. "Copy a link" copies that, never the hash route or the
  `/s/<id>/#/s/<id>` a pre-rendered page ends up at. The CSV header names it.
- **The citation can be followed and checked.** `citation()` gives the source,
  the title, the series id, "data to" the newest period, the address and the
  build date from `status.json`. It used to end with the reader's own clock,
  so two readers on the same day cited different things. A computed series is
  credited to Miqyas, computed from CBE data. "Copy the citation" copies the
  plain text.
- **Every page names its tab.** `pageTitle()`; `app.js` sets one per nav key
  (`TAB_TITLES`) and the series, subject and money market views name
  themselves once their data has arrived.
- **Rate decisions carry a download and source block**: every decision as CSV,
  written in the browser from the rows the list is drawn from, the JSON, the
  corridor as a series, where the rates come from, and a citation.
- **The field and date guide is `#/data/guide`**, rendered by `viewData`, which
  reads the hash, so the router needed no new route and the nav keeps Data lit.
  It says what each column means and how each family is dated: CBE's monthly
  tables by the 1st, the Excel archive by the period end, policy rates by the
  day a level took effect, auctions by issue date, reserves by the press
  release. A join on the date column between two of those matches nothing.

## Voice

Short declaratives. Say the limitation rather than hiding it, under a plain
heading ("Known limits"). Name the source. Never claim more than the data
supports: the site is updated daily, but most series are quarterly, so *most
numbers do not move daily* and the copy should not imply they do.

**Neutral about CBE** (decided 10 October 2026). The record is "revisions to
published figures". Never "quietly restated", "caught in the act", "kept
honest", "the only record", "nothing else does", or "mirror": each says
something about CBE's intent, or about completeness, that the site cannot
back. Say what Miqyas holds, not what CBE did: "No newer reading here. Miqyas
holds no value after...", not "CBE has published nothing new". Excel series
are "dated by Miqyas", computed series "computed by Miqyas", and only the daily
tables are "reproduced as published". Say "updated daily", never a clock time:
the job is scheduled in the morning and GitHub often starts it hours late.

**Who runs it, and how to reach him.** About names Mohamed Ghoneim and carries
the removal line, "If anything here should not be, contact me and it will be
removed.", which is also under the document search results. The contact is
`CONTACT_URL` in `core.js`, the GitHub issues page for now, and nowhere else.
The one attribution sentence ("Source: Central Bank of Egypt
(https://www.cbe.org.eg). Republished by Miqyas, an independent project...")
is `ATTRIBUTION` in `core.js`, `build_exports.py` and `prerender.py`, and goes
in every file a reader takes away.

**No em dashes.** Use a spaced hyphen. Grep before declaring anything done.
