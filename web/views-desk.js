/* Miqyas -- the money market page.
 *
 * Every other view here is generic: it will render whichever of the 1,300
 * series you point it at. This one is not. It is one desk's screen, assembled
 * once, because the people who work on EGP liquidity read the same eight
 * numbers every morning and should not have to find them across four topics
 * first. Nothing on it is computed here that is not already in the catalogue.
 */

const MM_CORRIDOR = {
  floor: "EG.RATE.ON.DEP",
  ceiling: "EG.RATE.ON.LEND",
  benchmark: "EG.CONIA.ON.RATE",
};

const MM_OVERNIGHT = [
  "EG.CONIA.ON.RATE",
  "EG.IBK.D.ON",
  "EG.IBK.D.W1",
  "EG.IBK.D.LT1W",
  "EG.CONIA.ON.VOL",
  "EG.IBK.D.VOL.ON",
  "EG.IBK.D.VOL.TOTAL",
];

const MM_TENORS = ["3M", "6M", "9M", "12M"];
const TENOR_LABEL = { "3M": t("3 month"), "6M": t("6 month"), "9M": t("9 month"), "12M": t("12 month") };

/* Auction amounts come out of CBE in whole pounds, which runs to eleven digits
 * and reads as noise. Billions is how the desk says it out loud. */
const bn = (v) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "—"
    : (v / 1e9).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* Clip a step series to a later start date without losing the level in force on
 * that date: the last reading at or before it is carried forward and re-dated,
 * so the corridor still reaches the left edge of the chart. */
const clipStep = (obs, from) => {
  const after = obs.filter((p) => p[0] >= from);
  const before = obs.filter((p) => p[0] < from).pop();
  return before ? [[from, before[1]]].concat(after) : after;
};

/* The card that reaches this page from the overview and from the rates topic.
 * It lives here so there is one copy of the words. */
function moneyMarketCard() {
  const conia = (state.byId && state.byId.get(MM_CORRIDOR.benchmark)) || null;
  return (
    '<a class="wide-card" href="#/money-market">' +
    '<p class="eyebrow">' + t("For a domestic market desk") + "</p>" +
    "<h3>" + t("The money market, on one screen") + "</h3>" +
    "<p>" + t("Where overnight money cleared inside the CBE corridor, the interbank tenors and their volumes, and the EGP bill curve with bid to cover at every tenor. Daily interbank since June 2010, every EGP bill auction since June 2002") +
    (conia ? tf(", CONIA at {v} on {d}", { v: fmt(conia.latest_value, conia.unit), d: niceDate(conia.last) }) : "") +
    ".</p>" +
    '<span class="go">' + t("Open the money market page →") + "</span></a>"
  );
}

