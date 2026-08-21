/* Miqyas -- shared core.
 *
 * Everything more than one view needs: where the data lives, how a number is
 * formatted, how a chart is drawn, and the topic taxonomy that turns 1,300
 * machine-named series into thirteen things a person can click.
 *
 * No framework and no build step. The whole site is rendering over static
 * JSON, which is the right size for a dataset that changes once a day.
 */

/* The site is published with the API as a sibling of index.html. Served from
 * the repo root instead -- which is what `python -m http.server` at the top
 * of a clone gives you -- index.html sits in web/ and the API is one level
 * up. Detect rather than configure, so both work with no flag. */
const ROOT = location.pathname.includes("/web/") ? ".." : ".";
const API = ROOT + "/api/v1";
const SEARCH_BASE = ROOT + "/search";

const state = {
  index: null,      // catalogue: one light record per series
  byId: null,
  events: null,
  sparks: null,
  mpc: null,
  status: null,     // built_at, last_scrape, and the headline counts
  cache: new Map(), // full observation arrays, by series id
};

/* ---------- remembered preferences ----------
 *
 * localStorage throws outright in a private window and in some embedded
 * contexts, so every touch is guarded and every read has a default. Nothing
 * kept here is worth a broken page: it is a remembered range and, later, a
 * watchlist.
 */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("miqyas." + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("miqyas." + key, JSON.stringify(value));
    } catch (err) {
      /* nothing to do: the preference is a convenience, not state */
    }
  },
};

/* ---------- the watchlist ----------
 *
 * A list of series ids in localStorage and nothing more. No account, no server,
 * no sync: this is the difference between a site someone reads once and one they
 * open every morning, and it does not need to be more than a list.
 *
 * Every read goes through store, which swallows the exception a private window
 * throws, so a desk still renders from its defaults rather than showing a blank
 * page to anyone with site data turned off.
 */

const watchGet = () => {
  const raw = store.get("watch", []);
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
};

const watchHas = (id) => watchGet().indexOf(id) !== -1;

const watchSet = (ids) => store.set("watch", ids.slice(0, 200));

/* Returns the new state, so a caller can update its own buttons without reading
 * storage again. */
function watchToggle(id) {
  const ids = watchGet();
  const i = ids.indexOf(id);
  if (i === -1) ids.push(id);
  else ids.splice(i, 1);
  watchSet(ids);
  return i === -1;
}

/* The star, wherever a series is listed. A button rather than a link, because it
 * changes something instead of going somewhere, and because a nested anchor
 * inside a row that is itself a link would be unclickable. */
const starButton = (id) => {
  const on = watchHas(id);
  return (
    '<button class="star' + (on ? " on" : "") + '" data-star="' + esc(id) +
    '" aria-pressed="' + on + '" title="' + (on ? "On your desk" : "Keep this on your desk") +
    '" aria-label="' + (on ? "Remove from your desk" : "Keep on your desk") + '">' +
    (on ? "★" : "☆") +
    "</button>"
  );
};

/* ---------- formatting ---------- */

const ARABIC_RE = /[؀-ۿ]/;

const esc = (s) =>
  String(s === null || s === undefined ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

/* Titles come out of CBE's own spreadsheets, and a few hundred rows are
 * labelled only in Arabic. Rendering those left-to-right mangles them, so
 * anything with Arabic in it is marked up rather than silently broken. */
const titleHTML = (s) => {
  const t = (s && (s.title_en || s.series_id)) || "";
  return ARABIC_RE.test(t) ? '<span dir="auto">' + esc(t) + "</span>" : esc(t);
};

/* CBE holds an Arabic title for 1,095 of the 1,317 series, and the site has only
 * ever used it as invisible search fodder.
 *
 * Shown where a reader is identifying a series rather than reading values off
 * one: the series page, search results, the palette. Not inside a table, where
 * it would double the height of every row for someone who arrived by browsing a
 * topic and already knows what they are looking at.
 *
 * Nothing is rendered for the 222 series without one. A placeholder would be
 * worse than an absence, because it would imply CBE published a name it did
 * not. */
const titleAR = (s) => {
  const ar = s && s.title_ar;
  if (!ar || ar === s.title_en) return "";
  return '<span class="ar" dir="rtl" lang="ar">' + esc(ar) + "</span>";
};

const fmt = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  // Exact zero gets no decimals at all. "0.0000%" is four digits of precision
  // spent saying nothing, and it appears wherever CBE publishes a zero.
  const digits = v === 0 ? 0 : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return /percent/i.test(unit || "") ? s + "%" : s;
};

/* Axis labels are a different problem from values: they should carry exactly
 * as many decimals as the gap between them needs, and never render as "-0". */
const fmtTick = (v, step, unit) => {
  const digits = step >= 10 ? 0 : step >= 1 ? 1 : step >= 0.1 ? 2 : 3;
  let s = v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return /percent/i.test(unit || "") ? s + "%" : s;
};

