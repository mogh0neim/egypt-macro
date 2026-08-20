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

const docState = { docs: null, meta: null, shards: new Map() };

/* Must match the normalisation in ingest/build_search.py exactly. If these
 * drift apart, Arabic queries silently return nothing. */
const normaliseQuery = (s) =>
  s
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .trim();

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

async function fullText(query) {
  const terms = normaliseQuery(query).split(/\s+/).filter((t) => t.length >= 2);
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
        "They have been read by OCR in Arabic and English, so their text is searchable, but a machine " +
        "reading a scan is not the same as a text layer and the odd word will be wrong.</p>"
      : "") +
    (scanned
      ? '<p class="foot-note">' + scanned + " of these are scans that OCR has not been run over yet. " +
        "They are findable by title only.</p>"
      : "") +
    "</div></section></div>";

  const q = document.getElementById("dq");
  const out = document.getElementById("dresults");
  const pick = (id) => document.getElementById(id).value;
  let mode = "title";

  const passesFacets = (d) =>
    (!pick("dsrc") || d.source === pick("dsrc")) &&
    (!pick("dcat") || d.categories.indexOf(pick("dcat")) !== -1) &&
    (!pick("dyear") || (d.date || "").indexOf(pick("dyear")) === 0);

  const card = (d, page) =>
    '<a class="result" href="' + esc(d.url) + (page ? "#page=" + page : "") + '" target="_blank" rel="noopener">' +
    '<div class="title">' + (ARABIC_RE.test(d.title || "") ? '<span dir="auto">' + esc(d.title || d.id) + "</span>" : esc(d.title || d.id)) + "</div>" +
    '<div class="sub">' + (d.date || "—") + " · " + esc(SOURCE_LABEL[d.source] || d.source) +
    (page ? ' · <b class="pagehit">page ' + page + "</b>" : "") +
    (d.pages ? " · " + d.pages + (d.pages === 1 ? " page" : " pages") : "") +
    (d.needs_ocr ? (d.ocr ? " · scan, read by OCR" : " · scan, no text layer") : "") +
    (d.categories.length ? " · " + esc(d.categories.slice(0, 3).join(", ").trim()) : "") +
    "</div></a>";

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
      const hits = await fullText(query);
      const allowed = new Set(filtered.map((d) => d.i));
      const rows = hits.filter((h) => allowed.has(h.docIdx));
      out.innerHTML = rows.length
        ? '<p class="count-line">' + rows.length + " pages contain every one of those words</p>" +
          rows.map((h) => card(docs[h.docIdx], h.page)).join("")
        : '<p class="empty">No single page contains all of those words. ' +
          "Try fewer words, or switch to matching titles.</p>";
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
