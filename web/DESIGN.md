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

Standing rules:

- **`documentElement.scrollWidth` must equal `clientWidth` at 360px on every
  route.** Wide content scrolls inside its own `overflow-x: auto` container
  (`.table-scroll`, `pre.code`), and the page body never scrolls sideways. This
  check is what caught `select.chip { max-width: 22rem }` (352px) overflowing a
  358px viewport.
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
- Search reaches series and documents. It does **not** index the site's own
  pages.

## Voice

Short declaratives. Say the limitation rather than hiding it - "Honesty is
cheaper than a footnote later" is the About page and also the rule. Name the
source. Never claim more than the data supports: the site is rebuilt every
morning, but 961 of 1,317 series are quarterly, so *most numbers do not move
daily* and the copy should not imply they do.

**No em dashes.** Use a spaced hyphen. Grep before declaring anything done.
