/* Miqyas -- the data views: overview, browse, topic, series, find.
 *
 * The governing rule for all of these: nobody should have to invent a query.
 * Every screen ends in something clickable, and the search box is an
 * accelerator for people who already know what they want, never the only
 * door in.
 */

/* ---------- curated starting points ----------
 *
 * Six questions rather than six series IDs. Each is a real question someone
 * turns up with, answered by a number on the card itself, so the card is
 * useful before it is clicked.
 */

const STARTERS = [
  { id: "EG.FX.OFF.USD.SELL", q: "What is a dollar worth?",
    note: "CBE's official selling rate, every business day since 2005." },
  { id: "EG.RATE.ON.DEP", q: "Where are interest rates?", href: "#/rates",
    note: "The overnight deposit rate, the floor of the CBE corridor." },
  { id: "EG.CPI.HDL.YOY", q: "How fast are prices rising?",
    note: "Headline consumer prices against the same month a year earlier." },
  { id: "EG.RES.NIR", q: "How big are the reserves?",
    note: "Net international reserves, read out of CBE's monthly press release." },
  { id: "EG.TB.EGP.12M.YLD.WAVG", q: "What is the government paying to borrow?",
    note: "Weighted average yield at the 12-month treasury bill auction." },
  { id: "EG.EXT.REMIT.FYTD", q: "What are Egyptians abroad sending home?",
    note: "Workers' remittances, cumulative across the fiscal year." },
];

/* The headline table on the overview. Order inside a group is deliberate. */
const HEADLINE_GROUPS = [
  { label: "Exchange rates", ids: ["EG.FX.OFF.USD.SELL", "EG.FX.MKT.USD.SELL", "EG.FX.IBK.WAVG"] },
  { label: "Policy rates", ids: ["EG.RATE.ON.DEP", "EG.RATE.ON.LEND", "EG.RATE.MAIN", "EG.RATE.DISCOUNT"] },
  { label: "Prices", ids: ["EG.CPI.HDL.YOY", "EG.CPI.CORE.YOY"] },
  { label: "External", ids: ["EG.RES.NIR", "EG.EXT.REMIT.FYTD"] },
  { label: "Treasury bills", ids: ["EG.TB.EGP.3M.YLD.WAVG", "EG.TB.EGP.6M.YLD.WAVG", "EG.TB.EGP.12M.YLD.WAVG", "EG.TB.EGP.3M.BIDCOVER"] },
  { label: "Money market", ids: ["EG.CONIA.ON.RATE", "EG.IBK.D.ON"] },
];

const changeOf = (s) =>
  s && s.previous !== null && s.previous !== undefined ? s.latest_value - s.previous : null;

const dirClass = (c) => (c === null || c === 0 ? "" : c > 0 ? "up" : "down");
const dirArrow = (c) => (c === null || c === 0 ? "" : c > 0 ? "▲" : "▼");

function indicatorRow(s) {
  const c = changeOf(s);
  return (
    "<tr>" +
    '<td class="name"><a href="#/s/' + encodeURIComponent(s.series_id) + '">' + titleHTML(s) + "</a>" +
    '<span class="unit">' + esc(unitShort(s.unit)) + "</span></td>" +
    "<td>" + fmt(s.latest_value, s.unit) + "</td>" +
    '<td class="' + dirClass(c) + '">' + dirArrow(c) + " " + fmtChange(c, s.unit) + "</td>" +
    '<td class="hide-sm">' + fmt(s.lowest && s.lowest.value, s.unit) + "</td>" +
    '<td class="hide-sm">' + fmt(s.highest && s.highest.value, s.unit) + "</td>" +
    '<td class="hide-sm">' + gauge(s.latest_value, s.lowest && s.lowest.value, s.highest && s.highest.value) + "</td>" +
    '<td class="asof">' + shortDate(s.last) + "</td>" +
    "</tr>"
  );
}

/* ---------- overview ---------- */