async function viewMoneyMarket() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);
  pageTitle(t("The money market"));

  await loadIndex();
  const mpc = await loadMPC();
  const get = (id) => state.byId.get(id) || null;

  const loaded = await Promise.all(
    [MM_CORRIDOR.floor, MM_CORRIDOR.ceiling, MM_CORRIDOR.benchmark,
     "EG.TB.EGP.3M.YLD.WAVG", "EG.TB.EGP.12M.YLD.WAVG"].map((id) => loadSeries(id).catch(() => null))
  );
  const floor = loaded[0], ceiling = loaded[1], benchmark = loaded[2];
  const tb3 = loaded[3], tb12 = loaded[4];

  /* ---------- the corridor ---------- */

  let corridor = "", corridorReadout = "", corridorLegend = "";
  let coniaObs = null, floorObs = null, ceilObs = null;

  if (floor && ceiling && benchmark && benchmark.observations.length) {
    // The corridor is published from July 2014 and CONIA only from December
    // 2016. Starting the chart where the benchmark starts keeps the band and
    // the line talking about the same period; the corridor's own page has the
    // earlier history.
    const from = benchmark.observations[0][0];
    coniaObs = benchmark.observations;
    floorObs = clipStep(floor.observations, from);
    ceilObs = clipStep(ceiling.observations, from);

    const lastC = coniaObs[coniaObs.length - 1];
    const lo = floorObs[floorObs.length - 1][1];
    const hi = ceilObs[ceilObs.length - 1][1];
    const mid = (lo + hi) / 2;
    const off = lastC[1] - mid;

    corridor = '<div class="hero-chart" id="corridor-slot"></div>';

    corridorLegend =
      '<div class="legend">' +
      '<span class="item"><span class="key"></span>' + t("CONIA, the overnight fixing") + "</span>" +
      '<span class="item"><span class="key band"></span>' + t("the CBE corridor, overnight deposit to overnight lending") + "</span>" +
      "</div>";

    const range = { lo: fmt(lo, "percent per annum"), hi: fmt(hi, "percent per annum"), x: fmtChange(off, "percent") };
    corridorReadout =
      '<div class="readout" id="corridor-readout">' +
      '<span class="val">' + fmt(lastC[1], "percent per annum") + "</span>" +
      '<span class="when">' + tf("CONIA, {d}", { d: niceDate(lastC[0]) }) + "</span>" +
      "<span>" +
      (Math.abs(off) < 0.005
        ? tf("Corridor {lo} to {hi}, so overnight money cleared on the midpoint", range)
        : off > 0
        ? tf("Corridor {lo} to {hi}, so overnight money cleared {x} above the midpoint", range)
        : tf("Corridor {lo} to {hi}, so overnight money cleared {x} below the midpoint", range)) +
      "</span></div>";
  }

  /* ---------- overnight money ---------- */

  const overnight = MM_OVERNIGHT.map(get).filter(Boolean).map((s) => indicatorRow(s)).join("");

  /* ---------- the EGP bill curve ---------- */

  const curveRow = (tenor) => {
    const way = get("EG.TB.EGP." + tenor + ".YLD.WAVG");
    if (!way) return "";
    const min = get("EG.TB.EGP." + tenor + ".YLD.MIN");
    const max = get("EG.TB.EGP." + tenor + ".YLD.MAX");
    const cover = get("EG.TB.EGP." + tenor + ".BIDCOVER");
    const acc = get("EG.TB.EGP." + tenor + ".AMT.ACC");
    const sub = get("EG.TB.EGP." + tenor + ".AMT.SUB");
    const c = changeOf(way);
    return (
      "<tr>" +
      '<td class="name"><a href="#/s/' + encodeURIComponent(way.series_id) + '">' + esc(TENOR_LABEL[tenor]) + "</a>" +
      '<span class="unit">' + t("weighted average") + "</span></td>" +
      "<td>" + fmt(way.latest_value, way.unit) + "</td>" +
      '<td class="' + dirClass(c, way.unit) + '">' + changeCell(c, way.unit) + "</td>" +
      '<td class="hide-sm">' + tf("{from} to {to}", {
        from: fmt(min && min.latest_value, "percent per annum"), to: fmt(max && max.latest_value, "percent per annum") }) + "</td>" +
      "<td>" + fmt(cover && cover.latest_value, "ratio") + "</td>" +
      '<td class="hide-sm">' + bn(sub && sub.latest_value) + "</td>" +
      "<td>" + bn(acc && acc.latest_value) + "</td>" +
      '<td class="asof">' + niceDate(way.last) + "</td>" +
      "</tr>"
    );
  };
  const curve = MM_TENORS.map(curveRow).join("");

  const slope =
    tb3 && tb12
      ? '<div id="billc-slot"></div>' +
        '<div class="legend"><span class="item"><span class="key"></span>' + t("3 month") + "</span>" +
        '<span class="item"><span class="key s1"></span>' + t("12 month") + "</span></div>" +
        '<div class="readout" id="bill-readout">' +
        "<span>" + t("Both weighted average accepted yields, as published, with no rebasing. Where the two cross, the curve inverted.") +
        "</span></div>"
      : "";

  /* ---------- latest decision ---------- */

  const latest = mpc && mpc.statements && mpc.statements[mpc.statements.length - 1];
  const mpcCard = latest
    ? '<a class="wide-card" href="#/rates">' +
      '<p class="eyebrow">' + t("Latest rate decision") + "</p>" +
      "<h3>" + tf({ hold: "{date}, the committee left rates unchanged", cut: "{date}, the committee cut",
                    hike: "{date}, the committee raised" }[latest.decision] || "{date}, the committee met",
                  { date: niceDate(latest.date) }) + "</h3>" +
      "<p>" + tf("Overnight deposit {d}%, overnight lending {l}%.", { d: esc(latest.deposit_rate || "—"), l: esc(latest.lending_rate || "—") }) +
      " " + t("Every decision back to June 2005 with the statement text, and what changed in the wording each time.") + "</p>" +
      '<span class="go">' + tf("See all {n} decisions →", { n: num(mpc.count || 0) }) + "</span></a>"
    : "";

  /* ---------- the page ---------- */

  const site = siteBase();

  app.innerHTML =
    '<section class="hero"><div class="wrap">' +
    crumbs([
      { label: t("Series"), href: "#/series" },
      { label: t("Interest rates"), href: "#/topic/rates" },
      { label: t("Money market") },
    ]) +
    "<h1>" + t("Where overnight money sits in the corridor.") + "</h1>" +
    '<p class="standfirst">' + t("The floor, the ceiling, and where the pound actually funded between them. Underneath it: the interbank tenors with the volumes behind them, and what the government paid at every EGP bill auction. All of it CBE's own numbers, updated daily.") + "</p>" +
    corridor + corridorLegend + corridorReadout +
    "</div></section>" +

    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">' + t("Overnight and short tenors") + "</p>" +
    "<h2>" + t("What money cost, and how much of it moved") + "</h2>" +
    '<p class="lede">' + t("Rates first, then the volumes underneath them, because a rate on thin volume is not the same fact as a rate on heavy volume. The last column is where the current reading sits between that series' own record low and high.") + "</p>" +
    '<div class="table-scroll"><table class="indicators"><thead><tr>' +
    '<th class="star-col"><span class="sr-only">' + t("On your desk") + "</span></th>" +
    "<th>" + t("Series|one row of a table") + "</th><th>" + t("Latest") + "</th><th>" + t("Change") + "</th>" +
    '<th class="hide-sm">' + t("Lowest") + '</th><th class="hide-sm">' + t("Highest") + "</th>" +
    "<th>" + t("Where it sits") + "</th><th>" + t("As of") + "</th>" +
    "</tr></thead><tbody>" + overnight + "</tbody></table></div>" +
    "</div></section>" +

    '<section class="section band"><div class="wrap">' +
    '<p class="eyebrow">' + t("EGP treasury bills") + "</p>" +
    "<h2>" + t("The curve, and who turned up for it") + "</h2>" +
    '<p class="lede">' + t("The latest auction CBE has published at each tenor, dated by the bill's issue date, which is why it can run a few days ahead of today. Bid to cover is the column that says whether the tenor was wanted: submitted over accepted, computed here because CBE publishes the two amounts and never the ratio. The 3-month runs back to June 2002, the 6-month to July 2002, the 12-month to April 2004 and the 9-month to October 2008, and the record-level table behind these carries the ISIN, the maturity date and the amount CBE asked for as well.") + "</p>" +
    '<div class="table-scroll"><table class="indicators"><thead><tr>' +
    "<th>" + t("Tenor") + "</th><th>" + t("Yield") + "</th><th>" + t("Change") + "</th>" +
    '<th class="hide-sm">' + t("Accepted range") + "</th><th>" + t("Bid to cover") + "</th>" +
    '<th class="hide-sm">' + t("Submitted, EGP bn") + "</th><th>" + t("Accepted, EGP bn") + "</th><th>" + t("Issued") + "</th>" +
    "</tr></thead><tbody>" + curve + "</tbody></table></div>" +
    slope +
    "</div></section>" +

    (mpcCard ? '<section class="section"><div class="wrap">' + mpcCard + "</div></section>" : "") +

    '<section class="section"><div class="wrap"><div class="band-inset">' +
    '<p class="eyebrow">' + t("Take it to your desk") + "</p>" +
    "<h2>" + t("All the series on this page, without the page") + "</h2>" +
    '<p class="lede">' + t("No key and no account. Every endpoint is a static file on the same host as this page, with no rate limit that we set.") + "</p>" +
    '<pre class="code"><code># ' + esc(t("the overnight fixing, every observation")) + "\n" +
    "curl " + site + "api/v1/series/EG.CONIA.ON.RATE.json\n\n" +
    "# " + esc(t("the whole money market, straight into Python")) + "\n" +
    "import duckdb\n" +
    "duckdb.sql(&quot;&quot;&quot;\n" +
    "  SELECT series_id, period, value\n" +
    "  FROM &#39;" + site + "parquet/rates.parquet&#39;\n" +
    "  WHERE series_id IN (&#39;EG.CONIA.ON.RATE&#39;, &#39;EG.IBK.D.ON&#39;,\n" +
    "                      &#39;EG.RATE.ON.DEP&#39;, &#39;EG.RATE.ON.LEND&#39;)\n" +
    "  ORDER BY period\n" +
    "&quot;&quot;&quot;)\n\n" +
    "# " + esc(t("every EGP bill auction since 2002")) + "\n" +
    "duckdb.sql(&quot;SELECT * FROM &#39;" + site + "parquet/govt.parquet&#39;&quot;)" +
    "</code></pre>" +
    '<h3 class="sub-head">' + t("Open market operations") + "</h3>" +
    '<p class="lede">' + t("The liquidity management CBE does itself is published as auction tables rather than as series, so it is not charted here, but it is in the record-level download: deposit auctions at the corridor rate, fixed-rate and variable-rate deposit auctions, fixed-rate and variable-rate repo auctions, and every EGP bill auction with its ISIN. One CSV per table, inside") +
    " " + bdiLTR("<code>records-csv.zip</code>") + ".</p>" +
    '<div class="controls">' +
    '<a class="chip solid" href="' + ROOT + '/bulk/records-csv.zip" download>' + bdiLTR("records-csv.zip") + "</a>" +
    '<a class="chip" href="' + ROOT + '/parquet/rates.parquet" download>' + bdiLTR("rates.parquet") + "</a>" +
    '<a class="chip" href="' + ROOT + '/parquet/govt.parquet" download>' + bdiLTR("govt.parquet") + "</a>" +
    '<a class="chip" href="#/topic/rates">' + t("Every rate series") + "</a>" +
    '<a class="chip" href="#/data">' + t("Everything else") + "</a>" +
    "</div>" +
    "</div></div></section>" +

    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">' + t("Where the record is not clean") + "</p>" +
    "<h2>" + t("Two prints for the same day") + "</h2>" +
    '<p class="lede">' + t("On 27 November 2023 CBE published two different interbank overnight rates for the same session, 19.395 and 19.404, and two different overnight volumes 21 billion pounds apart, 264,437 and 243,187 million. Both are kept: the site shows one and records the other, and the same is true of every other conflict of this kind in the archive.") + "</p>" +
    '<p class="foot-note">' + t("The full list is") + " " + bdiLTR("<code>data/clean/anomalies.csv</code>") + " " + t("in the repository.") +
    ' <a href="#/about">' + t("How this is built, and what is not in it →") + "</a></p>" +
    "</div></section>";

  /* ---------- wiring ---------- */

  if (corridor) {
    const readout = document.getElementById("corridor-readout");
    mountChart(document.getElementById("corridor-slot"), readout,
      (animate) => lineChart([coniaObs, floorObs, ceilObs], {
        height: 320,
        id: "corridor",
        unit: "percent per annum",
        // The benchmark is a daily fixing. The two corridor rates hold at the
        // level the committee set them to, so they step.
        step: [false, true, true],
        band: [1, 2],
        animate: animate,
      }),
      (svg) => wireHover(
        svg,
        [coniaObs, floorObs, ceilObs],
        ["percent per annum", "percent per annum", "percent per annum"],
        readout,
        [t("CONIA"), t("floor"), t("ceiling")],
        { bandMid: [1, 2] }
      ));
  }
  if (slope) {
    const readout = document.getElementById("bill-readout");
    mountChart(document.getElementById("billc-slot"), readout,
      (animate) => lineChart([tb3.observations, tb12.observations], {
        height: 300,
        id: "billc",
        unit: "percent per annum",
        animate: animate,
      }),
      (svg) => wireHover(
        svg,
        [tb3.observations, tb12.observations],
        ["percent per annum", "percent per annum"],
        readout,
        [t("3 month"), t("12 month")]
      ));
  }
}