/* A change of 0.1657 EGP is noise on the page; two significant figures says
 * the same thing. Percentages keep their decimal, because 25 basis points is
 * a real decision. */
const fmtChange = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const pct = /percent/i.test(unit || "");
  const digits = pct ? 2 : abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return pct ? s + "pp" : s;
};

/* A change that rounds away to nothing is not a rise. fmtChange has already
 * decided how many decimals the unit deserves, so ask it rather than invent a
 * threshold: whatever it prints as zeros is flat, gets no arrow, and gets no
 * colour. Without this, a 0.001pp move on the 12-month bill renders as
 * "▲ 0.00pp", which claims a rise that did not happen. */
const isFlat = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return true;
  return !/[1-9]/.test(fmtChange(v, unit));
};

const dirClass = (c, unit) => (isFlat(c, unit) ? "" : c > 0 ? "up" : "down");
const dirArrow = (c, unit) => (isFlat(c, unit) ? "" : c > 0 ? "▲" : "▼");

/* The whole change, arrow and all. A flat reading gets a word rather than a
 * signed zero, so a table of held rates reads as held. */
const changeCell = (c, unit) =>
  c === null || c === undefined || Number.isNaN(c)
    ? "—"
    : isFlat(c, unit)
    ? "flat"
    : dirArrow(c, unit) + " " + fmtChange(c, unit);

/* Short unit tag for places the full string will not fit. */
const UNIT_SHORT = {
  "USD million": "$ mn",
  "USD billion": "$ bn",
  "EUR million": "€ mn",
  "GBP million": "£ mn",
  "EGP million": "EGP mn",
  "EGP billion": "EGP bn",
  "EGP per USD": "EGP / $",
  "EGP per unit of foreign currency": "EGP",
  "percent per annum": "p.a.",
  percent: "%",
  ratio: "ratio",
  index: "index",
  thousand: "thousands",
  number: "count",
  EGP: "EGP",
};
const unitShort = (u) => (u ? UNIT_SHORT[u] || u : "");

/* The unit as a tag to set beside a formatted figure. Empty when fmt() has
 * already said it: "14.90%" needs no "%" after it. */
const unitTag = (u) => {
  const short = unitShort(u);
  return short === "%" ? "" : short;
};

const FREQ_LABEL = {
  A: "Yearly", Q: "Quarterly", M: "Monthly", W: "Weekly",
  BW: "Every two weeks", D: "Daily", IRR: "Only when it changes",
};

/* What a change is actually measured against. "Since the previous reading" is
 * true of every series and therefore tells you nothing: a dealer reading a
 * daily fixing and an economist reading a quarterly account are being told
 * about very different spans of time. */
const CHANGE_LABEL = {
  A: "on the year", Q: "on the quarter", M: "on the month",
  W: "on the week", BW: "on two weeks", D: "on the day",
  IRR: "since it moved",
};
const changeLabel = (freq) => CHANGE_LABEL[freq] || "on the previous reading";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const niceDate = (iso) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0];
};
/* Written out in full on purpose. "Aug 26" is read as the twenty-sixth of
 * August by most people and by every non-native reader, and it means August
 * 2026. Two characters is a cheap price for not being ambiguous about a date
 * on a page of interest rates. */
const shortDate = (iso) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return MONTHS[+p[1] - 1] + " " + p[0];
};

/* "3 days ago" is the fastest way to tell a live daily series from a
 * quarterly one that is two revisions behind. */
const staleness = (iso) => {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 1) return "today";
  if (days < 14) return days + " days ago";
  if (days < 60) return Math.round(days / 7) + " weeks ago";
  if (days < 730) return Math.round(days / 30) + " months ago";
  return Math.floor(days / 365) + " years ago";
};

/* Arabic search matching. It lives here rather than beside the document search
 * because three separate searches need it: document titles, full text, and the
 * command palette.
 *
 * Must match the normalisation in ingest/build_search.py exactly. If the two
 * drift apart, Arabic queries silently return nothing. */
const normaliseQuery = (s) =>
  s
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .trim();

/* ---------- the topic taxonomy ----------
 *
 * The catalogue's `family` comes from whichever CBE page or spreadsheet tab a
 * series arrived on, which is an accident of their site rather than a way
 * anyone thinks about the economy. This maps those onto thirteen topics that
 * read like questions people actually have.
 */