async function viewHome() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);

  const index = await loadIndex();
  const sparks = await loadSparks();
  const fx = await loadSeries("EG.FX.OFF.USD.SELL").catch(() => null);
  const mpc = await loadMPC();

  const first = fx && fx.observations[0];
  const last = fx && fx.observations[fx.observations.length - 1];
  const multiple = first && last ? (last[1] / first[1]).toFixed(1) : null;

  const starters = STARTERS.map((c) => {
    const s = state.byId.get(c.id);
    if (!s) return "";
    const ch = changeOf(s);
    return (
      '<a class="starter" href="' + (c.href || "#/s/" + encodeURIComponent(c.id)) + '">' +
      '<span class="q">' + esc(c.q) + "</span>" +
      '<span class="answer"><b>' + fmt(s.latest_value, s.unit) + "</b>" +
      '<i class="u">' + esc(unitShort(s.unit)) + "</i></span>" +
      '<span class="spark-wrap">' + spark(sparks[c.id], { w: 150, h: 30 }) + "</span>" +
      '<span class="delta ' + dirClass(ch) + '">' + dirArrow(ch) + " " + fmtChange(ch, s.unit) +
      '<i> since ' + shortDate(s.last) + "</i></span>" +
      '<span class="note">' + esc(c.note) + "</span></a>"
    );
  }).join("");

  const table = HEADLINE_GROUPS.map((g) => {
    const rows = g.ids.map((id) => state.byId.get(id)).filter(Boolean);
    if (!rows.length) return "";
    return '<tr class="group-head"><td colspan="7">' + esc(g.label) + "</td></tr>" + rows.map(indicatorRow).join("");
  }).join("");

  const counts = {};
  index.forEach((s) => { const k = topicOf(s); counts[k] = (counts[k] || 0) + 1; });
  const topicGrid = TOPICS.filter((t) => counts[t.key]).map((t) =>
    '<a class="topic-card" href="#/topic/' + t.key + '">' +
    '<span class="ico" aria-hidden="true">' + t.icon + "</span>" +
    "<h3>" + esc(t.name) + "</h3>" +
    "<p>" + esc(t.blurb) + "</p>" +
    '<span class="count">' + counts[t.key].toLocaleString() + " series</span></a>"
  ).join("");

  const latestMPC = mpc && mpc.statements && mpc.statements[mpc.statements.length - 1];
  const mpcCard = latestMPC
    ? '<a class="wide-card" href="#/rates">' +
      '<p class="eyebrow">Latest rate decision</p>' +
      "<h3>" + niceDate(latestMPC.date) + " — the committee " +
      ({ hold: "left rates unchanged", cut: "cut", hike: "raised" }[latestMPC.decision] || "met") + "</h3>" +
      "<p>Overnight deposit " + esc(latestMPC.deposit_rate || "—") + "%, overnight lending " +
      esc(latestMPC.lending_rate || "—") + "%. Every decision back to June 2005, with what changed in the wording each time.</p>" +
      '<span class="go">See all ' + (mpc.count || 0) + " decisions →</span></a>"
    : "";

  app.innerHTML =
    '<section class="hero"><div class="wrap">' +
    "<h1>What the pound did, and everything underneath it.</h1>" +
    '<p class="standfirst">' +
    (multiple
      ? "The Central Bank's official dollar rate has moved <b>" + multiple +
        "×</b> since January 2005. Every step of it, plus " + index.length.toLocaleString() +
        " other series, rebuilt from CBE's own publications each morning."
      : "Egypt's macroeconomic record, rebuilt from CBE's own publications each morning.") +
    "</p>" +
    '<div class="hero-chart">' +
    (fx ? lineChart(fx.observations, { height: 300, events: fxEvents(), id: "hero", unit: fx.unit }) : "") +
    "</div>" +
    '<div class="readout" id="hero-readout">' +
    '<span class="val">' + (last ? fmt(last[1], fx.unit) : "—") + "</span>" +
    '<span class="when">' + (last ? niceDate(last[0]) : "") + "</span>" +
    "<span>EGP per US dollar, CBE selling rate</span></div>" +
    "</div></section>" +

    '<section class="section band"><div class="wrap">' +
    '<p class="eyebrow">Start here</p>' +
    "<h2>Six questions, already answered</h2>" +
    '<p class="lede">Every number below is the latest CBE has published. Click one to see its whole history.</p>' +
    '<div class="starters">' + starters + "</div>" +
    "</div></section>" +

    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">At a glance</p>' +
    "<h2>Headline indicators</h2>" +
    '<p class="lede">Latest reading, the change since the one before it, and where that sits between the series’ own record low and high.</p>' +
    '<div class="table-scroll"><table class="indicators"><thead><tr>' +
    "<th>Series</th><th>Latest</th><th>Change</th>" +
    '<th class="hide-sm">Lowest</th><th class="hide-sm">Highest</th>' +
    '<th class="hide-sm">Where it sits</th><th>As of</th>' +
    "</tr></thead><tbody>" + table + "</tbody></table></div>" +
    "</div></section>" +

    (mpcCard ? '<section class="section"><div class="wrap">' + mpcCard + "</div></section>" : "") +

    '<section class="section band"><div class="wrap">' +
    '<p class="eyebrow">Browse</p>' +
    "<h2>Everything, by subject</h2>" +
    '<p class="lede">Thirteen topics over ' + index.length.toLocaleString() +
    " series. No search box required — pick a subject and read down.</p>" +
    '<div class="topic-grid">' + topicGrid + "</div>" +
    "</div></section>";

  if (fx) {
    wireHover(document.getElementById("hero"), fx.observations, fx.unit, document.getElementById("hero-readout"));
  }
}

