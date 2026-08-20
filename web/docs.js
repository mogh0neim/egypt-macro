/* Document search.
 *
 * Two modes over the same corpus, because the two questions are different
 * shapes. Filtering titles and facets is instant, since documents.json is
 * small enough to hold in memory. Full text goes through the sharded inverted
 * index and fetches only the shards the query's own terms live in.
 *
 * Results are page-level: a 180-page statistical bulletin should surface as
 * "page 42", not as itself.
 */

const SEARCH = "../dist/search";
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

async function loadDocs() {
  if (docState.docs) return docState.docs;
  const [docs, meta] = await Promise.all([
    fetch(`${SEARCH}/documents.json`).then((r) => r.json()),
    fetch(`${SEARCH}/meta.json`).then((r) => r.json()),
  ]);
  docState.docs = docs;
  docState.meta = meta;
  return docs;
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
      docState.shards.set(
        key,
        await fetch(`${SEARCH}/${key}.json`).then((r) => r.json()).catch(() => ({}))
      );
    }
    perTerm.push(docState.shards.get(key)[term] || []);
  }

  // Require every term on the same page and score by summed term frequency.
  // An AND at page level is what keeps results precise on a corpus where
  // "inflation" alone appears on thousands of pages.
  const scored = new Map();
  for (const postings of perTerm) {
    for (const [docIdx, page, tf] of postings) {
      const key = `${docIdx}:${page}`;
      const entry = scored.get(key) || { docIdx, page, score: 0, hits: 0 };
      entry.score += tf;
      entry.hits += 1;
      scored.set(key, entry);
    }
  }
  return [...scored.values()]
    .filter((e) => e.hits === terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
}

async function viewDocs() {
  const app = document.getElementById("app");
  let docs;
  try {
    docs = await loadDocs();
  } catch {
    app.innerHTML = `<div class="wrap"><p class="empty">No search index yet. Run
      <code>python ingest/build_search.py</code>, then reload.</p></div>`;
    return;
  }

  const sources = [...new Set(docs.map((d) => d.source))].sort();
  const years = [...new Set(docs.map((d) => (d.date || "").slice(0, 4)).filter(Boolean))]
    .sort()
    .reverse();
  const cats = [...new Set(docs.flatMap((d) => d.categories))].sort();
  const scanned = docs.filter((d) => d.needs_ocr).length;

  app.innerHTML = `
    <div class="wrap">
      <div class="search-shell">
        <p class="eyebrow">${docs.length.toLocaleString()} documents ·
          ${(docState.meta.pages || 0).toLocaleString()} pages</p>
        <h2 style="font-family:var(--display);margin:.2rem 0 1rem">Search the archive</h2>
        <input class="search" id="dq" autocomplete="off" autofocus
               placeholder="reserve requirement, MPC statement, تحويلات…">
        <div class="controls">
          <button class="chip" data-mode="title" aria-pressed="true">Titles</button>
          <button class="chip" data-mode="full" aria-pressed="false">Full text</button>
          <span class="spacer"></span>
          <select class="chip" id="dsrc"><option value="">All types</option>
            ${sources.map((s) => `<option>${s}</option>`).join("")}</select>
          <select class="chip" id="dcat"><option value="">All topics</option>
            ${cats.map((c) => `<option>${c}</option>`).join("")}</select>
          <select class="chip" id="dyear"><option value="">Any year</option>
            ${years.map((y) => `<option>${y}</option>`).join("")}</select>
        </div>
        <div class="results" id="dresults"></div>
        ${scanned
          ? `<p class="empty">${scanned} of these are scans with no text layer.
             They are findable by title; searching inside them needs OCR.</p>`
          : ""}
      </div>
    </div>`;

  const q = document.getElementById("dq");
  const out = document.getElementById("dresults");
  const pick = (id) => document.getElementById(id).value;
  let mode = "title";

  const passesFacets = (d) =>
    (!pick("dsrc") || d.source === pick("dsrc")) &&
    (!pick("dcat") || d.categories.includes(pick("dcat"))) &&
    (!pick("dyear") || (d.date || "").startsWith(pick("dyear")));

  const card = (d, page) =>
    `<a class="result" href="${d.url}${page ? `#page=${page}` : ""}" target="_blank" rel="noopener">
       <div class="title">${d.title || d.id}</div>
       <div class="sub">${d.date || "—"} · ${d.source}${page ? ` · page ${page}` : ""}${
         d.pages ? ` · ${d.pages} pages` : ""
       }${d.needs_ocr ? " · scan, no text layer" : ""}${
         d.categories.length ? ` · ${d.categories.slice(0, 3).join(", ")}` : ""
       }</div>
     </a>`;

  const run = async () => {
    const query = q.value.trim();
    const filtered = docs.filter(passesFacets);

    if (!query) {
      out.innerHTML = filtered.length
        ? filtered.slice(0, 60).map((d) => card(d)).join("") +
          (filtered.length > 60
            ? `<p class="empty">${(filtered.length - 60).toLocaleString()} more. Narrow it down.</p>`
            : "")
        : `<p class="empty">Nothing matches those filters.</p>`;
      return;
    }

    if (mode === "full") {
      out.innerHTML = `<p class="empty">Searching…</p>`;
      const hits = await fullText(query);
      const allowed = new Set(filtered.map((d) => d.i));
      const rows = hits.filter((h) => allowed.has(h.docIdx));
      out.innerHTML = rows.length
        ? rows.map((h) => card(docs[h.docIdx], h.page)).join("")
        : `<p class="empty">No page contains all of those words.</p>`;
      return;
    }

    const terms = normaliseQuery(query).split(/\s+/);
    const hits = filtered.filter((d) => {
      const hay = normaliseQuery(`${d.title || ""} ${d.categories.join(" ")}`);
      return terms.every((t) => hay.includes(t));
    });
    out.innerHTML = hits.length
      ? hits.slice(0, 60).map((d) => card(d)).join("")
      : `<p class="empty">No title matches “${query}”. Try full text.</p>`;
  };

  q.addEventListener("input", () => { if (mode === "title") run(); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  ["dsrc", "dcat", "dyear"].forEach((id) =>
    document.getElementById(id).addEventListener("change", run));
  app.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      app.querySelectorAll("[data-mode]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x.dataset.mode === mode)));
      run();
    }));
  run();
}

window.viewDocs = viewDocs;