const TOPICS = [
  { key: "money", name: "The pound", icon: "£",
    blurb: "Official, market and interbank exchange rates, against the dollar and twelve other currencies.",
    families: ["fx"] },
  { key: "rates", name: "Interest rates", icon: "%",
    blurb: "The CBE corridor, overnight money, and what treasury bills pay at auction.",
    families: ["policy", "rates", "govt", "interest_rates"] },
  { key: "prices", name: "Inflation", icon: "↗",
    blurb: "Headline and core inflation, the basket underneath them, and producer prices.",
    families: ["prices", "inflation"] },
  { key: "reserves", name: "Reserves and remittances", icon: "◆",
    blurb: "Net international reserves, and what Egyptians abroad send home.",
    families: ["external"] },
  { key: "bop", name: "Balance of payments", icon: "⇄",
    blurb: "The current account, trade in goods and services, and how the gap is financed.",
    families: ["bop"] },
  { key: "trade", name: "Foreign trade", icon: "⇢",
    blurb: "Exports and imports, by commodity and by trading partner.",
    families: ["foreign_trade"] },
  { key: "debt", name: "Debt", icon: "≡",
    blurb: "Domestic and external debt, by holder, by instrument and by maturity.",
    families: ["domestic_debt", "external_debt"] },
  { key: "budget", name: "The state budget", icon: "▤",
    blurb: "Revenue, spending, the deficit, and where the financing comes from.",
    families: ["state_budget"] },
  { key: "growth", name: "Growth and investment", icon: "▲",
    blurb: "GDP by sector at current and constant prices, and investment by sector.",
    families: ["gdp", "investments"] },
  { key: "banking", name: "Banks", icon: "▮",
    blurb: "Deposits, lending, the banking survey, and the payment systems CBE runs.",
    families: ["banking_surveys", "cbe"] },
  { key: "markets", name: "The stock market", icon: "◈",
    blurb: "EGX indicators, turnover, and who is doing the buying.",
    families: ["stocks"] },
  { key: "fdi", name: "Foreign investment", icon: "⊕",
    blurb: "Net foreign direct investment, by source country and by sector.",
    families: ["net_foreign_direct_investment"] },
  { key: "tourism", name: "Tourism", icon: "☀",
    blurb: "Arrivals and nights, by nationality and by region.",
    families: ["tourism"] },
];

const TOPIC_OF_FAMILY = {};
TOPICS.forEach((t) => t.families.forEach((f) => (TOPIC_OF_FAMILY[f] = t.key)));
const topicOf = (s) => TOPIC_OF_FAMILY[s.family] || "other";
const topicByKey = (k) => TOPICS.find((t) => t.key === k);

/* Series titles are "<table> - <line>", because that is how CBE's own sheets
 * are laid out. Splitting on it recovers the table, which is the unit people
 * browse: "Egypt's Balance of Payments", not 68 loose lines. */
const tableOf = (s) => {
  const t = s.title_en || "";
  const i = t.indexOf(" - ");
  return i > 0 ? t.slice(0, i) : t || s.dataset || "Other";
};
const lineOf = (s) => {
  const t = s.title_en || s.series_id;
  const i = t.indexOf(" - ");
  return i > 0 ? t.slice(i + 3) : t;
};

/* ---------- data ---------- */

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + " " + url.split("/").pop());
  return r.json();
}

async function loadIndex() {
  if (state.index) return state.index;
  const both = await Promise.all([
    getJSON(API + "/series.json"),
    getJSON(API + "/events.json").catch(() => null),
  ]);
  state.index = both[0];
  state.byId = new Map(state.index.map((s) => [s.series_id, s]));
  state.events = both[1];
  return state.index;
}

async function loadSparks() {
  if (!state.sparks) state.sparks = await getJSON(API + "/sparks.json").catch(() => ({}));
  return state.sparks;
}

async function loadSeries(id) {
  if (state.cache.has(id)) return state.cache.get(id);
  const data = await getJSON(API + "/series/" + encodeURIComponent(id) + ".json");
  state.cache.set(id, data);
  return data;
}

async function loadMPC() {
  if (!state.mpc) state.mpc = await getJSON(API + "/mpc.json").catch(() => null);
  return state.mpc;
}

/* build_site.py writes status.json on every publish: when the site was built,
 * when CBE was last read, and the headline counts. It has been published since
 * the first deploy and nothing has ever fetched it, which is why a mirror
 * rebuilt every morning has never been able to say so. */
async function loadStatus() {
  if (!state.status) state.status = await getJSON(ROOT + "/status.json").catch(() => null);
  return state.status;
}

const fxEvents = () =>
  ((state.events && state.events.events) || [])
    .filter((e) => e.type === "fx_move" && Math.abs((e.evidence && e.evidence.pct_change) || 0) >= 8)
    .map((e) => ({
      date: e.date,
      label: e.label || (e.evidence.pct_change > 0 ? "+" : "") + Math.round(e.evidence.pct_change) + "%",
    }));

/* events.json has carried four named exchange-rate regimes with their date
 * ranges since it was first generated, and nothing has ever drawn them. They
 * are the difference between a chart of a line going up and a chart of four
 * distinct policy eras. */
const fxRegimes = () => (state.events && state.events.fx_regimes) || [];

/* ---------- the gauge ----------
 * Where a value sits between its own record low and high. It answers "is
 * this a lot?", which a bare number cannot.
 */

