/* Egypt Macro — static front end.
 *
 * Reads the JSON the build step publishes under dist/api/v1. There is no
 * backend and no chart library: the series are small enough that hand-drawn
 * SVG is both lighter than a dependency and easier to make look right.
 *
 * The gauge is the one piece of ornament and it earns its place. It shows
 * where a value sits between its own historical low and high, which is the
 * question a bare number cannot answer.
 */

const API = "../dist/api/v1";

const state = { index: null, events: null, cache: new Map() };

/* ---------- formatting ---------- */

const fmt = (v, unit) => {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (unit || "").includes("percent") ? s + "%" : s;
};

/* A change of 0.1657 EGP is noise on the page; two significant figures says
 * the same thing. Percentages keep their decimal because 25 bp matters. */
const fmtChange = (v, unit) => {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  const digits = (unit || "").includes("percent") ? 2 : abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (unit || "").includes("percent") ? s + "pp" : s;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const niceDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
};
const shortDate = (iso) => {
  const [y, m] = iso.split("-");
  return `${MONTHS[+m - 1]} ${y.slice(2)}`;
};

/* ---------- data ---------- */

async function loadIndex() {
  if (state.index) return state.index;
  const [index, events] = await Promise.all([
    fetch(`${API}/series.json`).then((r) => r.json()),
    fetch(`${API}/events.json`).then((r) => r.json()).catch(() => null),
  ]);
  state.index = index;
  state.events = events;
  return index;
}

async function loadSeries(id) {
  if (state.cache.has(id)) return state.cache.get(id);
  const data = await fetch(`${API}/series/${encodeURIComponent(id)}.json`).then((r) => r.json());
  state.cache.set(id, data);
  return data;
}

/* ---------- the gauge ---------- */

function gauge(latest, low, high) {
  if (latest === null || low === undefined || high === undefined || high === low) return "";
  const t = Math.max(0, Math.min(1, (latest - low) / (high - low)));
  const W = 82, H = 20, pad = 1;
  const x = pad + t * (W - pad * 2);
  const notches = [0.25, 0.5, 0.75]
    .map((f) => {
      const nx = (pad + f * (W - pad * 2)).toFixed(1);
      return `<line class="notch" x1="${nx}" y1="6" x2="${nx}" y2="14"/>`;
    })
    .join("");
  return `<svg class="gauge" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <rect class="track" x="${pad}" y="8" width="${W - pad * 2}" height="4" rx="2"/>
    <rect class="fill" x="${pad}" y="8" width="${(x - pad).toFixed(1)}" height="4" rx="2"/>
    ${notches}
    <line class="mark${t < 0.02 ? " low" : ""}" x1="${x.toFixed(1)}" y1="3" x2="${x.toFixed(1)}" y2="17"/>
  </svg>`;
}

/* ---------- charts ---------- */

