/* Miqyas -- get the data, the field and date guide, and about.
 *
 * The download page reads its sizes off the build rather than out of the copy,
 * so they cannot quietly rot. It used to read manifest.json for that, which is
 * 518 KB and 3,087 entries because it lists every series, every page of
 * document text and every search shard; the page needed thirty of them and
 * blocked its own render waiting for the rest. downloads.json is the same data
 * with the bulk left out, at 4 KB.
 */

const MB = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " " + t("MB") : Math.round(b / 1e3) + " " + t("KB"));

async function viewData() {
  // The guide sits under Data, so the nav keeps Data lit while it is open.
  if (/^#\/data\/guide/.test(location.hash)) return viewGuide();

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

  // A file name is Latin on either site, and held left to right on /ar/.
  const file = (href, name, note, size) =>
    '<a class="dl" href="' + href + '" download>' +
    '<span class="n">' + bdiLTR(esc(name)) + "</span>" +
    '<span class="d">' + esc(note) + "</span>" +
    '<span class="s">' + esc(size || "") + "</span></a>";

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: t("Get the data") }]) +
    '<section class="section">' +
    '<p class="eyebrow">' + t("Free, no key, no account") + "</p>" +
    "<h2>" + t("Take all of it") + "</h2>" +
    '<p class="lede">' +
    tf("{s} series and {o} observations, in whichever shape suits you. Everything here is rebuilt from CBE's own publications and updated daily, so a bookmark stays current.",
       { s: num(index.length), o: num(totalObs) }) + "</p>" +
    '<p class="lede"><a href="#/data/guide">' + t("What each field, code and date means →") + "</a></p>" +

    '<h3 class="sub-head">' + t("Whole-archive downloads") + "</h3>" +
    '<div class="dl-grid">' +
    file(ROOT + "/parquet/all.parquet", "all.parquet", t("Every observation. Opens in DuckDB, pandas, Polars, R."), sizeOf("parquet/all.parquet")) +
    file(ROOT + "/parquet/series.parquet", "series.parquet", t("The catalogue: titles, units, frequency, provenance."), sizeOf("parquet/series.parquet")) +
    (sqliteName ? file(ROOT + "/" + sqliteName.path, sqliteName.path, t("One SQLite file: series, observations and a revisions table."), MB(sqliteName.bytes)) : "") +
    file(ROOT + "/bulk/series-csv.zip", "series-csv.zip", t("Plain CSV, one file per dataset, plus the catalogue."), sizeOf("bulk/series-csv.zip")) +
    file(ROOT + "/bulk/records-csv.zip", "records-csv.zip", t("The record-level tables behind the derived series."), sizeOf("bulk/records-csv.zip")) +
    file(ROOT + "/parquet/revisions.parquet", "revisions.parquet", t("Every value each series has held, with the first and last day it was held."), sizeOf("parquet/revisions.parquet")) +
    file(ROOT + "/bulk/revisions-csv.zip", "revisions-csv.zip", t("The same record as CSV: series_id, period, value, first_seen, last_seen."), sizeOf("bulk/revisions-csv.zip")) +
    file(ROOT + "/manifest.json", "manifest.json", t("Every published file with its SHA-256, so any copy can be checked against it."), sizeOf("manifest.json")) +
    "</div>" +

    '<h3 class="sub-head">' + t("By topic") + "</h3>" +
    '<p class="lede">' + t("Smaller files if you only want one part of it.") + "</p>" +
    '<div class="dl-grid">' +
    ["fx", "rates", "govt", "prices", "external", "excel"].map((f) =>
      file(ROOT + "/parquet/" + f + ".parquet", f + ".parquet", "", sizeOf("parquet/" + f + ".parquet"))
    ).join("") +
    "</div>" +
    "</section>" +

    '<section class="section band-inset"><div class="wrap-inner">' +
    '<p class="eyebrow">' + t("API") + "</p>" +
    "<h2>" + t("Static JSON, no key") + "</h2>" +
    '<p class="lede">' + t("There is no server. Every endpoint is a static file on GitHub Pages, with no key and no rate limit that we set.") + "</p>" +
    '<pre class="code"><code># ' + esc(t("the catalogue: one light record per series")) + "\n" +
    'curl ' + site + 'api/v1/series.json\n\n' +
    "# " + esc(t("one series, with every observation")) + "\n" +
    "curl " + site + "api/v1/series/EG.FX.OFF.USD.SELL.json\n\n" +
    "# " + esc(t("the rate decisions")) + "\n" +
    "curl " + site + "api/v1/mpc.json\n\n" +
    "# " + esc(t("query the whole archive from Python, no download")) + "\n" +
    "import duckdb\n" +
    "duckdb.sql(&quot;SELECT * FROM &#39;" + site +
    "parquet/all.parquet&#39; WHERE series_id = &#39;EG.CPI.HDL.YOY&#39;&quot;)" +
    "</code></pre>" +
    "</div></section>" +

    '<section class="section">' +
    '<p class="eyebrow">' + t("Terms") + "</p>" +
    "<h2>" + t("Using it") + "</h2>" +
    '<p class="lede">' +
    t("Cite the Central Bank of Egypt as the source. Miqyas cleans and dates the values; where a number was computed, the series page says so and names the method. If you find a value that does not match CBE's,") +
    ' <a href="' + CONTACT_URL + '" target="_blank" rel="noopener">' + t("tell us") + "</a>.</p>" +
    '<p class="lede">' +
    t("Miqyas is not affiliated with, endorsed by, or connected to the Central Bank of Egypt. The code is MIT-licensed; the data is CBE's.") +
    ' <a href="#/about">' + t("The full terms are on the About page.") + "</a></p>" +
    "</section></div>";
}