function gauge(latest, low, high, opts) {
  opts = opts || {};
  if (latest === null || latest === undefined) return "";
  if (low === undefined || low === null || high === undefined || high === null || high === low) return "";
  const t = Math.max(0, Math.min(1, (latest - low) / (high - low)));
  // Stretching the 82-unit column with CSS would scale its stroke widths with
  // it, so the series page asks for real geometry instead of a fat copy.
  const W = opts.w || 82, H = opts.h || 20, pad = 1;
  const x = pad + t * (W - pad * 2);
  const notches = [0.25, 0.5, 0.75]
    .map((f) => {
      const nx = (pad + f * (W - pad * 2)).toFixed(1);
      return '<line class="notch" x1="' + nx + '" y1="' + (H / 2 - 4) + '" x2="' + nx + '" y2="' + (H / 2 + 4) + '"/>';
    })
    .join("");
  const mid = H / 2;

  /* Where the middle of the record sits, in gold, because it is structure
   * rather than a reading. On the pound this is the whole point: the mark is
   * hard right and the median is hard left, and the gap between them is what
   * twenty years of devaluation looks like in one line. */
  const medianMark =
    opts.median === undefined || opts.median === null
      ? ""
      : (() => {
          const mt = Math.max(0, Math.min(1, (opts.median - low) / (high - low)));
          const mx = (pad + mt * (W - pad * 2)).toFixed(1);
          return '<line class="median" x1="' + mx + '" y1="' + (mid - 6) +
                 '" x2="' + mx + '" y2="' + (mid + 6) + '"/>';
        })();

  return (
    '<svg class="gauge' + (opts.cls ? " " + opts.cls : "") + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' +
    '<rect class="track" x="' + pad + '" y="' + (mid - 2) + '" width="' + (W - pad * 2) + '" height="4" rx="2"/>' +
    '<rect class="fill" x="' + pad + '" y="' + (mid - 2) + '" width="' + (x - pad).toFixed(1) + '" height="4" rx="2"/>' +
    notches +
    medianMark +
    '<line class="mark' + (t < 0.02 ? " low" : "") + '" x1="' + x.toFixed(1) + '" y1="' + (mid - 7) +
    '" x2="' + x.toFixed(1) + '" y2="' + (mid + 7) + '"/>' +
    "</svg>"
  );
}

/* ---------- sparkline ----------
 * Values only, no axis, no labels. Its job is to say "rising, flat, or a
 * cliff in 2016" at a glance, in a list of two hundred rows.
 */

function spark(values, opts) {
  opts = opts || {};
  if (!values || values.length < 2) return '<span class="spark-none" aria-hidden="true"></span>';
  const w = opts.w || 92, h = opts.h || 24;
  const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  const span = hi - lo || 1;
  const step = (w - 3) / (values.length - 1);
  const pts = values.map((v, i) => (1.5 + i * step).toFixed(1) + "," + (h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1));
  const last = pts[pts.length - 1].split(",");
  const rising = values[values.length - 1] >= values[0];
  return (
    '<svg class="spark ' + (rising ? "up" : "down") + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
    '<polyline points="' + pts.join(" ") + '"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.8"/></svg>'
  );
}

/* ---------- charts ---------- */

