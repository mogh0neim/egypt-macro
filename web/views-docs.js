/* Miqyas -- the document archive.
 *
 * Two modes over the same corpus, because the two questions are different
 * shapes. Filtering titles and facets is instant, since documents.json is
 * small enough to hold in memory. Full text goes through the sharded
 * inverted index and fetches only the shards the query's own terms live in.
 *
 * Results are page-level: a 180-page statistical bulletin should surface as
 * "page 42", not as itself.
 *
 * The page opens on collections rather than on an empty search box. Most
 * people arriving here want "the bulletins" or "the MPC releases", not a
 * keyword they have to guess.
 */

const docState = { docs: null, meta: null, shards: new Map(), text: new Map() };

/* How many hits get their matching text fetched. A median document is 3 KB
 * gzipped and the largest is 600 KB, so fetching all sixty results could be
 * 36 MB in the worst case for a page nobody scrolls to the bottom of. Twenty is
 * bounded and covers what anyone reads, and the count line says so rather than
 * letting the rest look as though they simply had nothing to show. */
const SNIPPET_LIMIT = 20;
const SNIPPET_WIDTH = 260;

/* The page text, published by ingest/build_pages.py.
 *
 * GitHub Pages serves a .gz as an opaque binary rather than sending
 * Content-Encoding: gzip, so the browser will not inflate it for us and we do it
 * here. Where DecompressionStream is missing, a result keeps its page number and
 * simply has no quote, which is what this page did before it had any. */
async function loadPageText(id) {
  if (docState.text.has(id)) return docState.text.get(id);
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const r = await fetch(ROOT + "/pages/" + encodeURIComponent(id) + ".json.gz");
    if (!r.ok) throw new Error(String(r.status));
    const json = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
    docState.text.set(id, json.pages || {});
  } catch (err) {
    docState.text.set(id, null);
  }
  return docState.text.get(id);
}

/* The stretch of a page that shows why it matched.
 *
 * The search runs in folded text and the quote comes out of the original, which
 * is what normaliseWithMap's index map is for: CBE printed "إجمالى", the index
 * holds "اجمالي", and a reader should see what CBE printed.
 *
 * Anchoring on whichever term appears first is not good enough. Search "reserve
 * requirement ratio" and the first hit on the page is usually "ratio", in a
 * sentence about something else. So the window goes where the most distinct
 * terms fall together, and every one of them inside it is marked. That is the
 * difference between a snippet that contains part of the query and one that
 * explains the hit.
 */
function snippetFor(pageText, terms) {
  if (!pageText) return null;
  const folded = normaliseWithMap(pageText);
  const hay = folded.text;
  const source = folded.nfkc;

  // Every occurrence of every term, capped so a term appearing two hundred times
  // down one column of a statistical table cannot dominate the work.
  const marks = [];
  terms.forEach((term, ti) => {
    let at = hay.indexOf(term);
    let found = 0;
    while (at !== -1 && found < 40) {
      marks.push({ at: at, end: at + term.length, ti: ti });
      found += 1;
      at = hay.indexOf(term, at + term.length);
    }
  });

  if (!marks.length) {
    // Every term is on this page or it would not be a hit, so this only happens
    // where the folding is the whole reason it matched. Show the opening rather
    // than claim a highlight that is not there.
    return [{ text: source.slice(0, SNIPPET_WIDTH) + (source.length > SNIPPET_WIDTH ? " …" : "") }];
  }

  marks.sort((a, b) => a.at - b.at);

  let anchor = marks[0].at;
  let best = -1;
  for (const m of marks) {
    const distinct = new Set();
    for (const o of marks) {
      if (o.at >= m.at && o.at < m.at + SNIPPET_WIDTH) distinct.add(o.ti);
    }
    if (distinct.size > best) {
      best = distinct.size;
      anchor = m.at;
    }
  }

  // A little context before the first match, most of the window after it.
  const fromFolded = Math.max(0, anchor - Math.round(SNIPPET_WIDTH * 0.25));
  const toFolded = Math.min(hay.length, fromFolded + SNIPPET_WIDTH);
  const from = folded.map[fromFolded] === undefined ? 0 : folded.map[fromFolded];
  const to = folded.map[toFolded] === undefined ? source.length : folded.map[toFolded];

  const out = [];
  if (from > 0) out.push({ text: "… " });
  let cursor = from;
  for (const m of marks) {
    if (m.at < fromFolded || m.end > toFolded) continue;
    const a = folded.map[m.at];
    const b = m.end < folded.map.length ? folded.map[m.end] : to;
    if (a === undefined || b === undefined || a < cursor) continue;
    if (a > cursor) out.push({ text: source.slice(cursor, a) });
    out.push({ text: source.slice(a, b), mark: true });
    cursor = b;
  }
  if (cursor < to) out.push({ text: source.slice(cursor, to) });
  if (to < source.length) out.push({ text: " …" });
  return out;
}

