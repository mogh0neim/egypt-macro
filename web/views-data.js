/* Miqyas -- the data views: overview, browse, topic, series, find.
 *
 * The governing rule for all of these: nobody should have to invent a query.
 * Every screen ends in something clickable, and the search box is an
 * accelerator for people who already know what they want, never the only
 * door in.
 */

/* ---------- curated starting points ----------
 *
 * Seven questions rather than seven series IDs. Each is a real question
 * someone turns up with, answered by a number on the card itself, so the card
 * is useful before it is clicked. The last one runs the full width of the grid
 * because it opens a whole page rather than one series.
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
  { id: "EG.CONIA.ON.RATE", q: "What did overnight money actually cost?", href: "#/money-market", wide: true,
    note: "CONIA, the overnight fixing. Opens the money market page: where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover." },
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

function indicatorRow(s) {
  const c = changeOf(s);
  return (
    "<tr>" +
    '<td class="name"><a href="#/s/' + encodeURIComponent(s.series_id) + '">' + titleHTML(s) + "</a>" +
    '<span class="unit">' + esc(unitShort(s.unit)) + "</span></td>" +
    "<td>" + fmt(s.latest_value, s.unit) + "</td>" +
    '<td class="' + dirClass(c, s.unit) + '">' + changeCell(c, s.unit) + "</td>" +
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
      '<a class="starter' + (c.wide ? " wide" : "") + '" href="' + (c.href || "#/s/" + encodeURIComponent(c.id)) + '">' +
      '<span class="q">' + esc(c.q) + "</span>" +
      '<span class="answer"><b>' + fmt(s.latest_value, s.unit) + "</b>" +
      '<i class="u">' + esc(unitTag(s.unit)) + "</i></span>" +
      '<span class="spark-wrap">' + spark(sparks[c.id], { w: 120, h: 30 }) + "</span>" +
      '<span class="delta ' + dirClass(ch, s.unit) + '">' + changeCell(ch, s.unit) +
      "<i> " + esc(changeLabel(s.freq)) + "</i></span>" +
      '<span class="asof">latest ' + shortDate(s.last) + "</span>" +
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
      "<h3>" + niceDate(latestMPC.date) + ", the committee " +
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
    "<h2>Seven questions, already answered</h2>" +
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
    " series. No search box required. Pick a subject and read down.</p>" +
    '<div class="topic-grid">' + topicGrid + "</div>" +
    "</div></section>" +

    // The overview should be able to reach everything the site has. Without
    // these two, the archive and the downloads exist only in the navigation.
    '<section class="section"><div class="wrap">' +
    '<div class="pair">' +
    '<a class="wide-card" href="#/docs">' +
    '<p class="eyebrow">Documents</p>' +
    "<h3>1,478 publications, read cover to cover</h3>" +
    "<p>Every statistical bulletin, circular, annual report and press release CBE has " +
    "put out as a PDF, 53,006 pages of it. Search inside the text and a result lands you " +
    "on a page number, in English or Arabic.</p>" +
    '<span class="go">Search the archive →</span></a>' +
    '<a class="wide-card" href="#/data">' +
    '<p class="eyebrow">Take it with you</p>' +
    "<h3>Parquet, SQLite, CSV, and a keyless API</h3>" +
    "<p>All " + index.length.toLocaleString() + " series in whichever shape suits you, " +
    "rebuilt every morning. No key, no account, no rate limit, and a SHA-256 for every " +
    "file so a mirror can check itself.</p>" +
    '<span class="go">Downloads and API →</span></a>' +
    "</div></div></section>";

  if (fx) {
    armLines(document.getElementById("hero"));
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
    "Every topic opens onto the CBE tables it came from, so you can read a whole balance of payments rather than hunt one line of it. " +
    "The last card is not a topic: it is a screen assembled out of several of them, for a desk that reads the same numbers every morning.</p>" +
    '<div class="topic-grid">' +
    TOPICS.filter((t) => counts[t.key]).map((t) =>
      '<a class="topic-card" href="#/topic/' + t.key + '">' +
      '<span class="ico" aria-hidden="true">' + t.icon + "</span>" +
      "<h3>" + esc(t.name) + "</h3><p>" + esc(t.blurb) + "</p>" +
      '<span class="count">' + counts[t.key].toLocaleString() + " series · " +
      obs[t.key].toLocaleString() + " observations</span></a>"
    ).join("") +
    '<a class="topic-card desk" href="#/money-market">' +
    '<span class="ico" aria-hidden="true">▩</span>' +
    "<h3>The money market</h3><p>Overnight money inside the CBE corridor, the interbank " +
    "tenors and their volumes, and the EGP bill curve with bid to cover.</p>" +
    '<span class="count">A made-up screen, not a CBE table</span></a>' +
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
      "<td>" + fmt(s.latest_value, s.unit) + '<i class="u">' + esc(unitTag(s.unit)) + "</i></td>" +
      '<td class="' + dirClass(c, s.unit) + ' hide-sm">' + changeCell(c, s.unit) + "</td>" +
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
    "</section>" +
    // The money market page is a curated front door onto part of this topic,
    // so it belongs here rather than only on the overview.
    (key === "rates" ? '<section class="section">' + moneyMarketCard() + "</section>" : "") +
    "</div>";

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

/* ---------- one series ----------
 *
 * The page every search and every click lands on, so it carries the weight.
 * The rule for what belongs here: a reader should be able to answer "is this a
 * lot?", "is this current?" and "can I have it?" without leaving.
 */

