/* Miqyas -- the three questions people actually turn up with.
 *
 * The rest of the site answers an analyst's questions: where the corridor is,
 * what bid-to-cover was at the last auction, how reserves moved. Those are the
 * right questions and they are nobody's first one. The first one is personal,
 * and it is always a version of the same thing: is this worth less than it
 * used to be, and by how much.
 *
 * Nothing here is new data. It is the chained CPI index and the official
 * dollar rate, both already on the site, asked a question in the second
 * person. That is the whole idea: the archive is the hard part and it is
 * already done, and one arithmetic step turns it into something a person can
 * send to their brother.
 *
 * Every input lives in the hash, so a result is a link. That is deliberate and
 * it is the only reason any of this travels.
 */

const CPI = "EG.CPI.HDL.INDEX";
const USD = "EG.FX.OFF.USD.SELL";

const TOOLS = [
  { key: "salary", nav: "What is your salary worth?",
    blurb: t("A salary that has not changed since a year you remember, priced in today's money.") },
  { key: "savings", nav: "What happened to your savings?",
    blurb: t("Pounds kept as pounds against the same pounds swapped for dollars on day one.") },
  { key: "dollar", nav: "What was a dollar worth that day?",
    blurb: t("The CBE rate on any date since 2005, and on the same date in every year since.") },
];

/* ---------- reading a series at a date ----------
 *
 * Every series here is a step function as far as a question about one date is
 * concerned: the CPI index is monthly, and the dollar rate is published on
 * business days and simply does not exist on a Friday. Both answer "the last
 * value published on or before this date", which is the only answer that is
 * true of a rate someone actually paid.
 */