/* ---------- browse: all topics ---------- */

async function viewBrowse() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);
  const index = await loadIndex();

  const counts = {}, obs = {};
  index.forEach((s) => {
    const k = topicOf(s);
    counts[k] = (counts[k] || 0) + 1;
    obs[k] = (obs[k] || 0) + (s.n || 0);
  });

  app.innerHTML =
    '<div class="wrap"><section class="section">' +
    '<p class="eyebrow">Browse</p>' +
    "<h2>All of it, by subject</h2>" +
    '<p class="lede">' + index.length.toLocaleString() + " series in thirteen topics. " +
    "Every topic opens onto the CBE tables it came from, so you can read a whole balance of payments rather than hunt one line of it.</p>" +
    '<div class="topic-grid">' +
    TOPICS.filter((t) => counts[t.key]).map((t) =>
      '<a class="topic-card" href="#/topic/' + t.key + '">' +
      '<span class="ico" aria-hidden="true">' + t.icon + "</span>" +
      "<h3>" + esc(t.name) + "</h3><p>" + esc(t.blurb) + "</p>" +
      '<span class="count">' + counts[t.key].toLocaleString() + " series · " +
      obs[t.key].toLocaleString() + " observations</span></a>"
    ).join("") +
    "</div></section></div>";
}

/* ---------- one topic ---------- */