/* CBE's own quality flags, which summarise.py has computed on every run and
 * which nothing had ever shown a reader. 742 of the 1,317 series have gone
 * quiet well past their own publishing rhythm, and someone could quote one
 * without ever being told. */
function qualityNotice(meta, data) {
  if (!meta) return "";
  const out = [];
  if (meta.stale_days) {
    const cadence = (FREQ_LABEL[data.freq] || "").toLowerCase();
    out.push(
      '<div class="notice"><h3>This series looks discontinued</h3>' +
      "<p>CBE has published nothing new here since " + niceDate(meta.last) + ": " +
      meta.stale_days.toLocaleString() + " days without a new " +
      (cadence ? esc(cadence) + " reading" : "reading") +
      ". What is below is complete as far as it goes, and it is not current.</p></div>"
    );
  }
  if (meta.zero_values) {
    out.push(
      '<div class="notice"><h3>' + meta.zero_values.toLocaleString() +
      " of these readings are exactly zero</h3>" +
      "<p>CBE publishes a zero where no rate was set rather than leaving the cell " +
      "empty, and they are reproduced here as published rather than treated as " +
      "missing. An average taken across this series will be pulled toward zero.</p></div>"
    );
  }
  /* Anything summarise.py flags that build_exports could not classify. Empty in
   * the catalogue as it stands, and here so that a new kind of flag shows up on
   * the page by itself rather than waiting for someone to notice it. */
  (meta.flags || []).forEach((f) =>
    out.push('<div class="notice"><h3>A note on this series</h3><p>' + esc(f) + "</p></div>")
  );
  return out.join("");
}

/* The largest single step in the record. Led by the absolute change, because
 * that is the figure that always means something: 371 of the 1,298 series with
 * a biggest_move have a percentage change over 500%, computed off a base near
 * zero, and one of them is 2.2 quintillion per cent. A percentage that large is
 * not a fact about the economy, it is a fact about dividing by almost nothing,
 * so it is only shown where it is readable -- and never on a series already
 * measured in percent, where the move in points is the thing that matters and
 * the ratio is noise. */
function biggestMove(move, unit) {
  if (!move || move.change === null || move.change === undefined) return "";
  const tag = unitTag(unit);
  const size = (move.change > 0 ? "+" : "-") + fmtChange(move.change, unit) + (tag ? " " + tag : "");
  const readable = Math.abs(move.pct_change) <= 500 && !/percent/i.test(unit || "");
  return (
    "Biggest single move " + size +
    (readable ? " (" + (move.pct_change > 0 ? "+" : "") + move.pct_change.toFixed(1) + "%)" : "") +
    " on " + niceDate(move.period) + "."
  );
}