function valueAt(observations, iso) {
  let found = null;
  for (const [period, value] of observations) {
    if (period > iso) break;
    found = [period, value];
  }
  return found;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---------- reading what was typed ----------
 *
 * Strictly, and out loud. These used to answer whatever they were given: a
 * month of "garbage" or one after the data ran out compared the last month with
 * itself and printed a confident 0% loss, a date before the data printed
 * nothing at all, and parseFloat read "8,000" as 8. Each reader returns
 * { value } for something usable, {} for nothing typed, and { bad: true } for
 * something that cannot be read, so the page can say which. */
function readAmount(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return {};
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e12 ? { value: n } : { bad: true };
}

const realDay = (iso) => !isNaN(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso;

/* A month, or a whole date read as its month, as the first day of it. */
function readMonth(raw) {
  if (!raw) return {};
  const m = String(raw).trim().match(/^(\d{4}-\d{2})(-\d{2})?$/);
  return m && realDay(m[1] + "-01") ? { value: m[1] + "-01" } : { bad: true };
}

/* A date, or a month read as its first day, the way a salary link carries one. */
function readDay(raw) {
  if (!raw) return {};
  const s = String(raw).trim();
  const iso = /^\d{4}-\d{2}$/.test(s) ? s + "-01" : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && realDay(iso) ? { value: iso } : { bad: true };
}

/* The last day of the month a monthly reading is dated by. */
const monthEnd = (iso) => {
  const d = new Date(iso.slice(0, 7) + "-01T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

const fillIn = (text, values) => text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));

const AMOUNT_PROBLEM = () => t("That is not an amount this can work with. Put in a number of pounds, more than zero.");
const MONTH_PROBLEM = () => t("Could not read that month. Write it as year and month, for example 2016-11.");
const DAY_PROBLEM = () => t("Could not read that date. Write it as year, month and day, for example 2016-11-03.");
const RANGE_PROBLEM = (from, to) =>
  fillIn(t("Miqyas holds no figure for that date. Pick one from {from} to {to}."), { from: from, to: to });

const toolProblem = (text) => (text ? '<p class="tool-problem" role="alert">' + esc(text) + "</p>" : "");

/* A percentage that is a loss reads better as a loss. "Down 82%" is a sentence
 * about the money; "worth 18% of what it was" is a sentence about arithmetic. */
const pct = (v) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("en-US");

const money = (v) => "EGP " + Math.round(v).toLocaleString("en-US");

function toolCrumbs(key) {
  const tool = TOOLS.find((x) => x.key === key);
  return crumbs([{ label: t("Work it out"), href: "#/tools" },
                 { label: tool ? t(tool.nav) : t("Work it out") }]);
}

/* The other two, offered at the bottom of each one. Somebody who just found out
 * what their 2016 salary is worth has a second question, and it is one of
 * these. */
function otherTools(current) {
  return (
    '<div class="pair">' +
    TOOLS.filter((tool) => tool.key !== current).map((tool) =>
      '<a class="wide-card" href="#/tools/' + tool.key + '">' +
      '<p class="eyebrow">' + t("Work it out") + "</p>" +
      "<h3>" + esc(t(tool.nav)) + "</h3><p>" + esc(t(tool.blurb)) + "</p>" +
      '<span class="go">' + t("Try it →") + "</span></a>").join("") +
    "</div>"
  );
}

/* Said on every page here, once, in full. These are real numbers about real
 * money and the arithmetic behind them has a known soft spot. */
const CPI_CAVEAT =
  '<details class="foot-note tool-note"><summary>' +
  t("Where these numbers come from, and where they are soft") + "</summary>" +
  "<p>The price index is CBE's own headline month-on-month inflation, chained from a base of 100 in " +
  'December 2004. Recomputing year-on-year inflation from it reproduces <a href="#/s/EG.CPI.HDL.YOY">' +
  "the rate CBE publishes</a> to a median of 0.001 percentage points.</p>" +
  "<p>It does not reproduce 2009 and 2010. CAPMAS rebased the basket there and a chained index cannot " +
  "see the link, so a comparison spanning those two years carries roughly one and a half percentage " +
  "points of error in that one year. Against a fourteenfold rise in prices since 2005 that is small, " +
  "and it is the one place these figures are soft.</p>" +
  "<p>Inflation is an average across a basket. It is not your rent, your school fees or your " +
  'medicine, each of which has moved differently. <a href="#/topic/prices">The basket is here</a>.</p>' +
  "</details>";

/* ---------- the index ---------- */

function viewTools() {
  document.getElementById("app").innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "Work it out" }]) +
    '<section class="section">' +
    '<p class="eyebrow">' + t("Work it out") + "</p>" +
    "<h2>" + t("Three questions about your own money") + "</h2>" +
    '<p class="lede">' +
    t("The same numbers as the rest of the site, asked in the second person. Nothing you type leaves your browser: the arithmetic happens on this page, and the only thing that travels is the link, which carries what you typed so you can send someone the answer rather than the form.") +
    "</p>" +
    '<div class="topic-grid">' +
    TOOLS.map((tool) =>
      '<a class="topic-card" href="#/tools/' + tool.key + '">' +
      '<span class="ico" aria-hidden="true">' +
      ({ salary: "◷", savings: "◈", dollar: "$" }[tool.key] || "?") + "</span>" +
      "<h3>" + esc(t(tool.nav)) + "</h3><p>" + esc(t(tool.blurb)) + "</p></a>").join("") +
    "</div>" +
    "</section>" +
    '<section class="section band-inset"><div class="wrap-inner">' + CPI_CAVEAT + "</div></section>" +
    "</div>";
}

/* ---------- 1. what is your salary worth ---------- */

