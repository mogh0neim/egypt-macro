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
  cache: new Map(), // full observation arrays, by series id
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
  "percent per annum": "% a year",
  percent: "%",
  ratio: "ratio",
  index: "index",
  thousand: "thousands",
  number: "count",
  EGP: "EGP",
};
const unitShort = (u) => (u ? UNIT_SHORT[u] || u : "");

const FREQ_LABEL = {
  A: "Yearly", Q: "Quarterly", M: "Monthly", W: "Weekly",
  BW: "Every two weeks", D: "Daily", IRR: "Only when it changes",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const niceDate = (iso) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0];
};
const shortDate = (iso) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return MONTHS[+p[1] - 1] + " " + p[0].slice(2);
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

const fxEvents = () =>
  ((state.events && state.events.events) || [])
    .filter((e) => e.type === "fx_move" && Math.abs((e.evidence && e.evidence.pct_change) || 0) >= 8)
    .map((e) => ({
      date: e.date,
      label: e.label || (e.evidence.pct_change > 0 ? "+" : "") + Math.round(e.evidence.pct_change) + "%",
    }));

/* ---------- the gauge ----------
 * Where a value sits between its own record low and high. It answers "is
 * this a lot?", which a bare number cannot.
 */

function gauge(latest, low, high) {
  if (latest === null || latest === undefined) return "";
  if (low === undefined || low === null || high === undefined || high === null || high === low) return "";
  const t = Math.max(0, Math.min(1, (latest - low) / (high - low)));
  const W = 82, H = 20, pad = 1;
  const x = pad + t * (W - pad * 2);
  const notches = [0.25, 0.5, 0.75]
    .map((f) => {
      const nx = (pad + f * (W - pad * 2)).toFixed(1);
      return '<line class="notch" x1="' + nx + '" y1="6" x2="' + nx + '" y2="14"/>';
    })
    .join("");
  return (
    '<svg class="gauge" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' +
    '<rect class="track" x="' + pad + '" y="8" width="' + (W - pad * 2) + '" height="4" rx="2"/>' +
    '<rect class="fill" x="' + pad + '" y="8" width="' + (x - pad).toFixed(1) + '" height="4" rx="2"/>' +
    notches +
    '<line class="mark' + (t < 0.02 ? " low" : "") + '" x1="' + x.toFixed(1) + '" y1="3" x2="' + x.toFixed(1) + '" y2="17"/>' +
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

  const W = 1000, H = height;
  const m = { t: 18, r: 14, b: 26, l: 58 };
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
  const zero =
    y0 < 0 && y1 > 0
      ? '<line class="zero" x1="' + m.l + '" y1="' + py(0).toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + py(0).toFixed(1) + '"/>'
      : "";

  const years = [];
  const span = (x1 - x0) / 31536000000;
  const stepY = span > 40 ? 10 : span > 18 ? 5 : span > 8 ? 2 : 1;
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
      const room = e.x - lastLabelX > 42;
      if (label && room) lastLabelX = e.x;
      return (
        '<line class="event" x1="' + x + '" y1="' + m.t + '" x2="' + x + '" y2="' + (m.t + ih) + '"/>' +
        (label && room
          ? '<text class="event-label" x="' + x + '" y="' + (m.t - 5) + '" text-anchor="middle">' + esc(label) + "</text>"
          : "")
      );
    })
    .join("");

  const paths = sets
    .map((data, i) => {
      const d = data
        .map((p, j) => (j ? "L" : "M") + px(Date.parse(p[0])).toFixed(1) + "," + py(p[1]).toFixed(1))
        .join("");
      const area =
        i === 0 && sets.length === 1
          ? '<path class="area" d="' + d +
            "L" + px(Date.parse(data[data.length - 1][0])).toFixed(1) + "," + py(y0).toFixed(1) +
            "L" + px(Date.parse(data[0][0])).toFixed(1) + "," + py(y0).toFixed(1) + '  Z"/>'
          : "";
      return area + '<path class="line s' + i + (animate ? " draw" : "") + '" d="' + d + '"/>';
    })
    .join("");

  return (
    '<svg class="chart" id="' + id + '" viewBox="0 0 ' + W + " " + H + '" ' +
    'style="--len:' + Math.round(iw * 1.6) + '" data-x0="' + x0 + '" data-x1="' + x1 + '" ' +
    'role="img" aria-label="Time series chart, ' + sets[0].length + ' points">' +
    guides.join("") + zero + years.join("") + marks + paths +
    '<g class="hover"></g></svg>'
  );
}

/* Crosshair and readout. A touch counts as a pointer, so a phone gets this
 * without a second code path. */
function wireHover(svg, series, units, readoutEl, labels) {
  if (!svg || !readoutEl) return;
  const data = (isMulti(series) ? series : [series]).map((s) => decimate(s));
  const x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
  const m = { l: 58, r: 14, t: 18, b: 26 };
  const iw = 1000 - m.l - m.r;
  const vbH = +(svg.getAttribute("viewBox") || "0 0 1000 300").split(/\s+/)[3];
  const g = svg.querySelector(".hover");
  const base = readoutEl.innerHTML;
  const unitList = Array.isArray(units) ? units : [units];

  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    const rel = ((ev.clientX - box.left) / box.width) * 1000;
    const t = x0 + ((rel - m.l) / iw) * (x1 - x0);
    const picks = data.map((sr) => {
      let best = sr[0], bestD = Infinity;
      for (let i = 0; i < sr.length; i++) {
        const d = Math.abs(Date.parse(sr[i][0]) - t);
        if (d < bestD) { bestD = d; best = sr[i]; }
      }
      return best;
    });
    const bx = m.l + ((Date.parse(picks[0][0]) - x0) / (x1 - x0)) * iw;
    g.innerHTML = '<line class="hover-line" x1="' + bx.toFixed(1) + '" y1="' + m.t + '" x2="' + bx.toFixed(1) + '" y2="' + (vbH - m.b) + '"/>';
    readoutEl.innerHTML =
      picks
        .map((p, i) =>
          '<span class="val' + (i ? " alt" : "") + '">' + fmt(p[1], unitList[i]) + "</span>" +
          (labels && labels[i] ? '<span class="when">' + esc(labels[i]) + "</span>" : ""))
        .join("") + '<span class="when">' + niceDate(picks[0][0]) + "</span>";
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", () => { g.innerHTML = ""; readoutEl.innerHTML = base; });
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

const RANGES = {
  "1 year": 1,
  "5 years": 5,
  "10 years": 10,
  Everything: null,
  "Since the 2016 float": "2016-11-03",
  "Since March 2024": "2024-03-06",
};

function applyRange(points, key) {
  const r = RANGES[key];
  if (!r) return points;
  const from = typeof r === "string" ? Date.parse(r) : Date.now() - r * 31536000000;
  const cut = points.filter((p) => Date.parse(p[0]) >= from);
  return cut.length > 1 ? cut : points;
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
function downloadCSV(id, observations, meta) {
  const head =
    "# " + ((meta && meta.title_en) || id) + "\n" +
    "# Source: Central Bank of Egypt. Republished by Miqyas, an unofficial mirror.\n" +
    "# Unit: " + ((meta && meta.unit) || "not stated") + "\n" +
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
  navigator.clipboard.writeText(location.href).then(
    () => {
      const was = button.textContent;
      button.textContent = "Link copied";
      setTimeout(() => (button.textContent = was), 1600);
    },
    () => {}
  );
}