function decimate(points, target) {
  target = target || 900;
  if (points.length <= target) return points;
  const step = points.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const isMulti = (series) => Array.isArray(series[0]) && Array.isArray(series[0][0]);

/* One or two series on shared axes. Comparison always rebases both to 100
 * before it gets here, because putting a level in pounds and a level in
 * dollars on one axis would be a lie told with a straight line. */
function lineChart(series, opts) {
  opts = opts || {};
  const height = opts.height || 300;
  const events = opts.events || [];
  const animate = opts.animate !== false;
  const id = opts.id || "c";
  const unit = opts.unit || "";

  const sets = (isMulti(series) ? series : [series]).map((p) => decimate(p)).filter((p) => p.length);
  if (!sets.length) return '<p class="empty">No observations in this range.</p>';

  // The viewBox is sized to roughly the CSS pixels it will occupy, so one SVG
  // unit is about one screen pixel and a 10px axis label renders at 10px. A
  // fixed 1000-unit box looks right on a desktop and shrinks the type to
  // three pixels on a phone, which is the same as not drawing it.
  const W = opts.width || Math.min(1000, Math.max(340, Math.round(window.innerWidth * 0.9)));
  const narrow = W < 700;
  const H = narrow ? Math.round(height * 0.78) : height;
  const m = { t: 18, r: 14, b: 26, l: narrow ? 42 : 58 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const allX = sets.reduce((a, s) => a.concat(s.map((p) => Date.parse(p[0]))), []);
  const allY = sets.reduce((a, s) => a.concat(s.map((p) => p[1])), []);
  const x0 = Math.min.apply(null, allX), x1 = Math.max.apply(null, allX);
  let y0 = Math.min.apply(null, allY), y1 = Math.max.apply(null, allY);
  const padY = (y1 - y0) * 0.08 || Math.abs(y1) * 0.1 || 1;
  y0 -= padY; y1 += padY;

  const px = (t) => m.l + ((t - x0) / (x1 - x0 || 1)) * iw;
  const py = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

  // Guides land on round numbers off a 1/2/5 ladder. Dividing the range into
  // fifths gives labels like 57.566, which reads as noise on a chart frame.
  const rawStep = (y1 - y0) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const step =
    [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((s) => s * mag).find((s) => s >= rawStep) || mag * 10;
  const guides = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    const y = py(v).toFixed(1);
    guides.push(
      '<line class="grid" x1="' + m.l + '" y1="' + y + '" x2="' + (W - m.r) + '" y2="' + y + '"/>' +
      '<text class="tick" x="' + (m.l - 8) + '" y="' + (+y + 3) + '" text-anchor="end">' + fmtTick(v, step, unit) + "</text>"
    );
  }
  // A zero line matters on anything that can go negative -- a trade balance
  // crossing it is the whole story -- and is clutter otherwise.
  /* Regimes are a wash behind the plot with their name set inside the top of
   * the band, deliberately at a different visual scale from the event markers:
   * an event is a dashed vertical rule with a figure above the frame, a regime
   * is a wide field with a name in it, so the two can share a chart without
   * competing. A band too narrow to letter keeps the wash and loses the name. */
  const regimes = (opts.regimes || [])
    .map((r) => {
      const a = Math.max(x0, Date.parse(r.from));
      const b = Math.min(x1, r.to ? Date.parse(r.to) : x1);
      return b > a ? { a: px(a), b: px(b), label: r.label || "" } : null;
    })
    .filter(Boolean)
    .map((r, i) => {
      const w = r.b - r.a;
      const room = w > (W / 1000) * 150;
      return (
        '<rect class="regime' + (i % 2 ? " alt" : "") + '" x="' + r.a.toFixed(1) +
        '" y="' + m.t + '" width="' + w.toFixed(1) + '" height="' + ih + '"/>' +
        (r.label && room
          ? '<text class="regime-label" x="' + (r.a + 6).toFixed(1) + '" y="' + (m.t + 12) + '">' +
            esc(r.label) + "</text>"
          : "")
      );
    })
    .join("");

  const zero =
    y0 < 0 && y1 > 0
      ? '<line class="zero" x1="' + m.l + '" y1="' + py(0).toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + py(0).toFixed(1) + '"/>'
      : "";

  const years = [];
  const span = (x1 - x0) / 31536000000;
  // Roughly one label per 90 units of width, rounded up the 1/2/5/10 ladder,
  // so the year axis does not overprint itself on a narrow screen.
  const wantYears = Math.max(2, Math.floor(iw / (narrow ? 60 : 90)));
  const stepY = [1, 2, 5, 10, 25].find((k) => span / k <= wantYears) || 50;
  const startY = new Date(x0).getUTCFullYear();
  for (let y = Math.ceil(startY / stepY) * stepY; ; y += stepY) {
    const t = Date.UTC(y, 0, 1);
    if (t > x1) break;
    if (t < x0) continue;
    years.push('<text class="tick" x="' + px(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + y + "</text>");
  }

  // Devaluations cluster -- November 2016 had three inside three weeks -- so
  // labels are dropped rather than allowed to overprint each other.
  const inRange = events
    .filter((e) => { const t = Date.parse(e.date); return t >= x0 && t <= x1; })
    .map((e) => { const o = { date: e.date, label: e.label, x: px(Date.parse(e.date)) }; return o; })
    .sort((a, b) => a.x - b.x);
  let lastLabelX = -Infinity;
  const marks = inRange
    .map((e) => {
      const x = e.x.toFixed(1);
      const label = (e.label || "").slice(0, 22);
      const room = e.x - lastLabelX > (W / 1000) * 42;
      if (label && room) lastLabelX = e.x;
      return (
        '<line class="event" x1="' + x + '" y1="' + m.t + '" x2="' + x + '" y2="' + (m.t + ih) + '"/>' +
        (label && room
          ? '<text class="event-label" x="' + x + '" y="' + (m.t - 5) + '" text-anchor="middle">' + esc(label) + "</text>"
          : "")
      );
    })
    .join("");

  /* A policy rate holds at the level the committee set until the committee sets
   * another one. Joining two decisions with a straight line says the rate
   * drifted between them, which is a lie about how the corridor works, so a
   * stepped set gets square corners. Per set rather than per chart, because the
   * corridor chart puts stepped policy rates and a daily benchmark on one
   * frame. */
  const stepped = (i) => (Array.isArray(opts.step) ? !!opts.step[i] : !!opts.step);
  // A rate still in force should reach today, not stop on the day it last moved.
  const edge = (W - m.r).toFixed(1);
  const lastX = (data, i) =>
    stepped(i) ? edge : px(Date.parse(data[data.length - 1][0])).toFixed(1);

  const segments = (data, i) => {
    const step = stepped(i);
    const d = data
      .map((p, j) => {
        const x = px(Date.parse(p[0])).toFixed(1), y = py(p[1]).toFixed(1);
        if (!j) return "M" + x + "," + y;
        return step ? "H" + x + "V" + y : "L" + x + "," + y;
      })
      .join("");
    return step ? d + "H" + edge : d;
  };

  // The same run walked right to left, to close a filled shape back along it.
  const backwards = (data, i) => {
    const L = data.length - 1;
    let d = "";
    if (stepped(i)) {
      d += "H" + px(Date.parse(data[L][0])).toFixed(1);
      for (let j = L; j >= 1; j--) {
        d += "V" + py(data[j - 1][1]).toFixed(1) +
             "H" + px(Date.parse(data[j - 1][0])).toFixed(1);
      }
    } else {
      for (let j = L; j >= 0; j--) {
        d += "L" + px(Date.parse(data[j][0])).toFixed(1) + "," + py(data[j][1]).toFixed(1);
      }
    }
    return d;
  };

  /* Two sets that bound a third are a band, not two lines. The corridor is the
   * case this exists for: a floor, a ceiling, and where overnight money
   * actually cleared inside them. */
  let band = "";
  if (opts.band && sets[opts.band[0]] && sets[opts.band[1]]) {
    const li = opts.band[0], hi = opts.band[1];
    const lo = sets[li], up = sets[hi];
    band =
      '<path class="band" d="' + segments(up, hi) +
      "L" + lastX(lo, li) + "," + py(lo[lo.length - 1][1]).toFixed(1) +
      backwards(lo, li) + ' Z"/>';
  }

  const paths = sets
    .map((data, i) => {
      const d = segments(data, i);
      const area =
        i === 0 && sets.length === 1
          ? '<path class="area" d="' + d +
            "L" + lastX(data, i) + "," + py(y0).toFixed(1) +
            "L" + px(Date.parse(data[0][0])).toFixed(1) + "," + py(y0).toFixed(1) + '  Z"/>'
          : "";
      return area + '<path class="line s' + i + (animate ? " draw" : "") + '" d="' + d + '"/>';
    })
    .join("");

  return (
    '<svg class="chart" id="' + id + '" viewBox="0 0 ' + W + " " + H + '" ' +
    'style="--len:' + Math.round(iw * 1.6) + '" data-x0="' + x0 + '" data-x1="' + x1 + '" ' +
    'data-w="' + W + '" data-l="' + m.l + '" ' +
    'role="img" tabindex="0" ' +
    'aria-label="Time series chart, ' + sets[0].length +
    ' points. Use the arrow keys to read values.">' +
    regimes + guides.join("") + zero + years.join("") + band + marks + paths +
    '<g class="hover"></g></svg>'
  );
}

/* The draw-on animation reveals the line by pulling a dash the length of the
 * whole path off it. It needs that length, and the stylesheet can only guess at
 * it from the width of the chart -- which is close enough for a smooth line and
 * badly wrong for a spiky one. CONIA's overnight volume covers 19,838 units
 * inside a 1,485-unit guess, so the dash repeats and the stroke ends up with
 * thirteen holes punched through it, permanently, because the animation holds
 * its end state. Measure the path instead, and take the dash off entirely once
 * the animation is done, so nothing can be left hidden by a stale dasharray. */
function armLines(svg) {
  if (!svg) return;
  svg.querySelectorAll(".line.draw").forEach((p) => {
    const len = Math.ceil(p.getTotalLength());
    if (len) p.style.setProperty("--len", len);
    const undash = () => {
      p.classList.remove("draw");
      p.style.removeProperty("--len");
    };
    p.addEventListener("animationend", undash, { once: true });
    // A hidden tab holds the animation clock at zero, and while it is held the
    // dash covers the entire path, so the chart is blank rather than
    // half-drawn. Losing the reveal costs far less than serving an empty
    // chart, so the dash comes off on a timer whether the animation ran or
    // not. The animation is 900ms plus at most a 240ms delay.
    setTimeout(undash, 2000);
  });
}

/* Crosshair and readout. A touch counts as a pointer, so a phone gets this
 * without a second code path. */
function wireHover(svg, series, units, readoutEl, labels) {
  if (!svg || !readoutEl) return;
  /* The readout works off the full series, not the decimated set the chart
   * drew. A 5,172-point series is plotted at every sixth day, so reading the
   * drawn points would make one press of the right arrow jump a week and would
   * report the nearest drawn value rather than the real one. Scanning five
   * thousand points on a pointer move costs nothing, and the number under the
   * crosshair is then the number CBE published on that date. */
  const data = isMulti(series) ? series : [series];
  const x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
  // The chart chose its own viewBox width and left margin; read them back
  // rather than assume, or the crosshair lands in the wrong place.
  const W = +svg.dataset.w || 1000;
  const m = { l: +svg.dataset.l || 58, r: 14, t: 18, b: 26 };
  const iw = W - m.l - m.r;
  const vbH = +(svg.getAttribute("viewBox") || "0 0 1000 300").split(/\s+/)[3];
  const g = svg.querySelector(".hover");
  const base = readoutEl.innerHTML;
  const unitList = Array.isArray(units) ? units : [units];

  // Nearest observation in each set to a moment in time.
  const nearest = (t) =>
    data.map((sr) => {
      let best = sr[0], bestD = Infinity;
      for (let i = 0; i < sr.length; i++) {
        const d = Math.abs(Date.parse(sr[i][0]) - t);
        if (d < bestD) { bestD = d; best = sr[i]; }
      }
      return best;
    });

  const paint = (picks) => {
    const bx = m.l + ((Date.parse(picks[0][0]) - x0) / (x1 - x0)) * iw;
    g.innerHTML = '<line class="hover-line" x1="' + bx.toFixed(1) + '" y1="' + m.t + '" x2="' + bx.toFixed(1) + '" y2="' + (vbH - m.b) + '"/>';
    readoutEl.innerHTML =
      picks
        .map((p, i) =>
          '<span class="val' + (i ? " alt" : "") + '">' + fmt(p[1], unitList[i]) + "</span>" +
          (labels && labels[i] ? '<span class="when">' + esc(labels[i]) + "</span>" : ""))
        .join("") + '<span class="when">' + niceDate(picks[0][0]) + "</span>";
  };

  const clear = () => { g.innerHTML = ""; readoutEl.innerHTML = base; };

  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    const rel = ((ev.clientX - box.left) / box.width) * W;
    paint(nearest(x0 + ((rel - m.l) / iw) * (x1 - x0)));
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", clear);

  /* The crosshair used to be mouse-only, so the one interactive thing on the
   * page could not be reached from a keyboard at all. Arrows walk the first
   * set one observation at a time; Home and End jump to the ends; Escape lets
   * go. The chart carries tabindex for this. */
  let idx = -1;
  svg.addEventListener("keydown", (ev) => {
    const n = data[0].length;
    if (ev.key === "ArrowRight") idx = idx < 0 ? n - 1 : Math.min(n - 1, idx + 1);
    else if (ev.key === "ArrowLeft") idx = idx < 0 ? n - 1 : Math.max(0, idx - 1);
    else if (ev.key === "Home") idx = 0;
    else if (ev.key === "End") idx = n - 1;
    else if (ev.key === "Escape") { idx = -1; clear(); return; }
    else return;
    ev.preventDefault();
    // Anchor on set 0 and take whatever the other sets had at that moment, so a
    // comparison reads at one date rather than at two.
    paint(nearest(Date.parse(data[0][idx][0])));
  });
  svg.addEventListener("blur", clear);
}

/* ---------- transformations offered on a series page ---------- */

const TRANSFORMS = {
  level: { label: "As published", fn: (p) => p },
  yoy: {
    label: "Change on a year earlier",
    fn: (p) => {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const target = Date.parse(p[i][0]) - 31536000000;
        let j = i, bestD = Infinity, best = null;
        while (j >= 0 && Date.parse(p[j][0]) > target - 45 * 86400000) {
          const d = Math.abs(Date.parse(p[j][0]) - target);
          if (d < bestD) { bestD = d; best = p[j]; }
          j--;
        }
        if (best && best[1]) out.push([p[i][0], ((p[i][1] - best[1]) / Math.abs(best[1])) * 100]);
      }
      return out;
    },
  },
  index: {
    label: "Rebased, first reading = 100",
    fn: (p) => (p.length && p[0][1] ? p.map((o) => [o[0], (o[1] / p[0][1]) * 100]) : p),
  },
};

/* The range buttons used to be one fixed list for all 1,300 series, which
 * served a daily FX series well and everything else badly. "1 year" on a
 * quarterly series is four points, and "Since March 2024" is a button that does
 * nothing on a series that stopped publishing in 2019. Since 961 of the 1,317
 * series are quarterly, the majority case was the one being served worst.
 *
 * Build the list out of what the series actually covers instead, and judge a
 * window by the series' own observed density rather than its nominal frequency:
 * a monthly series with a decade of gaps should not be offered a window that
 * lands four points in it.
 */
const FLOAT_2016 = "2016-11-03";
const FLOAT_2024 = "2024-03-06";

function rangesFor(meta) {
  const out = {};
  const first = meta && meta.first ? Date.parse(meta.first) : null;
  const last = meta && meta.last ? Date.parse(meta.last) : Date.now();
  const years = first === null ? 0 : (last - first) / 31536000000;
  const perYear = years > 0 && meta.n ? meta.n / years : 0;
  const worth = (y) => y < years && perYear * y >= 4;

  if (worth(1)) out["1 year"] = 1;
  if (worth(5)) out["5 years"] = 5;
  if (worth(10)) out["10 years"] = 10;
  out.Everything = null;

  // Only offer this year if the series has actually reached this year.
  if (new Date(last).getUTCFullYear() >= new Date().getUTCFullYear() && perYear >= 4) {
    out["This year"] = "ytd";
  }

  /* The two float dates mean something to the pound and to the money that
   * prices it, and nothing at all to tourist arrivals. They also have to be
   * inside the series' own span to be worth a button. */
  if (/^(fx|rates|govt|policy|interest_rates)$/.test((meta && meta.family) || "")) {
    if (last >= Date.parse(FLOAT_2016) && first !== null && first < Date.parse(FLOAT_2016)) {
      out["Since the 2016 float"] = FLOAT_2016;
    }
    if (last >= Date.parse(FLOAT_2024) && first !== null && first < Date.parse(FLOAT_2024)) {
      out["Since March 2024"] = FLOAT_2024;
    }
  }
  return out;
}

function applyRange(points, key, ranges) {
  const r = (ranges || {})[key];
  if (r === null || r === undefined) return points;
  const from =
    r === "ytd"
      ? Date.UTC(new Date().getUTCFullYear(), 0, 1)
      : typeof r === "string"
      ? Date.parse(r)
      : Date.now() - r * 31536000000;
  const cut = points.filter((p) => Date.parse(p[0]) >= from);
  return cut.length > 1 ? cut : points;
}

/* "Is this a lot?" answered against the series' own middle rather than its
 * extremes. A multiple is the honest form once a series has moved by more than
 * a factor of two: the pound is 6.6x its own median, and "558% above" is a true
 * sentence nobody can read. Returns the comparison only; the caller says what
 * it is being compared against, so the sentence can name the mark on the gauge. */
function vsMedian(latest, median) {
  if (median === null || median === undefined || median === 0) return "";
  if (latest === null || latest === undefined) return "";
  // A ratio across zero is meaningless: a deficit against a surplus median.
  if (median > 0 !== latest > 0) return "";
  const r = latest / median;
  return (
    "Today's reading is " +
    (r >= 2
      ? r.toFixed(1) + "× it."
      : Math.abs((r - 1) * 100).toFixed(0) + "% " + (r >= 1 ? "above" : "below") + " it.")
  );
}

/* ---------- small shared bits of markup ---------- */

const skeleton = (rows) =>
  '<div class="wrap"><div class="skeleton">' +
  '<div class="sk-line"></div>'.repeat(rows || 6) +
  "</div></div>";

const crumbs = (parts) =>
  '<nav class="crumbs" aria-label="Breadcrumb">' +
  parts
    .map((p) => (p.href ? '<a href="' + p.href + '">' + esc(p.label) + "</a>" : "<span>" + esc(p.label) + "</span>"))
    .join('<i aria-hidden="true">/</i>') +
  "</nav>";

/* Download a series as CSV without a round trip. The data is already in the
 * page; asking a server for it again would be theatre. */
function downloadCSV(id, observations, meta, note) {
  const head =
    "# " + ((meta && meta.title_en) || id) + "\n" +
    "# Source: Central Bank of Egypt. Republished by Miqyas, an unofficial mirror.\n" +
    "# Unit: " + ((meta && meta.unit) || "not stated") + "\n" +
    // What the reader was looking at when they asked for it. A file of 1,200
    // rows out of 5,172 with nothing saying which 1,200 is a trap.
    (note ? "# " + note + "\n" : "") +
    "# Retrieved " + new Date().toISOString().slice(0, 10) + "\n" +
    "series_id,period,value\n";
  const body = observations.map((o) => id + "," + o[0] + "," + o[1]).join("\n");
  const blob = new Blob([head + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = id + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Copy the current page URL. Used by the share button on a series page. */
function copyLink(button) {
  navigator.clipboard.writeText(location.href).then(() => flash(button, "Link copied"), () => {});
}

/* Tab-separated onto the clipboard, which is what pastes straight into a
 * spreadsheet cell by cell. For most of this audience that is the actual
 * destination, and a download is a detour through the filesystem. */
function copyTSV(button, rows, header) {
  const text =
    (header ? header.join("\t") + "\n" : "") + rows.map((r) => r.join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(
    () => flash(button, rows.length.toLocaleString() + " rows copied"),
    () => {}
  );
}

/* Say something happened, then put the label back. Shared by every copy button
 * so they all behave the same way. */
function flash(button, message) {
  const was = button.dataset.label || button.textContent;
  button.dataset.label = was;
  button.textContent = message;
  setTimeout(() => (button.textContent = was), 1800);
}