async function viewSalary(query) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(5);

  const params = new URLSearchParams(query || "");
  const amountRead = readAmount(params.get("amount"));
  const fromRead = readMonth(params.get("from"));
  const amount = amountRead.value || null;
  const from = fromRead.value || "";

  const cpi = await loadSeries(CPI).catch(() => null);
  // A newer navigation took the page while this was loading (see route()).
  if (!app.isConnected) return;
  if (!cpi) return toolUnavailable("the price index");

  const obs = cpi.observations;
  const firstMonth = obs[0][0].slice(0, 7);
  const lastMonth = obs[obs.length - 1][0].slice(0, 7);
  const now = obs[obs.length - 1];
  const monthOf = (iso) => niceDate(iso).replace(/^\d+ /, "");

  // A month after the index ends used to be read as its last month, and
  // compared with itself: "EGP 8,000 then is EGP 8,000 now".
  const problem = amountRead.bad ? AMOUNT_PROBLEM()
    : fromRead.bad ? MONTH_PROBLEM()
    : from && (from.slice(0, 7) < firstMonth || from.slice(0, 7) > lastMonth)
      ? RANGE_PROBLEM(monthOf(obs[0][0]), monthOf(now[0]))
      : "";
  const then = from && !problem ? valueAt(obs, from) : null;

  let answer = "";
  // What the salary buys, month by month, from the month it was earned.
  const line = amount && then
    ? obs.filter(([p]) => p >= then[0]).map(([p, v]) => [p, amount * (then[1] / v)])
    : [];
  if (amount && then) {
    const ratio = now[1] / then[1];
    const needed = amount * ratio;
    const worth = amount / ratio;
    const lost = (1 - 1 / ratio) * 100;

    answer =
      '<section class="section band"><div class="wrap-inner">' +
      '<p class="eyebrow">' + esc(niceDate(then[0]).replace(/^\d+ /, "")) + " " + t("to") + " " +
      esc(niceDate(now[0]).replace(/^\d+ /, "")) + "</p>" +
      "<h2>" + esc(money(amount)) + " " + t("then is") + " " + esc(money(worth)) + " " + t("now") + "</h2>" +
      '<p class="lede">' + t("A salary of") + " " + esc(money(amount)) + " " +
      t("that never changed has lost") + " <b>" + pct(lost) + "%</b> " +
      t("of what it could buy. To be worth what it was, it would have to be") + " <b>" +
      esc(money(needed)) + "</b> " + t("today.") + "</p>" +
      '<div class="hero-chart" id="salary-slot"></div>' +
      '<div class="readout" id="salary-readout">' +
      '<span class="val">' + esc(money(worth)) + "</span>" +
      '<span class="when">' + esc(niceDate(now[0])) + "</span>" +
      "<span>" + t("what") + " " + esc(money(amount)) + " " + t("from") + " " +
      esc(niceDate(then[0])) + " " + t("buys, in the money of the day") + "</span></div>" +
      '<div class="controls"><button class="chip solid" id="tool-share">' + t("Copy a link to this answer") + "</button></div>" +
      "</div></section>";
  }

  app.innerHTML =
    '<div class="wrap">' + toolCrumbs("salary") +
    '<section class="section">' +
    '<p class="eyebrow">' + t("Work it out") + "</p>" +
    "<h2>" + t("What is your salary worth?") + "</h2>" +
    '<p class="lede">' +
    t("Put in a salary and the month you were earning it. This prices the same number in today's money, using CBE's own inflation.") +
    "</p>" +
    toolForm([
      { id: "amount", label: t("Monthly salary, in pounds"), type: "number", value: amount || "",
        placeholder: "8000", min: "1", step: "any" },
      // The placeholder shows where a month box is plain text (Firefox and
      // Safari on a desktop), and says what form the month takes.
      { id: "from", label: t("Which month"), type: "month", value: from ? from.slice(0, 7) : "",
        placeholder: "2016-11", min: firstMonth, max: lastMonth },
    ], t("Work it out")) +
    toolProblem(problem) +
    '<p class="foot-note">' + t("The index runs from") + " " + esc(niceDate(obs[0][0])) +
    " " + t("to") + " " + esc(niceDate(now[0])) + ".</p>" +
    "</section>" + answer +
    '<section class="section"><div class="band-inset">' + CPI_CAVEAT + "</div>" +
    otherTools("salary") + "</section></div>";

  wireToolForm("salary", ["amount", "from"]);
  if (amount && then) {
    const readout = document.getElementById("salary-readout");
    mountChart(document.getElementById("salary-slot"), readout,
      (animate) => lineChart(line, { height: 260, id: "salary-chart", unit: "EGP", animate: animate }),
      (svg) => wireHover(svg, line, "EGP", readout));
  }
}

/* ---------- 2. what happened to your savings ---------- */