/* The collections worth putting on the front of the page. Each is a category
 * as CBE files it; the copy is ours, because "Monetary Policy Inflation Note"
 * does not tell you what is inside one. */
const COLLECTIONS = [
  { cat: "Monthly Statistical Bulletins", name: "Monthly statistical bulletin",
    blurb: "The big one. Every monthly table CBE publishes, bound together." },
  { cat: "MPC Press Release", name: "Rate decisions",
    blurb: "What the Monetary Policy Committee decided, and why it says it decided it." },
  { cat: "Monetary Policy Inflation Note", name: "Inflation notes",
    blurb: "CBE's read on each month's inflation print, usually within days of it." },
  { cat: "Economic Review", name: "Economic review",
    blurb: "The quarterly narrative: growth, prices, the external position." },
  { cat: " External Position of Egyptian Economy", name: "External position",
    blurb: "Balance of payments, external debt and reserves, written up in full." },
  { cat: "CPI Press Release", name: "Inflation releases",
    blurb: "The monthly consumer price print as CBE announces it." },
  { cat: "Balance of Payments", name: "Balance of payments",
    blurb: "The quarterly BOP release with its commentary." },
  { cat: "Credit Granting", name: "Credit rules",
    blurb: "Circulars governing what banks may lend, to whom, and on what terms." },
];

/* Searches that pay off, offered instead of a blank box. */
const DOC_SUGGESTIONS = [
  "reserve requirement ratio",
  "financial inclusion",
  "exchange rate flexibility",
  "non-performing loans",
  "digital payments",
  "تحويلات العاملين",
];

async function loadDocs() {
  if (docState.docs) return docState.docs;
  const both = await Promise.all([
    getJSON(SEARCH_BASE + "/documents.json"),
    getJSON(SEARCH_BASE + "/meta.json"),
  ]);
  docState.docs = both[0];
  docState.meta = both[1];
  return docState.docs;
}

/* djb2 over UTF-16 code units. Must stay identical to shard_of() in
 * ingest/build_search.py, or every lookup lands in the wrong shard. */
function shardFor(term, shards) {
  let h = 5381;
  for (let i = 0; i < term.length; i++) h = (h * 33 + term.charCodeAt(i)) >>> 0;
  return h % shards;
}

const queryTerms = (query) =>
  normaliseQuery(query).split(/\s+/).filter((t) => t.length >= 2);

