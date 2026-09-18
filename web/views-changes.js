/* Miqyas -- what changed.
 *
 * Every other page here shows a number. This one shows that a number changed,
 * which is the only thing on this site that no other source could publish even
 * if it wanted to.
 *
 * CBE overwrites its files in place. The spreadsheet at a URL today is not the
 * spreadsheet that was there last month; there is no changelog, no vintage,
 * and no way to ask what a figure read on a past date. This repository commits
 * every clean file every morning, so its own history is a record of revisions
 * that exists nowhere else and cannot be reconstructed after the fact.
 *
 * The page is deliberately honest about how young that record is. It began on
 * 20 August 2026, and a revision archive with one month in it has caught
 * almost nothing yet. Saying so is better than padding it: the proposition is
 * that the record starts here, not that it is already complete.
 */

async function viewChanges() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);

  const data = await getJSON(ROOT + "/api/v1/changes.json").catch(() => null);
  if (!data) {
    app.innerHTML =
      '<div class="wrap"><section class="section">' +
      "<h2>The change log has not been built yet</h2>" +
      '<p class="lede">It is read out of this repository\'s own git history. ' +
      "Run <code>python ingest/build_changes.py</code> after the exports.</p>" +
      '<p class="foot-note">On a shallow clone there is no history to read: ' +
      "<code>git clone</code> without <code>--depth</code>, or " +
      "<code>fetch-depth: 0</code> in the workflow.</p></section></div>";
    return;
  }

  const days = data.days || [];
  const revisions = days.reduce((a, d) => a + d.revised.length, 0);
  const readings = days.reduce((a, d) => a + d.moved_total, 0);
  const anomalies = data.anomalies || [];
  const since = days.length ? days[days.length - 1].date : null;

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "What changed" }]) +

    '<section class="section">' +
    '<p class="eyebrow">The revision record</p>' +
    "<h2>What CBE published, and what it quietly restated</h2>" +
    '<p class="lede">The Central Bank overwrites its files when it revises a figure. ' +
    "There is no changelog and no way to ask what a number read last month. This site keeps " +
    "every copy it has ever fetched, so its own history answers that question, and nothing " +
    "else does.</p>" +
    '<div class="stat-row">' +
    stat(readings.toLocaleString(), "readings published", since ? "since " + niceDate(since) : "") +
    stat(String(revisions), "figures CBE restated", "after first publishing them") +
    stat(String(anomalies.length), "same-day conflicts", "two values for one date") +
    "</div>" +
    '<p class="foot-note">' +
    (revisions === 0
      ? "No revision yet. The archive began on 20 August 2026 and a revision record one month " +
        "old has not had time to catch much. That is the honest state of it: this page fills up " +
        "from here, and every morning it is not running is a day that cannot be recovered."
      : "Each one is a figure that was published, read by somebody, and then changed.") +
    ' <a href="' + ROOT + '/changes.xml">Subscribe to the daily feed</a>' +
    ' · <a href="' + ROOT + '/changes-revisions.xml">revisions only</a>, which is deliberately quiet.</p>' +
    "</section>" +

    (anomalies.length
      ? '<section class="section band"><div class="wrap-inner">' +
        '<p class="eyebrow">Caught in the act</p>' +
        "<h2>Where CBE published two different values for one date</h2>" +
        '<p class="lede">These do not need a history to find: the same figure appears twice, ' +
        "differently, inside one of CBE's own files. The parser keeps one and records both.</p>" +
        '<div class="table-scroll"><table class="indicators compact"><thead><tr>' +
        "<th>Series</th><th>For</th><th>Kept</th><th>Discarded</th>" +
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
        '<p class="eyebrow">Day by day</p>' +
        "<h2>" + days.length + " days on the record</h2>" +
        '<p class="lede">Every morning the scrape runs, whatever moved is committed. ' +
        "A day with nothing on it is a day CBE published nothing new.</p>" +
        days.map(dayCard).join("") +
        "</section>"
      : "") +

    '<section class="section"><div class="band-inset">' +
    '<p class="eyebrow">How this is built</p>' +
    "<h3>Read out of the git history, and careful about whose change it was</h3>" +
    "<p>A change made by the scraper means CBE published something different: that is a " +
    "revision. A change made by a person means this project's parser changed and the reading " +
    "changed, which is our correction and not CBE's revision. The two are counted separately " +
    "and never merged, because calling the second one a CBE revision would be the one lie that " +
    "makes this page worthless.</p>" +
    '<p class="foot-note">' +
    (data.history_commits ? data.history_commits.toLocaleString() + " commits of history. " : "") +
    "Up to " + (data.moved_per_day_cap || 40) + " readings shown per day, biggest relative " +
    "move first; the totals count all of them.</p>" +
    "</div></section></div>";
}