/* ---------- the field and date guide ----------
 *
 * One page saying what the files hold and what their dates mean. The dates are
 * the part that bites: CBE's own tables date a month by its first day, its
 * Excel archive by its last, a policy rate by the day it took effect and
 * reserves by the day of the press release, and a join on the date column
 * between two of those silently matches nothing. Linked from the Data page
 * and from every series page's provenance.
 */
function viewGuide() {
  pageTitle(t("Fields and dates"));
  const row = (name, what) =>
    "<tr><td class=\"name\">" + bdiLTR("<code>" + esc(name) + "</code>") + "</td><td>" + what + "</td></tr>";
  const table = (rows) =>
    '<div class="table-scroll"><table class="indicators compact guide-table"><thead><tr><th>' +
    t("Field") + "</th><th>" + t("What it means") + "</th></tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  const freq = (code, words) => row(code, esc(words));

  document.getElementById("app").innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: t("Get the data"), href: "#/data" }, { label: t("Fields and dates") }]) +
    '<section class="section prose">' +
    '<p class="eyebrow">' + t("A one-page guide") + "</p>" +
    "<h2>" + t("What the fields, codes and dates mean") + "</h2>" +
    "<p>" + t("Every file holds the same three things: which series, which period, and the value. The catalogue says what each series is. This page says what the columns mean, and how each kind of series is dated, because the dates are not all dated the same way.") + "</p>" +

    "<h3>" + t("The readings") + "</h3>" +
    table([
      row("series_id", esc(t("The series. Ids for CBE's daily tables are not expected to change. Ids for the series read from CBE's Excel archive are being reworked and may change."))),
      row("period", esc(t("The date the reading is filed under, as YYYY-MM-DD. What that date stands for depends on the series: see the dates below."))),
      row("value", esc(t("The number as CBE published it, or as Miqyas computed it for a computed series. Its unit is in the catalogue."))),
      row("observations", esc(t("In the JSON for one series, the readings as a list of [period, value] pairs, oldest first."))),
    ]) +

    "<h3>" + t("The catalogue") + "</h3>" +
    table([
      row("title_en, title_ar", esc(t("CBE's English and Arabic titles. For the Excel archive, CBE's Arabic title names the line of the table only."))),
      row("title_ar_source", esc(t("\"miqyas\" where CBE publishes no Arabic name and the Arabic title is Miqyas's translation."))),
      row("unit", esc(t("What the value is measured in, as CBE states it: percent, EGP million, USD million and so on. Empty where CBE's sheet did not say."))),
      row("freq", esc(t("How often the series has a reading. The codes are below."))),
      row("dataset, family", esc(t("The CBE table or file group the series was read from, and the wider group the subjects are built on."))),
      row("source_url, source_file", esc(t("The CBE page or Excel file the series was read from. source_file is a path on www.cbe.org.eg."))),
      row("derived, method", esc(t("true where Miqyas computed the series from CBE's numbers, with the method in words."))),
      row("period_basis", esc(t("\"end\" where each value is dated to the last day of the period it describes."))),
      row("fiscal_year_basis", esc(t("Egypt's fiscal year, 1 July to 30 June, for the series that follow it."))),
    ]) +

    "<h3>" + t("Frequency codes") + "</h3>" +
    table([
      freq("D", t("Daily: each business day CBE publishes the table.")),
      freq("W", t("Weekly: the treasury bill auctions.")),
      freq("BW", t("Every two weeks.")),
      freq("M", t("Monthly.")),
      freq("Q", t("Quarterly.")),
      freq("A", t("Yearly, which in the Excel archive is Egypt's fiscal year.")),
      freq("IRR", t("Only when it changes: a policy rate, with one reading for each new level.")),
    ]) +

    "<h3>" + t("How each kind of series is dated") + "</h3>" +
    "<ul>" +
    "<li>" + t("Exchange rates, CONIA and the interbank and secondary-market tables: the day CBE's table gives for the reading.") + "</li>" +
    "<li>" + t("Policy rates (the corridor, the discount rate, the main operation rate): the day a new level took effect, usually a few days after the meeting. The level holds until the next reading.") + "</li>" +
    "<li>" + t("Inflation and the retail interest rates, from CBE's monthly tables: the first day of the month the reading is for. 2026-08-01 is August 2026.") + "</li>" +
    "<li>" + t("Treasury bill auctions: the bill's issue date, which can run a few days ahead of the auction.") + "</li>" +
    "<li>" + t("Net international reserves: the day of CBE's press release, not the month the figure describes.") + "</li>" +
    "<li>" + t("Remittances: the last day of the window the running total covers. The value is the total since 1 July, the start of the fiscal year.") + "</li>" +
    "<li>" + t("The Excel archive: the last day of the period. A month ends on its last day, a quarter on 31 March, 30 June, 30 September or 31 December, and a fiscal year on 30 June.") + "</li>" +
    "</ul>" +
    "<p>" + t("So the same month can carry two different dates. Inflation for August 2026 is filed under 2026-08-01, and a monthly Excel series for August 2026 under 2026-08-31. To put the two side by side, join on the year and the month, not on the date.") + "</p>" +

    "<h3>" + t("How the site writes a period") + "</h3>" +
    "<ul>" +
    "<li>" + t("A month as Jun 2026.") + "</li>" +
    "<li>" + t("A quarter as the calendar quarter, Q2 2026 for April to June 2026, whichever fiscal year it falls in.") + "</li>" +
    "<li>" + t("A fiscal year as FY2019/20, which is 1 July 2019 to 30 June 2020. The files date it 2020-06-30.") + "</li>" +
    "<li>" + t("Daily series, policy rates, auctions and reserves with the full date, because the day is the fact.") + "</li>" +
    "</ul>" +

    "<h3>" + t("The revision record") + "</h3>" +
    table([
      row("first_seen", esc(t("The first day Miqyas held that value for that series and period."))),
      row("last_seen", esc(t("The last day it was held. Empty while it is still held. When a different value replaces it for the same period, last_seen is the day before the new one was first seen."))),
    ]) +

    "<h3>" + t("Updates") + "</h3>" +
    "<p>" + t("The files are rebuilt every day from what Miqyas has read. status.json gives the time of the build and of the last read of CBE, and manifest.json gives every file with its SHA-256, so a copy can be checked against the one it came from.") + "</p>" +
    '<p><a href="#/data">' + t("Back to the downloads →") + "</a></p>" +
    "</section></div>";
}

