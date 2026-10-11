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
  { id: "EG.FX.OFF.USD.SELL", q: t("What is a dollar worth?"),
    note: t("CBE's official selling rate, every business day since 2005.") },
  { id: "EG.RATE.ON.DEP", q: t("Where are interest rates?"), href: "#/rates",
    note: t("The overnight deposit rate, the floor of the CBE corridor.") },
  { id: "EG.CPI.HDL.YOY", q: t("How fast are prices rising?"),
    note: t("Headline consumer prices against the same month a year earlier.") },
  { id: "EG.RES.NIR", q: t("How big are the reserves?"),
    note: t("Net international reserves, read out of CBE's monthly press release.") },
  { id: "EG.TB.EGP.12M.YLD.WAVG", q: t("What is the government paying to borrow?"),
    note: t("Weighted average yield at the 12-month treasury bill auction.") },
  { id: "EG.EXT.REMIT.FYTD", q: t("What are Egyptians abroad sending home?"),
    note: t("Workers' remittances, cumulative across the fiscal year.") },
  { id: "EG.CONIA.ON.RATE", q: t("What did overnight money actually cost?"), href: "#/money-market", wide: true,
    note: t("CONIA, the overnight fixing. Opens the money market page: where the pound funded inside the CBE corridor, the interbank tenors with their volumes, and the EGP bill curve with bid to cover.") },
];

/* The headline table on the overview. Order inside a group is deliberate. */
const HEADLINE_GROUPS = [
  { label: t("Foreign exchange"), ids: ["EG.FX.OFF.USD.SELL", "EG.FX.MKT.USD.SELL", "EG.FX.IBK.WAVG"] },
  { label: t("Policy rates"), ids: ["EG.RATE.ON.DEP", "EG.RATE.ON.LEND", "EG.RATE.MAIN", "EG.RATE.DISCOUNT"] },
  { label: t("Prices"), ids: ["EG.CPI.HDL.YOY", "EG.CPI.CORE.YOY"] },
  { label: t("External"), ids: ["EG.RES.NIR", "EG.EXT.REMIT.FYTD"] },
  { label: t("Treasury bills"), ids: ["EG.TB.EGP.3M.YLD.WAVG", "EG.TB.EGP.6M.YLD.WAVG", "EG.TB.EGP.12M.YLD.WAVG", "EG.TB.EGP.3M.BIDCOVER"] },
  { label: t("Money market"), ids: ["EG.CONIA.ON.RATE", "EG.IBK.D.ON"] },
];

const changeOf = (s) =>
  s && s.previous !== null && s.previous !== undefined ? s.latest_value - s.previous : null;

/* One row of the workhorse table, shared by the overview, the money market page
 * and the desk. opts.spark swaps the record low and high for a shape, which is
 * what a desk wants day to day: the position of a rate inside its twenty-year
 * range matters less each morning than which way it has been going. */
