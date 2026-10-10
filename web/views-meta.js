/* Miqyas -- get the data, and about.
 *
 * The download page reads its sizes off the build rather than out of the copy,
 * so they cannot quietly rot. It used to read manifest.json for that, which is
 * 518 KB and 3,087 entries because it lists every series, every page of
 * document text and every search shard; the page needed thirty of them and
 * blocked its own render waiting for the rest. downloads.json is the same data
 * with the bulk left out, at 4 KB.
 */

const MB = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB");

async function viewData() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);

  const index = await loadIndex();
  const manifest = await getJSON(ROOT + "/downloads.json")
    // A clone built before downloads.json existed still has the full manifest.
    .catch(() => getJSON(ROOT + "/manifest.json").catch(() => []));
  const sizeOf = (path) => {
    const hit = manifest.find((m) => m.path === path);
    return hit ? MB(hit.bytes) : "";
  };
  const totalObs = index.reduce((a, s) => a + (s.n || 0), 0);
  const sqliteName = manifest.find((m) => /\.sqlite$/.test(m.path));
  // The examples are for copying, so they name the site root, not this page.
  const site = siteBase();

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
    "publications and updated daily, so a bookmark stays current.</p>" +

    '<h3 class="sub-head">Whole-archive downloads</h3>' +
    '<div class="dl-grid">' +
    file(ROOT + "/parquet/all.parquet", "all.parquet", "Every observation. Opens in DuckDB, pandas, Polars, R.", sizeOf("parquet/all.parquet")) +
    file(ROOT + "/parquet/series.parquet", "series.parquet", "The catalogue: titles, units, frequency, provenance.", sizeOf("parquet/series.parquet")) +
    (sqliteName ? file(ROOT + "/" + sqliteName.path, sqliteName.path, "One SQLite file: series, observations and a revisions table.", MB(sqliteName.bytes)) : "") +
    file(ROOT + "/bulk/series-csv.zip", "series-csv.zip", "Plain CSV, one file per dataset, plus the catalogue.", sizeOf("bulk/series-csv.zip")) +
    file(ROOT + "/bulk/records-csv.zip", "records-csv.zip", "The record-level tables behind the derived series.", sizeOf("bulk/records-csv.zip")) +
    file(ROOT + "/parquet/revisions.parquet", "revisions.parquet", "Every value each series has held, with the first and last day it was held.", sizeOf("parquet/revisions.parquet")) +
    file(ROOT + "/bulk/revisions-csv.zip", "revisions-csv.zip", "The same record as CSV: series_id, period, value, first_seen, last_seen.", sizeOf("bulk/revisions-csv.zip")) +
    file(ROOT + "/manifest.json", "manifest.json", "Every published file with its SHA-256, so any copy can be checked against it.", sizeOf("manifest.json")) +
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
    "<h2>Static JSON, no key</h2>" +
    '<p class="lede">There is no server. Every endpoint is a static file on GitHub Pages, ' +
    "with no key and no rate limit that we set.</p>" +
    '<pre class="code"><code># the catalogue: one light record per series\n' +
    'curl ' + site + 'api/v1/series.json\n\n' +
    "# one series, with every observation\n" +
    "curl " + site + "api/v1/series/EG.FX.OFF.USD.SELL.json\n\n" +
    "# the rate decisions\n" +
    "curl " + site + "api/v1/mpc.json\n\n" +
    "# query the whole archive from Python, no download\n" +
    "import duckdb\n" +
    "duckdb.sql(&quot;SELECT * FROM &#39;" + site +
    "parquet/all.parquet&#39; WHERE series_id = &#39;EG.CPI.HDL.YOY&#39;&quot;)" +
    "</code></pre>" +
    "</div></section>" +

    '<section class="section">' +
    '<p class="eyebrow">Terms</p>' +
    "<h2>Using it</h2>" +
    '<p class="lede">Cite the Central Bank of Egypt as the source. Miqyas cleans and dates the ' +
    "values; where a number was computed, the series page says so and names the method. If you " +
    'find a value that does not match CBE\'s, <a href="' + CONTACT_URL + '" target="_blank" rel="noopener">' +
    "tell us</a>.</p>" +
    '<p class="lede">Miqyas is not affiliated with, endorsed by, or connected to the Central Bank of Egypt. ' +
    'The code is MIT-licensed; the data is CBE\'s. <a href="#/about">The full terms are on the About page.</a></p>' +
    "</section></div>";
}

