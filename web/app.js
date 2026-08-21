/* Miqyas -- router, theme, and the bits of chrome that live outside a view.
 *
 * Hash routing rather than history routing, because the site is static files
 * on a CDN and there is nothing to rewrite a deep URL back to index.html.
 * A hash also survives being pasted into a chat window, which is how most of
 * these links will travel.
 */

const ROUTES = [
  { test: /^\/$/, view: () => viewHome(), nav: "home" },
  /* Search and browse used to be two pages, which is why the site could not say
   * where series lived. They are one page now. The old addresses still work,
   * because they are in shared links and in a year of chat history. */
  { test: /^\/series\??(.*)$/, view: (m) => viewSeriesIndex(new URLSearchParams(m[1] || "").get("q") || ""), nav: "series" },
  { test: /^\/browse/, view: () => viewSeriesIndex(""), nav: "series" },
  { test: /^\/find\??(.*)$/, view: (m) => viewSeriesIndex(new URLSearchParams(m[1] || "").get("q") || ""), nav: "series" },
  { test: /^\/topic\/(.+)$/, view: (m) => viewTopic(decodeURIComponent(m[1])), nav: "series" },
  { test: /^\/s\/(.+)$/, view: (m) => viewSeries(decodeURIComponent(m[1])), nav: "series" },
  { test: /^\/money-market/, view: () => viewMoneyMarket(), nav: "series" },
  { test: /^\/favourites\??(.*)$/, view: (m) => viewDesk(m[1] || ""), nav: "favourites" },
  { test: /^\/desk\??(.*)$/, view: (m) => viewDesk(m[1] || ""), nav: "favourites" },
  { test: /^\/docs\/(.+)$/, view: (m) => viewDocs(decodeURIComponent(m[1])), nav: "docs" },
  { test: /^\/docs/, view: () => viewDocs(), nav: "docs" },
  { test: /^\/rates/, view: () => viewMPC(), nav: "rates" },
  { test: /^\/data/, view: () => viewData(), nav: "data" },
  { test: /^\/about/, view: () => viewAbout(), nav: "about" },
];

async function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  document.querySelectorAll("nav [data-route]").forEach((a) => a.classList.remove("on"));
  document.body.classList.remove("nav-open");

  const match = ROUTES.map((r) => ({ r: r, m: hash.match(r.test) })).find((x) => x.m);

  try {
    if (!match) {
      document.getElementById("app").innerHTML =
        '<div class="wrap"><section class="section">' +
        "<h2>Nothing lives at that address</h2>" +
        '<p class="lede">The link may be from an older version of the site.</p>' +
        '<div class="controls">' +
        '<a class="chip solid" href="#/">Start over</a>' +
        '<a class="chip" href="#/series">Find or browse series</a>' +
        '<a class="chip" href="#/favourites">Your favourites</a>' +
        "</div></section></div>";
    } else {
      const active = document.querySelector('[data-route="' + match.r.nav + '"]');
      if (active) active.classList.add("on");
      await match.r.view(match.m);
    }
  } catch (err) {
    document.getElementById("app").innerHTML =
      '<div class="wrap"><section class="section">' +
      "<h2>Could not load the data</h2>" +
      '<p class="lede">If you are running this from a clone, build the exports first:</p>' +
      '<pre class="code"><code>python ingest/build_exports.py\npython ingest/build_search.py\npython ingest/build_site.py</code></pre>' +
      '<p class="empty">' + String(err && err.message ? err.message : err) + "</p>" +
      "</section></div>";
  }
  window.scrollTo(0, 0);
}

/* ---------- theme ----------
 * Three states, not two: light, dark, and whatever the operating system says.
 * The button cycles through all three rather than trapping someone who never
 * wanted to override their system setting.
 */

const applyTheme = (t) => {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  const btn = document.getElementById("theme");
  if (btn) {
    btn.textContent = t === "dark" ? "Dark" : t === "light" ? "Light" : "Auto";
    btn.title = "Theme: " + (t || "follows your system") + ". Click to change.";
  }
};