function indicatorRow(s, opts) {
  opts = opts || {};
  const c = changeOf(s);
  return (
    "<tr>" +
    '<td class="star-col">' + starButton(s.series_id) + "</td>" +
    '<td class="name"><a href="#/s/' + encodeURIComponent(s.series_id) + '">' + titleHTML(s) + "</a>" +
    '<span class="unit">' + esc(unitShort(s.unit)) + "</span></td>" +
    (opts.spark ? '<td class="sparkcell hide-sm">' + spark(opts.spark, { w: 82, h: 22, step: s.freq === "IRR" }) + "</td>" : "") +
    "<td>" + fmt(s.latest_value, s.unit) + "</td>" +
    '<td class="' + dirClass(c, s.unit) + '">' + changeCell(c, s.unit) + "</td>" +
    (opts.spark
      ? ""
      : '<td class="hide-sm">' + fmt(s.lowest && s.lowest.value, s.unit) + "</td>" +
        '<td class="hide-sm">' + fmt(s.highest && s.highest.value, s.unit) + "</td>") +
    // The gauge stays at every width. It was hidden on a phone alongside the two
    // columns it summarises, which is exactly backwards: it says what they say,
    // in a quarter of the space.
    "<td>" + gauge(s.latest_value, s.lowest && s.lowest.value, s.highest && s.highest.value, { median: s.median }) + "</td>" +
    // At the size of the period: a day for a daily rate, "Aug 2026" for a month.
    '<td class="asof">' + periodLabel(s.last, s) + "</td>" +
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
  const calendar = await loadMPCCalendar();

  const last = fx && fx.observations[fx.observations.length - 1];

  const starters = STARTERS.map((c) => {
    const s = state.byId.get(c.id);
    if (!s) return "";
    const ch = changeOf(s);
    return (
      '<a class="starter' + (c.wide ? " wide" : "") + '" href="' + (c.href || "#/s/" + encodeURIComponent(c.id)) + '">' +
      '<span class="q">' + esc(c.q) + "</span>" +
      '<span class="answer"><b>' + fmt(s.latest_value, s.unit) + "</b>" +
      '<i class="u">' + esc(unitTag(s.unit)) + "</i></span>" +
      '<span class="spark-wrap">' + spark(sparks[c.id], { w: 120, h: 30, step: s.freq === "IRR" }) + "</span>" +
      '<span class="delta ' + dirClass(ch, s.unit) + '">' + changeCell(ch, s.unit) +
      "<i> " + esc(changeLabel(s.freq)) + "</i></span>" +
      /* The period the figure is for, and apart from it what kind of date
       * that is. "latest Oct 2026" on reserves was the press release's day
       * read as a month; it now says released. A series Miqyas has had no new
       * reading for says so on the tile, not only on its own page. */
      '<span class="asof">' + whenLabel(s) +
      (s.stale_days ? '<i class="stale">' + t("no newer reading held") + "</i>" : "") + "</span>" +
      '<span class="note">' + esc(c.note) + "</span></a>"
    );
  }).join("");

  const table = HEADLINE_GROUPS.map((g) => {
    const rows = g.ids.map((id) => state.byId.get(id)).filter(Boolean);
    if (!rows.length) return "";
    return '<tr class="group-head"><td colspan="8">' + esc(g.label) + "</td></tr>" + rows.map((r) => indicatorRow(r)).join("");
  }).join("");

  const counts = {};
  index.forEach((s) => { const k = topicOf(s); counts[k] = (counts[k] || 0) + 1; });
  const topicGrid = TOPICS.filter((tp) => counts[tp.key]).map((tp) =>
    '<a class="topic-card" href="#/topic/' + tp.key + '">' +
    '<span class="ico" aria-hidden="true">' + tp.icon + "</span>" +
    "<h3>" + esc(tp.name) + "</h3>" +
    "<p>" + esc(tp.blurb) + "</p>" +
    '<span class="count">' + num(counts[tp.key]) + " " + t("series") + "</span></a>"
  ).join("");

  const latestMPC = mpc && mpc.statements && mpc.statements[mpc.statements.length - 1];
  /* The only forward-looking thing on the overview. Everything else here is a
   * record of what already happened, which is why none of it is a reason to
   * come back on any particular day. */
  const next = nextMeeting(calendar);
  /* Since when the corridor has been where it is, which is not the date of the
   * latest meeting: that meeting may have been a hold. This said "unchanged
   * since 24 Sep 2026" of a deposit rate that had been 19% since February.
   * The rate series records a reading only when the level changes, so its last
   * reading is the day the level in force took effect, and the decision behind
   * it is the last statement in the three weeks before that day. */
  const dep = state.byId.get("EG.RATE.ON.DEP");
  const lend = state.byId.get("EG.RATE.ON.LEND");
  const statements = latestMPC ? mpc.statements.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
  const setBy = dep && dep.last
    ? statements.filter((s) => s.date <= dep.last && Date.parse(dep.last) - Date.parse(s.date) <= 21 * 86400000).pop()
    : null;
  const level = dep && lend
    ? (setBy
        ? tf("Overnight deposit {d}%, overnight lending {l}%, in force since the {date} decision",
               { d: esc(String(dep.latest_value)), l: esc(String(lend.latest_value)), date: niceDate(setBy.date) })
        : tf("Overnight deposit {d}%, overnight lending {l}%, in force since {date}",
               { d: esc(String(dep.latest_value)), l: esc(String(lend.latest_value)), date: niceDate(dep.last) })) +
      (latestMPC.decision === "hold" && (!setBy || latestMPC.date > setBy.date)
        ? tf(" and held at the {date} meeting", { date: niceDate(latestMPC.date) })
        : "") + "."
    : latestMPC && latestMPC.deposit_rate && latestMPC.lending_rate
    ? tf("Overnight deposit {d}%, overnight lending {l}%.", { d: esc(latestMPC.deposit_rate), l: esc(latestMPC.lending_rate) })
    : "";
  const mpcCard = latestMPC
    ? '<a class="wide-card" href="#/rates">' +
      '<p class="eyebrow">' + t(next ? "Next rate decision" : "Latest rate decision") + "</p>" +
      (next
        ? "<h3>" + niceDate(next.date) + (RTL ? "، " : ", ") + esc(countdownWords(next.days)) + "</h3>"
        : "<h3>" + tf({ hold: "{date}, the committee left rates unchanged", cut: "{date}, the committee cut",
                          hike: "{date}, the committee raised" }[latestMPC.decision] || "{date}, the committee met",
                        { date: niceDate(latestMPC.date) }) + "</h3>") +
      "<p>" + level + " " + t("Every decision back to June 2005, with what changed in the wording each time.") + "</p>" +
      '<span class="go">' + tf("See all {n} decisions →", { n: num(mpc.count || 0) }) + "</span></a>"
    : "";

  app.innerHTML =
    /* One sentence saying what this is, and the two things it is for. The
     * people this is built for come to take the data away or to see what
     * moved, so those are the two buttons, both above the fold on a phone.
     * The calculators are a card further down and a link in the footer. */
    '<section class="hero"><div class="wrap">' +
    '<h1 class="hero-line">' +
    t("Central Bank of Egypt statistics as one clean dataset, with a dated daily archive of its live tables.") +
    "</h1>" +
    '<div class="controls hero-actions">' +
    '<a class="chip solid" href="#/data">' + t("Download the data") + "</a>" +
    '<a class="chip" href="#/changes">' + t("See what changed") + "</a>" +
    "</div>" +
    '<div class="hero-chart" id="hero-slot"></div>' +
    '<div class="readout" id="hero-readout">' +
    '<span class="val">' + (last ? fmt(last[1], fx.unit) : "—") + "</span>" +
    '<span class="when">' + (last ? niceDate(last[0]) : "") + "</span>" +
    "<span>" + t("EGP per US dollar, CBE selling rate") + "</span></div>" +
    "</div></section>" +

    '<section class="section band"><div class="wrap">' +
    '<p class="eyebrow">' + t("Start here") + "</p>" +
    "<h2>" + t("Seven questions, already answered") + "</h2>" +
    '<p class="lede">' + t("Every number below is the latest Miqyas holds. Click one to see its whole history.") + "</p>" +
    '<div class="starters">' + starters + "</div>" +
    "</div></section>" +

    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">' + t("At a glance") + "</p>" +
    "<h2>" + t("Headline indicators") + "</h2>" +
    '<p class="lede">' + t("Latest reading, the change since the one before it, and where that sits between the series' own record low and high.") + "</p>" +
    '<div class="table-scroll"><table class="indicators"><thead><tr>' +
    '<th class="star-col"><span class="sr-only">' + t("On your desk") + "</span></th>" +
    "<th>" + t("Series|one row of a table") + "</th><th>" + t("Latest") + "</th><th>" + t("Change") + "</th>" +
    '<th class="hide-sm">' + t("Lowest") + '</th><th class="hide-sm">' + t("Highest") + "</th>" +
    "<th>" + t("Where it sits") + "</th><th>" + t("As of") + "</th>" +
    "</tr></thead><tbody>" + table + "</tbody></table></div>" +
    '<p class="foot-note">' +
    t("Star any row to keep it on your desk: one screen of the numbers you check most, with no prose in the way.") +
    ' <a href="#/favourites">' + t("Open your favourites →") + "</a></p>" +
    "</div></section>" +

    (mpcCard ? '<section class="section"><div class="wrap">' + mpcCard + "</div></section>" : "") +

    '<section class="section band"><div class="wrap">' +
    '<p class="eyebrow">' + t("Browse") + "</p>" +
    "<h2>" + t("Everything, by subject") + "</h2>" +
    '<p class="lede">' + t("Thirteen topics over") + " " + num(index.length) +
    " " + t("series. No search box required. Pick a subject and read down.") + "</p>" +
    '<div class="topic-grid">' + topicGrid + moneyMarketTopicCard() + "</div>" +
    "</div></section>" +

    /* The name, on the page rather than three clicks away on About.
     * It is the most memorable thing about the project and it was the one
     * thing a visitor never saw. The gauge is not decoration here: it is the
     * same instrument the rest of the site uses, reading today's rate against
     * its own twenty-year range, which is exactly what the column did. */
    nilometerBand(state.byId.get("EG.FX.OFF.USD.SELL")) +

    // The overview should be able to reach everything the site has. Without
    // these two, the archive and the downloads exist only in the navigation.
    '<section class="section"><div class="wrap">' +
    '<div class="pair">' +
    '<a class="wide-card" href="#/tools">' +
    '<p class="eyebrow">' + t("Work it out") + "</p>" +
    "<h3>" + t("What is your salary actually worth?") + "</h3>" +
    "<p>" + t("The same numbers, asked in the second person. A salary from a year you remember, priced in today's money. Savings kept as pounds against the same money swapped for dollars on day one. The dollar rate on any date since 2005.") + "</p>" +
    '<span class="go">' + t("Work it out →") + "</span></a>" +
    '<a class="wide-card" href="#/changes">' +
    '<p class="eyebrow">' + t("What changed") + "</p>" +
    "<h3>" + t("A dated record of what CBE published") + "</h3>" +
    "<p>" + t("Miqyas keeps a dated copy of the daily tables from 20 August 2026. If CBE changes a figure it has already published, the change appears on the What changed page, which also counts the revisions recorded so far. The weekly Excel archive is not yet checked for changes.") + "</p>" +
    '<span class="go">' + t("See what changed →") + "</span></a>" +
    '<a class="wide-card" href="#/docs">' +
    '<p class="eyebrow">' + t("Documents") + "</p>" +
    "<h3>" + t("CBE publications, indexed for search") + "</h3>" +
    "<p>" + t("Statistical bulletins, circulars, annual reports and press releases CBE has published as PDFs, indexed so you can search inside them. A result lands you on a page number, in English or Arabic, and links to the original on cbe.org.eg.") + "</p>" +
    '<span class="go">' + t("Search the archive →") + "</span></a>" +
    '<a class="wide-card" href="#/data">' +
    '<p class="eyebrow">' + t("Take it with you") + "</p>" +
    "<h3>" + t("Parquet, SQLite, CSV, and a keyless API") + "</h3>" +
    "<p>" + t("All") + " " + num(index.length) + " " +
    t("series in whichever shape suits you, updated daily. No key and no account, and a SHA-256 for every file so any copy can be checked against it.") + "</p>" +
    '<span class="go">' + t("Downloads and API →") + "</span></a>" +
    "</div></div></section>";

  if (fx) {
    const readout = document.getElementById("hero-readout");
    mountChart(document.getElementById("hero-slot"), readout,
      (animate) => lineChart(fx.observations, { height: 300, events: fxEvents(), id: "hero", unit: fx.unit, animate: animate }),
      (svg) => wireHover(svg, fx.observations, fx.unit, readout));
  }
}

/* Where the name comes from, said once, on the page people actually land on. */
function nilometerBand(fx) {
  const mark = fx
    ? gauge(fx.latest_value, fx.lowest && fx.lowest.value, fx.highest && fx.highest.value,
            { w: 260, h: 40, median: fx.median })
    : "";
  return (
    '<section class="section band nilometer"><div class="wrap">' +
    '<div class="two-col">' +
    "<div>" +
    '<p class="eyebrow">' + t("The name") + "</p>" +
    "<h2>" + t("Cairo read the flood against a marble column") + "</h2>" +
    '<p class="lede">' +
    t("The miqyas on Rhoda Island is a graduated shaft in a stone well, in service by 861 AD. The height the Nile reached against it forecast the harvest and set that year's tax rate: Egypt's first macroeconomic indicator, and the reason a graduated gauge runs through this site.") +
    "</p>" +
    '<p class="foot-note"><a href="#/about">' + t("What is and is not here →") + "</a></p>" +
    "</div>" +
    (mark
      ? '<div class="nilo-mark">' + mark +
        '<p class="foot-note">' +
        tf("Today's dollar rate, against every rate CBE has published since 2005. Low {lo} in {lod}, high {hi} in {hid}.",
           { lo: fmt(fx.lowest.value, fx.unit), lod: shortDate(fx.lowest.period),
             hi: fmt(fx.highest.value, fx.unit), hid: shortDate(fx.highest.period) }) + "</p></div>"
      : "") +
    "</div></div></section>"
  );
}

/* The fourteenth card on the series grid. Gold-bordered, because it is not one
 * of the thirteen subjects and should not pretend to be. */
const moneyMarketTopicCard = () =>
  '<a class="topic-card screen" href="#/money-market">' +
  '<span class="ico" aria-hidden="true">▩</span>' +
  "<h3>" + t("The money market") + "</h3><p>" +
  t("Overnight money inside the CBE corridor, the interbank tenors and their volumes, and the EGP bill curve with bid to cover.") + "</p>" +
  '<span class="count">' + t("A made-up screen, not a CBE table") + "</span></a>";

/* ---------- series: search and browse, on one page ----------
 *
 * These were two pages, Browse and Find, which were two doors onto the same
 * thing and made the site unable to say where series lived. One page, with the
 * box at the top and the subjects under it: type if you know the word, read down
 * if you do not.
 */

const FIND_SUGGESTIONS = [
  "dollar", "treasury bill yield", "deposits", "reserves", "inflation",
  "exports", "tourists", "external debt", "budget deficit", "remittances",
];

/* Shared by this page and by the panel on the favourites page, so a search for
 * something to look at and a search for something to keep behave identically.
 * The ranking is rankSeries in core.js, which the palette uses too. */
function searchSeries(query, limit) {
  return rankSeries(query).slice(0, limit || 100);
}

function seriesResultRow(s, sparks) {
  return (
    '<div class="result-row">' +
    starButton(s.series_id) +
    '<a class="result rich" href="#/s/' + encodeURIComponent(s.series_id) + '">' +
    '<span class="title">' + titleHTML(s) + "</span>" +
    '<span class="spk">' + spark(sparks[s.series_id], { w: 70, h: 20, step: s.freq === "IRR" }) + "</span>" +
    '<span class="v">' + fmt(s.latest_value, s.unit) + "</span>" +
    titleAlt(s) +
    /* Each piece isolated on its own: on /ar/ an id, a date range and "$ mn"
     * in one run came out as "mn $" with the dates the wrong way round. */
    '<span class="sub">' + [
      bdiLTR(esc(s.series_id)),
      tf("{n} readings", { n: num(s.n) }),
      tf("{from} to {to}", { from: periodLabel(s.first, s), to: periodLabel(s.last, s) }),
      s.unit ? "<bdi>" + esc(unitShort(s.unit)) + "</bdi>" : "",
      s.stale_days ? t("no newer data held") : "",
    ].filter(Boolean).join(" · ") +
    "</span></a></div>"
  );
}

async function viewSeriesIndex(preset) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);
  const index = await loadIndex();
  const sparks = await loadSparks();

  const counts = {}, obs = {};
  index.forEach((s) => {
    const k = topicOf(s);
    counts[k] = (counts[k] || 0) + 1;
    obs[k] = (obs[k] || 0) + (s.n || 0);
  });

  app.innerHTML =
    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">' + num(index.length) + " " + t("series") + "</p>" +
    "<h2>" + t("Find a series, or read down the subjects") + "</h2>" +
    '<p class="lede">' + t("Type a word if you know one. If you would rather not, every subject is below and each opens onto the CBE tables it came from, so you can read a whole balance of payments rather than hunt one line of it. The star on any result keeps it in your") +
    ' <a href="#/favourites">' + t("favourites") + "</a>.</p>" +
    '<input class="search" id="q" placeholder="' + esc(t("dollar, treasury bill yield, تحويلات…")) + '" autocomplete="off">' +
    '<div class="controls suggest">' +
    '<span class="hint">' + t("Try:") + "</span>" +
    FIND_SUGGESTIONS.map((s) => '<button class="chip" data-sug="' + esc(t(s)) + '">' + esc(t(s)) + "</button>").join("") +
    "</div>" +
    '<div class="results" id="results"></div>' +
    "</div></section>" +

    '<section class="section band" id="subjects"><div class="wrap">' +
    '<p class="eyebrow">' + t("By subject") + "</p>" +
    "<h2>" + t("All of it, in thirteen subjects") + "</h2>" +
    '<p class="lede">' + t("The last card is not a subject: it is a screen assembled out of several of them, for a desk that reads the same numbers every day.") + "</p>" +
    '<div class="topic-grid">' +
    TOPICS.filter((tp) => counts[tp.key]).map((tp) =>
      '<a class="topic-card" href="#/topic/' + tp.key + '">' +
      '<span class="ico" aria-hidden="true">' + tp.icon + "</span>" +
      "<h3>" + esc(tp.name) + "</h3><p>" + esc(tp.blurb) + "</p>" +
      '<span class="count">' + tf("{s} series · {o} observations", { s: num(counts[tp.key]), o: num(obs[tp.key]) }) +
      "</span></a>"
    ).join("") +
    moneyMarketTopicCard() +
    "</div></div></section>";

  const input = document.getElementById("q");
  const out = document.getElementById("results");

  const run = () => {
    const typed = input.value.trim();
    if (!typed) {
      out.innerHTML = "";
      return;
    }
    const hits = searchSeries(typed, 100);
    out.innerHTML = hits.length
      ? '<p class="count-line">' + tf("{n} matching series", { n: hits.length + (hits.length === 100 ? "+" : "") }) + "</p>" +
        hits.map((s) => seriesResultRow(s, sparks)).join("")
      : '<p class="empty">' + tf("Nothing matches “{q}”. Try a broader word, or pick a subject below.", { q: esc(typed) }) + "</p>";
  };

  input.addEventListener("input", run);
  app.querySelectorAll("[data-sug]").forEach((b) =>
    b.addEventListener("click", () => { input.value = b.dataset.sug; run(); input.focus(); })
  );
  if (preset) input.value = preset;
  run();
  // Focus only when someone came here to type. Landing on the page with the
  // keyboard already up would hide the subjects on a phone.
  if (preset) input.focus();
}

