/* Miqyas -- the command palette.
 *
 * The masthead search box reached series and nothing else, and it was hidden
 * outright below 1150px, so on most laptops the site's only accelerator was
 * gone. This replaces it: one box that reaches every series, every topic, every
 * document collection and every page, at any width.
 *
 * It is an accelerator, never the only way in. Every destination it offers is
 * also reachable by clicking, which is the rule the rest of the site follows.
 */

const PALETTE_PAGES = [
  { label: "Overview", href: "#/", hint: "the front page",
    alt: "home start headline indicators dashboard" },
  { label: "Series", href: "#/series", hint: "search all 1,317, or read down the subjects",
    alt: "browse topics subjects everything all series categories find search catalogue lookup" },
  { label: "Favourites", href: "#/favourites", hint: "the numbers you chose to keep",
    alt: "desk watchlist saved starred pinned my series shortlist morning" },
  { label: "Rate decisions", href: "#/rates", hint: "every MPC statement since June 2005",
    alt: "mpc monetary policy committee corridor hike cut hold discount rate statements" },
  { label: "The money market", href: "#/money-market", hint: "the corridor, the tenors, the bill curve",
    alt: "conia interbank overnight liquidity repo deposit auction treasury bills yield curve bid to cover desk" },
  { label: "Documents", href: "#/docs", hint: "1,478 publications, searchable",
    alt: "pdf archive bulletin circular publications press release full text ocr scans" },
  { label: "Get the data", href: "#/data", hint: "Parquet, SQLite, CSV, and the API",
    alt: "download downloads bulk export api json parquet sqlite csv duckdb pandas mirror sha256" },
  { label: "About", href: "#/about", hint: "how this is built, and what is not in it",
    alt: "methodology provenance source disclaimer unofficial licence citation nilometer miqyas" },
];

/* How well a haystack answers a query term.
 *
 * Position matters more than anything: a title that starts with the word is
 * almost always what was meant. Length is a mild penalty, so "Inflation" beats
 * "Consumer Price Inflation - Regulated Items, of which: Tobacco".
 */
