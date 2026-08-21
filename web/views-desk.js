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
const TENOR_LABEL = { "3M": "3 month", "6M": "6 month", "9M": "9 month", "12M": "12 month" };

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
    '<p class="eyebrow">For a domestic market desk</p>' +
    "<h3>The money market, on one screen</h3>" +
    "<p>Where overnight money cleared inside the CBE corridor, the interbank tenors and " +
    "their volumes, and the EGP bill curve with bid to cover at every tenor. Daily interbank " +
    "since June 2010, every EGP bill auction since June 2002" +
    (conia ? ", CONIA at " + fmt(conia.latest_value, conia.unit) + " on " + niceDate(conia.last) : "") +
    ".</p>" +
    '<span class="go">Open the money market page →</span></a>'
  );
}

async function viewMoneyMarket() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);

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

    corridor =
      '<div class="hero-chart">' +
      lineChart([coniaObs, floorObs, ceilObs], {
        height: 320,
        id: "corridor",
        unit: "percent per annum",
        // The benchmark is a daily fixing. The two corridor rates hold at the
        // level the committee set them to, so they step.
        step: [false, true, true],
        band: [1, 2],
      }) +
      "</div>";

    corridorLegend =
      '<div class="legend">' +
      '<span class="key"></span>CONIA, the overnight fixing' +
      '<span class="key band"></span>the CBE corridor, overnight deposit to overnight lending' +
      "</div>";

    corridorReadout =
      '<div class="readout" id="corridor-readout">' +
      '<span class="val">' + fmt(lastC[1], "percent per annum") + "</span>" +
      '<span class="when">CONIA, ' + niceDate(lastC[0]) + "</span>" +
      "<span>Corridor " + fmt(lo, "percent per annum") + " to " + fmt(hi, "percent per annum") + ", so " +
      (Math.abs(off) < 0.005
        ? "overnight money cleared on the midpoint"
        : "overnight money cleared " + fmtChange(off, "percent") + (off > 0 ? " above" : " below") + " the midpoint") +
      "</span></div>";
  }

  /* ---------- overnight money ---------- */

  const overnight = MM_OVERNIGHT.map(get).filter(Boolean).map(indicatorRow).join("");

  /* ---------- the EGP bill curve ---------- */

  const curveRow = (t) => {
    const way = get("EG.TB.EGP." + t + ".YLD.WAVG");
    if (!way) return "";
    const min = get("EG.TB.EGP." + t + ".YLD.MIN");
    const max = get("EG.TB.EGP." + t + ".YLD.MAX");
    const cover = get("EG.TB.EGP." + t + ".BIDCOVER");
    const acc = get("EG.TB.EGP." + t + ".AMT.ACC");
    const sub = get("EG.TB.EGP." + t + ".AMT.SUB");
    const c = changeOf(way);
    return (
      "<tr>" +
      '<td class="name"><a href="#/s/' + encodeURIComponent(way.series_id) + '">' + esc(TENOR_LABEL[t]) + "</a>" +
      '<span class="unit">weighted average</span></td>' +
      "<td>" + fmt(way.latest_value, way.unit) + "</td>" +
      '<td class="' + dirClass(c, way.unit) + '">' + changeCell(c, way.unit) + "</td>" +
      '<td class="hide-sm">' + fmt(min && min.latest_value, "percent per annum") + " to " +
      fmt(max && max.latest_value, "percent per annum") + "</td>" +
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
      ? lineChart([tb3.observations, tb12.observations], {
          height: 300,
          id: "billc",
          unit: "percent per annum",
        }) +
        '<div class="legend"><span class="key"></span>3 month' +
        '<span class="key s1"></span>12 month</div>' +
        '<div class="readout" id="bill-readout">' +
        "<span>Both weighted average accepted yields, as published, with no rebasing. " +
        "Where the two cross, the curve inverted.</span></div>"
      : "";

  /* ---------- latest decision ---------- */

  const latest = mpc && mpc.statements && mpc.statements[mpc.statements.length - 1];
  const mpcCard = latest
    ? '<a class="wide-card" href="#/rates">' +
      '<p class="eyebrow">Latest rate decision</p>' +
      "<h3>" + niceDate(latest.date) + ", the committee " +
      ({ hold: "left rates unchanged", cut: "cut", hike: "raised" }[latest.decision] || "met") + "</h3>" +
      "<p>Overnight deposit " + esc(latest.deposit_rate || "—") + "%, overnight lending " +
      esc(latest.lending_rate || "—") + "%. Every decision back to June 2005 with the " +
      "statement text, and what changed in the wording each time.</p>" +
      '<span class="go">See all ' + (mpc.count || 0) + " decisions →</span></a>"
    : "";

  /* ---------- the page ---------- */

  const site = location.origin + location.pathname.replace(/[^/]*$/, "");

  app.innerHTML =
    '<section class="hero"><div class="wrap">' +
    crumbs([
      { label: "Browse", href: "#/browse" },
      { label: "Interest rates", href: "#/topic/rates" },
      { label: "Money market" },
    ]) +
    "<h1>Where overnight money sits in the corridor.</h1>" +
    '<p class="standfirst">The floor, the ceiling, and where the pound actually funded ' +
    "between them. Underneath it: the interbank tenors with the volumes behind them, and " +
    "what the government paid at every EGP bill auction. All of it CBE's own numbers, " +
    "rebuilt every morning.</p>" +
    corridor + corridorLegend + corridorReadout +
    "</div></section>" +

    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">Overnight and short tenors</p>' +
    "<h2>What money cost, and how much of it moved</h2>" +
    '<p class="lede">Rates first, then the volumes underneath them, because a rate on ' +
    "thin volume is not the same fact as a rate on heavy volume. The last column is where " +
    "the current reading sits between that series' own record low and high.</p>" +
    '<div class="table-scroll"><table class="indicators"><thead><tr>' +
    "<th>Series</th><th>Latest</th><th>Change</th>" +
    '<th class="hide-sm">Lowest</th><th class="hide-sm">Highest</th>' +
    '<th class="hide-sm">Where it sits</th><th>As of</th>' +
    "</tr></thead><tbody>" + overnight + "</tbody></table></div>" +
    "</div></section>" +

    '<section class="section band"><div class="wrap">' +
    '<p class="eyebrow">EGP treasury bills</p>' +
    "<h2>The curve, and who turned up for it</h2>" +
    '<p class="lede">The latest auction CBE has published at each tenor, dated by the ' +
    "bill's issue date, which is why it can run a few days ahead of today. Bid to cover is " +
    "the column that says whether the tenor was wanted: submitted over accepted, computed " +
    "here because CBE publishes the two amounts and never the ratio. The 3-month runs back " +
    "to June 2002, the 6-month to July 2002, the 12-month to April 2004 and the 9-month to " +
    "October 2008, and the record-level table behind these carries the ISIN, the maturity " +
    "date and the amount CBE asked for as well.</p>" +
    '<div class="table-scroll"><table class="indicators"><thead><tr>' +
    "<th>Tenor</th><th>Yield</th><th>Change</th>" +
    '<th class="hide-sm">Accepted range</th><th>Bid to cover</th>' +
    '<th class="hide-sm">Submitted, EGP bn</th><th>Accepted, EGP bn</th><th>Issued</th>' +
    "</tr></thead><tbody>" + curve + "</tbody></table></div>" +
    slope +
    "</div></section>" +

    (mpcCard ? '<section class="section"><div class="wrap">' + mpcCard + "</div></section>" : "") +

    '<section class="section"><div class="wrap"><div class="band-inset">' +
    '<p class="eyebrow">Take it to your desk</p>' +
    "<h2>Every series on this page, without the page</h2>" +
    '<p class="lede">No key, no account, no rate limit. Every endpoint is a static file, ' +
    "so it cannot throttle you and cannot go down separately from the site.</p>" +
    '<pre class="code"><code># the overnight fixing, every observation\n' +
    "curl " + site + "api/v1/series/EG.CONIA.ON.RATE.json\n\n" +
    "# the whole money market, straight into Python\n" +
    "import duckdb\n" +
    "duckdb.sql(&quot;&quot;&quot;\n" +
    "  SELECT series_id, period, value\n" +
    "  FROM &#39;" + site + "parquet/rates.parquet&#39;\n" +
    "  WHERE series_id IN (&#39;EG.CONIA.ON.RATE&#39;, &#39;EG.IBK.D.ON&#39;,\n" +
    "                      &#39;EG.RATE.ON.DEP&#39;, &#39;EG.RATE.ON.LEND&#39;)\n" +
    "  ORDER BY period\n" +
    "&quot;&quot;&quot;)\n\n" +
    "# every EGP bill auction since 2002\n" +
    "duckdb.sql(&quot;SELECT * FROM &#39;" + site + "parquet/govt.parquet&#39;&quot;)" +
    "</code></pre>" +
    '<h3 class="sub-head">Open market operations</h3>' +
    '<p class="lede">The liquidity management CBE does itself is published as auction tables ' +
    "rather " +
    "than as series, so it is not charted here, but it is in the record-level download: 294 " +
    "deposit auctions at the corridor rate, 600 fixed-rate and 544 variable-rate deposit " +
    "auctions, 116 fixed-rate and 54 variable-rate repo auctions, and all 4,037 EGP bill " +
    "auctions with their ISINs. One CSV per table, inside " +
    "<code>records-csv.zip</code>.</p>" +
    '<div class="controls">' +
    '<a class="chip solid" href="' + ROOT + '/bulk/records-csv.zip" download>records-csv.zip</a>' +
    '<a class="chip" href="' + ROOT + '/parquet/rates.parquet" download>rates.parquet</a>' +
    '<a class="chip" href="' + ROOT + '/parquet/govt.parquet" download>govt.parquet</a>' +
    '<a class="chip" href="#/topic/rates">Every rate series</a>' +
    '<a class="chip" href="#/data">Everything else</a>' +
    "</div>" +
    "</div></div></section>" +

    '<section class="section"><div class="wrap">' +
    '<p class="eyebrow">Where the record is not clean</p>' +
    "<h2>Two prints for the same day</h2>" +
    '<p class="lede">On 27 November 2023 CBE published two different interbank overnight ' +
    "rates for the same session, 19.395 and 19.404, and two different overnight volumes 21 " +
    "billion pounds apart, 264,437 and 243,187 million. Both are kept. The site shows one " +
    "and records the other rather than picking quietly, and the same is true of every other " +
    "conflict found across 424,000 observations.</p>" +
    '<p class="foot-note">The full list is <code>data/clean/anomalies.csv</code> in the ' +
    'repository. <a href="#/about">How this is built, and what is not in it →</a></p>' +
    "</div></section>";

  /* ---------- wiring ---------- */

  if (corridor) {
    const svg = document.getElementById("corridor");
    armLines(svg);
    wireHover(
      svg,
      [coniaObs, floorObs, ceilObs],
      ["percent per annum", "percent per annum", "percent per annum"],
      document.getElementById("corridor-readout"),
      ["CONIA", "floor", "ceiling"]
    );
  }
  if (slope) {
    const svg = document.getElementById("billc");
    armLines(svg);
    wireHover(
      svg,
      [tb3.observations, tb12.observations],
      ["percent per annum", "percent per annum"],
      document.getElementById("bill-readout"),
      ["3 month", "12 month"]
    );
  }
}
