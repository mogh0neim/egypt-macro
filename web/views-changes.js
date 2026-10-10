/* Miqyas -- what changed.
 *
 * CBE overwrites its files in place when it revises a figure. Miqyas keeps a
 * dated copy of the daily tables from 20 August 2026, so its own history can
 * say what a figure read before it changed. This page reads that history.
 *
 * It keeps three things apart, because merging any two of them would put a
 * false statement about CBE on the page: new readings CBE published, figures
 * CBE revised after publishing them, and values that changed because Miqyas
 * read the same files differently. build_changes.py does the sorting; this
 * only says it plainly, including which sources are checked at all.
 */

/* A translated string with numbers or dates dropped into it. */
const tsub = (english, values) =>
  Object.keys(values).reduce((s, k) => s.split("{" + k + "}").join(values[k]), t(english));

async function viewChanges() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);

  const data = await getJSON(ROOT + "/api/v1/changes.json").catch(() => null);
  if (!data) {
    app.innerHTML =
      '<div class="wrap"><section class="section">' +
      "<h2>" + t("The change log has not been built yet") + "</h2>" +
      '<p class="lede">' + t("It is read out of this repository's own git history. Run this after the exports:") +
      " <code>python ingest/build_changes.py</code></p>" +
      '<p class="foot-note">' + t("A shallow clone has no history to read. Clone the full history, or set this in the workflow:") +
      " <code>fetch-depth: 0</code></p></section></div>";
    return;
  }

  const days = data.days || [];
  const revisions = days.reduce((a, d) => a + d.revised.length, 0);
  const readings = days.reduce((a, d) => a + d.moved_total, 0);
  const anomalies = data.anomalies || [];
  const cover = data.coverage || {};
  const since = cover.since || (days.length ? days[days.length - 1].date : null);

  const excel = !cover.excel_files_checked
    ? t("Read weekly. Not yet checked for changes: new readings are listed as archive updates.")
    : cover.excel_revisions_counted
    ? t("Read weekly and checked for files CBE replaced or withdrew. A figure that changes in a replaced file counts as a revision.")
    : t("Read weekly and checked for files CBE replaced or withdrew. Changes are listed as archive updates and not yet counted as revisions.");

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: t("What changed") }]) +

    '<section class="section">' +
    '<p class="eyebrow">' + t("The revision record") + "</p>" +
    "<h2>" + t("What CBE published, and what was revised") + "</h2>" +
    '<p class="lede">' +
    t("Miqyas keeps a dated copy of the daily tables from 20 August 2026. If CBE changes a figure it has already published, the change appears here.") +
    "</p>" +
    '<div class="stat-row">' +
    stat(readings.toLocaleString(), t("new readings"),
         since ? t("since") + " " + niceDate(since) : "") +
    stat(String(revisions), t("figures revised"), t("after first publishing them")) +
    stat(String(anomalies.length), t("Two values for one date"), t("inside one CBE table")) +
    "</div>" +
    '<p class="foot-note">' +
    (revisions === 0
      ? since ? esc(tsub("No revisions recorded since {d}.", { d: niceDate(since) })) : ""
      : t("Each is a figure CBE published and later changed.")) +
    ' <a href="' + ROOT + '/changes.xml">' + t("Daily feed") + "</a>" +
    ' · <a href="' + ROOT + '/changes-revisions.xml">' + t("Revisions only") + "</a>" +
    t(", low volume.") + "</p>" +
    "</section>" +

    '<section class="section"><div class="band-inset">' +
    '<p class="eyebrow">' + t("What is checked") + "</p>" +
    "<h3>" + t("Which sources are checked for revisions") + "</h3>" +
    "<ul class='change-list'>" +
    "<li><strong>" + t("Daily tables") + "</strong>: " +
    t("Exchange rates, interest rates, CONIA, inflation and T-bill yields. Read every day; a changed or withdrawn figure counts as a revision.") + "</li>" +
    "<li><strong>" + t("Auction results") + "</strong>: " +
    t("The auction tables. Read every day; a changed or withdrawn result counts as a revision.") + "</li>" +
    "<li><strong>" + t("Excel archive") + "</strong>: " + excel + "</li>" +
    "<li><strong>" + t("Not counted") + "</strong>: " +
    t("The series Miqyas computes or parses from press releases, such as reserves, remittances and the yield curve. They move when their sources move.") + "</li>" +
    "</ul>" +
    '<p class="foot-note">' + t("Every value Miqyas has held, with the first and last day it was held:") +
    ' <a href="' + ROOT + '/bulk/revisions-csv.zip">CSV</a>' +
    ' · <a href="' + ROOT + '/parquet/revisions.parquet">Parquet</a>' +
    ' · <a href="' + ROOT + '/miqyas.sqlite">' + t("the revisions table in miqyas.sqlite") + "</a>.</p>" +
    "</div></section>" +

    (anomalies.length
      ? '<section class="section band"><div class="wrap-inner">' +
        '<p class="eyebrow">' + t("Two values for one date") + "</p>" +
        "<h2>" + t("Where CBE published two different values for one date") + "</h2>" +
        '<p class="lede">' +
        t("These do not need a history to find: the same figure appears twice, differently, inside one of CBE's own tables. Miqyas keeps one, the same one every day, and records both.") +
        "</p>" +
        '<div class="table-scroll"><table class="indicators compact"><thead><tr>' +
        "<th>" + t("Series|one row of a table") + "</th><th>" + t("For") + "</th><th>" +
        t("Kept") + "</th><th>" + t("Discarded") + "</th>" +
        "</tr></thead><tbody>" +
        anomalies.map((a) =>
          '<tr><td class="name"><a href="#/s/' + encodeURIComponent(a.series_id) + '">' +
          esc(a.title) + "</a></td>" +
          '<td class="period">' + esc(niceDate(a.period)) + "</td>" +
          "<td>" + esc(a.kept) + "</td>" +
          '<td class="down">' + esc(a.discarded) + "</td></tr>").join("") +
        "</tbody></table></div></div></section>"
      : "") +

    (days.length
      ? '<section class="section">' +
        '<p class="eyebrow">' + t("Day by day") + "</p>" +
        "<h2>" + esc(tsub("{n} days on the record", { n: days.length })) + "</h2>" +
        '<p class="lede">' +
        t("The tables are read once a day and any change is saved. Days with no change are not listed.") +
        "</p>" +
        days.map(dayCard).join("") +
        "</section>"
      : "") +

    '<section class="section"><div class="band-inset">' +
    '<p class="eyebrow">' + t("How this is built") + "</p>" +
    "<h3>" + t("Read out of the git history, with each change put down to CBE or to Miqyas") + "</h3>" +
    "<p>" +
    t("A change counts as a CBE revision only when the file CBE served changed: a different value for the same date, in the same table, than the one Miqyas saved before. When Miqyas reads the same files differently, after a parser fix or a new way of dating a quarter, the change is listed as re-read by Miqyas. Series Miqyas computes are never counted as revisions. More than 500 changes in one go are held back for a check rather than reported.") +
    "</p>" +
    '<p class="foot-note">' +
    (data.history_commits ? esc(tsub("{n} commits of history.", { n: data.history_commits.toLocaleString() })) + " " : "") +
    esc(tsub("Up to {n} new readings shown per day, biggest move against each series' usual level first; the totals count all of them.",
           { n: data.moved_per_day_cap || 40 })) +
    "</p></div></section></div>";
}

