/* Miqyas -- the rate decisions.
 *
 * Every Monetary Policy Committee statement CBE has published since June
 * 2005, in one list, with what the committee did and how much of the wording
 * it changed on the way. The language matters: an MPC that keeps rates flat
 * but rewrites two paragraphs is telling you something a rate table cannot.
 */

const DECISION_LABEL = { hold: t("Held"), cut: t("Cut"), hike: t("Raised") };

/* A step function over an "only when it changes" series: what was the rate on
 * this date? Used to recover the decision for the statements whose PDF the
 * parser could not read a rate out of. */
function rateAt(observations, iso) {
  let value = null;
  for (let i = 0; i < observations.length; i++) {
    if (observations[i][0] > iso) break;
    value = observations[i][1];
  }
  return value;
}

const dayBefore = (iso) =>
  new Date(Date.parse(iso) - 86400000).toISOString().slice(0, 10);

async function viewMPC() {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);

  const mpc = await loadMPC();
  if (!mpc || !mpc.statements || !mpc.statements.length) {
    app.innerHTML =
      '<div class="wrap"><p class="empty">The rate-decision archive has not been built yet. ' +
      "Run <code>python ingest/mpc_archive.py</code>, then <code>python ingest/build_exports.py</code>.</p></div>";
    return;
  }

  await loadIndex();
  const calendar = await loadMPCCalendar();
  const three = await Promise.all([
    loadSeries("EG.RATE.ON.DEP").catch(() => null),
    loadSeries("EG.RATE.ON.LEND").catch(() => null),
    loadSeries("EG.RATE.DISCOUNT").catch(() => null),
  ]);
  const dep = three[0], lend = three[1], disc = three[2];
  const depObs = (dep && dep.observations) || [];

  const statements = mpc.statements.slice().sort((a, b) => a.date.localeCompare(b.date));
  const diffByTo = {};
  (mpc.diffs || []).forEach((d) => (diffByTo[d.to_date] = d));

  const rows = statements.map((s, i) => {
    const prev = i ? statements[i - 1] : null;
    const next = statements[i + 1];
    let decision = s.decision || null;
    let bp = null;
    let deposit = s.deposit_rate ? parseFloat(s.deposit_rate) : null;
    let lending = s.lending_rate ? parseFloat(s.lending_rate) : null;
    let inferred = false;

    // Fill the gaps from the corridor series rather than leaving a quarter of
    // the decisions blank.
    //
    // CBE dates the corridor series to the day a rate takes effect, which runs
    // a few days behind the meeting: the 1 February 2024 hike is stamped
    // 4 February. So the rate a statement set is the one in effect a week
    // later, not on the day -- capped at the day before the next meeting, or
    // the two statements four days apart in October 2022 would read each
    // other's decisions.
    const window = new Date(Date.parse(s.date) + 7 * 86400000).toISOString().slice(0, 10);
    const lookAt = next && dayBefore(next.date) < window ? dayBefore(next.date) : window;
    const after = rateAt(depObs, lookAt);
    const before = rateAt(depObs, dayBefore(s.date));

    if (after !== null && before !== null) {
      if (deposit === null) { deposit = after; inferred = true; }
      if (lending === null && lend) { lending = rateAt(lend.observations, lookAt); inferred = true; }
      if (!decision) { decision = after > before ? "hike" : after < before ? "cut" : "hold"; inferred = true; }
      if (after !== before) bp = Math.round((after - before) * 100);
    }
    // Before July 2014 there is no corridor series, so the only measure of the
    // move is the gap between what two consecutive statements said.
    if (bp === null && prev && s.deposit_rate && prev.deposit_rate) {
      const move = Math.round((parseFloat(s.deposit_rate) - parseFloat(prev.deposit_rate)) * 100);
      if (move) bp = move;
    }
    return { s: s, decision: decision, bp: bp, deposit: deposit, lending: lending,
             inferred: inferred, diff: diffByTo[s.date] };
  }).reverse();

  const tally = { hike: 0, cut: 0, hold: 0, unknown: 0 };
  rows.forEach((r) => (r.decision ? tally[r.decision]++ : tally.unknown++));

  const sets = [], labels = [], units = [];
  if (disc) { sets.push(disc.observations); labels.push(t("Discount rate")); units.push("percent per annum"); }
  if (dep) { sets.push(dep.observations); labels.push(t("Overnight deposit rate")); units.push("percent per annum"); }
  if (lend) { sets.push(lend.observations); labels.push(t("Overnight lending rate")); units.push("percent per annum"); }
  /* Three step lines a point apart overprinted each other from 2014 on, and the
   * dashed grey one nearly vanished. The deposit and lending rates are the two
   * edges of one object, so they are drawn as the corridor band, as on the
   * money market page, with the discount rate as the one line through it. The
   * readout still gives all three. */
  const corridorBand = dep && lend ? [sets.length - 2, sets.length - 1] : null;
  const legendItem = (cls, label) =>
    '<span class="item"><span class="key ' + cls + '"></span>' + esc(label) + "</span>";

  const card = (r) => {
    const s = r.s;
    const badge = r.decision
      ? '<span class="badge ' + r.decision + '">' + DECISION_LABEL[r.decision] +
        (r.bp && r.decision !== "hold" ? " " + Math.abs(r.bp) + " bp" : "") + "</span>"
      : '<span class="badge unknown">Statement only</span>';
    const rateText =
      (r.deposit !== null && r.deposit !== undefined ? "deposit <b>" + r.deposit + "%</b>" : "") +
      (r.lending !== null && r.lending !== undefined ? " · lending <b>" + r.lending + "%</b>" : "");
    const language = r.diff
      ? '<span class="lang">' + Math.round((1 - parseFloat(r.diff.similarity || 0)) * 100) +
        "% of the wording changed</span>"
      : "";
    return (
      '<li class="mpc-row" data-decision="' + (r.decision || "unknown") + '">' +
      '<span class="when">' + niceDate(s.date) + "</span>" +
      badge +
      '<span class="rates">' + rateText + (r.inferred ? ' <i class="from-series">from the rate series</i>' : "") + "</span>" +
      language +
      '<a class="src" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
      (s.format === "pdf" ? "PDF" : "Statement") + " ↗</a></li>"
    );
  };

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "Rate decisions" }]) +
    nextPanel(nextMeeting(calendar)) +
    '<section class="section">' +
    '<p class="eyebrow">' + t("Monetary Policy Committee") + "</p>" +
    "<h2>" + t("Every rate decision since June 2005") + "</h2>" +
    '<p class="lede">' + mpc.count + " statements, continuous from " + niceDate(mpc.range[0]) +
    " to " + niceDate(mpc.range[1]) + ". " + tally.hike + " increases, " + tally.cut +
    " cuts, " + tally.hold + " meetings that changed nothing" +
    (tally.unknown
      ? ", and " + tally.unknown + " older statements whose decision is in the PDF but not in any series CBE publishes"
      : "") +
    ". Each one links back to CBE's own copy.</p>" +
    (sets.length
      ? '<div id="mpc-chart"></div>' +
        '<div class="legend">' +
        labels.map((l, i) =>
          !corridorBand ? legendItem("s" + i, l)
          : i === corridorBand[0] ? legendItem("band", t("the CBE corridor, overnight deposit to overnight lending"))
          : i === corridorBand[1] ? ""
          : legendItem("s" + i, l)).join("") +
        "</div>" +
        '<div class="readout" id="mpc-readout"><span>' +
        t("The discount rate runs back to 1991. The corridor is only published from July 2014, which is why the older statements below carry no rate.") +
        "</span></div>"
      : "") +
    '<div class="controls">' +
    '<button class="chip" data-dec="" aria-pressed="true">All ' + rows.length + "</button>" +
    '<button class="chip" data-dec="hike" aria-pressed="false">Increases ' + tally.hike + "</button>" +
    '<button class="chip" data-dec="cut" aria-pressed="false">Cuts ' + tally.cut + "</button>" +
    '<button class="chip" data-dec="hold" aria-pressed="false">No change ' + tally.hold + "</button>" +
    (tally.unknown
      ? '<button class="chip" data-dec="unknown" aria-pressed="false">Unrecorded ' + tally.unknown + "</button>"
      : "") +
    "</div>" +
    '<ul class="mpc-list" id="mpc-list">' + rows.map(card).join("") + "</ul>" +
    '<p class="foot-note">“Wording changed” compares each statement with the one before it, character by character. ' +
    "A committee that holds rates but rewrites half its statement is doing something. " +
    "Rates marked <i>from the rate series</i> were not machine-readable in the statement itself and have been " +
    "recovered from CBE's published corridor history.</p>" +
    "</section></div>";

  if (sets.length) {
    const readout = document.getElementById("mpc-readout");
    mountChart(document.getElementById("mpc-chart"), readout,
      (animate) => lineChart(sets, { height: 320, id: "mpcc", unit: "percent per annum", step: true, band: corridorBand, animate: animate }),
      (svg) => wireHover(svg, sets.length > 1 ? sets : sets[0], units, readout, labels));
  }

  app.querySelectorAll("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => {
      const want = b.dataset.dec;
      app.querySelectorAll("[data-dec]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.dec === want)));
      document.querySelectorAll("#mpc-list .mpc-row").forEach((li) =>
        li.classList.toggle("hidden", !!want && li.dataset.decision !== want)
      );
    })
  );
}

/* ---------- the next meeting ----------
 *
 * The committee meets eight times a year on dates CBE publishes in advance, so
 * the next one is a fact worth a line at the top of the page. There used to be
 * a Cut / Hold / Raise guess here, kept in the browser and scored against the
 * archive. It was commentary rather than record, it sat above the history the
 * page is for, and it is gone.
 */

function nextPanel(next) {
  if (!next) return "";
  return (
    '<section class="section band-inset call"><div class="wrap-inner">' +
    '<p class="eyebrow">' + t("Next rate decision") + "</p>" +
    "<h2>" + esc(niceDate(next.date)) + ", " + esc(countdownWords(next.days)) + "</h2>" +
    '<p class="lede">' +
    t("The committee meets eight times a year, on dates the Central Bank publishes in advance.") +
    "</p>" +
    "</div></section>"
  );
}
