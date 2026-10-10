/* Miqyas -- the visit counter, and what the About page says about it.
 *
 * Off unless site.toml names a GoatCounter site code, which build_site.py
 * writes into <meta name="miqyas:goatcounter">. Off, nothing here sends
 * anything. On, each page a reader opens sends GoatCounter one request.
 *
 * What it sends is decided here, not by GoatCounter's script, which is never
 * loaded. Every page is a hash route, and the hash carries what readers type:
 * #/series?q=<a search>, #/tools/salary?amount=<a salary>, #/favourites?s=<a
 * list>. So only the route's name goes, and only a name this site knows:
 * "/tools/salary", "/s/EG.FX.OFF.USD.SELL", never the part after "?", and
 * anything unrecognised as "/not-found". The referring site goes by its
 * address alone, once, on arrival. No cookies, no screen size, no title.
 */

const COUNTER_CODE = (() => {
  const meta = document.querySelector('meta[name="miqyas:goatcounter"]');
  const code = meta ? meta.getAttribute("content") || "" : "";
  // The unfilled "{{GOATCOUNTER}}" of a page served straight from web/ is off.
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(code) ? code : "";
})();

/* The pages that are a name on their own. A route with an id in it is counted
 * with the id only when the id is one this site has. */
const COUNTED_PAGES = ["/", "/series", "/browse", "/find", "/money-market", "/tools",
  "/tools/salary", "/tools/savings", "/tools/dollar", "/favourites", "/desk", "/docs",
  "/rates", "/data", "/changes", "/about"];

function countedPath(hash) {
  let path = String(hash || "").replace(/^#/, "").split("?")[0] || "/";
  try { path = decodeURIComponent(path); } catch (e) { return "/not-found"; }
  if (COUNTED_PAGES.indexOf(path) !== -1) return path;
  const m = path.match(/^\/(s|topic|docs)\/(.+)$/);
  const known = m && (
    m[1] === "s" ? !!(state.byId && state.byId.has(m[2]))
    : m[1] === "topic" ? TOPICS.some((x) => x.key === m[2])
    : typeof COLLECTIONS !== "undefined" && COLLECTIONS.some((c) => c.cat === m[2]));
  return known ? path : "/not-found";
}

let counterArrived = false;

function countPage(hash) {
  if (!COUNTER_CODE || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  const params = new URLSearchParams({ p: (RTL ? "/ar" : "") + countedPath(hash) });
  if (!counterArrived && document.referrer) {
    try {
      const from = new URL(document.referrer);
      if (from.origin !== location.origin) params.set("r", from.origin);
    } catch (e) { /* no referrer worth sending */ }
  }
  counterArrived = true;
  params.set("rnd", Math.random().toString(36).slice(2, 8));
  try {
    fetch("https://" + COUNTER_CODE + ".goatcounter.com/count?" + params.toString(), {
      mode: "no-cors", credentials: "omit", cache: "no-store", keepalive: true, referrerPolicy: "origin",
    }).catch(() => {});
  } catch (e) { /* a count is never worth an error */ }
}

/* The privacy paragraph for the About page. It says what is true for this
 * build: with the counter off, that nothing is counted; with it on, exactly
 * what goes to GoatCounter. */
function privacyNote() {
  return (
    '<h3 id="privacy">' + t("Privacy") + "</h3><p>" +
    (COUNTER_CODE
      ? t("Miqyas sets no cookies.") + " " +
        t("It counts visits with GoatCounter, the only other site a page load contacts; the pages, the fonts and the data all come from this site's own address.") + " " +
        t("For each page you open, GoatCounter is sent the name of the page, such as /tools/salary, never what you typed into it, and, when you arrive, the address of the site that linked you here, without the rest of its link.") + " " +
        t("Your browser also sends it what every request carries: your IP address and the kind of browser you use.") + " " +
        t("What GoatCounter keeps is set out in") +
        ' <a href="https://www.goatcounter.com/help/privacy" target="_blank" rel="noopener">' +
        t("its privacy policy") + "</a>."
      : t("Miqyas counts no visits and sets no cookies.") + " " +
        t("The pages, the fonts and the data all come from this site's own address, so opening a page tells no other site that you did.")) +
    "</p><p>" +
    t("Your favourites and settings are kept in this browser and never sent anywhere.") + " " +
    t("Nothing you type into a search box or a calculator is sent to any other site. Where it is kept in the page's address, so that an answer can be shared as a link, it sits after the # sign, which browsers do not send to any site.") + " " +
    t("Links to cbe.org.eg and GitHub take you to those sites, under their own terms.") +
    "</p>"
  );
}