const stat = (value, label, note) =>
  '<div class="stat"><b>' + esc(value) + "</b><span>" + esc(label) + "</span>" +
  (note ? "<i>" + esc(note) + "</i>" : "") + "</div>";

/* A series name, linked when it is a series. Auction rows have no page. */
const changeTitle = (r) =>
  r.series_id
    ? "<a href='#/s/" + encodeURIComponent(r.series_id) + "'>" + esc(r.title) + "</a>"
    : esc(r.title);

/* Auction rows carry text as well as numbers. */
const changeValue = (v, unit) => (typeof v === "number" ? fmt(v, unit) : esc(v));

const REREAD_WHY = {
  parser: "The Excel archive was read again after a change to the parser.",
  miqyas: "Changed by Miqyas in the repository: a parser fix, a new series or a correction.",
  no_source_change: "A table changed although the file CBE served behind it did not.",
  conflict: "A date where CBE published two values; the one kept changed.",
  computed: "Series Miqyas computes were recomputed from their sources.",
};

function dayCard(day) {
  const parts = [];

  if (day.start) {
    parts.push(
      '<p class="change-head">' + t("The record begins") + "</p>" +
      "<p class='foot-note'>" +
      esc(tsub("{s} series and {r} readings, as first read.",
             { s: day.start.series.toLocaleString(), r: day.start.readings.toLocaleString() })) +
      "</p>");
  }
  if (day.revised.length) {
    parts.push(
      '<p class="change-head down">' + esc(tsub("Revised after publication: {n}", { n: day.revised.length })) +
      "</p><ul class='change-list'>" +
      day.revised.map((r) =>
        "<li>" + changeTitle(r) +
        (r.period ? " " + t("for|a date") + " " + esc(niceDate(r.period)) : "") + ": " +
        (r.withdrawn
          ? t("no longer published, was") + " " + changeValue(r.was, r.unit)
          : changeValue(r.was, r.unit) + " " + t("revised to") + " <b>" + changeValue(r.now, r.unit) + "</b>") +
        "</li>").join("") + "</ul>");
  }
  if (day.new_series && day.new_series.length) {
    parts.push(
      '<p class="change-head">' + esc(tsub("New series: {n}", { n: day.new_series.length })) +
      "</p><ul class='change-list'>" +
      day.new_series.map((n) =>
        "<li>" + changeTitle(n) + " <i>" +
        esc(tsub("{n} readings from {d}", { n: n.n.toLocaleString(), d: shortDate(n.first) })) +
        "</i></li>").join("") + "</ul>");
  }
  if (day.moved.length) {
    parts.push(
      '<p class="change-head">' + esc(tsub("New readings: {n}", { n: day.moved_total.toLocaleString() })) +
      (day.moved_total > day.moved.length
        ? esc(tsub(", the {n} that moved most", { n: day.moved.length }))
        : "") +
      "</p><ul class='change-list'>" +
      day.moved.map((m) =>
        "<li>" + changeTitle(m) + ": " +
        "<b>" + fmt(m.value, m.unit) + "</b>" +
        ("previous" in m
          ? ' <span class="' + dirClass(m.change, m.unit) + '">' + changeCell(m.change, m.unit) + "</span>"
          : "") +
        " <i>" + esc(niceDate(m.period)) + "</i></li>").join("") + "</ul>");
  }
  if (day.backfilled) {
    parts.push("<p class='foot-note'>" +
      esc(tsub("{n} earlier readings added to series already held.", { n: day.backfilled.toLocaleString() })) +
      "</p>");
  }
  if (day.records && day.records.added) {
    parts.push(
      '<p class="change-head">' + esc(tsub("Auction results: {n}", { n: day.records.added })) +
      "</p><ul class='change-list'>" +
      day.records.examples.map((r) =>
        "<li>" + esc(r.title) + " <i>" + esc(r.detail) + "</i></li>").join("") + "</ul>");
  }
  if (day.archive) {
    const a = day.archive;
    parts.push(
      '<p class="change-head">' + t("Excel archive update") + "</p>" +
      "<p class='foot-note'>" +
      esc(tsub("{n} readings added across {s} series", { n: a.added.toLocaleString(), s: a.series.toLocaleString() })) +
      (a.latest ? esc(tsub(", newest for {d}", { d: niceDate(a.latest) })) : "") + "." +
      (a.changed || a.removed
        ? " " + esc(tsub("{n} values changed or removed; not counted as revisions.",
                       { n: (a.changed + a.removed).toLocaleString() }))
        : "") +
      "</p>" +
      (a.examples && a.examples.length
        ? "<ul class='change-list'>" +
          a.examples.map((e) =>
            "<li>" + changeTitle(e) + ": <b>" + fmt(e.value, e.unit) + "</b> <i>" +
            esc(niceDate(e.period)) + "</i></li>").join("") + "</ul>"
        : ""));
  }
  if (day.reread) {
    const r = day.reread;
    const ex = r.examples && r.examples[0];
    parts.push(
      '<p class="change-head quiet">' + t("Re-read by Miqyas") + "</p>" +
      "<p class='foot-note'>" +
      r.why.map((w) => t(REREAD_WHY[w] || w)).join(" ") + " " +
      esc(tsub("{c} values changed, {a} added and {r} removed.",
             { c: r.changed.toLocaleString(), a: r.added.toLocaleString(), r: r.removed.toLocaleString() })) +
      (r.renamed
        ? " " + esc(tsub("Series under new ids: {n}.", { n: r.renamed.toLocaleString() }))
        : "") +
      (r.series_new || r.series_gone
        ? " " + esc(tsub("Series added: {n}. Series dropped: {g}.",
                         { n: r.series_new.toLocaleString(), g: r.series_gone.toLocaleString() }))
        : "") +
      " " + t("Not counted as revisions.") +
      (ex
        ? " " + esc(tsub("For example {t} for {d}, read as {a} and now as {b}.",
                       { t: ex.title, d: niceDate(ex.period), a: String(ex.was), b: String(ex.now) }))
        : "") +
      "</p>");
  }
  if (day.held_back) {
    parts.push(
      '<p class="change-head quiet">' + t("Held back") + "</p>" +
      "<p class='foot-note'>" +
      esc(tsub("{n} changes in one go, too many to treat as revisions without a check.",
             { n: day.held_back.toLocaleString() })) + "</p>");
  }
  if (!parts.length) return "";

  return (
    '<details class="group change-day">' +
    "<summary><b>" + esc(niceDate(day.date)) + "</b> " +
    '<span class="quiet">' + esc(daySummary(day)) + "</span></summary>" +
    parts.join("") + "</details>"
  );
}

function daySummary(day) {
  const bits = [];
  if (day.start) bits.push(t("record begins"));
  if (day.moved_total) bits.push(tsub("{n} new", { n: day.moved_total.toLocaleString() }));
  if (day.revised.length) bits.push(tsub("{n} revised", { n: day.revised.length }));
  if (day.new_series && day.new_series.length) bits.push(tsub("{n} new series", { n: day.new_series.length }));
  if (day.records && day.records.added) {
    bits.push(tsub(day.records.added === 1 ? "{n} auction result" : "{n} auction results",
                   { n: day.records.added }));
  }
  if (day.archive) bits.push(t("archive update"));
  if (day.reparsed) bits.push(tsub("{n} re-read by Miqyas", { n: day.reparsed.toLocaleString() }));
  if (day.held_back) bits.push(tsub("{n} held back", { n: day.held_back.toLocaleString() }));
  return bits.join(" · ");
}