async function viewSavings(query) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(5);

  const params = new URLSearchParams(query || "");
  const amountRead = readAmount(params.get("amount"));
  /* A link can carry a month, "2015-01", the way the salary tool's does. The
   * date input takes nothing but a whole yyyy-mm-dd and logged an error for it,
   * so a month is read as its first day. */
  const fromRead = readDay(params.get("from"));
  const amount = amountRead.value || null;
  const from = fromRead.value || "";

  const [cpi, fx] = await Promise.all([
    loadSeries(CPI).catch(() => null),
    loadSeries(USD).catch(() => null),
  ]);
  if (!app.isConnected) return;
  if (!cpi || !fx) return toolUnavailable("the price index and the dollar rate");

  const priceNow = cpi.observations[cpi.observations.length - 1];
  const fxNow = fx.observations[fx.observations.length - 1];
  /* Both series have to cover the day. Prices stop at the last month CBE's
   * index reaches, which is usually a month or two before the dollar rate; a
   * day after that has no inflation to measure, and used to be told prices had
   * risen 1x. */
  const firstDay = [fx.observations[0][0], cpi.observations[0][0]].sort()[1];
  const lastDay = [fxNow[0], monthEnd(priceNow[0])].sort()[0];

  const problem = amountRead.bad ? AMOUNT_PROBLEM()
    : fromRead.bad ? DAY_PROBLEM()
    : from && (from < firstDay || from > lastDay) ? RANGE_PROBLEM(niceDate(firstDay), niceDate(lastDay))
    : "";
  const priceThen = from && !problem ? valueAt(cpi.observations, from) : null;
  const fxThen = from && !problem ? valueAt(fx.observations, from) : null;
  // The dollar series has holes of several weeks in 2014 and 2015. The rate
  // used for a day inside one is the last one before it, and now says so.
  const fxStale = fxThen && (Date.parse(from) - Date.parse(fxThen[0])) / 86400000 > 4;

  let answer = "";
  if (amount && priceThen && fxThen) {
    const inflation = priceNow[1] / priceThen[1];
    const keptReal = amount / inflation;             // what the cash still buys, in then-pounds
    const dollars = amount / fxThen[1];
    const inDollarsNow = dollars * fxNow[1];         // nominal pounds if swapped on day one
    const inDollarsReal = inDollarsNow / inflation;  // and what that buys, in then-pounds
    const lost = (1 - 1 / inflation) * 100;

    answer =
      '<section class="section band"><div class="wrap-inner">' +
      '<p class="eyebrow">' + esc(niceDate(from)) + " " + t("to") + " " + esc(niceDate(fxNow[0])) + "</p>" +
      "<h2>" + esc(money(amount)) + " " + t("kept as pounds now buys") + " " +
      esc(money(keptReal)) + " " + t("of") + " " +
      esc(niceDate(from).replace(/^\d+ /, "")) + " " + t("shopping") + "</h2>" +
      '<p class="lede">' + t("Prices have risen") + " <b>" + (Math.round(inflation * 100) / 100) +
      "×</b> " + t("since then, so the cash lost") + " <b>" + pct(lost) + "%</b> " +
      t("of what it could buy.") + " " +
      t("The same money swapped for dollars that day would be") + " <b>$" +
      Math.round(dollars).toLocaleString("en-US") + "</b>, " + t("which is") + " " +
      esc(money(inDollarsNow)) + " " + t("today, and buys") + " " +
      esc(money(inDollarsReal)) + " " + t("of that same shopping.") + "</p>" +
      '<div class="table-scroll"><table class="indicators"><thead><tr><th>' + t("What you did with it") + "</th>" +
      "<th>" + t("Pounds today") + "</th><th>" + t("What it buys") + "</th></tr></thead><tbody>" +
      "<tr><td class='name'>" + t("Kept it as pounds") + "</td><td>" + esc(money(amount)) + "</td><td>" +
      esc(money(keptReal)) + "</td></tr>" +
      "<tr><td class='name'>" + t("Swapped it for dollars on day one") + "</td><td>" +
      esc(money(inDollarsNow)) + "</td><td>" + esc(money(inDollarsReal)) + "</td></tr>" +
      "</tbody></table></div>" +
      '<p class="foot-note">' + t("“What it buys” is in the money of") + " " + esc(niceDate(from)) +
      ", " + t("so both rows can be compared with the number you started from. The dollar row is the CBE official selling rate on both dates and ignores what a bank would have charged you on either side of it.") +
      " " + fillIn(t("Prices are to {prices}, the latest month in the index; the dollar rate is to {dollar}."),
                   { prices: esc(niceDate(priceNow[0]).replace(/^\d+ /, "")), dollar: esc(niceDate(fxNow[0])) }) +
      (fxStale
        ? " " + fillIn(t("The dollar rate used for {asked} is from {held}, the last one Miqyas holds before it."),
                       { asked: esc(niceDate(from)), held: esc(niceDate(fxThen[0])) })
        : "") +
      "</p>" +
      '<div class="controls"><button class="chip solid" id="tool-share">' + t("Copy a link to this answer") + "</button></div>" +
      "</div></section>";
  }

  app.innerHTML =
    '<div class="wrap">' + toolCrumbs("savings") +
    '<section class="section">' +
    '<p class="eyebrow">' + t("Work it out") + "</p>" +
    "<h2>" + t("What happened to your savings?") + "</h2>" +
    '<p class="lede">' +
    t("Put in an amount and the day you set it aside. This says what it still buys, and what the same money would have been worth had you swapped it for dollars that day and done nothing else.") +
    "</p>" +
    toolForm([
      { id: "amount", label: t("Amount, in pounds"), type: "number", value: amount || "",
        placeholder: "10000", min: "1", step: "any" },
      { id: "from", label: t("Set aside on"), type: "date", value: from,
        min: firstDay, max: lastDay },
    ], t("Work it out")) +
    toolProblem(problem) +
    '<p class="foot-note">' + t("Any date from") + " " + esc(niceDate(firstDay)) + " " + t("onwards.") + "</p>" +
    "</section>" + answer +
    '<section class="section"><div class="band-inset">' + CPI_CAVEAT + "</div>" +
    otherTools("savings") + "</section></div>";

  wireToolForm("savings", ["amount", "from"]);
}

