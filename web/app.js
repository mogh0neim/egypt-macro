/* Miqyas -- router, theme, and the bits of chrome that live outside a view.
 *
 * Hash routing rather than history routing, because the site is static files
 * on a CDN and there is nothing to rewrite a deep URL back to index.html.
 * A hash also survives being pasted into a chat window, which is how most of
 * these links will travel.
 */

const ROUTES = [
  { test: /^\/$/, view: () => viewHome(), nav: "home" },
  { test: /^\/browse/, view: () => viewBrowse(), nav: "browse" },
  { test: /^\/topic\/(.+)$/, view: (m) => viewTopic(decodeURIComponent(m[1])), nav: "browse" },
  { test: /^\/s\/(.+)$/, view: (m) => viewSeries(decodeURIComponent(m[1])), nav: "browse" },
  { test: /^\/money-market/, view: () => viewMoneyMarket(), nav: "browse" },
  { test: /^\/find\??(.*)$/, view: (m) => viewFind(new URLSearchParams(m[1] || "").get("q") || ""), nav: "find" },
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
        '<a class="chip" href="#/browse">Browse by subject</a>' +
        '<a class="chip" href="#/find">Find a series</a>' +
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

/* ---------- masthead search ----------
 * An accelerator, never the only way in. Slash focuses it, escape lets go.
 */

const quick = document.getElementById("quick");
quick.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const v = quick.value.trim();
    location.hash = v ? "#/find?q=" + encodeURIComponent(v) : "#/find";
    quick.blur();
  }
  if (e.key === "Escape") { quick.value = ""; quick.blur(); }
});

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); quick.focus(); }
});

/* ---------- mobile navigation ---------- */

document.getElementById("menu").addEventListener("click", () => {
  document.body.classList.toggle("nav-open");
});

window.addEventListener("hashchange", route);
route();