async function viewTopic(key) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);
  const topic = topicByKey(key);
  if (!topic) {
    app.innerHTML = '<div class="wrap"><p class="empty">No such topic. <a href="#/browse">See all thirteen</a>.</p></div>';
    return;
  }

  const index = await loadIndex();
  const sparks = await loadSparks();
  const mine = index.filter((s) => topicOf(s) === key);

  // Group into the CBE tables the series came from. A table with one line in
  // it is not a table, so those collect into a single "Other" group rather
  // than producing thirty single-row accordions.
  const groups = new Map();
  mine.forEach((s) => {
    const t = tableOf(s);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(s);
  });
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const freqs = [...new Set(mine.map((s) => s.freq).filter(Boolean))]
    .sort((a, b) => "DWBWMQA".indexOf(a) - "DWBWMQA".indexOf(b));

  const seriesRow = (s) => {
    const c = changeOf(s);
    return (
      '<tr data-title="' + esc(((s.title_en || "") + " " + s.series_id).toLowerCase()) + '" data-freq="' + esc(s.freq || "") + '">' +
      '<td class="name"><a href="#/s/' + encodeURIComponent(s.series_id) + '">' +
      (ARABIC_RE.test(lineOf(s)) ? '<span dir="auto">' + esc(lineOf(s)) + "</span>" : esc(lineOf(s))) +
      "</a></td>" +
      '<td class="sparkcell">' + spark(sparks[s.series_id], { w: 82, h: 22 }) + "</td>" +
      "<td>" + fmt(s.latest_value, s.unit) + '<i class="u">' + esc(unitShort(s.unit)) + "</i></td>" +
      '<td class="' + dirClass(c) + ' hide-sm">' + dirArrow(c) + " " + fmtChange(c, s.unit) + "</td>" +
      '<td class="asof">' + shortDate(s.first) + " – " + shortDate(s.last) + "</td>" +
      '<td class="asof hide-sm">' + esc(FREQ_LABEL[s.freq] || s.freq || "") + "</td>" +
      "</tr>"
    );
  };

  const accordions = ordered.map((entry, i) => {
    const name = entry[0], rows = entry[1];
    rows.sort((a, b) => (a.title_en || "").localeCompare(b.title_en || ""));
    const covers = rows.map((r) => r.first).filter(Boolean).sort()[0];
    return (
      "<details class=\"group\"" + (i === 0 ? " open" : "") + ">" +
      "<summary><span class=\"g-name\">" + esc(name) + "</span>" +
      '<span class="g-meta">' + rows.length + " series · from " + shortDate(covers) + "</span></summary>" +
      '<div class="table-scroll"><table class="indicators compact"><thead><tr>' +
      "<th>Line</th><th></th><th>Latest</th>" +
      '<th class="hide-sm">Change</th><th>Covers</th><th class="hide-sm">Published</th>' +
      "</tr></thead><tbody>" + rows.map(seriesRow).join("") + "</tbody></table></div></details>"
    );
  }).join("");

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "Browse", href: "#/browse" }, { label: topic.name }]) +
    '<section class="section topic-head">' +
    '<p class="eyebrow">' + topic.icon + " Topic</p>" +
    "<h2>" + esc(topic.name) + "</h2>" +
    '<p class="lede">' + esc(topic.blurb) + " " + mine.length.toLocaleString() +
    " series across " + ordered.length + (ordered.length === 1 ? " CBE table." : " CBE tables.") + "</p>" +
    '<div class="controls">' +
    '<input class="filter" id="tfilter" placeholder="Narrow this topic (optional)" autocomplete="off">' +
    '<span class="spacer"></span>' +
    '<button class="chip" data-freq="" aria-pressed="true">Any frequency</button>' +
    freqs.map((f) => '<button class="chip" data-freq="' + f + '" aria-pressed="false">' + esc(FREQ_LABEL[f] || f) + "</button>").join("") +
    '<button class="chip" id="expand-all">Open all tables</button>' +
    "</div>" +
    '<div id="groups">' + accordions + "</div>" +
    "</section></div>";

  let freq = "";
  const filterInput = document.getElementById("tfilter");
  const apply = () => {
    const q = filterInput.value.trim().toLowerCase();
    document.querySelectorAll("#groups details.group").forEach((d) => {
      let shown = 0;
      d.querySelectorAll("tbody tr").forEach((tr) => {
        const ok = (!q || tr.dataset.title.includes(q)) && (!freq || tr.dataset.freq === freq);
        tr.classList.toggle("hidden", !ok);
        if (ok) shown++;
      });
      d.classList.toggle("hidden", shown === 0);
      if ((q || freq) && shown) d.open = true;
    });
  };
  filterInput.addEventListener("input", apply);
  // Scoped to buttons on purpose: the table rows carry data-freq too, and an
  // unscoped selector would turn every click on a row into a filter change.
  app.querySelectorAll("button[data-freq]").forEach((b) =>
    b.addEventListener("click", () => {
      freq = b.dataset.freq;
      app.querySelectorAll("button[data-freq]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x.dataset.freq === freq)));
      apply();
    })
  );
  document.getElementById("expand-all").addEventListener("click", (e) => {
    const opening = e.target.textContent.indexOf("Open") === 0;
    document.querySelectorAll("#groups details.group").forEach((d) => (d.open = opening));
    e.target.textContent = opening ? "Close all tables" : "Open all tables";
  });
}

