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
  /* The specific tools before the index, or /tools would swallow all of them. */
  { test: /^\/tools\/salary\??(.*)$/, view: (m) => viewSalary(m[1] || ""), nav: "tools" },
  { test: /^\/tools\/savings\??(.*)$/, view: (m) => viewSavings(m[1] || ""), nav: "tools" },
  { test: /^\/tools\/dollar\??(.*)$/, view: (m) => viewDollarOn(m[1] || ""), nav: "tools" },
  { test: /^\/tools/, view: () => viewTools(), nav: "tools" },
  { test: /^\/favourites\??(.*)$/, view: (m) => viewDesk(m[1] || ""), nav: "favourites" },
  { test: /^\/desk\??(.*)$/, view: (m) => viewDesk(m[1] || ""), nav: "favourites" },
  { test: /^\/docs\/(.+)$/, view: (m) => viewDocs(decodeURIComponent(m[1])), nav: "docs" },
  { test: /^\/docs/, view: () => viewDocs(), nav: "docs" },
  { test: /^\/rates/, view: () => viewMPC(), nav: "rates" },
  { test: /^\/data/, view: () => viewData(), nav: "data" },
  { test: /^\/changes/, view: () => viewChanges(), nav: "changes" },
  { test: /^\/about/, view: () => viewAbout(), nav: "about" },
];

/* ---------- pre-rendered pages ----------
 *
 * Most of the site is also published as real files -- dist/s/<id>/index.html
 * and so on -- so that a crawler, and anything that unfurls a link, meets the
 * number rather than an empty shell. Those documents declare MIQYAS_PAGE, the
 * hash route they were rendered for, next to MIQYAS_ROOT.
 *
 * Two things follow. Arriving with no hash, the page routes to itself rather
 * than to the overview. Navigating anywhere else, it hands off to the real app
 * document: staying put would leave a reader at /s/EG.FX.OFF.USD.SELL/#/rates,
 * which renders correctly and then lies to everything that reads the address --
 * the canonical link, the share card, and whoever they paste it to.
 *
 * `replace` rather than `assign`, so the back button returns to wherever they
 * came from rather than to the page they just bounced off.
 */
const PAGE = typeof MIQYAS_PAGE === "string" ? MIQYAS_PAGE : null;
/* The app document for THIS language. An Arabic series page that handed off
 * to the English root would answer a click on an Arabic nav item by
 * switching the reader to English, which is the worst possible reading of
 * "go to rate decisions". */
const HOME_DOC = PAGE ? ROOT + (RTL ? "/ar/" : "/") : "";