function matchScore(hay, term) {
  const i = hay.indexOf(term);
  if (i < 0) return 0;
  const brevity = Math.min(40, hay.length / 6);
  if (i === 0) return 100 - brevity;
  // A match at a word boundary is a real match; one in the middle of a token is
  // usually a coincidence.
  if (/[\s\-./(,:]/.test(hay[i - 1])) return 60 - brevity;
  return 25 - brevity / 2;
}

const paletteState = { open: false, rows: [], cursor: 0 };

function paletteRecents() {
  return store.get("recent", []).filter((r) => r && r.href && r.label);
}

function paletteRemember(row) {
  const kept = paletteRecents().filter((r) => r.href !== row.href);
  kept.unshift({ href: row.href, label: row.label, kind: row.kind });
  store.set("recent", kept.slice(0, 6));
}

/* Everything the palette can offer, scored against the query. Series come last
 * in the weighting rather than first: there are 1,317 of them and eight pages,
 * and someone typing "doc" wants the archive, not a series with "doc" inside a
 * table name. */
function paletteSearch(raw) {
  const q = normaliseQuery(raw);
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) {
    const recents = paletteRecents().map((r) => ({ ...r, kind: r.kind || "Page" }));
    return recents.length
      ? recents
      : PALETTE_PAGES.map((p) => ({ label: p.label, sub: p.hint, href: p.href, kind: "Page" }));
  }

  const pool = [];

  PALETTE_PAGES.forEach((p) =>
    pool.push({ label: p.label, sub: p.hint, href: p.href, kind: "Page",
                hay: normaliseQuery(p.label + " " + p.hint + " " + (p.alt || "")), weight: 45 })
  );

  TOPICS.forEach((t) =>
    pool.push({ label: t.name, sub: t.blurb, href: "#/topic/" + t.key, kind: "Topic", hay: normaliseQuery(t.name + " " + t.blurb), weight: 38 })
  );

  // COLLECTIONS lives in views-docs.js, which is loaded before this file.
  (typeof COLLECTIONS === "undefined" ? [] : COLLECTIONS).forEach((c) =>
    pool.push({ label: c.name, sub: c.blurb, href: "#/docs/" + encodeURIComponent(c.cat), kind: "Documents", hay: normaliseQuery(c.name + " " + c.blurb), weight: 30 })
  );

  (state.index || []).forEach((s) =>
    pool.push({
      label: s.title_en || s.series_id,
      sub: s.series_id + (s.unit ? " · " + unitShort(s.unit) : "") + " · " + (s.n || 0).toLocaleString() + " readings",
      ar: s.title_ar || "",
      href: "#/s/" + encodeURIComponent(s.series_id),
      kind: "Series",
      hay: normaliseQuery(s.series_id + " " + (s.title_en || "") + " " + (s.title_ar || "")),
      weight: 0,
      stale: !!s.stale_days,
    })
  );

  return pool
    .map((row) => {
      let total = row.weight;
      for (const t of terms) {
        const sc = matchScore(row.hay, t);
        if (!sc) return null;
        total += sc;
      }
      return { ...row, score: total };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

function paletteRender() {
  const out = document.getElementById("presults");
  const rows = paletteState.rows;
  if (!rows.length) {
    out.innerHTML = '<p class="empty">Nothing matches that. Try a broader word.</p>';
    return;
  }
  out.innerHTML = rows
    .map(
      (r, i) =>
        '<a class="prow' + (i === paletteState.cursor ? " on" : "") + '" href="' + r.href +
        '" role="option" aria-selected="' + (i === paletteState.cursor) + '" data-i="' + i + '">' +
        '<span class="pkind">' + esc(r.kind || "") + "</span>" +
        '<span class="plabel">' + esc(r.label) +
        (r.stale ? '<i class="pstale" title="CBE has stopped updating this">quiet</i>' : "") +
        (r.ar ? '<span class="ar" dir="rtl" lang="ar">' + esc(r.ar) + "</span>" : "") +
        "</span>" +
        (r.sub ? '<span class="psub">' + esc(r.sub) + "</span>" : "") +
        "</a>"
    )
    .join("");
  const on = out.querySelector(".prow.on");
  if (on) on.scrollIntoView({ block: "nearest" });
}

async function paletteOpen(seed) {
  const el = document.getElementById("palette");
  const input = document.getElementById("pq");
  paletteState.open = true;
  el.hidden = false;
  document.body.classList.add("palette-open");
  input.value = seed || "";
  input.focus();
  input.select();
  paletteRun();
  // Series are only searchable once the catalogue is in memory. Every data page
  // has already loaded it; About and the error page have not, so fetch it now
  // and re-run rather than quietly offering less on those two pages.
  if (!state.index) {
    await loadIndex().catch(() => null);
    if (paletteState.open) paletteRun();
  }
}

function paletteClose() {
  paletteState.open = false;
  document.getElementById("palette").hidden = true;
  document.body.classList.remove("palette-open");
}

function paletteRun() {
  paletteState.rows = paletteSearch(document.getElementById("pq").value);
  paletteState.cursor = 0;
  paletteRender();
}

function paletteGo(i) {
  const row = paletteState.rows[i];
  if (!row) return;
  paletteRemember(row);
  paletteClose();
  location.hash = row.href.replace(/^#/, "");
}

(function wirePalette() {
  const el = document.getElementById("palette");
  const input = document.getElementById("pq");
  if (!el || !input) return;

  input.addEventListener("input", paletteRun);

  input.addEventListener("keydown", (e) => {
    const n = paletteState.rows.length;
    if (e.key === "ArrowDown") { paletteState.cursor = n ? (paletteState.cursor + 1) % n : 0; }
    else if (e.key === "ArrowUp") { paletteState.cursor = n ? (paletteState.cursor - 1 + n) % n : 0; }
    else if (e.key === "Enter") { paletteGo(paletteState.cursor); return; }
    else if (e.key === "Escape") { paletteClose(); return; }
    else return;
    e.preventDefault();
    paletteRender();
  });

  // Delegated, because the rows are rewritten on every keystroke.
  document.getElementById("presults").addEventListener("click", (e) => {
    const row = e.target.closest(".prow");
    if (!row) return;
    e.preventDefault();
    paletteGo(+row.dataset.i);
  });

  // Clicking the backdrop closes; clicking the box does not.
  el.addEventListener("mousedown", (e) => { if (e.target === el) paletteClose(); });

  const quick = document.getElementById("quick");
  if (quick) quick.addEventListener("click", () => paletteOpen(""));

  // The shortcut is the platform's, not ours.
  const key = document.getElementById("quick-key");
  if (key && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)) {
    key.textContent = "⌘K";
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      paletteState.open ? paletteClose() : paletteOpen("");
      return;
    }
    if (paletteState.open) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); paletteOpen(""); }
  });
})();