function decimate(points, target = 900) {
  if (points.length <= target) return points;
  const step = points.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function lineChart(points, opts = {}) {
  const { height = 300, events = [], animate = true, id = "c" } = opts;
  const data = decimate(points);
  if (!data.length) return `<p class="empty">No observations.</p>`;

  const W = 1000, H = height;
  const m = { t: 16, r: 14, b: 26, l: 52 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const xs = data.map((p) => Date.parse(p[0]));
  const ys = data.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padY = (y1 - y0) * 0.08 || Math.abs(y1) * 0.1 || 1;
  y0 -= padY; y1 += padY;

  const px = (t) => m.l + ((t - x0) / (x1 - x0 || 1)) * iw;
  const py = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

  const path = data.map((p, i) => `${i ? "L" : "M"}${px(Date.parse(p[0])).toFixed(1)},${py(p[1]).toFixed(1)}`).join("");
  const area = `${path}L${px(xs[xs.length - 1]).toFixed(1)},${py(y0).toFixed(1)}L${px(xs[0]).toFixed(1)},${py(y0).toFixed(1)}Z`;

  // Guides land on round numbers off a 1/2/5 ladder. Dividing the range into
  // fifths gives labels like 57.566, which reads as noise on a chart frame.
  const rawStep = (y1 - y0) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const step =
    [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((s) => s * mag).find((s) => s >= rawStep) ||
    mag * 10;
  const guides = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    const y = py(v).toFixed(1);
    guides.push(`<line class="grid" x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}"/>
      <text class="tick" x="${m.l - 8}" y="${+y + 3}" text-anchor="end">${fmt(v, opts.unit)}</text>`);
  }

  const years = [];
  const span = (x1 - x0) / 31536000000;
  const stepY = span > 18 ? 5 : span > 8 ? 2 : 1;
  const startY = new Date(x0).getUTCFullYear();
  for (let y = Math.ceil(startY / stepY) * stepY; ; y += stepY) {
    const t = Date.UTC(y, 0, 1);
    if (t > x1) break;
    if (t < x0) continue;
    years.push(`<text class="tick" x="${px(t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${y}</text>`);
  }

  // Devaluations cluster -- November 2016 had three inside three weeks -- so
  // labels are dropped rather than allowed to overprint each other. The rule
  // is closest-wins on position, biggest-wins on overlap.
  const inRange = events
    .filter((e) => { const t = Date.parse(e.date); return t >= x0 && t <= x1; })
    .map((e) => ({ ...e, x: px(Date.parse(e.date)) }))
    .sort((a, b) => a.x - b.x);

  let lastLabelX = -Infinity;
  const marks = inRange.map((e) => {
    const x = e.x.toFixed(1);
    const label = (e.label || "").slice(0, 22);
    const room = e.x - lastLabelX > 42;
    if (label && room) lastLabelX = e.x;
    return `<line class="event" x1="${x}" y1="${m.t}" x2="${x}" y2="${m.t + ih}"/>
            ${label && room
              ? `<text class="event-label" x="${x}" y="${m.t - 4}" text-anchor="middle">${label}</text>`
              : ""}`;
  }).join("");

  const len = Math.round(iw * 1.6);
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}"
            style="--len:${len}" data-x0="${x0}" data-x1="${x1}" role="img"
            aria-label="Time series chart, ${data.length} points">
    ${guides.join("")}${years}${marks}
    <path class="area" d="${area}"/>
    <path class="line${animate ? " draw" : ""}" d="${path}"/>
    <g class="hover"></g>
  </svg>`;
}

/* Hover readout. One shared handler, attached after render. */
function wireHover(svg, points, unit, readoutEl) {
  if (!svg || !readoutEl) return;
  const data = decimate(points);
  const x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
  const m = { l: 52, r: 14, t: 16, b: 26 };
  const iw = 1000 - m.l - m.r;
  // Read the height off the viewBox rather than assuming 300: the hero and
  // series charts are different heights and the crosshair has to reach the
  // axis on both.
  const vbH = +(svg.getAttribute("viewBox") || "0 0 1000 300").split(/\s+/)[3];
  const g = svg.querySelector(".hover");
  const base = readoutEl.innerHTML;

  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    const rel = ((ev.clientX - box.left) / box.width) * 1000;
    const t = x0 + ((rel - m.l) / iw) * (x1 - x0);
    let best = data[0], bestD = Infinity;
    for (const p of data) {
      const d = Math.abs(Date.parse(p[0]) - t);
      if (d < bestD) { bestD = d; best = p; }
    }
    const bx = m.l + ((Date.parse(best[0]) - x0) / (x1 - x0)) * iw;
    g.innerHTML = `<line class="hover-line" x1="${bx.toFixed(1)}" y1="${m.t}" x2="${bx.toFixed(1)}" y2="${vbH - m.b}"/>`;
    readoutEl.innerHTML =
      `<span class="val">${fmt(best[1], unit)}</span><span class="when">${niceDate(best[0])}</span>`;
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", () => { g.innerHTML = ""; readoutEl.innerHTML = base; });
}

/* ---------- transformations ---------- */

const TRANSFORMS = {
  level: { label: "Level", fn: (p) => p },
  yoy: {
    label: "% change from year ago",
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
    label: "Index, first = 100",
    fn: (p) => (p.length && p[0][1] ? p.map(([d, v]) => [d, (v / p[0][1]) * 100]) : p),
  },
};

const RANGES = {
  "1Y": 1, "5Y": 5, "10Y": 10, Max: null,
  "Since 2016 float": "2016-11-03",
  "Since Mar 2024": "2024-03-06",
};

function applyRange(points, key) {
  const r = RANGES[key];
  if (!r) return points;
  const from = typeof r === "string" ? Date.parse(r) : Date.now() - r * 31536000000;
  const cut = points.filter((p) => Date.parse(p[0]) >= from);
  return cut.length > 1 ? cut : points;
}

/* ---------- views ---------- */

const FAMILY_ORDER = ["fx", "policy", "rates", "govt", "prices", "external"];
const FAMILY_LABEL = {
  fx: "Exchange rates", policy: "Policy rates", rates: "Money market",
  govt: "Government securities", prices: "Prices", external: "External sector",
};

const HEADLINE = [
  "EG.FX.OFF.USD.SELL", "EG.FX.MKT.USD.SELL", "EG.FX.IBK.WAVG",
  "EG.RATE.ON.DEP", "EG.RATE.ON.LEND", "EG.RATE.MAIN", "EG.RATE.DISCOUNT",
  "EG.CPI.HDL.YOY", "EG.CPI.CORE.YOY",
  "EG.RES.NIR", "EG.EXT.REMIT.FYTD",
  "EG.TB.EGP.3M.YLD.WAVG", "EG.TB.EGP.6M.YLD.WAVG",
  "EG.TB.EGP.12M.YLD.WAVG", "EG.TB.EGP.3M.BIDCOVER",
  "EG.CONIA.ON.RATE", "EG.IBK.D.ON",
];

function row(s) {
  const change = s.previous !== null && s.previous !== undefined
    ? s.latest_value - s.previous : null;
  const cls = change === null || change === 0 ? "" : change > 0 ? "up" : "down";
  const arrow = change === null || change === 0 ? "" : change > 0 ? "▲" : "▼";
  return `<tr>
    <td class="name">
      <a href="#/s/${encodeURIComponent(s.series_id)}">${s.title_en || s.series_id}</a>
      <span class="unit">${s.unit || ""}</span>
    </td>
    <td>${fmt(s.latest_value, s.unit)}</td>
    <td class="${cls}">${arrow} ${fmtChange(change, s.unit)}</td>
    <td class="hide-sm">${fmt(s.lowest?.value, s.unit)}</td>
    <td class="hide-sm">${fmt(s.highest?.value, s.unit)}</td>
    <td class="hide-sm">${gauge(s.latest_value, s.lowest?.value, s.highest?.value)}</td>
    <td class="asof">${shortDate(s.last)}</td>
  </tr>`;
}

async function viewHome() {
  const index = await loadIndex();
  const byId = new Map(index.map((s) => [s.series_id, s]));
  const fx = await loadSeries("EG.FX.OFF.USD.SELL").catch(() => null);

  const fxEvents = (state.events?.events || [])
    .filter((e) => e.type === "fx_move" && Math.abs(e.evidence?.pct_change || 0) >= 8)
    .map((e) => ({ date: e.date, label: e.label || `${e.evidence.pct_change > 0 ? "+" : ""}${Math.round(e.evidence.pct_change)}%` }));

  const first = fx?.observations?.[0], last = fx?.observations?.[fx.observations.length - 1];
  const multiple = first && last ? (last[1] / first[1]).toFixed(1) : null;

  const groups = FAMILY_ORDER.map((f) => {
    const rows = HEADLINE.map((id) => byId.get(id)).filter((s) => s && s.family === f);
    return rows.length ? `<tr class="group-head"><td colspan="7">${FAMILY_LABEL[f]}</td></tr>${rows.map(row).join("")}` : "";
  }).join("");

  const app = document.getElementById("app");
  app.innerHTML = `
    <section class="hero">
      <div class="wrap">
        <h1>What the pound did, and everything underneath it.</h1>
        <p class="standfirst">${multiple
          ? `The Central Bank's official dollar rate has moved <b>${multiple}×</b> since January 2005. Every step of it, plus ${index.length.toLocaleString()} other series, rebuilt from CBE's own publications each morning.`
          : `Egypt's macroeconomic record, rebuilt from CBE's own publications each morning.`}</p>
        <div class="hero-chart">
          ${fx ? lineChart(fx.observations, { height: 300, events: fxEvents, id: "hero", unit: fx.unit }) : ""}
        </div>
        <div class="readout" id="hero-readout">
          <span class="val">${last ? fmt(last[1], fx.unit) : "—"}</span>
          <span class="when">${last ? niceDate(last[0]) : ""}</span>
          <span>EGP per US dollar, CBE selling rate</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <p class="eyebrow">At a glance</p>
        <h2>Headline indicators</h2>
        <p class="lede">Latest reading, the change since the previous one, and where that
          sits between the series' own record low and high.</p>
        <div class="table-scroll">
          <table class="indicators">
            <thead><tr>
              <th>Series</th><th>Latest</th><th>Change</th>
              <th class="hide-sm">Lowest</th><th class="hide-sm">Highest</th>
              <th class="hide-sm">Range</th><th>As of</th>
            </tr></thead>
            <tbody>${groups}</tbody>
          </table>
        </div>
      </div>
    </section>`;

  if (fx) wireHover(document.getElementById("hero"), fx.observations, fx.unit, document.getElementById("hero-readout"));
}

async function viewSeries(id) {
  const index = await loadIndex();
  const meta = index.find((s) => s.series_id === id);
  const app = document.getElementById("app");
  app.innerHTML = `<div class="wrap"><p class="empty">Loading ${id}…</p></div>`;

  let data;
  try {
    data = await loadSeries(id);
  } catch {
    app.innerHTML = `<div class="wrap"><p class="empty">No series called <code>${id}</code>.
      <a href="#/search">Search instead</a>.</p></div>`;
    return;
  }

  let range = "Max", transform = "level";

  const render = () => {
    const points = TRANSFORMS[transform].fn(applyRange(data.observations, range));
    const unit = transform === "level" ? data.unit : transform === "yoy" ? "percent" : "index";
    const events = (state.events?.events || [])
      .filter((e) => e.type === "fx_move" && Math.abs(e.evidence?.pct_change || 0) >= 8)
      .map((e) => ({ date: e.date, label: e.label || "" }));
    const last = points[points.length - 1];

    document.getElementById("chart-slot").innerHTML =
      lineChart(points, { height: 340, events: data.family === "fx" ? events : [], id: "sc", unit });
    document.getElementById("s-readout").innerHTML = last
      ? `<span class="val">${fmt(last[1], unit)}</span><span class="when">${niceDate(last[0])}</span>
         <span>${TRANSFORMS[transform].label}</span>`
      : `<span class="empty">Nothing in this range.</span>`;
    wireHover(document.getElementById("sc"), points, unit, document.getElementById("s-readout"));
    document.querySelectorAll("[data-range]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.range === range)));
    document.querySelectorAll("[data-transform]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.transform === transform)));
  };

  app.innerHTML = `
    <div class="wrap">
      <div class="series-head">
        <span class="series-id">${data.series_id}</span>
        <h1>${data.title_en || data.series_id}</h1>
        <div class="meta-row">
          <span><b>Unit</b> ${data.unit || "—"}</span>
          <span><b>Frequency</b> ${({A:"Annual",Q:"Quarterly",M:"Monthly",W:"Weekly",BW:"Bi-weekly",D:"Daily",IRR:"On change"})[data.freq] || data.freq || "—"}</span>
          <span><b>Observations</b> ${data.count.toLocaleString()}</span>
          <span><b>Covers</b> ${meta ? `${meta.first} to ${meta.last}` : "—"}</span>
          ${data.derived ? `<span><b>Derived</b> yes</span>` : ""}
        </div>
      </div>

      <div class="controls">
        ${Object.keys(RANGES).map((k) => `<button class="chip" data-range="${k}">${k}</button>`).join("")}
        <span class="spacer"></span>
        ${Object.entries(TRANSFORMS).map(([k, t]) => `<button class="chip" data-transform="${k}">${t.label}</button>`).join("")}
      </div>

      <div id="chart-slot"></div>
      <div class="readout" id="s-readout"></div>

      <section class="section">
        <p class="eyebrow">Provenance</p>
        <h2>Where this comes from</h2>
        <p class="lede">${data.derived
          ? `This series is computed, not reproduced. ${data.method || ""}`
          : `Reproduced from the Central Bank of Egypt without transformation.`}
          ${data.period_basis === "end" ? " Values are dated to the end of their period." : ""}</p>
        <div class="meta-row">
          ${data.source_url ? `<span><b>Source</b> <a href="${data.source_url}">${data.source_url.replace("https://www.cbe.org.eg", "cbe.org.eg")}</a></span>` : ""}
          ${data.source_file ? `<span><b>File</b> <a href="https://www.cbe.org.eg${data.source_file}">${data.source_file.split("/").pop()}</a></span>` : ""}
          <span><b>API</b> <a href="${API}/series/${encodeURIComponent(id)}.json">JSON</a></span>
        </div>
        <p class="lede" style="margin-top:1rem">
          Suggested citation: Central Bank of Egypt, <i>${data.title_en || id}</i>,
          retrieved from Egypt Macro on ${niceDate(new Date().toISOString().slice(0, 10))}.
        </p>
      </section>
    </div>`;

  render();
  app.querySelectorAll("[data-range]").forEach((b) =>
    b.addEventListener("click", () => { range = b.dataset.range; render(); }));
  app.querySelectorAll("[data-transform]").forEach((b) =>
    b.addEventListener("click", () => { transform = b.dataset.transform; render(); }));
}

async function viewSearch() {
  const index = await loadIndex();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="wrap">
      <div class="search-shell">
        <p class="eyebrow">${index.length.toLocaleString()} series</p>
        <h2 style="font-family:var(--display);margin:.2rem 0 1rem">Find a series</h2>
        <input class="search" id="q" placeholder="dollar, treasury bill yield, deposits, reserves…"
               autocomplete="off" autofocus>
        <div class="results" id="results"></div>
      </div>
    </div>`;

  const input = document.getElementById("q");
  const out = document.getElementById("results");

  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      out.innerHTML = `<p class="empty">Type to search titles and series IDs.</p>`;
      return;
    }
    const terms = q.split(/\s+/);
    const hits = index
      .filter((s) => {
        const hay = `${s.series_id} ${s.title_en || ""} ${s.title_ar || ""}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 80);
    out.innerHTML = hits.length
      ? hits.map((s) => `<a class="result" href="#/s/${encodeURIComponent(s.series_id)}">
           <div class="title">${s.title_en || s.series_id}</div>
           <div class="sub">${s.series_id} · ${s.n.toLocaleString()} obs · ${s.first} to ${s.last}${s.unit ? " · " + s.unit : ""}</div>
         </a>`).join("")
      : `<p class="empty">Nothing matches “${input.value}”.</p>`;
  };

  input.addEventListener("input", run);
  run();
}

function viewAbout() {
  document.getElementById("app").innerHTML = `
    <div class="wrap">
      <section class="section">
        <p class="eyebrow">About</p>
        <h2>An unofficial mirror, kept honest</h2>
        <p class="lede">The Central Bank of Egypt publishes a large and genuinely useful
          body of statistics, and makes it hard to use: no API, no bulk download, and
          files that get overwritten in place when a figure is revised.</p>
        <p class="lede">This scrapes all of it once a day and commits the result, which
          means there is now a record of what CBE published on any past date — something
          that did not exist before and cannot be reconstructed after the fact.</p>
        <p class="lede">Where a number has been computed rather than reproduced — a
          bid-to-cover ratio, a yield-curve bucket, reserves parsed out of a press
          release — the series says so on its own page.</p>
        <p class="lede">The name comes from the Nilometer on Rhoda Island, the graduated
          marble column Cairo read the flood against to forecast the harvest and set the
          tax rate. Egypt's first macroeconomic indicator, in service by 861 AD.</p>
      </section>
    </div>`;
}

/* ---------- routing ---------- */

async function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const nav = document.querySelectorAll("nav [data-route]");
  nav.forEach((a) => a.classList.remove("on"));

  try {
    if (hash.startsWith("/s/")) {
      await viewSeries(decodeURIComponent(hash.slice(3)));
    } else if (hash.startsWith("/search")) {
      document.querySelector('[data-route="search"]')?.classList.add("on");
      await viewSearch();
    } else if (hash.startsWith("/docs")) {
      document.querySelector('[data-route="docs"]')?.classList.add("on");
      await viewDocs();
    } else if (hash.startsWith("/about")) {
      document.querySelector('[data-route="about"]')?.classList.add("on");
      viewAbout();
    } else {
      document.querySelector('[data-route="home"]')?.classList.add("on");
      await viewHome();
    }
  } catch (err) {
    document.getElementById("app").innerHTML =
      `<div class="wrap"><p class="empty">Could not load the data.
        Run <code>python ingest/build_exports.py</code> first, then reload.<br><br>
        <span style="color:var(--down)">${err.message}</span></p></div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------- theme ---------- */

const applyTheme = (t) => {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
};
applyTheme(localStorage.getItem("theme"));
document.getElementById("theme").addEventListener("click", () => {
  const now = document.documentElement.getAttribute("data-theme");
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = now ? (now === "dark" ? "light" : "dark") : (dark ? "light" : "dark");
  localStorage.setItem("theme", next);
  applyTheme(next);
});

window.addEventListener("hashchange", route);
route();