/* The graduated column, at full width, with the record low and high dated and
 * the median marked on it. The gauge is the site's one ornament and until now
 * it appeared only inside tables, where it is also hidden on a phone. */
function whereItSits(meta, unit) {
  if (!meta) return "";
  const lo = meta.lowest, hi = meta.highest;
  if (!lo || !hi || lo.value === hi.value) return "";

  const hasMedian = meta.median !== null && meta.median !== undefined && meta.median !== 0;
  const note = [
    hasMedian
      ? "The gold mark is the median of " + (meta.n || 0).toLocaleString() +
        " readings, " + fmt(meta.median, unit) + "."
      : "",
    hasMedian ? vsMedian(meta.latest_value, meta.median) : "",
    biggestMove(meta.biggest_move, unit),
  ].filter(Boolean).join(" ");

  return (
    '<section class="where">' +
    '<p class="eyebrow">Where this sits in its own record</p>' +
    gauge(meta.latest_value, lo.value, hi.value, { w: 1000, h: 26, cls: "wide", median: meta.median }) +
    '<div class="gauge-ends">' +
    "<span>lowest <b>" + fmt(lo.value, unit) + "</b><i>" + niceDate(lo.period) + "</i></span>" +
    '<span class="hi">highest <b>' + fmt(hi.value, unit) + "</b><i>" + niceDate(hi.period) + "</i></span>" +
    "</div>" +
    (note ? '<p class="where-note">' + esc(note) + "</p>" : "") +
    "</section>"
  );
}

/* The readings themselves, newest first. A chart answers "what shape is this";
 * only a table answers "what was the number on the third". */
