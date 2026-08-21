/* Miqyas -- get the data, and about.
 *
 * The download page reads dist/manifest.json so the sizes on it are the real
 * sizes of the files being offered, not numbers typed into copy that will
 * quietly rot.
 */

const MB = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB");

async function viewData() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);

  const index = await loadIndex();
  const manifest = await getJSON(ROOT + "/manifest.json").catch(() => []);
  const sizeOf = (path) => {
    const hit = manifest.find((m) => m.path === path);
    return hit ? MB(hit.bytes) : "";
  };
  const totalObs = index.reduce((a, s) => a + (s.n || 0), 0);
  const sqliteName = manifest.find((m) => /\.sqlite$/.test(m.path));

  const file = (href, name, note, size) =>
    '<a class="dl" href="' + href + '" download>' +
    '<span class="n">' + esc(name) + "</span>" +
    '<span class="d">' + esc(note) + "</span>" +
    '<span class="s">' + esc(size || "") + "</span></a>";

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "Get the data" }]) +
    '<section class="section">' +
    '<p class="eyebrow">Free, no key, no account</p>' +
    "<h2>Take all of it</h2>" +
    '<p class="lede">' + index.length.toLocaleString() + " series and " + totalObs.toLocaleString() +
    " observations, in whichever shape suits you. Everything here is rebuilt from CBE's own " +
    "publications every morning, so a bookmark stays current.</p>" +

    '<h3 class="sub-head">Whole-archive downloads</h3>' +
    '<div class="dl-grid">' +
    file(ROOT + "/parquet/all.parquet", "all.parquet", "Every observation. Opens in DuckDB, pandas, Polars, R.", sizeOf("parquet/all.parquet")) +
    file(ROOT + "/parquet/series.parquet", "series.parquet", "The catalogue: titles, units, frequency, provenance.", sizeOf("parquet/series.parquet")) +
    (sqliteName ? file(ROOT + "/" + sqliteName.path, sqliteName.path, "One SQLite file with both tables and an index on period.", MB(sqliteName.bytes)) : "") +
    file(ROOT + "/bulk/series-csv.zip", "series-csv.zip", "Plain CSV, one file per dataset, plus the catalogue.", sizeOf("bulk/series-csv.zip")) +
    file(ROOT + "/bulk/records-csv.zip", "records-csv.zip", "The record-level tables behind the derived series.", sizeOf("bulk/records-csv.zip")) +
    file(ROOT + "/manifest.json", "manifest.json", "Every published file with its SHA-256, so a mirror can check itself.", sizeOf("manifest.json")) +
    "</div>" +

    '<h3 class="sub-head">By topic</h3>' +
    '<p class="lede">Smaller files if you only want one part of it.</p>' +
    '<div class="dl-grid">' +
    ["fx", "rates", "govt", "prices", "external", "excel"].map((f) =>
      file(ROOT + "/parquet/" + f + ".parquet", f + ".parquet", "", sizeOf("parquet/" + f + ".parquet"))
    ).join("") +
    "</div>" +
    "</section>" +

    '<section class="section band-inset"><div class="wrap-inner">' +
    '<p class="eyebrow">API</p>' +
    "<h2>Static JSON, no key, no rate limit</h2>" +
    '<p class="lede">There is no server. Every endpoint is a file on a CDN, which is why it ' +
    "cannot go down, cannot rate-limit you, and costs nothing to run.</p>" +
    '<pre class="code"><code># the catalogue: one light record per series\n' +
    'curl ' + location.origin + location.pathname.replace(/[^/]*$/, "") + 'api/v1/series.json\n\n' +
    "# one series, with every observation\n" +
    "curl " + location.origin + location.pathname.replace(/[^/]*$/, "") + "api/v1/series/EG.FX.OFF.USD.SELL.json\n\n" +
    "# the rate decisions\n" +
    "curl " + location.origin + location.pathname.replace(/[^/]*$/, "") + "api/v1/mpc.json\n\n" +
    "# query the whole archive from Python, no download\n" +
    "import duckdb\n" +
    "duckdb.sql(&quot;SELECT * FROM &#39;" + location.origin + location.pathname.replace(/[^/]*$/, "") +
    "parquet/all.parquet&#39; WHERE series_id = &#39;EG.CPI.HDL.YOY&#39;&quot;)" +
    "</code></pre>" +
    "</div></section>" +

    '<section class="section">' +
    '<p class="eyebrow">Terms</p>' +
    "<h2>Using it</h2>" +
    '<p class="lede">The Central Bank of Egypt is the source of every number here and should be ' +
    "cited as such. The cleaning, the parsing and any error in either are ours. Where a figure has " +
    "been computed rather than reproduced, its series page says so and names the method.</p>" +
    '<p class="lede">Miqyas is not affiliated with, endorsed by, or connected to the Central Bank of Egypt.</p>' +
    "</section></div>";
}

