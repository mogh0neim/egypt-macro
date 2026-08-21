/* Miqyas -- the desk.
 *
 * One screen of the numbers someone reads every morning, with no prose in the
 * way. It is the same page whether the set is ours or theirs:
 *
 *   #/desk              the watchlist, or a curated default set if it is empty
 *   #/desk?s=ID,ID,...  a set someone was sent, which they can then save
 *
 * Seeding it with defaults is the whole trick. A watchlist that starts empty is
 * a page that does nothing on the first visit and therefore never gets a second
 * one; a desk that already works is something to adjust rather than build.
 */

const DESK_DEFAULTS = [
  { label: "The pound", ids: ["EG.FX.OFF.USD.SELL", "EG.FX.MKT.USD.SELL", "EG.FX.IBK.WAVG"] },
  { label: "The corridor and overnight money",
    ids: ["EG.RATE.ON.DEP", "EG.RATE.ON.LEND", "EG.RATE.MAIN", "EG.CONIA.ON.RATE", "EG.IBK.D.ON"] },
  { label: "EGP treasury bills",
    ids: ["EG.TB.EGP.3M.YLD.WAVG", "EG.TB.EGP.6M.YLD.WAVG", "EG.TB.EGP.12M.YLD.WAVG", "EG.TB.EGP.3M.BIDCOVER"] },
  { label: "Prices", ids: ["EG.CPI.HDL.YOY", "EG.CPI.CORE.YOY"] },
  { label: "External", ids: ["EG.RES.NIR", "EG.EXT.REMIT.FYTD"] },
];

const DESK_DEFAULT_IDS = DESK_DEFAULTS.reduce((a, g) => a.concat(g.ids), []);

const deskState = { mode: "default" };

/* Starring on the desk must not redraw the desk.
 *
 * Redrawing looks harmless and is not: the first click replaces the table, the
 * row under the cursor moves somewhere else, and a second click lands on a node
 * that is no longer in the document, so it does nothing at all. Which is
 * precisely what happened.
 *
 * So a removal takes out its own row and leaves everything else where it was,
 * and starring something on the default or a shared set changes only the button,
 * because flipping the page into "your desk" mid-edit would move every row under
 * the reader's hand.
 */
function deskOnStar(id, on) {
  if (deskState.mode !== "mine" || on) return;
  const button = document.querySelector('#app [data-star="' + id + '"]');
  const row = button && button.closest("tr");
  if (row) row.remove();
  // A group whose last row has just gone takes its heading with it.
  document.querySelectorAll("#app tr.group-head").forEach((h) => {
    const next = h.nextElementSibling;
    if (!next || next.classList.contains("group-head")) h.remove();
  });
  if (!document.querySelectorAll("#app tbody tr:not(.group-head)").length) route();
}

/* A set someone chose has no order we can know, so it is grouped by the same
 * thirteen topics the rest of the site uses. Structure the reader already
 * recognises beats the order they happened to click things in. */
function deskGroups(ids) {
  const seen = new Set();
  const byTopic = new Map();
  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const s = state.byId.get(id);
    if (!s) return;
    const key = topicOf(s);
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(s);
  });
  return TOPICS.filter((t) => byTopic.has(t.key))
    .map((t) => ({ label: t.name, rows: byTopic.get(t.key) }))
    .concat(byTopic.has("other") ? [{ label: "Other", rows: byTopic.get("other") }] : []);
}

/* One row per series, latest value and what moved. Not observations: a desk is
 * a snapshot, and anyone who wants the history has the series page. */