applyTheme(localStorage.getItem("theme") || "");
document.getElementById("theme").addEventListener("click", () => {
  const order = ["", "light", "dark"];
  const now = localStorage.getItem("theme") || "";
  const next = order[(order.indexOf(now) + 1) % order.length];
  if (next) localStorage.setItem("theme", next);
  else localStorage.removeItem("theme");
  applyTheme(next);
});

/* ---------- the star ----------
 *
 * Delegated once at the root rather than wired per view, because every table on
 * the site rewrites its own rows and a per-row listener would be lost on each
 * render. A single id can appear more than once on a page -- the overview and
 * the money market both list CONIA -- so all of its buttons are updated
 * together, or one would silently disagree with the other.
 */

document.getElementById("app").addEventListener("click", (e) => {
  const button = e.target.closest("[data-star]");
  if (!button) return;
  e.preventDefault();
  const id = button.dataset.star;
  const on = watchToggle(id);

  document.querySelectorAll('[data-star="' + id + '"]').forEach((el) => {
    el.classList.toggle("on", on);
    el.setAttribute("aria-pressed", String(on));
    if (el.classList.contains("star-chip")) {
      el.textContent = on ? "★ On your desk" : "☆ Keep on your desk";
    } else {
      el.textContent = on ? "★" : "☆";
      el.title = on ? "On your desk" : "Keep this on your desk";
      el.setAttribute("aria-label", on ? "Remove from your desk" : "Keep on your desk");
    }
  });

  // The desk is a view of the list being edited, so it gets told. It handles
  // this itself rather than being redrawn from here: a full redraw moves the row
  // out from under the cursor and the next click lands on a detached node.
  if (/^#?\/(favourites|desk)/.test(location.hash) && typeof deskOnStar === "function") {
    deskOnStar(id, on);
  }
});

/* ---------- the freshness strip ----------
 *
 * A mirror that rebuilds itself every morning has to be able to say when it
 * last did. Without it a reader cannot tell a fresh page from a workflow that
 * quietly stopped firing -- and the workflow here has quietly stopped firing
 * before. build_site.py has written status.json on every publish since the
 * first deploy; nothing had ever read it.
 */

async function renderFreshness() {
  const strip = document.getElementById("freshness");
  const foot = document.getElementById("foot-fresh");
  const s = await loadStatus();
  if (!s || !s.built_at) return;

  const day = s.built_at.slice(0, 10);
  const clock = s.built_at.slice(11, 16);
  const today = new Date().toISOString().slice(0, 10);
  const hours = (Date.now() - Date.parse(s.built_at)) / 3600000;

  /* Thirty-six hours rather than twenty-four. The daily job runs at 08:20 UTC,
   * so anyone reading in the hours before it fires is looking at a build that
   * is legitimately a day old, and calling that stale would cry wolf every
   * morning. */
  const stale = hours > 36;

  const bits = [
    stale
      ? "Last rebuilt " + staleness(day)
      : "Rebuilt " + clock + " UTC " + (day === today ? "today" : "on " + niceDate(day)),
  ];
  if (s.last_scrape) bits.push("CBE last read " + niceDate(s.last_scrape.slice(0, 10)));
  if (s.series) bits.push(s.series.toLocaleString() + " series");
  if (s.observations) bits.push(s.observations.toLocaleString() + " observations");
  if (s.documents) bits.push(s.documents.toLocaleString() + " documents");

  if (strip) {
    strip.className = "freshness" + (stale ? " stale" : "");
    strip.innerHTML =
      '<div class="wrap">' +
      bits.map((b) => "<span>" + esc(b) + "</span>").join("") +
      (stale ? '<span class="warn">the daily job may not have run</span>' : "") +
      "</div>";
    strip.hidden = false;
  }
  // The footer keeps the whole line at every width: it is the one place on the
  // page with room, and it is where someone checks provenance.
  if (foot) foot.textContent = bits.join("  ·  ");
}

/* ---------- mobile navigation ---------- */

document.getElementById("menu").addEventListener("click", () => {
  document.body.classList.toggle("nav-open");
});

window.addEventListener("hashchange", route);
route();
renderFreshness();