/* ---------- one series ---------- */

async function viewSeries(id) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(7);

  const index = await loadIndex();
  const meta = state.byId.get(id);
  let data;
  try {
    data = await loadSeries(id);
  } catch (err) {
    app.innerHTML =
      '<div class="wrap"><p class="empty">There is no series called <code>' + esc(id) + "</code>. " +
      '<a href="#/browse">Browse by subject</a> or <a href="#/find">search the catalogue</a>.</p></div>';
    return;
  }

  const topicKey = topicOf(data);
  const topic = topicByKey(topicKey);
  const table = tableOf(data);
  const siblings = index
    .filter((s) => s.series_id !== id && tableOf(s) === table && topicOf(s) === topicKey)
    .slice(0, 40);

  let range = "Everything";
  let transform = "level";
  let compareId = "";

  const readoutSlot = () => document.getElementById("s-readout");

  const render = async () => {
    const base = TRANSFORMS[transform].fn(applyRange(data.observations, range));
    const unit = transform === "level" ? data.unit : transform === "yoy" ? "percent" : "index";
    let sets = base, units = unit, labels = null;

    if (compareId) {
      const other = await loadSeries(compareId).catch(() => null);
      if (other) {
        // Two units on one axis is a lie. Both get rebased to 100 so the
        // comparison is about shape, which is the only honest question.
        const rebase = (p) => (p.length && p[0][1] ? p.map((o) => [o[0], (o[1] / p[0][1]) * 100]) : p);
        const a = rebase(applyRange(data.observations, range));
        const b = rebase(applyRange(other.observations, range));
        sets = [a, b];
        units = ["index", "index"];
        labels = [data.title_en || id, other.title_en || compareId];
      }
    }

    const last = (isMulti(sets) ? sets[0] : sets).slice(-1)[0];
    document.getElementById("chart-slot").innerHTML = lineChart(sets, {
      height: 340,
      events: data.family === "fx" ? fxEvents() : [],
      id: "sc",
      unit: Array.isArray(units) ? units[0] : units,
    });
    readoutSlot().innerHTML = last
      ? '<span class="val">' + fmt(last[1], Array.isArray(units) ? units[0] : units) + "</span>" +
        '<span class="when">' + niceDate(last[0]) + "</span>" +
        "<span>" + esc(compareId ? "Both rebased to 100 at the start of the range" : TRANSFORMS[transform].label) + "</span>"
      : '<span class="empty">Nothing in this range.</span>';
    wireHover(document.getElementById("sc"), sets, units, readoutSlot(), labels);

    document.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === range)));
    document.querySelectorAll("[data-transform]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.transform === transform)));
    document.getElementById("legend").innerHTML = compareId
      ? '<span class="key s0"></span>' + titleHTML(data) +
        '<span class="key s1"></span>' + esc((state.byId.get(compareId) || {}).title_en || compareId)
      : "";
  };

  const stats = meta || {};
  const change = changeOf(stats);

  // Comparison candidates: siblings first, then the six headline series, so
  // the dropdown is useful whether you want context inside the same table or
  // against the pound.
  const compareOptions = [{ id: "", label: "Compare with… (nothing selected)" }]
    .concat(siblings.slice(0, 25).map((s) => ({ id: s.series_id, label: lineOf(s) + " — same table" })))
    .concat(STARTERS.filter((c) => c.id !== id && state.byId.get(c.id))
      .map((c) => ({ id: c.id, label: (state.byId.get(c.id).title_en || c.id) })));

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([
      { label: "Browse", href: "#/browse" },
      topic ? { label: topic.name, href: "#/topic/" + topic.key } : { label: "Other" },
      { label: table },
    ]) +
    '<div class="series-head">' +
    '<span class="series-id">' + esc(data.series_id) + "</span>" +
    "<h1>" + titleHTML(data) + "</h1>" +
    '<div class="big-figure">' +
    '<span class="v">' + fmt(stats.latest_value, data.unit) + "</span>" +
    // fmt() already prints the % sign, so repeating it under the figure would
    // just be the same character twice.
    '<span class="u">' + esc(unitShort(data.unit) === "%" ? "" : unitShort(data.unit) || "no unit stated") + "</span>" +
    '<span class="d ' + dirClass(change) + '">' + dirArrow(change) + " " + fmtChange(change, data.unit) +
    " since the previous reading</span>" +
    '<span class="asof">as of ' + niceDate(stats.last) + " · " + staleness(stats.last) + "</span>" +
    "</div>" +
    '<div class="meta-row">' +
    "<span><b>Published</b> " + esc(FREQ_LABEL[data.freq] || data.freq || "—") + "</span>" +
    "<span><b>Readings</b> " + data.count.toLocaleString() + "</span>" +
    "<span><b>Covers</b> " + (stats.first ? niceDate(stats.first) + " to " + niceDate(stats.last) : "—") + "</span>" +
    (data.derived ? "<span><b>Computed by us</b> yes</span>" : "<span><b>Reproduced as published</b> yes</span>") +
    "</div></div>" +

    '<div class="controls">' +
    Object.keys(RANGES).map((k) => '<button class="chip" data-range="' + esc(k) + '">' + esc(k) + "</button>").join("") +
    "</div>" +
    '<div class="controls">' +
    Object.keys(TRANSFORMS).map((k) => '<button class="chip" data-transform="' + k + '">' + esc(TRANSFORMS[k].label) + "</button>").join("") +
    '<span class="spacer"></span>' +
    '<select class="chip" id="cmp">' +
    compareOptions.map((o) => '<option value="' + esc(o.id) + '">' + esc(o.label) + "</option>").join("") +
    "</select></div>" +

    '<div id="chart-slot"></div>' +
    '<div class="legend" id="legend"></div>' +
    '<div class="readout" id="s-readout"></div>' +

    '<div class="controls">' +
    '<button class="chip solid" id="dl-csv">Download this series as CSV</button>' +
    '<a class="chip" href="' + API + "/series/" + encodeURIComponent(id) + '.json" target="_blank" rel="noopener">Open the JSON</a>' +
    '<button class="chip" id="share">Copy a link to this page</button>' +
    "</div>" +

    '<section class="section two-col">' +
    "<div>" +
    '<p class="eyebrow">Where this comes from</p>' +
    "<h2>Provenance</h2>" +
    '<p class="lede">' +
    (data.derived
      ? "This series is computed, not reproduced. " + esc(data.method || "")
      : "Reproduced from the Central Bank of Egypt with no transformation.") +
    (data.period_basis === "end" ? " Values are dated to the end of the period they describe." : "") +
    "</p>" +
    '<div class="meta-col">' +
    (data.source_url
      ? "<span><b>CBE page</b> <a href=\"" + esc(data.source_url) + '" target="_blank" rel="noopener">' +
        esc(data.source_url.replace("https://www.cbe.org.eg", "cbe.org.eg")) + "</a></span>"
      : "") +
    (data.source_file
      ? "<span><b>Source file</b> <a href=\"" +
        esc(data.source_file.startsWith("http") ? data.source_file : "https://www.cbe.org.eg" + data.source_file) +
        '" target="_blank" rel="noopener">' + esc(String(data.source_file).split("/").pop()) + "</a></span>"
      : "") +
    "</div>" +
    '<p class="cite">Suggested citation: Central Bank of Egypt, <i>' + esc(data.title_en || id) +
    "</i>, retrieved from Miqyas on " + niceDate(new Date().toISOString().slice(0, 10)) + ".</p>" +
    "</div>" +
    "<div>" +
    '<p class="eyebrow">Same table</p>' +
    "<h2>" + esc(table) + "</h2>" +
    (siblings.length
      ? '<ul class="sib-list">' + siblings.slice(0, 12).map((s) =>
          '<li><a href="#/s/' + encodeURIComponent(s.series_id) + '">' +
          (ARABIC_RE.test(lineOf(s)) ? '<span dir="auto">' + esc(lineOf(s)) + "</span>" : esc(lineOf(s))) +
          "</a><b>" + fmt(s.latest_value, s.unit) + "</b></li>").join("") + "</ul>" +
        (topic ? '<a class="go" href="#/topic/' + topic.key + '">All ' + esc(topic.name.toLowerCase()) + " series →</a>" : "")
      : '<p class="lede">Nothing else came from this table.</p>') +
    "</div></section></div>";

  await render();

  app.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { range = b.dataset.range; render(); }));
  app.querySelectorAll("[data-transform]").forEach((b) => b.addEventListener("click", () => { transform = b.dataset.transform; render(); }));
  document.getElementById("cmp").addEventListener("change", (e) => {
    compareId = e.target.value;
    if (compareId) transform = "level";
    render();
  });
  document.getElementById("dl-csv").addEventListener("click", () => downloadCSV(id, data.observations, data));
  document.getElementById("share").addEventListener("click", (e) => copyLink(e.target));
}