function deskCSV(rows) {
  const head =
    "# Miqyas desk, " + new Date().toISOString().slice(0, 10) + "\n" +
    "# Source: Central Bank of Egypt. Republished by Miqyas, an unofficial mirror.\n" +
    "series_id,title,unit,period,value,previous,change\n";
  const csv = (v) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const body = rows
    .map((s) =>
      [s.series_id, s.title_en, s.unit, s.last, s.latest_value, s.previous, changeOf(s)]
        .map(csv)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([head + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "miqyas-desk.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function viewDesk(query) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(8);

  await loadIndex();
  const sparks = await loadSparks();
  const status = await loadStatus();

  const asked = (new URLSearchParams(query || "").get("s") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const mine = watchGet();

  let mode, groups, ids;

  if (asked.length) {
    mode = "shared";
    ids = asked;
    groups = deskGroups(asked);
  } else if (mine.length) {
    mode = "mine";
    ids = mine;
    groups = deskGroups(mine);
  } else {
    mode = "default";
    ids = DESK_DEFAULT_IDS;
    groups = DESK_DEFAULTS.map((g) => ({
      label: g.label,
      rows: g.ids.map((id) => state.byId.get(id)).filter(Boolean),
    })).filter((g) => g.rows.length);
  }

  deskState.mode = mode;

  const rows = groups.reduce((a, g) => a.concat(g.rows), []);
  const missing = ids.length - rows.length;

  // The one thing a desk has to say before anything else: how fresh is this.
  const built = status && status.built_at
    ? "rebuilt " + status.built_at.slice(11, 16) + " UTC " +
      (status.built_at.slice(0, 10) === new Date().toISOString().slice(0, 10)
        ? "today"
        : niceDate(status.built_at.slice(0, 10)))
    : "";

  const standfirst = {
    default:
      "A set we chose, so the page is useful before you have picked anything. Star " +
      "rows anywhere on the site and your desk becomes exactly those, or take all " +
      "sixteen of these as a starting point and edit from there.",
    mine:
      "Your set, kept in this browser only. Nothing is sent anywhere, and clearing " +
      "your site data clears it.",
    shared:
      "A set someone sent you. Save it to make it the one this page opens on, or " +
      "leave it and your own stays untouched.",
  }[mode];

  const table = groups
    .map(
      (g) =>
        '<tr class="group-head"><td colspan="7">' + esc(g.label) + "</td></tr>" +
        g.rows.map((s) => indicatorRow(s, { star: true, spark: sparks[s.series_id] })).join("")
    )
    .join("");

  app.innerHTML =
    '<div class="wrap">' +
    '<section class="section desk-head">' +
    '<p class="eyebrow">Desk' + (built ? " · " + esc(built) : "") + "</p>" +
    "<h2>" +
    (mode === "mine" ? "Your desk" : mode === "shared" ? "A shared set" : "The desk") +
    "</h2>" +
    '<p class="lede">' + esc(standfirst) + "</p>" +
    '<div class="controls">' +
    '<button class="chip solid" id="d-copy">Copy as a table</button>' +
    '<button class="chip" id="d-csv">Download as CSV</button>' +
    '<button class="chip" id="d-share">Copy a link to this set</button>' +
    (mode === "mine"
      ? '<span class="spacer"></span><button class="chip" id="d-clear">Clear my desk</button>'
      : '<span class="spacer"></span><button class="chip" id="d-save">' +
        (mode === "shared" ? "Save this as my desk" : "Start from this set") + "</button>") +
    "</div>" +
    (missing > 0
      ? '<p class="foot-note">' +
        (missing === 1
          ? "One id in that link is not in the catalogue and has been left out."
          : missing + " ids in that link are not in the catalogue and have been left out.") +
        "</p>"
      : "") +
    (rows.length
      ? '<div class="table-scroll"><table class="indicators"><thead><tr>' +
        '<th class="star-col"><span class="sr-only">On your desk</span></th>' +
        '<th>Series</th><th class="hide-sm">Shape</th><th>Latest</th><th>Change</th>' +
        "<th>Where it sits</th><th>As of</th>" +
        "</tr></thead><tbody>" + table + "</tbody></table></div>"
      : '<p class="empty">Nothing on this desk. <a href="#/browse">Browse by subject</a> ' +
        'or press ctrl-K and star what you need.</p>') +
    '<p class="foot-note">The last column is where each current reading sits between that ' +
    "series' own record low and high, with the gold mark at its median. " +
    '<a href="#/data">Every one of these is in the API and the bulk downloads →</a></p>' +
    "</section></div>";

  document.getElementById("d-copy").addEventListener("click", (e) =>
    copyTSV(
      e.target,
      rows.map((s) => [
        s.series_id,
        s.title_en || "",
        fmt(s.latest_value, s.unit),
        unitShort(s.unit) || "",
        fmtChange(changeOf(s), s.unit),
        s.last,
      ]),
      ["series_id", "title", "latest", "unit", "change", "as of"]
    )
  );
  document.getElementById("d-csv").addEventListener("click", () => deskCSV(rows));
  document.getElementById("d-share").addEventListener("click", (e) => {
    const url =
      location.origin +
      location.pathname +
      "#/desk?s=" +
      rows.map((s) => encodeURIComponent(s.series_id)).join(",");
    navigator.clipboard.writeText(url).then(() => flash(e.target, "Link copied"), () => {});
  });

  const clear = document.getElementById("d-clear");
  if (clear) {
    clear.addEventListener("click", () => {
      watchSet([]);
      route();
    });
  }
  const save = document.getElementById("d-save");
  if (save) {
    save.addEventListener("click", () => {
      watchSet(rows.map((s) => s.series_id));
      location.hash = "#/desk";
      route();
    });
  }
}