/* ---------- 3. the dollar on a date, and on that date every year ---------- */

async function viewDollarOn(query) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(5);

  const params = new URLSearchParams(query || "");
  // loadIndex rather than loadSeries alone: fxRegimes reads state.events, and
  // nothing else on this page would have filled it.
  const [, fx] = await Promise.all([
    loadIndex().catch(() => null),
    loadSeries(USD).catch(() => null),
  ]);
  if (!app.isConnected) return;
  if (!fx) return toolUnavailable("the dollar rate");

  const obs = fx.observations;
  const firstDay = obs[0][0];
  const lastDay = obs[obs.length - 1][0];
  /* With no date this is "on this day": the same calendar day in every year
   * the archive covers. It is the one thing on the site that is different
   * every morning without anybody publishing anything. A date somebody typed
   * is checked instead of being quietly moved to the nearest end. */
  const typed = params.get("on");
  const onRead = typed ? readDay(typed) : { value: todayISO() };
  const problem = onRead.bad ? DAY_PROBLEM()
    : typed && (onRead.value < firstDay || onRead.value > lastDay)
      ? RANGE_PROBLEM(niceDate(firstDay), niceDate(lastDay))
      : "";
  const on = problem ? todayISO() : onRead.value;
  const asked = on > lastDay ? lastDay : on < firstDay ? firstDay : on;

  const hit = problem ? null : valueAt(obs, asked);
  // A weekend or a holiday is a gap of a few days; the archive also has holes
  // of seven and eight weeks in 2014 and 2015, which are not CBE's doing.
  const gap = hit ? Math.round((Date.parse(asked) - Date.parse(hit[0])) / 86400000) : 0;
  const now = obs[obs.length - 1];
  const regime = (fxRegimes() || []).find((r) => r.from <= asked && asked <= r.to);

  // The same day and month, every year the archive has one.
  const [, month, day] = asked.split("-");
  const years = [];
  for (let y = parseInt(firstDay.slice(0, 4), 10); y <= parseInt(lastDay.slice(0, 4), 10); y++) {
    const at = valueAt(obs, y + "-" + month + "-" + day);
    if (at && at[0].slice(0, 4) === String(y)) years.push(at);
  }

  const multiple = hit && hit[1] ? now[1] / hit[1] : null;

  app.innerHTML =
    '<div class="wrap">' + toolCrumbs("dollar") +
    '<section class="section">' +
    '<p class="eyebrow">' + t("Work it out") + "</p>" +
    "<h2>" + t("What was a dollar worth that day?") + "</h2>" +
    '<p class="lede">' +
    t("A birthday, a wedding, the day you started a job. CBE has published an official rate every business day since January 2005.") +
    "</p>" +
    toolForm([{ id: "on", label: t("Pick a date"), type: "date", value: problem ? "" : asked,
                min: firstDay, max: lastDay }], t("Look it up")) +
    toolProblem(problem) +
    "</section>" +

    (hit
      ? '<section class="section band"><div class="wrap-inner">' +
        '<p class="eyebrow">' + esc(regime ? regime.label : "CBE official selling rate") + "</p>" +
        "<h2>" + esc(fmt(hit[1], fx.unit)) + " " + t("on") + " " + esc(niceDate(hit[0])) + "</h2>" +
        '<p class="lede">' +
        (hit[0] !== asked && gap > 4
          ? fillIn(t("Miqyas holds no rate for {asked}. This is the last one before it, {days} days earlier."),
                   { asked: esc(niceDate(asked)), days: gap }) + " "
          : hit[0] !== asked
          ? "CBE published no rate on " + esc(niceDate(asked)) +
            ", so this is the last one before it. "
          : "") +
        (multiple
          ? t("A dollar costs") + " <b>" + (Math.round(multiple * 100) / 100) + "×</b> " +
            t("more today, at") + " " + esc(fmt(now[1], fx.unit)) + ". " +
            t("Put the other way round,") + " " + esc(money(1000)) + " " + t("was") + " $" +
            Math.round(1000 / hit[1]).toLocaleString("en-US") + " " + t("then and is") + " $" +
            Math.round(1000 / now[1]).toLocaleString("en-US") + " " + t("now") + "."
          : "") +
        "</p>" +
        '<div class="controls"><button class="chip solid" id="tool-share">' + t("Copy a link to this answer") + "</button>" +
        '<a class="chip" href="#/s/' + USD + '">' + t("The whole series") + "</a></div>" +
        "</div></section>"
      : "") +

    (years.length > 1
      ? '<section class="section">' +
        '<p class="eyebrow">' + t("On this day") + "</p>" +
        "<h2>The " + esc(String(parseInt(day, 10))) + esc(ordinal(parseInt(day, 10))) + " of " +
        esc(MONTH_NAMES[parseInt(month, 10) - 1]) + ", every year</h2>" +
        '<p class="lede">The official rate on the same calendar day, as far back as CBE goes.</p>' +
        '<div class="table-scroll"><table class="indicators"><thead><tr>' +
        "<th>Year</th><th>Rate</th><th>Against the year before</th><th>As of</th>" +
        "</tr></thead><tbody>" +
        years.map((row, i) => {
          const prev = i ? years[i - 1][1] : null;
          const change = prev === null ? null : row[1] - prev;
          return "<tr><td class='name'>" + row[0].slice(0, 4) + "</td>" +
            "<td>" + fmt(row[1], fx.unit) + "</td>" +
            '<td class="' + dirClass(change, fx.unit) + '">' + changeCell(change, fx.unit) + "</td>" +
            '<td class="asof">' + esc(niceDate(row[0])) + "</td></tr>";
        }).join("") +
        "</tbody></table></div></section>"
      : "") +

    '<section class="section">' + otherTools("dollar") + "</section></div>";

  wireToolForm("dollar", ["on"]);
}