async function fullText(query) {
  const terms = queryTerms(query);
  if (!terms.length) return [];

  const perTerm = [];
  for (const term of terms) {
    const key = String(shardFor(term, docState.meta.shards)).padStart(3, "0");
    if (!docState.shards.has(key)) {
      docState.shards.set(key, await getJSON(SEARCH_BASE + "/" + key + ".json").catch(() => ({})));
    }
    perTerm.push(docState.shards.get(key)[term] || []);
  }

  // Require every term on the same page and score by summed term frequency.
  // An AND at page level is what keeps results precise on a corpus where
  // "inflation" alone appears on thousands of pages.
  const scored = new Map();
  for (const postings of perTerm) {
    for (const p of postings) {
      const key = p[0] + ":" + p[1];
      const entry = scored.get(key) || { docIdx: p[0], page: p[1], score: 0, hits: 0 };
      entry.score += p[2];
      entry.hits += 1;
      scored.set(key, entry);
    }
  }
  return [...scored.values()]
    .filter((e) => e.hits === terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
}

const SOURCE_LABEL = { publications: "Publication", circulars: "Circular", News: "Press release" };

async function viewDocs(presetCategory) {
  const app = document.getElementById("app");
  app.innerHTML = skeleton(6);

  let docs;
  try {
    docs = await loadDocs();
  } catch (err) {
    app.innerHTML =
      '<div class="wrap"><p class="empty">The document index has not been built yet. Run ' +
      "<code>python ingest/build_search.py</code>, then reload.</p></div>";
    return;
  }

  const sources = [...new Set(docs.map((d) => d.source))].sort();
  const years = [...new Set(docs.map((d) => (d.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  // A few of CBE's category strings carry a leading space, which would sort
  // them above the alphabet in the dropdown for no reason a reader can see.
  const cats = [...new Set(docs.flatMap((d) => d.categories))].sort((a, b) =>
    a.trim().localeCompare(b.trim()));
  const scanned = docs.filter((d) => d.needs_ocr && !d.ocr).length;
  const ocred = docs.filter((d) => d.ocr).length;
  const counts = {};
  docs.forEach((d) => d.categories.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));

  const collectionCards = COLLECTIONS.filter((c) => counts[c.cat]).map((c) =>
    '<button class="topic-card as-button" data-collection="' + esc(c.cat) + '">' +
    "<h3>" + esc(c.name) + "</h3><p>" + esc(c.blurb) + "</p>" +
    '<span class="count">' + counts[c.cat].toLocaleString() + " documents</span></button>"
  ).join("");

  app.innerHTML =
    '<div class="wrap">' +
    crumbs([{ label: "Documents" }]) +
    '<section class="section">' +
    '<p class="eyebrow">' + docs.length.toLocaleString() + " documents · " +
    ((docState.meta && docState.meta.pages) || 0).toLocaleString() + " pages of text</p>" +
    "<h2>The archive</h2>" +
    '<p class="lede">Everything CBE has published as a PDF, mirrored and read. ' +
    "Search inside the text and a result lands you on a page number, not on a 200-page file.</p>" +
    '<div class="topic-grid tight">' + collectionCards + "</div>" +
    "</section>" +

    '<section class="section band-inset">' +
    '<div class="search-shell">' +
    "<h2>Search</h2>" +
    '<input class="search" id="dq" autocomplete="off" placeholder="reserve requirement, MPC statement, تحويلات…">' +
    '<div class="controls suggest">' +
    '<span class="hint">Try:</span>' +
    DOC_SUGGESTIONS.map((s) => '<button class="chip" data-sug="' + esc(s) + '">' + esc(s) + "</button>").join("") +
    "</div>" +
    '<div class="controls">' +
    '<button class="chip" data-mode="title" aria-pressed="true">Match titles</button>' +
    '<button class="chip" data-mode="full" aria-pressed="false">Search inside the text</button>' +
    '<span class="spacer"></span>' +
    '<select class="chip" id="dsrc"><option value="">Any kind</option>' +
    sources.map((s) => '<option value="' + esc(s) + '">' + esc(SOURCE_LABEL[s] || s) + "</option>").join("") +
    "</select>" +
    '<select class="chip" id="dcat"><option value="">Any topic</option>' +
    cats.map((c) => '<option value="' + esc(c) + '"' + (c === presetCategory ? " selected" : "") + ">" +
      esc(c.trim()) + " (" + counts[c] + ")</option>").join("") +
    "</select>" +
    '<select class="chip" id="dyear"><option value="">Any year</option>' +
    years.map((y) => '<option>' + y + "</option>").join("") +
    "</select>" +
    '<button class="chip" id="dclear">Clear</button>' +
    "</div>" +
    '<div class="results" id="dresults"></div>' +
    (ocred
      ? '<p class="foot-note">' + ocred + " of these are scans of paper with no text layer of their own. " +
        "They have been read by OCR in Arabic and English, so their text is searchable. Expect the odd " +
        "word to be wrong, and expect Arabic inside a scan to search less reliably than English: " +
        "OCR often returns it in visual rather than logical letter order.</p>"
      : "") +
    (scanned
      ? '<p class="foot-note">' + scanned + " of these are scans that OCR has not been run over yet. " +
        "They are findable by title only.</p>"
      : "") +
    '<p class="foot-note">About one page in twenty comes out of its PDF as unmapped glyph ' +
    "codes rather than as characters, because the file embeds a font with no Unicode mapping. " +
    "Those pages are searched and quoted on whatever could be read, so a quote from one may " +
    "have words missing from the middle of it.</p>" +
    "</div></section></div>";

  const q = document.getElementById("dq");
  const out = document.getElementById("dresults");
  const pick = (id) => document.getElementById(id).value;
  let mode = "title";

  const passesFacets = (d) =>
    (!pick("dsrc") || d.source === pick("dsrc")) &&
    (!pick("dcat") || d.categories.indexOf(pick("dcat")) !== -1) &&
    (!pick("dyear") || (d.date || "").indexOf(pick("dyear")) === 0);

  const card = (d, page, slot) =>
    '<a class="result" href="' + esc(d.url) + (page ? "#page=" + page : "") + '" target="_blank" rel="noopener">' +
    '<div class="title">' + (ARABIC_RE.test(d.title || "") ? '<span dir="auto">' + esc(d.title || d.id) + "</span>" : esc(d.title || d.id)) + "</div>" +
    (slot === undefined ? "" : '<div class="snip" id="snip-' + slot + '"></div>') +
    '<div class="sub">' + niceDate(d.date) + " · " + esc(SOURCE_LABEL[d.source] || d.source) +
    (page ? ' · <b class="pagehit">page ' + page + "</b>" : "") +
    (d.pages ? " · " + d.pages + (d.pages === 1 ? " page" : " pages") : "") +
    (d.needs_ocr ? (d.ocr ? " · scan, read by OCR" : " · scan, no text layer") : "") +
    (d.categories.length ? " · " + esc(d.categories.slice(0, 3).join(", ").trim()) : "") +
    "</div></a>";

  /* Filled after the list is on screen rather than before it: the rows are the
   * answer and the quotes are detail, so a reader gets the answer while 3 KB per
   * document is still in flight. Deduplicated by document, because one bulletin
   * often supplies several of the hits. */
  const fillSnippets = async (hits, terms) => {
    const byDoc = new Map();
    hits.forEach((h, i) => {
      const id = docs[h.docIdx].id;
      if (!byDoc.has(id)) byDoc.set(id, []);
      byDoc.get(id).push({ slot: i, page: h.page });
    });
    await Promise.all(
      [...byDoc.entries()].map(async (entry) => {
        const pages = await loadPageText(entry[0]);
        entry[1].forEach((want) => {
          const el = document.getElementById("snip-" + want.slot);
          if (!el) return;
          const snip = pages && snippetFor(pages[String(want.page)], terms);
          if (!snip || !snip.length) {
            el.remove();
            return;
          }
          el.innerHTML =
            '<span dir="auto">' +
            snip.map((part) => (part.mark ? "<mark>" + esc(part.text) + "</mark>" : esc(part.text))).join("") +
            "</span>";
        });
      })
    );
  };

  const run = async () => {
    const query = q.value.trim();
    const filtered = docs.filter(passesFacets);

    if (!query) {
      // No query is not an error state. Show the newest documents that pass
      // whatever facets are set, which is a genuinely useful default.
      const recent = filtered.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      out.innerHTML = recent.length
        ? '<p class="count-line">' + filtered.length.toLocaleString() + " documents · newest first</p>" +
          recent.slice(0, 60).map((d) => card(d)).join("") +
          (recent.length > 60
            ? '<p class="empty">' + (recent.length - 60).toLocaleString() +
              " more. Narrow it with the filters above, or search.</p>"
            : "")
        : '<p class="empty">Nothing matches those filters. <button class="linkish" id="reset2">Clear them</button>.</p>';
      const r2 = document.getElementById("reset2");
      if (r2) r2.addEventListener("click", clearAll);
      return;
    }

    if (mode === "full") {
      out.innerHTML = '<p class="empty">Reading 53,000 pages…</p>';
      const fullTerms = queryTerms(query);
      const hits = await fullText(query);
      const allowed = new Set(filtered.map((d) => d.i));
      const rows = hits.filter((h) => allowed.has(h.docIdx));
      out.innerHTML = rows.length
        ? '<p class="count-line">' + rows.length + " pages contain every one of those words" +
          (rows.length > SNIPPET_LIMIT
            ? ", showing the matching text for the first " + SNIPPET_LIMIT
            : "") + "</p>" +
          rows.map((h, i) => card(docs[h.docIdx], h.page, i < SNIPPET_LIMIT ? i : undefined)).join("")
        : '<p class="empty">No single page contains all of those words. ' +
          "Try fewer words, or switch to matching titles.</p>";
      if (rows.length) fillSnippets(rows.slice(0, SNIPPET_LIMIT), fullTerms);
      return;
    }

    const terms = normaliseQuery(query).split(/\s+/);
    const hits = filtered.filter((d) => {
      const hay = normaliseQuery((d.title || "") + " " + d.categories.join(" "));
      return terms.every((t) => hay.indexOf(t) !== -1);
    });
    out.innerHTML = hits.length
      ? '<p class="count-line">' + hits.length.toLocaleString() + " titles match</p>" +
        hits.slice(0, 60).map((d) => card(d)).join("")
      : '<p class="empty">No title matches “' + esc(query) + '”. ' +
        '<button class="linkish" id="tryfull">Search inside the documents instead</button>.</p>';
    const tf = document.getElementById("tryfull");
    if (tf) tf.addEventListener("click", () => { setMode("full"); run(); });
  };

  const setMode = (m) => {
    mode = m;
    app.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === m)));
  };

  const clearAll = () => {
    q.value = "";
    ["dsrc", "dcat", "dyear"].forEach((id) => (document.getElementById(id).value = ""));
    setMode("title");
    run();
  };

  q.addEventListener("input", () => { if (mode === "title") run(); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  ["dsrc", "dcat", "dyear"].forEach((id) => document.getElementById(id).addEventListener("change", run));
  document.getElementById("dclear").addEventListener("click", clearAll);
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { setMode(b.dataset.mode); run(); }));
  app.querySelectorAll("[data-sug]").forEach((b) =>
    b.addEventListener("click", () => { q.value = b.dataset.sug; setMode("full"); run(); })
  );
  app.querySelectorAll("[data-collection]").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("dcat").value = b.dataset.collection;
      run();
      document.getElementById("dq").scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );

  run();
}