function viewAbout() {
  document.getElementById("app").innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "About" }]) +
    '<section class="section prose">' +
    '<p class="eyebrow">About</p>' +
    "<h2>An independent dataset of Central Bank of Egypt statistics</h2>" +
    "<p><b>Independent project. Not affiliated with, endorsed by, or connected to the Central " +
    "Bank of Egypt.</b> Official figures are on " +
    '<a href="https://www.cbe.org.eg/en/" target="_blank" rel="noopener">cbe.org.eg</a>.</p>' +

    "<h3>Who made this, and why</h3>" +
    "<p>Miqyas is made by Mohamed Ghoneim, as an independent project. It republishes Central " +
    "Bank of Egypt statistics as one clean dataset, with a dated archive of the daily tables, " +
    "for people who write about Egypt's economy: analysts, journalists and researchers. CBE's " +
    "figures are spread across live tables, Excel files and PDFs; here they are one catalogue " +
    "with one set of ids, charted, searchable, and downloadable as CSV, Parquet, SQLite or JSON.</p>" +
    '<p>Questions and corrections go to <a href="' + CONTACT_URL + '" target="_blank" rel="noopener">' +
    "the project's GitHub issues page</a>. " + removalLine() + "</p>" +

    "<h3>What it does</h3>" +
    "<p>Miqyas copies CBE's live tables once a day and its Excel archive and publications once " +
    "a week, and saves each copy. It keeps a dated copy of the daily tables from 20 August 2026, " +
    "so past values can be looked up. If CBE changes a figure it has already published, the " +
    'change appears on the <a href="#/changes">What changed</a> page. The weekly Excel archive ' +
    "is not yet checked for changes.</p>" +
    "<p>Each series page says how its numbers got here: reproduced as published from one of " +
    "CBE's daily tables, dated by Miqyas from the period labels in a CBE Excel sheet, or " +
    "computed by Miqyas (a bid-to-cover ratio, a yield-curve bucket, reserves read from a " +
    "press release), with the method named.</p>" +

    '<h3 id="terms">Terms</h3>' +
    "<p>The code is MIT-licensed. The data is the Central Bank of Egypt's, and Miqyas claims " +
    "no rights in it. CBE's " +
    '<a href="https://www.cbe.org.eg/en/disclaimer" target="_blank" rel="noopener">disclaimer</a> ' +
    "allows reuse of information from its website if CBE is cited as the source, any " +
    "transformation is stated explicitly, and the information appears accurately. Miqyas cites " +
    "CBE on every page and in every file, and says for each series what was done to the " +
    "numbers. Errors in cleaning or dating are ours, not CBE's: check against CBE before you " +
    "cite.</p>" +
    "<p>To cite a figure, name the Central Bank of Egypt as the source and Miqyas as where you " +
    "found it. Each series page suggests a citation for its own series.</p>" +

    "<h3>The name</h3>" +
    "<p><i>Miqyas</i> is the Nilometer on Rhoda Island: the graduated marble column Cairo read " +
    "the flood against to forecast the harvest and set the tax rate. Egypt's first " +
    "macroeconomic indicator, in service by 861 AD, and the reason the graduated gauge recurs " +
    "through this site.</p>" +

    "<h3>Known limits</h3>" +
    "<ul>" +
    "<li>Some series stop earlier than CBE's own. Money and banking figures from the Excel " +
    "archive end in mid-2023, where CBE stopped extending those files; CBE publishes newer " +
    "figures elsewhere on its site that Miqyas does not yet read.</li>" +
    "<li>Some documents are scans of paper with no text layer of their own. They are read by " +
    "OCR, using Tesseract in Arabic and English, so their text is searchable. It is not as " +
    "good as a real text layer: the odd word comes out wrong, and Arabic in a scan often " +
    "comes back with its letters in visual rather than logical order, so searching inside " +
    "these particular documents works better in English than in Arabic. The Documents page " +
    "counts and labels every one of them.</li>" +
    "<li>About one page of text in twenty lost at least a sixth of its characters on the way " +
    "out of the PDF. Those files embed a font with no Unicode mapping, so the text layer " +
    "holds glyph indices rather than letters and nothing short of OCR can recover the words. " +
    "Those pages are still searched and quoted on whatever could be read, which is why a " +
    "quote from one can have words missing from the middle.</li>" +
    "<li>The Financial Soundness Indicator tables are extracted as text but not yet parsed " +
    "into series.</li>" +
    "<li>Some Excel files in the archive resisted parsing. Each one is listed with its " +
    "reason in <code>catalog/excel_quarantine.json</code>.</li>" +
    "<li>Around one series in eight carries no unit, because CBE's own sheet did not state " +
    "one anywhere the parser could find it.</li>" +
    "</ul>" +

    "<h3>How it is built</h3>" +
    "<p>Python for the ingest, static JSON and Parquet for the output, and a front end with no " +
    "framework and no build step. Two scheduled jobs, the live tables once a day and the Excel " +
    "archive and document corpus once a week, plus a publish step that rebuilds this site " +
    "after each of them, and an OCR pass run by hand when new scans turn up. The daily job " +
    "often starts hours after its scheduled time; the status line on every page says when CBE " +
    "was last read. The whole thing is a repository, and the repository is the archive.</p>" +
    "<p><a href=\"https://github.com/mogh0neim/egypt-macro\" target=\"_blank\" rel=\"noopener\">" +
    "The code and the data are on GitHub ↗</a></p>" +
    "</section></div>";
}