/* core.js abbreviates months, which is right in a table column and wrong in a
 * sentence. */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];

const ordinal = (n) =>
  n % 10 === 1 && n % 100 !== 11 ? "st"
  : n % 10 === 2 && n % 100 !== 12 ? "nd"
  : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";

/* ---------- the form ----------
 *
 * One shape for all three. Submitting writes the values into the hash rather
 * than rendering in place, which costs a re-route and buys three things: the
 * answer is a link, the back button works, and there is exactly one path into
 * the render rather than one for a fresh load and another for a submit.
 */

function toolForm(fields, action) {
  return (
    '<form class="tool-form" id="tool-form">' +
    fields.map((f) =>
      '<label class="tool-field"><span>' + esc(f.label) + "</span>" +
      '<input id="tf-' + f.id + '" name="' + f.id + '" type="' + f.type + '"' +
      (f.value !== "" && f.value !== null && f.value !== undefined ? ' value="' + esc(f.value) + '"' : "") +
      (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "") +
      (f.min ? ' min="' + esc(f.min) + '"' : "") +
      (f.max ? ' max="' + esc(f.max) + '"' : "") +
      (f.step ? ' step="' + esc(f.step) + '"' : "") +
      " inputmode=\"" + (f.type === "number" ? "decimal" : "text") + "\"></label>").join("") +
    '<button class="chip solid" type="submit">' + esc(action) + "</button>" +
    "</form>"
  );
}

function wireToolForm(key, ids) {
  const form = document.getElementById("tool-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      ids.forEach((id) => {
        const el = document.getElementById("tf-" + id);
        if (el && el.value) params.set(id, el.value);
      });
      const next = "#/tools/" + key + (params.toString() ? "?" + params.toString() : "");
      if (location.hash === next) route();
      else location.hash = next;
    });
  }
  const share = document.getElementById("tool-share");
  if (share) share.addEventListener("click", () => copyLink(share));
}

function toolUnavailable(what) {
  document.getElementById("app").innerHTML =
    '<div class="wrap"><section class="section">' +
    "<h2>That one needs a number that is not here</h2>" +
    '<p class="lede">This calculator runs on ' + esc(what) + ", which did not load. " +
    'Reloading usually fixes it.</p><div class="controls">' +
    '<a class="chip solid" href="#/tools">The other calculators</a>' +
    '<a class="chip" href="#/">Overview</a></div></section></div>';
}