/* ---------- find a series ---------- */

const FIND_SUGGESTIONS = [
  "dollar", "treasury bill yield", "deposits", "reserves", "inflation",
  "exports", "tourists", "external debt", "budget deficit", "remittances",
];

async function viewFind(preset) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(5);
  const index = await loadIndex();
  const sparks = await loadSparks();

  app.innerHTML =
    '<div class="wrap"><div class="search-shell">' +
    '<p class="eyebrow">' + index.length.toLocaleString() + " series</p>" +
    "<h2>Find a series</h2>" +
    '<p class="lede">If you would rather not type, <a href="#/browse">browse by subject</a> instead.</p>' +
    '<input class="search" id="q" placeholder="dollar, treasury bill yield, tourists…" autocomplete="off" autofocus>' +
    '<div class="controls suggest">' +
    '<span class="hint">Try:</span>' +
    FIND_SUGGESTIONS.map((s) => '<button class="chip" data-sug="' + esc(s) + '">' + esc(s) + "</button>").join("") +
    "</div>" +
    '<div class="results" id="results"></div>' +
    "</div></div>";

  const input = document.getElementById("q");
  const out = document.getElementById("results");

  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      out.innerHTML =
        '<p class="empty">Type a word, or pick one of the suggestions above. ' +
        'Titles and series IDs are both searched, in English and Arabic.</p>';
      return;
    }
    const terms = q.split(/\s+/);
    const hits = index
      .filter((s) => {
        const hay = (s.series_id + " " + (s.title_en || "") + " " + (s.title_ar || "")).toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 100);
    out.innerHTML = hits.length
      ? '<p class="count-line">' + hits.length + (hits.length === 100 ? "+" : "") + " matching series</p>" +
        hits.map((s) =>
          '<a class="result rich" href="#/s/' + encodeURIComponent(s.series_id) + '">' +
          '<span class="title">' + titleHTML(s) + "</span>" +
          '<span class="spk">' + spark(sparks[s.series_id], { w: 70, h: 20 }) + "</span>" +
          '<span class="v">' + fmt(s.latest_value, s.unit) + "</span>" +
          '<span class="sub">' + esc(s.series_id) + " · " + (s.n || 0).toLocaleString() + " readings · " +
          shortDate(s.first) + " – " + shortDate(s.last) + (s.unit ? " · " + esc(unitShort(s.unit)) : "") + "</span></a>"
        ).join("")
      : '<p class="empty">Nothing matches “' + esc(input.value) + '”. ' +
        'Try a broader word, or <a href="#/browse">browse by subject</a>.</p>';
  };

  input.addEventListener("input", run);
  app.querySelectorAll("[data-sug]").forEach((b) =>
    b.addEventListener("click", () => { input.value = b.dataset.sug; run(); input.focus(); })
  );
  if (preset) input.value = preset;
  run();
}