function observationsTable(points, unit) {
  const CAP = 500;
  const rows = points.slice(-CAP).reverse();
  return (
    '<p class="count-line">' +
    (points.length > CAP
      ? "Newest first. The most recent " + rows.length.toLocaleString() +
        " of " + points.length.toLocaleString() + " readings in this range."
      : "Newest first. All " + rows.length.toLocaleString() + " readings in this range.") +
    "</p>" +
    '<div class="table-scroll"><table class="indicators compact"><thead><tr>' +
    "<th>Period</th><th>Value</th><th>Change</th>" +
    "</tr></thead><tbody>" +
    rows.map((p, i) => {
      const prev = rows[i + 1];
      const c = prev ? p[1] - prev[1] : null;
      return (
        '<tr><td class="period">' + niceDate(p[0]) + "</td>" +
        "<td>" + fmt(p[1], unit) + "</td>" +
        '<td class="' + dirClass(c, unit) + '">' + (prev ? changeCell(c, unit) : "—") + "</td></tr>"
      );
    }).join("") +
    "</tbody></table></div>"
  );
}

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

  // Which windows are worth offering depends on what this series actually
  // covers, so the buttons are built per series rather than from one fixed list.
  const ranges = rangesFor(meta || data);
  const freqKey = data.freq || "?";
  const rememberedRanges = store.get("range", {});
  let range =
    Object.prototype.hasOwnProperty.call(ranges, rememberedRanges[freqKey] || "")
      ? rememberedRanges[freqKey]
      : "Everything";
  let transform = "level";
  let compareId = "";

  // What the export buttons and the table are currently looking at, kept in one
  // place so "this range" cannot drift from what is on the screen.
  const shown = { points: [], unit: "", note: "" };

  const readoutSlot = () => document.getElementById("s-readout");

  const render = async () => {
    const base = TRANSFORMS[transform].fn(applyRange(data.observations, range, ranges));
    const unit = transform === "level" ? data.unit : transform === "yoy" ? "percent" : "index";
    let sets = base, units = unit, labels = null;

    if (compareId) {
      const other = await loadSeries(compareId).catch(() => null);
      if (other) {
        // Two units on one axis is a lie. Both get rebased to 100 so the
        // comparison is about shape, which is the only honest question.
        const rebase = (p) => (p.length && p[0][1] ? p.map((o) => [o[0], (o[1] / p[0][1]) * 100]) : p);
        const a = rebase(applyRange(data.observations, range, ranges));
        const b = rebase(applyRange(other.observations, range, ranges));
        sets = [a, b];
        units = ["index", "index"];
        labels = [data.title_en || id, other.title_en || compareId];
      }
    }

    shown.points = isMulti(sets) ? sets[0] : sets;
    shown.unit = Array.isArray(units) ? units[0] : units;
    shown.note =
      "Range: " + range + ". " +
      (compareId ? "Rebased to 100 at the start of the range." : TRANSFORMS[transform].label + ".");

    const last = shown.points.slice(-1)[0];
    document.getElementById("chart-slot").innerHTML = lineChart(sets, {
      height: 340,
      events: data.family === "fx" ? fxEvents() : [],
      // Four named policy eras, drawn behind the line. Only the pound has them,
      // and only when the chart is about one series.
      regimes: data.family === "fx" && !compareId ? fxRegimes() : [],
      id: "sc",
      unit: shown.unit,
      // A rate that only moves when someone decides it should is a step.
      step: data.freq === "IRR",
    });
    readoutSlot().innerHTML = last
      ? '<span class="val">' + fmt(last[1], shown.unit) + "</span>" +
        '<span class="when">' + niceDate(last[0]) + "</span>" +
        "<span>" + esc(compareId ? "Both rebased to 100 at the start of the range" : TRANSFORMS[transform].label) + "</span>"
      : '<span class="empty">Nothing in this range.</span>';
    armLines(document.getElementById("sc"));
    wireHover(document.getElementById("sc"), sets, units, readoutSlot(), labels);

    document.getElementById("obs-slot").innerHTML = observationsTable(shown.points, shown.unit);

    document.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === range)));
    document.querySelectorAll("[data-transform]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.transform === transform)));
    document.getElementById("legend").innerHTML = compareId
      ? '<span class="key s0"></span>' + titleHTML(data) +
        '<span class="key s1"></span>' + esc((state.byId.get(compareId) || {}).title_en || compareId)
      : "";
  };

  const stats = meta || {};
  const change = changeOf(stats);

  // Comparison candidates: siblings first, then the headline series, so the
  // dropdown is useful whether you want context inside the same table or
  // against the pound.
  const compareOptions = [{ id: "", label: "Compare with… (nothing selected)" }]
    .concat(siblings.slice(0, 25).map((s) => ({ id: s.series_id, label: lineOf(s) + " (same table)" })))
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
    '<span class="u">' + esc(unitTag(data.unit) || (data.unit ? "" : "no unit stated")) + "</span>" +
    '<span class="d ' + dirClass(change, data.unit) + '">' + changeCell(change, data.unit) +
    " " + esc(changeLabel(data.freq)) + "</span>" +
    '<span class="asof">as of ' + niceDate(stats.last) + " · " + staleness(stats.last) + "</span>" +
    "</div>" +
    '<div class="meta-row">' +
    "<span><b>Published</b> " + esc(FREQ_LABEL[data.freq] || data.freq || "—") + "</span>" +
    "<span><b>Readings</b> " + data.count.toLocaleString() + "</span>" +
    "<span><b>Covers</b> " + (stats.first ? niceDate(stats.first) + " to " + niceDate(stats.last) : "—") + "</span>" +
    (data.derived ? "<span><b>Computed by us</b> yes</span>" : "<span><b>Reproduced as published</b> yes</span>") +
    "</div></div>" +

    qualityNotice(meta, data) +
    whereItSits(meta, data.unit) +

    '<div class="controls">' +
    Object.keys(ranges).map((k) => '<button class="chip" data-range="' + esc(k) + '">' + esc(k) + "</button>").join("") +
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
    '<button class="chip solid" id="dl-range">This range as CSV</button>' +
    '<button class="chip" id="dl-all">Everything as CSV</button>' +
    '<button class="chip" id="copy-tsv">Copy for a spreadsheet</button>' +
    '<a class="chip" href="' + API + "/series/" + encodeURIComponent(id) + '.json" target="_blank" rel="noopener">Open the JSON</a>' +
    '<button class="chip" id="share">Copy a link to this page</button>' +
    "</div>" +

    '<details class="obs"><summary><span class="g-name">The readings themselves</span>' +
    '<span class="g-meta">' + data.count.toLocaleString() + " in total</span></summary>" +
    '<div id="obs-slot"></div></details>' +

    '<section class="section two-col">' +
    "<div>" +
    '<p class="eyebrow">Where this comes from</p>' +
    "<h2>Provenance</h2>" +
    '<p class="lede">' +
    (data.derived
      ? "This series is computed, not reproduced. " + esc(data.method || "")
      : "Reproduced from the Central Bank of Egypt with no transformation.") +
    (data.period_basis === "end" ? " Values are dated to the end of the period they describe." : "") +
    (data.unit
      ? ""
      : " CBE's own sheet did not state a unit anywhere the parser could find one, so the " +
        "figures are reproduced without one rather than given a guessed label.") +
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
    (data.dataset ? "<span><b>Dataset</b> " + esc(data.dataset) + "</span>" : "") +
    "</div>" +
    '<p class="cite">Suggested citation: Central Bank of Egypt, <i>' + esc(data.title_en || id) +
    "</i>, retrieved from Miqyas on " + niceDate(new Date().toISOString().slice(0, 10)) + ".</p>" +
    "</div>" +
    "<div>" +
    '<p class="eyebrow">Same table</p>' +
    "<h2>" + esc(table) + "</h2>" +
    (siblings.length
      ? '<ul class="sib-list">' + siblings.slice(0, 10).map((s) =>
          '<li><a href="#/s/' + encodeURIComponent(s.series_id) + '">' +
          (ARABIC_RE.test(lineOf(s)) ? '<span dir="auto">' + esc(lineOf(s)) + "</span>" : esc(lineOf(s))) +
          "</a><b>" + fmt(s.latest_value, s.unit) +
          '<i class="u">' + esc(unitTag(s.unit)) + "</i></b></li>").join("") + "</ul>" +
        (siblings.length > 10
          ? '<p class="foot-note">' + (siblings.length - 10) + " more lines in this table.</p>"
          : "") +
        (topic ? '<a class="go" href="#/topic/' + topic.key + '">All ' + esc(topic.name.toLowerCase()) + " series →</a>" : "")
      : '<p class="lede">Nothing else came from this table.</p>') +
    "</div></section></div>";

  await render();

  app.querySelectorAll("[data-range]").forEach((b) =>
    b.addEventListener("click", () => {
      range = b.dataset.range;
      // Remembered per frequency rather than per series: someone who wants five
      // years of one daily fixing wants five years of the next one too, and the
      // same words would mean a very different window on a quarterly series.
      const kept = store.get("range", {});
      kept[freqKey] = range;
      store.set("range", kept);
      render();
    })
  );
  app.querySelectorAll("[data-transform]").forEach((b) => b.addEventListener("click", () => { transform = b.dataset.transform; render(); }));
  document.getElementById("cmp").addEventListener("change", (e) => {
    compareId = e.target.value;
    if (compareId) transform = "level";
    render();
  });
  document.getElementById("dl-range").addEventListener("click", () =>
    downloadCSV(id, shown.points, data, shown.note));
  document.getElementById("dl-all").addEventListener("click", () =>
    downloadCSV(id, data.observations, data, "Every observation, as published."));
  document.getElementById("copy-tsv").addEventListener("click", (e) =>
    copyTSV(e.target, shown.points, ["period", data.series_id]));
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