async function route() {
  if (PAGE) {
    if (!location.hash || location.hash === "#") {
      history.replaceState(null, "", "#" + PAGE);
    } else if (location.hash.replace(/^#/, "") !== PAGE) {
      location.replace(HOME_DOC + location.hash);
      return;
    }
  }

  const hash = location.hash.replace(/^#/, "") || "/";
  document.querySelectorAll("nav [data-route]").forEach((a) => a.classList.remove("on"));
  document.body.classList.remove("nav-open");

  const match = ROUTES.map((r) => ({ r: r, m: hash.match(r.test) })).find((x) => x.m);

  try {
    if (!match) {
      /* An address that matches nothing is nearly always a link that has lost
       * its tail or come from an older version, and the words left in it are
       * usually enough to find what was meant. Load the catalogue -- no view
       * has run, so nothing else has -- and offer the nearest series before
       * offering the front door. */
      await loadIndex().catch(() => null);
      const near = nearestSeries(hash.replace(/[/?&=]+/g, " "), 5);
      document.getElementById("app").innerHTML =
        '<div class="wrap"><section class="section">' +
        "<h2>" + t("Nothing lives at that address") + "</h2>" +
        '<p class="lede">' + t("The link may be from an older version of the site.") +
        (near.length ? " " + t("This is what it looks closest to.") : "") + "</p>" +
        (near.length
          ? '<div class="near">' +
            near.map((s) =>
              '<a class="result" href="#/s/' + encodeURIComponent(s.series_id) + '">' +
              '<span class="title">' + titleHTML(s) + "</span>" +
              '<span class="sub">' + esc(s.series_id) + "</span></a>").join("") +
            "</div>"
          : "") +
        '<div class="controls">' +
        '<a class="chip solid" href="#/">' + t("Start over") + "</a>" +
        '<a class="chip" href="#/series">' + t("Find or browse series") + "</a>" +
        '<a class="chip" href="#/favourites">' + t("Your favourites") + "</a>" +
        "</div></section></div>";
    } else {
      const active = document.querySelector('[data-route="' + match.r.nav + '"]');
      if (active) active.classList.add("on");
      await match.r.view(match.m);
    }
  } catch (err) {
    /* This used to lead with three python commands, which is the right answer
     * for about four people and gibberish to everyone else. A reader on the
     * published site who hits this is looking at a network failure, not a
     * missing build, so say that first and keep the build instructions for
     * whoever opens the details. */
    document.getElementById("app").innerHTML =
      '<div class="wrap"><section class="section">' +
      "<h2>" + t("Could not load the data") + "</h2>" +
      '<p class="lede">' +
      t("The numbers this page needs did not arrive. Reloading usually fixes it. If it keeps happening, the rest of the site may still work: try the") +
      ' <a href="#/">' + t("overview") + "</a>.</p>" +
      '<div class="controls"><button class="chip solid" id="retry">' + t("Try again") + "</button>" +
      '<a class="chip" href="#/">' + t("Overview") + "</a></div>" +
      '<details class="foot-note"><summary>Running this from a clone?</summary>' +
      "<p>Build the exports first:</p>" +
      '<pre class="code"><code>python ingest/build_exports.py\npython ingest/build_search.py\npython ingest/build_site.py</code></pre>' +
      '<p class="empty">' + esc(String(err && err.message ? err.message : err)) + "</p>" +
      "</details></section></div>";
    const retry = document.getElementById("retry");
    if (retry) retry.addEventListener("click", () => route());
  }
  window.scrollTo(0, 0);
}

/* ---------- theme ----------
 * Three states, not two: light, dark, and whatever the operating system says.
 * The button cycles through all three rather than trapping someone who never
 * wanted to override their system setting.
 */

/* The parameter is `mode`, not `t`: `t` is the translator now, and a local
   binding of that name inside a function that has to call it is a bug waiting
   for whoever adds the next string. */
const applyTheme = (mode) => {
  if (mode) document.documentElement.setAttribute("data-theme", mode);
  else document.documentElement.removeAttribute("data-theme");
  const btn = document.getElementById("theme");
  if (btn) {
    btn.textContent = t(mode === "dark" ? "Dark" : mode === "light" ? "Light" : "Auto");
    btn.title = t("Theme") + ": " + (mode || t("follows your system")) + ".";
  }
};

/* Everything else the site remembers lives under `miqyas.`, through `store`.
 * The theme was the one key written raw, which meant it threw uncaught in a
 * private window and collided with anything else served from this origin.
 * The old key is read once, so nobody loses the choice they already made. */
const themeStored = () => {
  const now = store.get("theme", null);
  if (now !== null) return now;
  let legacy = "";
  try {
    legacy = localStorage.getItem("theme") || "";
    if (legacy) localStorage.removeItem("theme");
  } catch (e) { /* private window: no preference to recover */ }
  if (legacy) store.set("theme", legacy);
  return legacy;
};

applyTheme(themeStored());
document.getElementById("theme").addEventListener("click", () => {
  const order = ["", "light", "dark"];
  const now = store.get("theme", "");
  const next = order[(order.indexOf(now) + 1) % order.length];
  store.set("theme", next);
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

/* What the last scrape actually did, in six words for the strip. Silent when
 * the change log has not been built, which is every clone that has not run
 * build_changes.py and every shallow checkout. */
function changedLine(changed) {
  if (!changed || !changed.date) return "";
  const bits = [];
  if (changed.revised) bits.push(changed.revised + " " + t("restated by CBE"));
  if (changed.moved) bits.push(changed.moved.toLocaleString() + " " + t("numbers moved"));
  if (!bits.length) return "";
  // niceDate, not shortDate: these are single days, and "12 numbers moved on
  // Sep 2026" says the wrong thing about a daily figure.
  const when = changed.date === new Date().toISOString().slice(0, 10)
    ? t("today") : t("on") + " " + niceDate(changed.date);
  return bits.join(", ") + " " + when + " " + ARROW;
}

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
      ? t("Last rebuilt") + " " + staleness(day)
      : t("Rebuilt") + " " + clock + " UTC " + (day === today ? t("today") : t("on") + " " + niceDate(day)),
  ];
  if (s.last_scrape) bits.push(t("CBE last read") + " " + niceDate(s.last_scrape.slice(0, 10)));
  if (s.series) bits.push(s.series.toLocaleString() + " " + t("series"));
  if (s.observations) bits.push(s.observations.toLocaleString() + " " + t("observations"));
  if (s.documents) bits.push(s.documents.toLocaleString() + " " + t("documents"));

  /* The change log gets its entry here rather than a ninth item in the nav.
   * This strip is already about how fresh the page is, it is already on every
   * page, and "what moved" is the question it half answers. The nav must never
   * be what gives way, and it was full.
   *
   * The counts ride along in status.json, which this function already fetched.
   * changes.json is a few hundred kilobytes and no page that is not the change
   * log should be paying for it. */
  const moved = changedLine(s.changed);

  if (strip) {
    strip.className = "freshness" + (stale ? " stale" : "");
    strip.innerHTML =
      '<div class="wrap">' +
      bits.map((b) => "<span>" + esc(b) + "</span>").join("") +
      (moved ? '<a class="moved" href="#/changes">' + esc(moved) + "</a>" : "") +
      (stale ? '<span class="warn">' + t("the daily job may not have run") + "</span>" : "") +
      "</div>";
    strip.hidden = false;
  }
  // The footer keeps the whole line at every width: it is the one place on the
  // page with room, and it is where someone checks provenance.
  if (foot) foot.textContent = bits.join("  ·  ");
}

/* ---------- the language switch ----------
 *
 * English lives at the root and Arabic under /ar/, as two sets of real files
 * rather than one document with a toggle, because a hash cannot be indexed and
 * a reader who pastes an Arabic link expects Arabic to open.
 *
 * So switching is navigation, not state: same route, other directory. The
 * route is carried across, so somebody reading the dollar series in English
 * lands on the dollar series in Arabic rather than back at the front page,
 * which is where a naive switch always drops people.
 */
function wireLanguage() {
  const link = document.getElementById("lang");
  if (!link) return;
  const hash = location.hash || "";
  if (RTL) {
    link.textContent = "EN";
    link.setAttribute("hreflang", "en");
    link.setAttribute("lang", "en");
    link.title = "Read this page in English";
    /* ROOT already points at the site root from wherever this document sits --
     * ".." from /ar/, "../../.." from /ar/s/<id>/ -- so the English site is
     * ROOT itself. Adding another "../" walks out above the site, which is
     * what the first version did. */
    link.href = ROOT + "/" + hash;
  } else {
    link.textContent = "عربي";
    link.title = "اقرأ هذه الصفحة بالعربية";
    link.href = ROOT + "/ar/" + hash;
  }
}

window.addEventListener("hashchange", wireLanguage);

/* ---------- mobile navigation ---------- */

document.getElementById("menu").addEventListener("click", () => {
  document.body.classList.toggle("nav-open");
});

window.addEventListener("hashchange", route);
route();
renderFreshness();
wireLanguage();