const stat = (value, label, note) =>
  '<div class="stat"><b>' + esc(value) + "</b><span>" + esc(label) + "</span>" +
  (note ? "<i>" + esc(note) + "</i>" : "") + "</div>";

function dayCard(day) {
  const parts = [];

  if (day.revised.length) {
    parts.push(
      '<p class="change-head down">CBE restated ' + day.revised.length + "</p><ul class='change-list'>" +
      day.revised.map((r) =>
        "<li><a href='#/s/" + encodeURIComponent(r.series_id) + "'>" + esc(r.title) + "</a> " +
        "for " + esc(niceDate(r.period)) + ": " +
        (r.withdrawn
          ? "withdrawn, was " + fmt(r.was, r.unit)
          : fmt(r.was, r.unit) + " restated as <b>" + fmt(r.now, r.unit) + "</b>") +
        "</li>").join("") + "</ul>");
  }
  if (day.new_series && day.new_series.length) {
    parts.push(
      '<p class="change-head">' + day.new_series.length + " new series</p><ul class='change-list'>" +
      day.new_series.map((n) =>
        "<li><a href='#/s/" + encodeURIComponent(n.series_id) + "'>" + esc(n.title) + "</a>, " +
        n.n.toLocaleString() + " readings from " + esc(shortDate(n.first)) + "</li>").join("") + "</ul>");
  }
  if (day.moved.length) {
    parts.push(
      '<p class="change-head">' + day.moved_total.toLocaleString() + " readings published" +
      (day.moved_total > day.moved.length ? ", the " + day.moved.length + " that moved most" : "") +
      "</p><ul class='change-list'>" +
      day.moved.map((m) =>
        "<li><a href='#/s/" + encodeURIComponent(m.series_id) + "'>" + esc(m.title) + "</a>: " +
        "<b>" + fmt(m.value, m.unit) + "</b>" +
        ("previous" in m
          ? ' <span class="' + dirClass(m.change, m.unit) + '">' + changeCell(m.change, m.unit) + "</span>"
          : "") +
        " <i>" + esc(niceDate(m.period)) + "</i></li>").join("") + "</ul>");
  }
  if (day.reparsed) {
    parts.push(
      '<p class="change-head quiet">' + day.reparsed.toLocaleString() +
      " readings reread here</p>" +
      "<p class='foot-note'>This project's own parser changed, not CBE's figures. " +
      "Counted separately on purpose." +
      (day.reparsed_examples && day.reparsed_examples.length
        ? " For example " + esc(day.reparsed_examples[0].title) + " for " +
          esc(niceDate(day.reparsed_examples[0].period)) + ", read as " +
          esc(String(day.reparsed_examples[0].was)) + " and now as " +
          esc(String(day.reparsed_examples[0].now)) + "."
        : "") + "</p>");
  }
  if (!parts.length) return "";

  return (
    '<details class="group change-day"' + (day === undefined ? "" : "") + ">" +
    "<summary><b>" + esc(niceDate(day.date)) + "</b> " +
    '<span class="quiet">' + esc(daySummary(day)) + "</span></summary>" +
    parts.join("") + "</details>"
  );
}

function daySummary(day) {
  const bits = [];
  if (day.moved_total) bits.push(day.moved_total.toLocaleString() + " published");
  if (day.revised.length) bits.push(day.revised.length + " restated by CBE");
  if (day.new_series && day.new_series.length) bits.push(day.new_series.length + " new series");
  if (day.reparsed) bits.push(day.reparsed.toLocaleString() + " reread here");
  return bits.join(" · ");
}