/* ---------- one topic ---------- */

async function viewTopic(key) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);
  const topic = topicByKey(key);
  if (!topic) {
    app.innerHTML = '<div class="wrap"><p class="empty">' + t("No such topic.") + ' <a href="#/series">' + t("See all thirteen") + "</a>.</p></div>";
    return;
  }
  pageTitle(topic.name);

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
      '<tr data-title="' + esc(((s.title_en || "") + " " + arTitle(s) + " " + s.series_id).toLowerCase()) + '" data-freq="' + esc(s.freq || "") + '">' +
      '<td class="star-col">' + starButton(s.series_id) + "</td>" +
      '<td class="name"><a href="#/s/' + encodeURIComponent(s.series_id) + '">' + lineHTML(s) + "</a></td>" +
      '<td class="sparkcell">' + spark(sparks[s.series_id], { w: 82, h: 22, step: s.freq === "IRR" }) + "</td>" +
      "<td>" + fmt(s.latest_value, s.unit) + '<i class="u">' + esc(unitTag(s.unit)) + "</i></td>" +
      '<td class="' + dirClass(c, s.unit) + ' hide-sm">' + changeCell(c, s.unit) + "</td>" +
      '<td class="asof">' + tf("{from} to {to}", { from: periodLabel(s.first, s), to: periodLabel(s.last, s) }) + "</td>" +
      '<td class="asof hide-sm">' + esc(FREQ_LABEL[s.freq] || s.freq || "") + "</td>" +
      "</tr>"
    );
  };

  const accordions = ordered.map((entry, i) => {
    const rows = entry[1];
    rows.sort((a, b) => (a.title_en || "").localeCompare(b.title_en || ""));
    const covers = rows.map((r) => r.first).filter(Boolean).sort()[0];
    return (
      "<details class=\"group\"" + (i === 0 ? " open" : "") + ">" +
      "<summary><span class=\"g-name\">" + labelHTML(tableText(rows[0]), rows[0]) + "</span>" +
      '<span class="g-meta">' + tf("{n} series · from {d}", { n: num(rows.length), d: shortDate(covers) }) + "</span></summary>" +
      '<div class="table-scroll"><table class="indicators compact"><thead><tr>' +
      '<th class="star-col"><span class="sr-only">' + t("On your desk") + "</span></th>" +
      "<th>" + t("Line") + "</th><th></th><th>" + t("Latest") + "</th>" +
      '<th class="hide-sm">' + t("Change") + "</th><th>" + t("Covers") + '</th><th class="hide-sm">' + t("Published") + "</th>" +
      "</tr></thead><tbody>" + rows.map(seriesRow).join("") + "</tbody></table></div></details>"
    );
  }).join("");

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: t("Series"), href: "#/series" }, { label: topic.name }]) +
    '<section class="section topic-head">' +
    '<p class="eyebrow">' + topic.icon + " " + t("Topic") + "</p>" +
    "<h2>" + esc(topic.name) + "</h2>" +
    '<p class="lede">' + esc(topic.blurb) + " " +
    tf(ordered.length === 1 ? "{n} series across 1 CBE table." : "{n} series across {k} CBE tables.",
       { n: num(mine.length), k: num(ordered.length) }) + "</p>" +
    '<div class="controls">' +
    '<input class="filter" id="tfilter" placeholder="' + esc(t("Narrow this topic (optional)")) + '" autocomplete="off">' +
    '<span class="spacer"></span>' +
    '<button class="chip" data-freq="" aria-pressed="true">' + t("Any frequency") + "</button>" +
    freqs.map((f) => '<button class="chip" data-freq="' + f + '" aria-pressed="false">' + esc(FREQ_LABEL[f] || f) + "</button>").join("") +
    '<button class="chip" id="expand-all" data-open="0">' + t("Open all tables") + "</button>" +
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
  // Which way the button points is kept on it, not read off its words, which
  // are Arabic on /ar/.
  document.getElementById("expand-all").addEventListener("click", (e) => {
    const opening = e.target.dataset.open !== "1";
    document.querySelectorAll("#groups details.group").forEach((d) => (d.open = opening));
    e.target.dataset.open = opening ? "1" : "0";
    e.target.textContent = t(opening ? "Close all tables" : "Open all tables");
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
    /* What Miqyas holds, not what CBE has done. The flag measures the age of
     * the newest stored reading, so it cannot tell a source that stopped from
     * a newer release Miqyas has not picked up, and it must not pretend to. */
    const cadence = FREQ_LABEL[data.freq] || "";
    out.push(
      '<div class="notice"><h3>' + t("No newer reading here") + "</h3>" +
      "<p>" + tf(cadence
        ? "Miqyas holds no value for this series after {d}: {n} days without a new reading ({f})."
        : "Miqyas holds no value for this series after {d}: {n} days without a new reading.",
        { d: periodLabel(meta.last, meta), n: num(meta.stale_days), f: esc(cadence.toLowerCase()) }) + " " +
      t("The source may have stopped, or Miqyas may not have picked up a newer release.") +
      (data.source_url || data.source_file ? " " + t("Check the CBE source linked below.") : "") +
      "</p></div>"
    );
  }
  /* The latest months CBE marks "Preliminary" or "Provisional" in its own
   * file (the SDDS series). The values are CBE's as printed; the mark is the
   * warning that they can still move. */
  const marked = data.marked && data.marked.periods && data.marked.periods.length ? data.marked : null;
  if (marked) {
    const ps = marked.periods;
    const span = ps.length > 1
      ? tf("{from} to {to}", { from: periodLabel(ps[0], data), to: periodLabel(ps[ps.length - 1], data) })
      : periodLabel(ps[0], data);
    const provisional = marked.as === "provisional";
    out.push(
      '<div class="notice"><h3>' + t(provisional ? "The latest figures are provisional" : "The latest figures are preliminary") + "</h3>" +
      "<p>" + tf(provisional
        ? "CBE marks {span} as provisional in its file. These figures can still be revised; if they are, the What changed page shows it."
        : "CBE marks {span} as preliminary in its file. These figures can still be revised; if they are, the What changed page shows it.",
        { span: span }) + "</p></div>"
    );
  }
  if (meta.zero_values) {
    out.push(
      '<div class="notice"><h3>' + tf("{n} of these readings are exactly zero", { n: num(meta.zero_values) }) + "</h3>" +
      "<p>" + t("CBE publishes a zero where no rate was set rather than leaving the cell empty, and they are reproduced here as published rather than treated as missing. An average taken across this series will be pulled toward zero.") +
      "</p></div>"
    );
  }
  /* Anything summarise.py flags that build_exports could not classify. Empty in
   * the catalogue as it stands, and here so that a new kind of flag shows up on
   * the page by itself rather than waiting for someone to notice it. The flag
   * is English prose from the build, so on /ar/ it is held left to right. */
  (meta.flags || []).forEach((f) =>
    out.push('<div class="notice"><h3>' + t("A note on this series") + "</h3><p" +
      (RTL ? ' dir="ltr" lang="en"' : "") + ">" + esc(f) + "</p></div>")
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
 * the ratio is noise. Signed figures are held left to right on /ar/. */
function biggestMove(move, unit, meta) {
  if (!move || move.change === null || move.change === undefined) return "";
  const tag = unitTag(unit);
  const size = isoLTR((move.change > 0 ? "+" : "-") + fmtChange(move.change, unit)) + (tag ? " " + tag : "");
  const readable = Math.abs(move.pct_change) <= 500 && !/percent/i.test(unit || "");
  return tf("Biggest single move {size}{pct} on {d}.", {
    size: size,
    pct: readable ? " (" + isoLTR((move.pct_change > 0 ? "+" : "") + move.pct_change.toFixed(1) + "%") + ")" : "",
    d: periodLabel(move.period, meta),
  });
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
      ? tf("The gold mark is the median of {n} readings, {m}.", { n: num(meta.n), m: fmt(meta.median, unit) })
      : "",
    hasMedian ? vsMedian(meta.latest_value, meta.median) : "",
    biggestMove(meta.biggest_move, unit, meta),
  ].filter(Boolean).join(" ");

  return (
    '<section class="where">' +
    '<p class="eyebrow">' + t("Where this sits in its own record") + "</p>" +
    gauge(meta.latest_value, lo.value, hi.value, { w: 1000, h: 26, cls: "wide", median: meta.median }) +
    '<div class="gauge-ends">' +
    "<span>" + t("lowest") + " <b>" + fmt(lo.value, unit) + "</b><i>" + periodLabel(lo.period, meta) + "</i></span>" +
    '<span class="hi">' + t("highest") + " <b>" + fmt(hi.value, unit) + "</b><i>" + periodLabel(hi.period, meta) + "</i></span>" +
    "</div>" +
    (note ? '<p class="where-note">' + esc(note) + "</p>" : "") +
    "</section>"
  );
}

/* The readings themselves, newest first. A chart answers "what shape is this";
 * only a table answers "what was the number on the third". Each period is
 * written at its own size (periodLabel), and the heading says which size. */
function observationsTable(points, unit, meta) {
  const CAP = 500;
  const rows = points.slice(-CAP).reverse();
  const freq = meta && FREQ_LABEL[meta.freq];
  return (
    '<p class="count-line">' +
    (points.length > CAP
      ? tf("Newest first. The most recent {n} of {all} readings in this range.", { n: num(rows.length), all: num(points.length) })
      : tf("Newest first. All {n} readings in this range.", { n: num(rows.length) })) +
    "</p>" +
    '<div class="table-scroll"><table class="indicators compact"><thead><tr>' +
    "<th>" + t("Period") + (freq ? " (" + esc(freq.toLowerCase()) + ")" : "") + "</th><th>" + t("Value") + "</th><th>" + t("Change") + "</th>" +
    "</tr></thead><tbody>" +
    rows.map((p, i) => {
      const prev = rows[i + 1];
      const c = prev ? p[1] - prev[1] : null;
      return (
        '<tr><td class="period">' + periodLabel(p[0], meta) + "</td>" +
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
    /* A series id travels by being pasted, and CBE's Excel-derived ids run to
     * 88 characters, so this state gets reached by a link that lost its tail
     * far more often than by a typo. The catalogue is already loaded above;
     * offering what the id nearly matches is the difference between a dead end
     * and one more click. */
    const near = nearestSeries(id, 5);
    pageTitle(t("There is no series with that id"));
    app.innerHTML =
      '<div class="wrap">' +
      crumbs([{ label: t("Series"), href: "#/series" }, { label: t("Not found") }]) +
      '<section class="section">' +
      "<h2>" + t("There is no series with that id") + "</h2>" +
      '<p class="lede">' + t("Nothing here is called") + ' <code class="series-id">' + esc(id) + "</code>. " +
      (near.length
        ? t("These are the closest things in the catalogue.")
        : t("Nothing in the catalogue looks close to it, so it may be from an older version of the site.")) +
      "</p>" +
      (near.length
        ? '<div class="near">' +
          near.map((s) =>
            '<a class="result" href="#/s/' + encodeURIComponent(s.series_id) + '">' +
            '<span class="title">' + titleHTML(s) + "</span>" +
            '<span class="sub">' + bdiLTR(esc(s.series_id)) + " · " + tf("{n} readings", { n: num(s.n) }) + "</span>" +
            "</a>").join("") +
          "</div>"
        : "") +
      '<div class="controls">' +
      '<a class="chip solid" href="#/series">' + t("Find or browse series") + "</a>" +
      '<a class="chip" href="#/">' + t("Overview") + "</a>" +
      "</div></section></div>";
    return;
  }
  // The build the page is from, for the citation. Already fetched by the
  // freshness strip, so this is normally a cache hit.
  const status = await loadStatus();
  // A newer navigation has replaced this page while it loaded; it draws itself.
  if (!app.isConnected) return;
  pageTitle(titleText(data));

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
  // Year-on-year and rebased only where dividing by an earlier reading means something.
  const offered = transformsFor(data.unit, data.observations);

  // What the export buttons and the table are currently looking at, kept in one
  // place so "this range" cannot drift from what is on the screen.
  const shown = { points: [], unit: "", note: "" };

  const readoutSlot = () => document.getElementById("s-readout");

  // again: drawn a second time for a new screen width, so not animated.
  const render = async (again) => {
    const base = TRANSFORMS[transform].fn(applyRange(data.observations, range, ranges));
    const unit = transform === "level" ? data.unit : transform === "yoy" ? "percent" : "index";
    let sets = base, units = unit, labels = null;
    // What a comparison did, or why it was not drawn. Empty with no comparison.
    let compared = "";
    const other = compareId ? await loadSeries(compareId).catch(() => null) : null;

    if (other) {
      // Rebased at one shared date, or as published when neither can be
      // rebased and they share a unit, or not drawn together at all.
      const pair = comparePair(applyRange(data.observations, range, ranges), data.unit,
                               applyRange(other.observations, range, ranges), other.unit);
      compared = pair.note;
      if (pair.sets) {
        sets = pair.sets;
        units = pair.units;
        labels = [titleText(data), titleText(other)];
      }
    }

    shown.points = isMulti(sets) ? sets[0] : sets;
    shown.unit = Array.isArray(units) ? units[0] : units;
    // The note travels inside the CSV, which is written in English.
    shown.note =
      "Range: " + range + ". " +
      (labels ? compared + "." : TRANSFORMS[transform].label + ".");

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
      animate: !again,
    });
    readoutSlot().innerHTML = last
      ? '<span class="val">' + fmt(last[1], shown.unit, digitsFor(shown.points)) + "</span>" +
        '<span class="when">' + periodLabel(last[0], data) + "</span>" +
        "<span>" + esc(compared || TRANSFORMS[transform].label) + "</span>"
      : '<span class="empty">' + t("Nothing in this range.") + "</span>";
    armLines(document.getElementById("sc"));
    wireHover(document.getElementById("sc"), sets, units, readoutSlot(), labels);

    document.getElementById("obs-slot").innerHTML = observationsTable(shown.points, shown.unit, data);

    document.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === range)));
    document.querySelectorAll("[data-transform]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.transform === transform)));
    document.getElementById("legend").innerHTML = labels
      ? '<span class="item"><span class="key s0"></span>' + titleHTML(data) + "</span>" +
        '<span class="item"><span class="key s1"></span>' + titleHTML(state.byId.get(compareId) || other) + "</span>"
      : "";
  };

  const stats = meta || {};
  const change = changeOf(stats);
  // The Excel archive is CBE's numbers on dates Miqyas reads off the sheet, so
  // it is neither "as published" nor computed, and says so.
  const isExcel = data.dataset === "excel_archive";
  // The same holds for the files on CBE's SDDS page, which are read the same way.
  const isSDDS = data.dataset === "sdds";
  const cite = citation(data, meta, status);

  // Comparison candidates: siblings first, then the headline series, so the
  // dropdown is useful whether you want context inside the same table or
  // against the pound.
  const compareOptions = [{ id: "", label: t("Compare with… (nothing selected)") }]
    .concat(siblings.slice(0, 25).map((s) => ({ id: s.series_id, label: tf("{line} (same table)", { line: lineText(s) }) })))
    .concat(STARTERS.filter((c) => c.id !== id && state.byId.get(c.id))
      .map((c) => ({ id: c.id, label: titleText(state.byId.get(c.id)) })));

  // A computed series names its method. The eight methods in the catalogue
  // have Arabic in the dictionary, keyed on the English; a new one stays
  // English, held left to right.
  const method = esc(t(data.method || ""));
  const methodHTML = RTL && !ARABIC_RE.test(method) ? '<span dir="ltr" lang="en">' + method + "</span>" : method;
  // A series' own note, worded the same way: how it differs from a near twin.
  const note = esc(t(data.note || ""));
  const noteHTML = RTL && !ARABIC_RE.test(note) ? '<span dir="ltr" lang="en">' + note + "</span>" : note;

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([
      { label: t("Series"), href: "#/series" },
      topic ? { label: topic.name, href: "#/topic/" + topic.key } : { label: t("Other") },
      { label: tableText(data), html: labelHTML(tableText(data), data) },
    ]) +
    '<div class="series-head">' +
    '<span class="series-id">' + esc(data.series_id) + "</span>" +
    "<h1>" + titleHTML(data) + "</h1>" +
    titleAlt(data) +
    // The mark, said in words where a reader cannot hover.
    (RTL && arTitle(data) && data.title_ar_source === "miqyas"
      ? '<p class="foot-note ours-note">' + t("Translated by Miqyas. CBE publishes no Arabic name for this series.") + "</p>"
      : "") +
    '<div class="big-figure">' +
    '<span class="v">' + fmt(stats.latest_value, data.unit) + "</span>" +
    '<span class="u">' + esc(unitTag(data.unit) || (data.unit ? "" : t("no unit stated"))) + "</span>" +
    '<span class="d ' + dirClass(change, data.unit) + '">' + changeCell(change, data.unit) +
    " " + esc(changeLabel(data.freq)) + "</span>" +
    '<span class="asof">' + tf("as of {d}", { d: periodLabel(stats.last, data) }) + " · " + staleness(stats.last) + "</span>" +
    "</div>" +
    '<div class="meta-row">' +
    "<span><b>" + t("Published") + "</b> " + esc(FREQ_LABEL[data.freq] || data.freq || "—") + "</span>" +
    "<span><b>" + t("Readings") + "</b> " + num(data.count) + "</span>" +
    "<span><b>" + t("Covers") + "</b> " +
    (stats.first ? tf("{from} to {to}", { from: periodLabel(stats.first, data), to: periodLabel(stats.last, data) }) : "—") + "</span>" +
    (data.derived
      ? "<span><b>" + t("Computed by Miqyas") + "</b> " + t("from CBE data") + "</span>"
      : isExcel || isSDDS
      ? "<span><b>" + t("Dates assigned by Miqyas") + "</b> " + t("from the sheet") + "</span>"
      : "<span><b>" + t("Reproduced as published") + "</b> " + t("yes") + "</span>") +
    "</div></div>" +

    qualityNotice(meta, data) +
    whereItSits(meta, data.unit) +

    '<div class="controls">' +
    Object.keys(ranges).map((k) => '<button class="chip" data-range="' + esc(k) + '">' + esc(t(k)) + "</button>").join("") +
    "</div>" +
    '<div class="controls">' +
    offered.keys.map((k) => '<button class="chip" data-transform="' + k + '">' + esc(TRANSFORMS[k].label) + "</button>").join("") +
    '<span class="spacer"></span>' +
    '<select class="chip" id="cmp" aria-label="' + t("Compare with another series") + '">' +
    compareOptions.map((o) => '<option value="' + esc(o.id) + '">' + esc(o.label) + "</option>").join("") +
    "</select></div>" +
    (offered.why ? '<p class="foot-note transform-note">' + esc(offered.why) + "</p>" : "") +

    '<div id="chart-slot"></div>' +
    '<div class="legend" id="legend"></div>' +
    '<div class="readout" id="s-readout"></div>' +

    '<div class="controls">' +
    '<button class="chip star-chip' + (watchHas(id) ? " on" : "") + '" data-star="' + esc(id) + '">' +
    t(watchHas(id) ? "★ On your desk" : "☆ Keep on your desk") + "</button>" +
    '<button class="chip solid" id="dl-range">' + t("This range as CSV") + "</button>" +
    '<button class="chip" id="dl-all">' + t("Everything as CSV") + "</button>" +
    '<button class="chip" id="copy-tsv">' + t("Copy for a spreadsheet") + "</button>" +
    '<a class="chip" href="' + API + "/series/" + encodeURIComponent(id) + '.json" target="_blank" rel="noopener">' + t("Open the JSON") + "</a>" +
    '<button class="chip" id="share">' + t("Copy a link to this page") + "</button>" +
    "</div>" +

    '<details class="obs"><summary><span class="g-name">' + t("The readings themselves") + "</span>" +
    '<span class="g-meta">' + tf("{n} in total", { n: num(data.count) }) + "</span></summary>" +
    '<div id="obs-slot"></div></details>' +

    '<section class="section two-col">' +
    "<div>" +
    '<p class="eyebrow">' + t("Where this comes from") + "</p>" +
    "<h2>" + t("Provenance") + "</h2>" +
    '<p class="lede">' +
    (data.derived
      ? t("Computed by Miqyas from CBE data:") + " " + methodHTML
      : isExcel
      ? t("Source: Central Bank of Egypt, Excel time-series archive. Miqyas reads the sheet and assigns each value to a date from the sheet's own period labels. Fiscal-year quarters follow Egypt's July to June year. Dates are our reading of the sheet and can be wrong; check the linked CBE file before citing.")
      : isSDDS
      ? t("Source: Central Bank of Egypt, the Excel files on its SDDS page, where CBE keeps money, banking and reserves up to the latest month. Miqyas reads the file and dates each value to the last day of its month from the sheet's own month labels. Check the linked CBE file before citing.")
      : t("Reproduced as published from the Central Bank of Egypt's daily tables. Where CBE printed two values for one date, Miqyas keeps one and lists both on the What changed page.")) +
    (data.note ? " " + noteHTML : "") +
    (data.period_basis === "end" ? " " + t("Values are dated to the end of the period they describe.") : "") +
    (data.unit
      ? ""
      : " " + t("CBE's own sheet did not state a unit anywhere the parser could find one, so the figures are reproduced without one rather than given a guessed label.")) +
    ' <a href="#/data/guide">' + t("How periods and dates are written →") + "</a>" +
    "</p>" +
    '<div class="meta-col">' +
    (data.source_url
      ? "<span><b>" + t("CBE page") + "</b> " + bdiLTR('<a href="' + esc(data.source_url) + '" target="_blank" rel="noopener">' +
        esc(data.source_url.replace("https://www.cbe.org.eg", "cbe.org.eg")) + "</a>") + "</span>"
      : "") +
    (data.source_file
      ? "<span><b>" + t("Source file") + "</b> " + bdiLTR('<a href="' +
        esc(data.source_file.startsWith("http") ? data.source_file : "https://www.cbe.org.eg" + data.source_file) +
        '" target="_blank" rel="noopener">' + esc(String(data.source_file).split("/").pop()) + "</a>") + "</span>"
      : "") +
    (data.dataset ? "<span><b>" + t("Dataset") + "</b> " + bdiLTR(esc(data.dataset)) + "</span>" : "") +
    "</div>" +
    /* The citation names the series' own address, its id, the newest period
     * it holds and the build, so a footnote can be followed and checked. See
     * citation() in core.js. */
    '<p class="cite">' + t("Suggested citation:") + " " + cite.html + "</p>" +
    '<div class="controls"><button class="chip" id="copy-cite">' + t("Copy the citation") + "</button></div>" +
    "</div>" +
    "<div>" +
    '<p class="eyebrow">' + t("Same table") + "</p>" +
    "<h2>" + labelHTML(tableText(data), data) + "</h2>" +
    (siblings.length
      ? '<ul class="sib-list">' + siblings.slice(0, 10).map((s) =>
          '<li><a href="#/s/' + encodeURIComponent(s.series_id) + '">' + lineHTML(s) +
          "</a><b>" + fmt(s.latest_value, s.unit) +
          '<i class="u">' + esc(unitTag(s.unit)) + "</i></b></li>").join("") + "</ul>" +
        (siblings.length > 10
          ? '<p class="foot-note">' + tf("{n} more lines in this table.", { n: num(siblings.length - 10) }) + "</p>"
          : "") +
        (topic ? '<a class="go" href="#/topic/' + topic.key + '">' + tf("All {topic} series →", { topic: esc(RTL ? topic.name : topic.name.toLowerCase()) }) + "</a>" : "")
      : '<p class="lede">' + t("Nothing else came from this table.") + "</p>") +
    "</div></section></div>";

  await render();
  keepSized(document.getElementById("chart-slot"), () => render(true));

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
    downloadCSV(id, data.observations, data, "Every observation."));
  document.getElementById("copy-tsv").addEventListener("click", (e) =>
    copyTSV(e.target, shown.points, ["period", data.series_id]));
  // The series' own address, never the hash route it happens to be open at.
  document.getElementById("share").addEventListener("click", (e) => copyLink(e.target, seriesURL(id)));
  document.getElementById("copy-cite").addEventListener("click", (e) =>
    copyText(e.target, cite.text, t("Citation copied")));
}