function viewAbout() {
  document.getElementById("app").innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: t("About") }]) +
    '<section class="section prose">' +
    '<p class="eyebrow">' + t("About") + "</p>" +
    "<h2>" + t("An independent dataset of Central Bank of Egypt statistics") + "</h2>" +
    "<p><b>" + t("Independent project. Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.") + "</b> " +
    t("Official figures are on") + " " +
    '<a href="https://www.cbe.org.eg/en/" target="_blank" rel="noopener">cbe.org.eg</a>.</p>' +

    "<h3>" + t("Who made this, and why") + "</h3>" +
    "<p>" + t("Miqyas is made by Mohamed Ghoneim, as an independent project.") + " " +
    t("It republishes Central Bank of Egypt statistics as one clean dataset, with a dated archive of the daily tables, for people who write about Egypt's economy: analysts, journalists and researchers. CBE's figures are spread across live tables, Excel files and PDFs; here they are one catalogue with one set of ids, charted, searchable, and downloadable as CSV, Parquet, SQLite or JSON.") + "</p>" +
    "<p>" + t("Questions and corrections go to") + ' <a href="' + CONTACT_URL + '" target="_blank" rel="noopener">' +
    t("the project's GitHub issues page") + "</a>. " + removalLine() + "</p>" +

    "<h3>" + t("What it does") + "</h3>" +
    "<p>" + t("Miqyas copies CBE's live tables once a day and its Excel archive and publications once a week, and saves each copy. It keeps a dated copy of the daily tables from 20 August 2026, so past values can be looked up. If CBE changes a figure it has already published, the change appears on the") +
    ' <a href="#/changes">' + t("What changed") + "</a> " + t("page. Each week the Excel archive and the publications are also checked for files CBE has replaced or withdrawn.") + "</p>" +
    "<p>" + t("Each series page says how its numbers got here: reproduced as published from one of CBE's daily tables, dated by Miqyas from the period labels in a CBE Excel sheet, or computed by Miqyas (a bid-to-cover ratio, a yield-curve bucket, reserves read from a press release), with the method named.") + "</p>" +

    '<h3 id="terms">' + t("Terms") + "</h3>" +
    "<p>" + t("The code is MIT-licensed. The data is the Central Bank of Egypt's, and Miqyas claims no rights in it. CBE's") + " " +
    '<a href="https://www.cbe.org.eg/en/disclaimer" target="_blank" rel="noopener">' + t("disclaimer") + "</a> " +
    t("allows reuse of information from its website if CBE is cited as the source, any transformation is stated explicitly, and the information appears accurately. Miqyas cites CBE on every page and in every file, and says for each series what was done to the numbers. Errors in cleaning or dating are ours, not CBE's: check against CBE before you cite.") + "</p>" +
    "<p>" + t("To cite a figure, name the Central Bank of Egypt as the source and Miqyas as where you found it. Each series page suggests a citation for its own series.") + "</p>" +

    "<h3>" + t("The name") + "</h3>" +
    "<p><i>" + t("Miqyas") + "</i> " + t("is the Nilometer on Rhoda Island: the graduated marble column Cairo read the flood against to forecast the harvest and set the tax rate. Egypt's first macroeconomic indicator, in service by 861 AD, and the reason the graduated gauge recurs through this site.") + "</p>" +

    "<h3>" + t("Known limits") + "</h3>" +
    "<ul>" +
    "<li>" + t("Some series stop earlier than CBE's own. Money and banking figures from the Excel archive end in mid-2023, where CBE stopped extending those files; CBE publishes newer figures elsewhere on its site that Miqyas does not yet read.") + "</li>" +
    "<li>" + t("Some documents are scans of paper with no text layer of their own. They are read by OCR, using Tesseract in Arabic and English, so their text is searchable. It is not as good as a real text layer: the odd word comes out wrong, and Arabic in a scan often comes back with its letters in visual rather than logical order, so searching inside these particular documents works better in English than in Arabic. The Documents page counts and labels every one of them.") + "</li>" +
    "<li>" + t("About one page of text in twenty lost at least a sixth of its characters on the way out of the PDF. Those files embed a font with no Unicode mapping, so the text layer holds glyph indices rather than letters and nothing short of OCR can recover the words. Those pages are still searched and quoted on whatever could be read, which is why a quote from one can have words missing from the middle.") + "</li>" +
    "<li>" + t("The Financial Soundness Indicator tables are extracted as text but not yet parsed into series.") + "</li>" +
    "<li>" + t("When an Excel file in the archive cannot be parsed, it is listed with its reason in") +
    " " + bdiLTR("<code>catalog/excel_quarantine.json</code>") + ".</li>" +
    "<li>" + t("Around one series in eight carries no unit, because CBE's own sheet did not state one anywhere the parser could find it.") + "</li>" +
    "</ul>" +

    privacyNote() +
    "<h3>" + t("How it is built") + "</h3>" +
    "<p>" + t("Python for the ingest, static JSON and Parquet for the output, and a front end with no framework and no build step. Two scheduled jobs, the live tables once a day and the Excel archive and document corpus once a week, plus a publish step that rebuilds this site after each of them, and an OCR pass run by hand when new scans turn up. The daily job often starts hours after its scheduled time; the status line on every page says when CBE was last read. The whole thing is a repository, and the repository is the archive.") + "</p>" +
    "<p><a href=\"https://github.com/mogh0neim/egypt-macro\" target=\"_blank\" rel=\"noopener\">" +
    t("The code and the data are on GitHub ↗") + "</a></p>" +
    "</section></div>";
}