function viewAbout() {
  document.getElementById("app").innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "About" }]) +
    '<section class="section prose">' +
    '<p class="eyebrow">About</p>' +
    "<h2>An unofficial mirror, kept honest</h2>" +
    "<p>The Central Bank of Egypt publishes a large and genuinely useful body of statistics, " +
    "and makes it hard to use: no API, no bulk download, and files that get overwritten in " +
    "place when a figure is revised.</p>" +
    "<p>Miqyas scrapes all of it once a day and commits the result. That means there is now a " +
    "record of what CBE published on any past date, which did not exist before and cannot be " +
    "reconstructed after the fact. A commit here means a number moved.</p>" +
    "<p>Where a number has been computed rather than reproduced (a bid-to-cover ratio, a " +
    "yield-curve bucket, reserves parsed out of a press release) the series says so on its " +
    "own page, and names the method.</p>" +

    "<h3>The name</h3>" +
    "<p><i>Miqyas</i> is the Nilometer on Rhoda Island: the graduated marble column Cairo read " +
    "the flood against to forecast the harvest and set the tax rate. Egypt's first " +
    "macroeconomic indicator, in service by 861 AD, and the reason the graduated gauge recurs " +
    "through this site.</p>" +

    "<h3>What is not here</h3>" +
    "<p>Honesty is cheaper than a footnote later:</p>" +
    "<ul>" +
    "<li>77 documents are scans of paper with no text layer of their own. They are read by " +
    "OCR, using Tesseract in Arabic and English, so their text is searchable. It is not as " +
    "good as a real text layer: the odd word comes out wrong, and Arabic in a scan often " +
    "comes back with its letters in visual rather than logical order, so searching inside " +
    "these particular documents works better in English than in Arabic. The Documents page " +
    "labels every one of them.</li>" +
    "<li>2,824 of the 52,705 pages of text, about one in twenty, lost at least a sixth of " +
    "their characters on the way out of the PDF. Those files embed a font with no Unicode " +
    "mapping, so the text layer holds glyph indices rather than letters and nothing short of " +
    "OCR can recover the words. Those pages are still searched and quoted on whatever could " +
    "be read, which is why a quote from one can have words missing from the middle.</li>" +
    "<li>The Financial Soundness Indicator tables are extracted as text but not yet parsed " +
    "into series.</li>" +
    "<li>Twelve Excel files in the archive resisted parsing. Each one is listed with its " +
    "reason in <code>catalog/excel_quarantine.json</code>.</li>" +
    "<li>Around one series in eight carries no unit, because CBE's own sheet did not state " +
    "one anywhere the parser could find it.</li>" +
    "</ul>" +

    "<h3>How it is built</h3>" +
    "<p>Python for the ingest, static JSON and Parquet for the output, and a front end with no " +
    "framework and no build step. Two scheduled jobs, the live endpoints every morning " +
    "at 08:20 UTC and the Excel archive and document corpus every Sunday, plus a publish " +
    "step that rebuilds this site after each of them, and an OCR pass run by hand when new " +
    "scans turn up. The whole thing is a repository, and the repository is the archive.</p>" +
    "<p><a href=\"https://github.com/mogh0neim/egypt-macro\" target=\"_blank\" rel=\"noopener\">" +
    "The code and the data are on GitHub ↗</a></p>" +
    "</section></div>";
}
