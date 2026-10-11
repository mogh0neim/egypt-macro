/* Miqyas -- shared core.
 *
 * Everything more than one view needs: where the data lives, how a number is
 * formatted, how a chart is drawn, and the topic taxonomy that turns 1,300
 * machine-named series into thirteen things a person can click.
 *
 * No framework and no build step. The whole site is rendering over static
 * JSON, which is the right size for a dataset that changes once a day.
 */

/* The site is published with the API as a sibling of index.html. Served from
 * the repo root instead -- which is what `python -m http.server` at the top
 * of a clone gives you -- index.html sits in web/ and the API is one level
 * up. Detect rather than configure, so both work with no flag.
 *
 * The detection reads the path, so it cannot survive a pre-rendered page at a
 * depth of its own: dist/s/EG.FX.OFF.USD.SELL/index.html would compute "." and
 * fetch the API from three levels too shallow. Those pages declare MIQYAS_ROOT
 * ahead of this script and it wins. Nothing else sets it, so the ordinary two
 * cases are unchanged. */
const ROOT = typeof MIQYAS_ROOT === "string" ? MIQYAS_ROOT
  : location.pathname.includes("/web/") ? ".." : ".";
const API = ROOT + "/api/v1";
const SEARCH_BASE = ROOT + "/search";

/* The site's own address, absolute, from wherever this document sits. A
 * pre-rendered page two directories down built its copy-paste API examples
 * from its own path, so /data/ offered /data/api/v1/series.json, which is a
 * 404. ROOT already knows the way up. */
const siteBase = () => new URL(ROOT + "/", location.href).href;

/* The one attribution sentence, in every file a reader takes away. The same
 * words are in ingest/build_exports.py (JSON, Parquet, SQLite, the zip README)
 * and ingest/prerender.py (the pre-rendered pages); change all three together. */
const ATTRIBUTION =
  "Source: Central Bank of Egypt (https://www.cbe.org.eg). Republished by Miqyas, an independent project not affiliated with, endorsed by, or connected to the Central Bank of Egypt. Values are cleaned and dated by Miqyas; check against CBE before citing.";

/* Where a reader reaches the person behind the site: questions, corrections,
 * and requests to take something down. Set here and nowhere else, because it
 * changes when the site gets an address of its own. */
const CONTACT_URL = "https://github.com/mogh0neim/egypt-macro/issues";

/* The removal line, said the same way wherever it is said. */
const removalLine = () =>
  t("If anything here should not be,") + ' <a href="' + CONTACT_URL + '" target="_blank" rel="noopener">' +
  t("contact me") + "</a> " + t("and it will be removed.");

const state = {
  index: null,      // catalogue: one light record per series
  byId: null,
  events: null,
  sparks: null,
  mpc: null,
  calendar: undefined, // when the MPC meets next; null once we know there is none
  status: null,     // built_at, last_scrape, and the headline counts
  cache: new Map(), // full observation arrays, by series id
};

/* ---------- remembered preferences ----------
 *
 * localStorage throws outright in a private window and in some embedded
 * contexts, so every touch is guarded and every read has a default. Nothing
 * kept here is worth a broken page: it is a remembered range and, later, a
 * watchlist.
 */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("miqyas." + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("miqyas." + key, JSON.stringify(value));
    } catch (err) {
      /* nothing to do: the preference is a convenience, not state */
    }
  },
};

/* ---------- favourites ----------
 *
 * A list of series ids in localStorage and nothing more. No account, no server,
 * no sync: this is the difference between a site someone reads once and one they
 * open every morning, and it does not need to be more than a list.
 *
 * Every read goes through store, which swallows the exception a private window
 * throws, so a desk still renders from its defaults rather than showing a blank
 * page to anyone with site data turned off.
 */

const watchGet = () => {
  const raw = store.get("watch", []);
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
};

const watchHas = (id) => watchGet().indexOf(id) !== -1;

const watchSet = (ids) => store.set("watch", ids.slice(0, 200));

/* Returns the new state, so a caller can update its own buttons without reading
 * storage again. */
function watchToggle(id) {
  const ids = watchGet();
  const i = ids.indexOf(id);
  if (i === -1) ids.push(id);
  else ids.splice(i, 1);
  watchSet(ids);
  return i === -1;
}

/* The star, wherever a series is listed. A button rather than a link, because it
 * changes something instead of going somewhere, and because a nested anchor
 * inside a row that is itself a link would be unclickable. */
const starButton = (id) => {
  const on = watchHas(id);
  // Named for its series, so a screen reader going down a table hears which.
  const s = state.byId && state.byId.get(id);
  const name = (s && ((RTL && s.title_ar) || s.title_en)) || id;
  return (
    '<button class="star' + (on ? " on" : "") + '" data-star="' + esc(id) +
    '" aria-pressed="' + on + '" title="' + t(on ? "In your favourites" : "Add to your favourites") +
    '" aria-label="' + esc(t(on ? "Remove from favourites" : "Add to favourites") + ": " + name) + '">' +
    (on ? "★" : "☆") +
    "</button>"
  );
};

/* ---------- formatting ---------- */

const ARABIC_RE = /[؀-ۿ]/;

const esc = (s) =>
  String(s === null || s === undefined ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

/* Digits stay Western on both sites (i18n.js says why). A bare toLocaleString()
 * follows the browser, and a browser set to Egyptian Arabic printed "١٬٣١٨"
 * beside "52.46". Every count goes through this. */
const num = (n) => Number(n || 0).toLocaleString("en-US");

/* t() with its {placeholders} filled. Arabic puts a count or a date where its
 * own grammar wants it, so a sentence is translated whole and filled after,
 * rather than cut into English-shaped pieces around the figure. */
const tf = (key, map) =>
  Object.keys(map || {}).reduce((s, k) => s.split("{" + k + "}").join(map[k]), t(key));

/* A run of Latin text or a signed figure, held left to right inside an Arabic
 * line. Without it "-5,554" printed as "5,554-": a leading minus is neutral and
 * takes the direction of the line around it. LRI and PDI, the same isolate the
 * chart markers use. Nothing on the English site. */
const isoLTR = (s) => (RTL ? "⁦" + s + "⁩" : s);
// The same, as markup, for a fragment that is HTML rather than text.
const bdiLTR = (html) => (RTL ? '<bdi dir="ltr">' + html + "</bdi>" : html);

/* The Arabic title, tidied: CBE pads some of its Arabic labels with runs of
 * spaces. Its tatweel stays; that is how the Bank set the word. */
const arTitle = (s) => String((s && s.title_ar) || "").replace(/\s+/g, " ").trim();

/* The series' name in the page's language, as plain text: for a select, a
 * legend, the browser tab and a citation. On /ar/ that is the Arabic title,
 * which every series now has; the English one is CBE's and stays primary on
 * the English site. */
const titleText = (s) => {
  if (!s) return "";
  if (RTL && arTitle(s)) return arTitle(s);
  return s.title_en || s.series_id || "";
};

/* Titles come out of CBE's own spreadsheets, and a few hundred rows are
 * labelled only in Arabic. Rendering those left-to-right mangles them, so
 * anything with Arabic in it is marked up rather than silently broken.
 *
 * On /ar/ the Arabic title is the label, in headings, tables and search
 * results alike. 223 of them are ours rather than CBE's: the Bank names the
 * Excel archive in Arabic and nothing else, which leaves every exchange rate,
 * every policy rate, every treasury bill and all of inflation unnamed. Those are
 * marked wherever they appear, with a dotted underline and a tooltip, because
 * passing our translation off as the Bank's name for a figure is exactly the
 * kind of small lie this project cannot afford. */
const titleHTML = (s) => {
  if (RTL && arTitle(s)) {
    const mine = s.title_ar_source === "miqyas";
    return '<span lang="ar"' + (mine
      ? ' class="ar-ours" title="' + t("Translated by Miqyas. CBE publishes no Arabic name for this series.") + '"'
      : "") + ">" + esc(arTitle(s)) + "</span>";
  }
  const text = (s && (s.title_en || s.series_id)) || "";
  if (ARABIC_RE.test(text)) return '<span dir="auto">' + esc(text) + "</span>";
  return RTL ? '<span dir="ltr" lang="en">' + esc(text) + "</span>" : esc(text);
};

/* The title in the other language, as a second line under the first, where a
 * reader is identifying a series rather than reading values off one: the
 * series page and search results. Not inside a table, where it would double
 * the height of every row for someone who arrived by browsing a topic and
 * already knows what they are looking at.
 *
 * On the English site that is the Arabic title, marked when it is ours. On
 * /ar/ it is CBE's English title, which is the name the Bank publishes and the
 * one to quote back to it. Nothing is rendered when there is no second title:
 * a placeholder would imply CBE published a name it did not. */
const titleAlt = (s) => {
  if (RTL) {
    if (!arTitle(s) || !s.title_en || s.title_en === arTitle(s)) return "";
    return '<span class="alt-en" dir="ltr" lang="en">' + esc(s.title_en) + "</span>";
  }
  const ar = arTitle(s);
  if (!ar || ar === s.title_en) return "";
  const mine = s.title_ar_source === "miqyas";
  return '<span class="ar' + (mine ? " ar-ours" : "") + '" dir="rtl" lang="ar"' +
    (mine ? ' title="' + t("Translated by Miqyas. CBE publishes no Arabic name for this series.") + '"' : "") +
    ">" + esc(ar) + "</span>";
};

/* digits, when given, overrides the magnitude rule: see digitsFor. */
const fmt = (v, unit, digits) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  // Exact zero gets no decimals at all. "0.0000%" is four digits of precision
  // spent saying nothing, and it appears wherever CBE publishes a zero.
  if (v === 0) digits = 0;
  else if (digits === undefined) digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const out = /percent/i.test(unit || "") ? s + "%" : s;
  // The minus stays on the left on /ar/ (isoLTR).
  return v < 0 ? isoLTR(out) : out;
};

/* One precision for a whole series, set by its largest reading, for places
 * that show one reading after another: a crosshair moving along the current
 * account read "-3,711" and then "349.7", as if the second were measured more
 * finely than the first. */
const digitsFor = (points) => {
  let top = 0;
  for (let i = 0; i < points.length; i++) top = Math.max(top, Math.abs(points[i][1]) || 0);
  return top >= 1000 ? 0 : top >= 100 ? 1 : top >= 1 ? 2 : 4;
};

/* Axis labels are a different problem from values: they should carry exactly
 * as many decimals as the gap between them needs, and never render as "-0".
 * A scale of 1e6 or 1e9 counts the axis in millions or billions, with the same
 * mn and bn the unit tags use; zero needs neither. They stay Latin on an Arabic
 * page, like % and pp: a figure and its multiplier are one token, and an
 * Arabic word inside a left-to-right axis label reads back to front. */
const fmtTick = (v, step, unit, scale) => {
  const k = scale || 1;
  const s0 = step / k;
  const digits = s0 >= 10 ? 0 : s0 >= 1 ? 1 : s0 >= 0.1 ? 2 : 3;
  let s = (v / k).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  if (k > 1 && /[1-9]/.test(s)) s += k === 1e9 ? "bn" : "mn";
  return /percent/i.test(unit || "") ? s + "%" : s;
};

/* A change of 0.1657 EGP is noise on the page; two significant figures says
 * the same thing. Percentages keep their decimal, because 25 basis points is
 * a real decision. */
const fmtChange = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const pct = /percent/i.test(unit || "");
  const digits = pct ? 2 : abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return pct ? s + "pp" : s;
};

/* A change that rounds away to nothing is not a rise. fmtChange has already
 * decided how many decimals the unit deserves, so ask it rather than invent a
 * threshold: whatever it prints as zeros is flat, gets no arrow, and gets no
 * colour. Without this, a 0.001pp move on the 12-month bill renders as
 * "▲ 0.00pp", which claims a rise that did not happen. */
const isFlat = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return true;
  return !/[1-9]/.test(fmtChange(v, unit));
};

const dirClass = (c, unit) => (isFlat(c, unit) ? "" : c > 0 ? "up" : "down");
const dirArrow = (c, unit) => (isFlat(c, unit) ? "" : c > 0 ? "▲" : "▼");

/* The whole change, arrow and all. A flat reading gets a word rather than a
 * signed zero, so a table of held rates reads as held. */
const changeCell = (c, unit) =>
  c === null || c === undefined || Number.isNaN(c)
    ? "—"
    : isFlat(c, unit)
    ? t("flat")
    : dirArrow(c, unit) + " " + fmtChange(c, unit);

/* Short unit tag for places the full string will not fit. */
const UNIT_SHORT = {
  "USD million": "$ mn",
  "USD billion": "$ bn",
  "EUR million": "€ mn",
  "GBP million": "£ mn",
  "EGP million": "EGP mn",
  "EGP billion": "EGP bn",
  "EGP per USD": "EGP / $",
  "EGP per unit of foreign currency": "EGP",
  "percent per annum": "p.a.",
  percent: "%",
  ratio: "ratio",
  index: "index",
  thousand: "thousands",
  number: "count",
  EGP: "EGP",
};
// Through t(), so an Arabic page says مليون جنيه rather than "EGP mn".
const unitShort = (u) => (u ? t(UNIT_SHORT[u] || u) : "");

/* The unit as a tag to set beside a formatted figure. Empty when fmt() has
 * already said it: "14.90%" needs no "%" after it. */
const unitTag = (u) => {
  const short = unitShort(u);
  return short === "%" ? "" : short;
};

const FREQ_LABEL = {
  A: t("Yearly"), Q: t("Quarterly"), M: t("Monthly"), W: t("Weekly"),
  BW: t("Every two weeks"), D: t("Daily"), IRR: t("Only when it changes"),
};

/* What a change is actually measured against. "Since the previous reading" is
 * true of every series and therefore tells you nothing: a dealer reading a
 * daily fixing and an economist reading a quarterly account are being told
 * about very different spans of time. */
const CHANGE_LABEL = {
  A: t("on the year"), Q: t("on the quarter"), M: t("on the month"),
  W: t("on the week"), BW: t("on two weeks"), D: t("on the day"),
  IRR: t("since it moved"),
};
const changeLabel = (freq) => CHANGE_LABEL[freq] || t("on the previous reading");

/* Abbreviated in English, written out in Arabic: Arabic has no convention for
 * a three-letter month, and the full names are short enough to set in a table. */
const MONTHS = RTL
  ? MONTHS_AR
  : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const niceDate = (iso) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0];
};
/* Written out in full on purpose. "Aug 26" is read as the twenty-sixth of
 * August by most people and by every non-native reader, and it means August
 * 2026. Two characters is a cheap price for not being ambiguous about a date
 * on a page of interest rates. */
const shortDate = (iso) => {
  if (!iso) return "—";
  const p = iso.split("-");
  return MONTHS[+p[1] - 1] + " " + p[0];
};

/* What a reading is for, said at the size of its period. A monthly reading
 * dated the 1st printed as "1 Jun 2026", which reads as a day; a fiscal year
 * dated 30 June printed as "30 Jun 2020", which reads as calendar 2020 when it
 * is July 2019 to June 2020. So: a day for daily and irregular series, a month
 * for a monthly one, the calendar quarter for a quarterly one (Q2 2026 is April
 * to June, whatever fiscal year it falls in), and FY2019/20 for a year that
 * ends on 30 June. Decided from the date as well as the frequency, because a
 * few series filed as quarterly carry month-end readings, and a date that is
 * not a period end keeps its day. */
const AR_QUARTERS = ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];
const fiscalYear = (y) =>
  RTL ? "العام المالي " + isoLTR((y - 1) + "/" + y) : "FY" + (y - 1) + "/" + String(y).slice(2);

/* Series dated by the day CBE released them rather than by the period they
 * describe: net international reserves is read out of a press release, and
 * its date is the release's. Its readings keep their day. */
const RELEASE_DATED = ["EG.RES.NIR"];

function periodLabel(iso, s) {
  if (!iso) return "—";
  const freq = s && s.freq;
  if (!/^[AQM]$/.test(freq || "") || (s && RELEASE_DATED.indexOf(s.series_id) !== -1)) return niceDate(iso);
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const monthEnd = d === new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (freq === "A" && monthEnd && m === 6) return fiscalYear(y);
  if (freq === "A" && monthEnd && m === 12) return String(y);
  if (freq === "Q" && monthEnd && m % 3 === 0) {
    return RTL ? AR_QUARTERS[m / 3 - 1] + " " + y : "Q" + m / 3 + " " + y;
  }
  return d === 1 || monthEnd ? shortDate(iso) : niceDate(iso);
}

/* The newest reading on a tile or in an As of column: the period it is for,
 * or, where the date is not a period, what the date is. Release dates are not
 * recorded for monthly and quarterly series, so those say the period only. */
function whenLabel(s) {
  if (!s || !s.last) return "—";
  if (RELEASE_DATED.indexOf(s.series_id) !== -1) return t("released") + " " + niceDate(s.last);
  if (s.freq === "IRR") return t("in force since") + " " + niceDate(s.last);
  // The auction series are dated by the bills' issue date.
  if (s.family === "govt" && s.freq === "W") return t("issued") + " " + niceDate(s.last);
  if (/^[AQM]$/.test(s.freq || "")) return t("for|a period") + " " + periodLabel(s.last, s);
  return niceDate(s.last);
}

/* A count of days, weeks, months or years in words. Arabic counts in four
 * forms: يوم واحد, يومين, 3 to 10 أيام, then 11 يومًا. Gluing one form to every
 * number gave "4 يومًا مضت" and "1 سنوات مضت". */
const AR_COUNT = {
  day: ["يوم واحد", "يومين", "أيام", "يومًا"],
  week: ["أسبوع واحد", "أسبوعين", "أسابيع", "أسبوعًا"],
  month: ["شهر واحد", "شهرين", "أشهر", "شهرًا"],
  year: ["سنة واحدة", "سنتين", "سنوات", "سنة"],
};
function countWords(n, unit) {
  if (!RTL) return n + " " + unit + (n === 1 ? "" : "s");
  const f = AR_COUNT[unit];
  return n === 1 ? f[0] : n === 2 ? f[1] : n <= 10 ? n + " " + f[2] : n + " " + f[3];
}

/* "3 days ago" is the fastest way to tell a live daily series from a
 * quarterly one that is two revisions behind. */
const staleness = (iso) => {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 1) return t("today");
  const ago = (n, unit) => t("{n} ago").replace("{n}", countWords(n, unit));
  if (days < 14) return ago(days, "day");
  if (days < 60) return ago(Math.round(days / 7), "week");
  if (days < 730) return ago(Math.round(days / 30), "month");
  return ago(Math.floor(days / 365), "year");
};

/* Arabic search matching. It lives here rather than beside the document search
 * because three separate searches need it: document titles, full text, and the
 * command palette.
 *
 * Must match normalise() in ingest/extract_text.py exactly. If the two drift
 * apart, Arabic queries silently return nothing. The table and the dropped
 * marks below are that function's, character for character: Persian letter
 * forms fold to Arabic ones, Arabic punctuation becomes a space, and the Arabic
 * decimal separator becomes a point, so "9٫5" and "9.5" are one number. */
const SEARCH_DROP = /[\u0610-\u061a\u061c\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200b-\u200f]/g;
const SEARCH_DROP_ONE = new RegExp(SEARCH_DROP.source);
const SEARCH_FOLD = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
  "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
  "ی": "ي", "ې": "ي", "ے": "ي", "ک": "ك", "گ": "ك",
  "ھ": "ه", "ہ": "ه", "ۀ": "ه", "ە": "ه",
  "،": " ", "؛": " ", "؟": " ", "۔": " ",
  "٫": ".", "٬": ",", "٪": "%",
};
const SEARCH_FOLD_RE = new RegExp("[" + Object.keys(SEARCH_FOLD).join("") + "]", "g");
const foldDigit = (d) => String(d.charCodeAt(0) - (d >= "۰" ? 0x06f0 : 0x0660));

const normaliseQuery = (s) =>
  s
    .normalize("NFKC")
    .replace(SEARCH_DROP, "")
    .replace(SEARCH_FOLD_RE, (c) => SEARCH_FOLD[c])
    .replace(/[٠-٩۰-۹]/g, foldDigit)
    .toLowerCase()
    .trim();

/* The same folding, done a character at a time, recording which input character
 * produced each output character.
 *
 * A match found in folded text is at a different offset from the same match in
 * the original, because dropping diacritics changes the length. That map is what
 * lets a search hit be highlighted in the text CBE actually printed rather than
 * in our folded copy of it.
 *
 * It has to agree with normaliseQuery above, character for character. The fast
 * regex version stays separate because it runs over the whole catalogue and this
 * one runs over a handful of pages.
 *
 * Indices are into the NFKC form, which is returned for the same reason.
 */
function normaliseWithMap(input) {
  const nfkc = String(input).normalize("NFKC");
  const out = [];
  const map = [];
  for (let i = 0; i < nfkc.length; i++) {
    const c = nfkc[i];
    // Harakat, superscript alef, tatweel and the invisible marks are dropped,
    // not replaced.
    if (SEARCH_DROP_ONE.test(c)) continue;
    let r;
    if (Object.prototype.hasOwnProperty.call(SEARCH_FOLD, c)) r = SEARCH_FOLD[c];
    else if ((c >= "٠" && c <= "٩") || (c >= "۰" && c <= "۹")) r = foldDigit(c);
    else r = c.toLowerCase();
    // toLowerCase can lengthen a character. Keep one map entry per output
    // character or the two fall out of step and every offset after it is wrong.
    for (const ch of r) {
      out.push(ch);
      map.push(i);
    }
  }
  return { nfkc: nfkc, text: out.join(""), map: map };
}

/* From folded text to index terms, as ingest/build_search.py does it: numbers
 * whole, decimals included and thousands commas dropped, then words; Arabic
 * words lose the article and a sound-plural ending. Both sides must agree, or a
 * term is looked up in a shard it was never written to. */
const SEARCH_TOKEN = /[0-9]+(?:,[0-9]{3})+(?:\.[0-9]+)?(?![0-9])|[0-9]+\.[0-9]+|[a-z0-9\u0621-\u063a\u0641-\u064a\u0671-\u06d3]+/g;
const AR_PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال"];
const AR_SUFFIXES = ["ات", "ون", "ين"];

function stemArabic(term) {
  if (!(term[0] >= "\u0621" && term[0] <= "\u06d3")) return term;
  for (const p of AR_PREFIXES) {
    if (term.startsWith(p) && term.length - p.length >= 2) { term = term.slice(p.length); break; }
  }
  for (const s of AR_SUFFIXES) {
    if (term.endsWith(s) && term.length - s.length >= 4) { term = term.slice(0, -s.length); break; }
  }
  return term;
}

/* A query as the document index would have stored it: [{ word, key }], where
 * the word is what the reader typed (folded) and the key is the index term. */
const indexTerms = (query) =>
  (normaliseQuery(query).match(SEARCH_TOKEN) || [])
    .map((w) => w.replace(/,/g, ""))
    .filter((w) => w.length >= 2 && w.length <= 28)
    .map((w) => ({ word: w, key: stemArabic(w) }));

/* ---------- finding a series ----------
 *
 * The catalogue is in CBE's order, and CBE files "CPI - Tobacco" ahead of the
 * headline rate, so a list of matches in catalogue order buried the number
 * people came for: headline CPI was 27th for "cpi", total external debt last of
 * 54. Matches are ranked instead, the same way in the Series page, the
 * favourites panel and the palette: how well the words land, then whether the
 * series is one of the few everybody wants, then whether it is still updated,
 * then how much history it has.
 */

/* The numbers people come for. Daily series by id; the Excel archive by what
 * the catalogue says, because its ids are still being reworked. The first entry
 * that fits wins, so the headline rate outranks its siblings. */
const SERIES_HEADLINE = [
  { tier: 3, test: (s) => s.series_id === "EG.CPI.HDL.YOY" },
  { tier: 2, test: (s) => /^EG\.CPI\.HDL\./.test(s.series_id) },
  { tier: 3, test: (s) => s.series_id === "EG.FX.OFF.USD.SELL" },
  { tier: 2, test: (s) => s.series_id === "EG.FX.OFF.USD.BUY" },
  { tier: 3, test: (s) => /^EG\.RATE\.ON\.(DEP|LEND)$/.test(s.series_id) },
  { tier: 2, test: (s) => s.series_id === "EG.RATE.MAIN" || s.series_id === "EG.RATE.DISCOUNT" },
  { tier: 3, test: (s) => s.series_id === "EG.SDDS.RES.NIR" },
  { tier: 3, test: (s) => s.family === "external_debt" && /total external debt\s*$/i.test(s.title_en || "") },
  { tier: 3, test: (s) => s.family === "gdp" && /gdp at market prices\s*$/i.test(s.title_en || "") },
  { tier: 2, test: (s) => /^EG\.TB\.EGP\.\d+M\.YLD\.WAVG$/.test(s.series_id) },
];

/* The words the market uses where CBE's titles use others. Matched as if they
 * were in the title, Arabic included. */
const SERIES_WORDS = [
  { test: (s) => /treasury bill|t-bill/i.test(s.title_en || ""), words: "t-bill t-bills tbill tbills" },
  { test: (s) => /\b12[- ]month/i.test(s.title_en || ""), words: "364 365 1y one-year" },
  { test: (s) => /\b9[- ]month/i.test(s.title_en || ""), words: "273 9m" },
  { test: (s) => /\b6[- ]month/i.test(s.title_en || ""), words: "182 6m" },
  { test: (s) => /\b3[- ]month/i.test(s.title_en || ""), words: "91 3m" },
  { test: (s) => s.family === "policy",
    words: "policy rate mpc corridor interest key rate سعر الفائدة الكوريدور لجنة السياسة النقدية" },
  { test: (s) => /\(\s*M2\s*\)/i.test(s.title_en || ""), words: "money supply broad money عرض النقود" },
  { test: (s) => /\.USD\./.test(s.series_id) || /us dollar/i.test(s.title_en || ""), words: "usd us$ dollar دولار" },
  { test: (s) => s.family === "fx", words: "egp pound جنيه" },
  { test: (s) => s.series_id === "EG.RES.NIR", words: "nir fx foreign reserves الاحتياطي النقدي" },
  { test: (s) => s.family === "gdp" && /gdp at market prices/i.test(s.title_en || ""), words: "growth output" },
];

/* Broken plurals in CBE's Arabic titles, folded, with the singular a reader
 * types. No ending comes off "أسعار" to leave "سعر", so "سعر الصرف" found
 * nothing until the title carried both. */
const AR_PLURALS = [
  ["اسعار", "سعر"], ["ودايع", "وديعه"], ["قروض", "قرض"], ["اصول", "اصل"],
  ["ديون", "دين"], ["بنوك", "بنك"], ["اوراق", "ورقه"], ["عملاء", "عميل"],
];

const SERIES_HAY = new WeakMap();
function seriesHay(s) {
  let h = SERIES_HAY.get(s);
  if (!h) {
    const words = SERIES_WORDS.filter((w) => w.test(s)).map((w) => w.words).join(" ");
    const head = SERIES_HEADLINE.find((x) => x.test(s));
    let text = normaliseQuery(s.series_id + " " + (s.title_en || "") + " " + (s.title_ar || "") + " " + words);
    AR_PLURALS.forEach((p) => { if (text.indexOf(p[0]) !== -1) text += " " + p[1]; });
    h = { text: text, tier: head ? head.tier : 0 };
    SERIES_HAY.set(s, h);
  }
  return h;
}

/* Query words for the series boxes. Matching is by substring, so a stem finds
 * every form of the word: the Arabic article and sound plural come off ("التضخم"
 * finds تضخم, "الاحتياطيات" finds الاحتياطي), and so does an English plural s
 * ("rates" finds Rate). */
const seriesTerms = (query) =>
  normaliseQuery(query).split(/\s+/).filter(Boolean).map((w) =>
    /^[\u0621-\u06d3]/.test(w) ? stemArabic(w)
      : w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);

/* Where a match starts a word, it is a real match; one in the middle of a token
 * is usually a coincidence. In Arabic a word can also start after the article. */
function startsWord(hay, at) {
  const edge = (i) => i <= 0 || /[\s\-./(,:+]/.test(hay[i - 1]);
  if (edge(at)) return true;
  if (hay.slice(at - 2, at) !== "ال") return false;
  return edge(at - 2) || (/[وبفكل]/.test(hay[at - 3] || "") && edge(at - 3));
}

/* A score, or null when some word is missing. */
function seriesScore(s, terms) {
  const h = seriesHay(s);
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (let at = h.text.indexOf(term), n = 0; at !== -1 && n < 20 && best < 20; n++) {
      best = Math.max(best, startsWord(h.text, at) ? 20 : 8);
      at = h.text.indexOf(term, at + 1);
    }
    if (!best) return null;
    score += best;
  }
  return score +
    h.tier * 40 +
    (s.stale_days ? 0 : 25) +
    Math.min(15, 5 * Math.log10((s.n || 0) + 1)) -
    // An Arabic line label in the English title is a sub-line CBE left untranslated.
    (ARABIC_RE.test(s.title_en || "") ? 10 : 0);
}

function rankSeries(query) {
  const terms = seriesTerms(query);
  if (!terms.length) return [];
  return (state.index || [])
    .map((s, i) => ({ s: s, i: i, score: seriesScore(s, terms) }))
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.s);
}

/* ---------- nearest matches ----------
 *
 * For the states where something was asked for and is not there: a series id
 * that no longer exists, or an address nothing lives at. `searchSeries` is the
 * wrong tool for those, because it requires every term to match and the input
 * here is usually a mangled or stale identifier rather than a query.
 *
 * So: split on anything that is not a letter or a digit -- which turns
 * EG.FX.OFF.USD.SELL into five usable tokens -- and rank on how many of them
 * land, longest token first, because "remittances" says far more than "eg".
 * One match is enough to be worth offering; nothing matching returns nothing,
 * and the caller falls back to the topics.
 */
function nearestSeries(text, limit) {
  const tokens = [...new Set(normaliseQuery(text).split(/[^a-z0-9؀-ۿ]+/).filter((t) => t.length > 1))];
  if (!tokens.length) return [];
  const scored = [];
  for (const s of state.index || []) {
    const hay = normaliseQuery(s.series_id + " " + (s.title_en || "") + " " + (s.title_ar || ""));
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += t.length;
    if (score) scored.push({ s: s, score: score });
  }
  scored.sort((a, b) => b.score - a.score || (b.s.n || 0) - (a.s.n || 0));
  return scored.slice(0, limit || 5).map((x) => x.s);
}

/* ---------- the topic taxonomy ----------
 *
 * The catalogue's `family` comes from whichever CBE page or spreadsheet tab a
 * series arrived on, which is an accident of their site rather than a way
 * anyone thinks about the economy. This maps those onto thirteen topics that
 * read like questions people actually have.
 */

const TOPICS = [
  { key: "money", name: t("Foreign exchange"), icon: "£",
    blurb: t("Official, market and interbank exchange rates for the dollar and other major currencies."),
    families: ["fx"] },
  { key: "rates", name: t("Interest rates"), icon: "%",
    blurb: t("The CBE corridor, overnight money, and what treasury bills pay at auction."),
    families: ["policy", "rates", "govt", "interest_rates"] },
  { key: "prices", name: t("Inflation"), icon: "↗",
    blurb: t("Headline and core inflation, the basket underneath them, and producer prices."),
    families: ["prices", "inflation"] },
  { key: "reserves", name: t("Reserves and remittances"), icon: "◆",
    blurb: t("Net international reserves and what they hold, month by month from CBE's own file, and what Egyptians abroad send home, read from CBE's press releases."),
    families: ["external"] },
  { key: "bop", name: t("Balance of payments"), icon: "⇄",
    blurb: t("The current account, trade in goods and services, and how the gap is financed."),
    families: ["bop"] },
  { key: "trade", name: t("Foreign trade"), icon: "⇢",
    blurb: t("Exports and imports, by commodity and by trading partner."),
    families: ["foreign_trade"] },
  { key: "debt", name: t("Debt"), icon: "≡",
    blurb: t("Domestic and external debt, by holder, by instrument and by maturity."),
    families: ["domestic_debt", "external_debt"] },
  { key: "budget", name: t("The state budget"), icon: "▤",
    blurb: t("Revenue, spending, the deficit, and where the financing comes from."),
    families: ["state_budget"] },
  { key: "growth", name: t("Growth and investment"), icon: "▲",
    blurb: t("GDP by sector at current and constant prices, and investment by sector."),
    families: ["gdp", "investments"] },
  { key: "banking", name: t("Banks"), icon: "▮",
    blurb: t("Deposits, lending, the banking survey, and the payment systems CBE runs."),
    families: ["banking_surveys", "cbe"] },
  { key: "markets", name: t("The stock market"), icon: "◈",
    blurb: t("EGX indicators, turnover, and who is doing the buying."),
    families: ["stocks"] },
  { key: "fdi", name: t("Foreign investment"), icon: "⊕",
    blurb: t("Net foreign direct investment, by source country and by sector."),
    families: ["net_foreign_direct_investment"] },
  { key: "tourism", name: t("Tourism"), icon: "☀",
    blurb: t("Arrivals and nights, by nationality and by region."),
    families: ["tourism"] },
];

const TOPIC_OF_FAMILY = {};
TOPICS.forEach((t) => t.families.forEach((f) => (TOPIC_OF_FAMILY[f] = t.key)));
const topicOf = (s) => TOPIC_OF_FAMILY[s.family] || "other";
const topicByKey = (k) => TOPICS.find((t) => t.key === k);

/* Series titles are "<table> - <line>", because that is how CBE's own sheets
 * are laid out. Splitting on it recovers the table, which is the unit people
 * browse: "Egypt's Balance of Payments", not 68 loose lines. */
const tableOf = (s) => {
  const t = s.title_en || "";
  const i = t.indexOf(" - ");
  return i > 0 ? t.slice(0, i) : t || s.dataset || "Other";
};
const lineOf = (s) => {
  const t = s.title_en || s.series_id;
  const i = t.indexOf(" - ");
  return i > 0 ? t.slice(i + 3) : t;
};

/* The line and the table, in the page's language. CBE's Arabic titles for
 * the Excel archive name the line and nothing else, so its tables have no
 * Arabic name and stay English on /ar/, held left to right. The titles
 * Miqyas wrote carry both halves, and keep their mark. */
const splitAR = (s) => {
  const a = arTitle(s), i = a.indexOf(" - ");
  return i > 0 ? [a.slice(0, i), a.slice(i + 3)] : [null, a];
};
const lineText = (s) => (RTL && arTitle(s) ? splitAR(s)[1] : lineOf(s));
const tableText = (s) => (RTL && arTitle(s) && splitAR(s)[0]) || tableOf(s);
const labelHTML = (text, s) => {
  if (RTL && ARABIC_RE.test(text) && s && s.title_ar_source === "miqyas") {
    return '<span lang="ar" class="ar-ours" title="' +
      t("Translated by Miqyas. CBE publishes no Arabic name for this series.") + '">' + esc(text) + "</span>";
  }
  if (ARABIC_RE.test(text)) return '<span dir="auto">' + esc(text) + "</span>";
  return RTL ? '<span dir="ltr" lang="en">' + esc(text) + "</span>" : esc(text);
};
const lineHTML = (s) => labelHTML(lineText(s), s);

/* ---------- data ---------- */

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + " " + url.split("/").pop());
  return r.json();
}

async function loadIndex() {
  if (state.index) return state.index;
  const both = await Promise.all([
    getJSON(API + "/series.json"),
    getJSON(API + "/events.json").catch(() => null),
  ]);
  state.index = both[0];
  state.byId = new Map(state.index.map((s) => [s.series_id, s]));
  state.events = both[1];
  return state.index;
}

async function loadSparks() {
  if (!state.sparks) state.sparks = await getJSON(API + "/sparks.json").catch(() => ({}));
  return state.sparks;
}

async function loadSeries(id) {
  if (state.cache.has(id)) return state.cache.get(id);
  const data = await getJSON(API + "/series/" + encodeURIComponent(id) + ".json");
  state.cache.set(id, data);
  return data;
}

async function loadMPC() {
  if (!state.mpc) state.mpc = await getJSON(API + "/mpc.json").catch(() => null);
  return state.mpc;
}

/* build_site.py writes status.json on every publish: when the site was built,
 * when CBE was last read, and the headline counts. It has been published since
 * the first deploy and nothing has ever fetched it, which is why a mirror
 * rebuilt every morning has never been able to say so. */
async function loadStatus() {
  if (!state.status) state.status = await getJSON(ROOT + "/status.json").catch(() => null);
  return state.status;
}

/* A bare "+16%" above a chart says nothing about what moved or when, so each
 * marker also carries a sentence for the readout to show when the crosshair
 * reaches it. The figure is isolated so an Arabic sentence cannot turn it into
 * "16%+". */
const fxEvents = () =>
  ((state.events && state.events.events) || [])
    .filter((e) => e.type === "fx_move" && Math.abs((e.evidence && e.evidence.pct_change) || 0) >= 8)
    .map((e) => {
      const move = (e.evidence.pct_change > 0 ? "+" : "") + Math.round(e.evidence.pct_change) + "%";
      return {
        date: e.date,
        label: e.label || move,
        size: Math.abs(e.evidence.pct_change),
        note: (e.label ? e.label + ": " : "") + t("Official dollar rate") + " \u2066" + move + "\u2069 " +
          t("in one business day") + ": " + fmt(e.evidence.from) + " " + t("to") + " " +
          fmt(e.evidence.to) + " " + t("on") + " " + niceDate(e.date),
      };
    });

/* events.json has carried four named exchange-rate regimes with their date
 * ranges since it was first generated, and nothing has ever drawn them. They
 * are the difference between a chart of a line going up and a chart of four
 * distinct policy eras. */
const fxRegimes = () =>
  ((state.events && state.events.fx_regimes) || []).map((r) => Object.assign({}, r, { label: t(r.label) }));

/* ---------- the next rate decision ----------
 *
 * Everything else on this site is a record of something that already happened.
 * This is the one file that points forward, and it is the only thing here a
 * reader can put in a diary: eight dates a year, published by CBE, hand-entered
 * because their page renders them client-side and serves them through nothing.
 *
 * Missing is a normal state, not an error. A clone with no build has no
 * calendar, and the calendar runs out every December until next year's dates
 * are added, so every caller must cope with null.
 */
async function loadMPCCalendar() {
  if (state.calendar === undefined) {
    state.calendar = await getJSON(API + "/mpc_calendar.json").catch(() => null);
  }
  return state.calendar;
}

function nextMeeting(calendar) {
  if (!calendar || !calendar.meetings) return null;
  const today = new Date().toISOString().slice(0, 10);
  const ahead = calendar.meetings.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (!ahead.length) return null;
  const date = ahead[0].date;
  /* Both dates read as UTC midnight, so the difference is whole days and does
   * not wobble by one either side of a timezone or a daylight-saving change. */
  const days = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
  return { date: date, days: days, remaining: ahead.length };
}

/* "in 6 days" is useful; "in 0 days" is not, and neither is "in 1 days". */
function countdownWords(days) {
  if (days <= 0) return t("today");
  if (days === 1) return t("tomorrow");
  if (days < 14) return t("in") + " " + countWords(days, "day");
  if (days < 60) return t("in") + " " + countWords(Math.round(days / 7), "week");
  return t("in") + " " + countWords(Math.round(days / 30), "month");
}

/* ---------- the gauge ----------
 * Where a value sits between its own record low and high. It answers "is
 * this a lot?", which a bare number cannot.
 */

function gauge(latest, low, high, opts) {
  opts = opts || {};
  if (latest === null || latest === undefined) return "";
  if (low === undefined || low === null || high === undefined || high === null || high === low) return "";
  const t = Math.max(0, Math.min(1, (latest - low) / (high - low)));
  // Stretching the 82-unit column with CSS would scale its stroke widths with
  // it, so the series page asks for real geometry instead of a fat copy.
  const W = opts.w || 82, H = opts.h || 20, pad = 1;
  const x = pad + t * (W - pad * 2);
  const notches = [0.25, 0.5, 0.75]
    .map((f) => {
      const nx = (pad + f * (W - pad * 2)).toFixed(1);
      return '<line class="notch" x1="' + nx + '" y1="' + (H / 2 - 4) + '" x2="' + nx + '" y2="' + (H / 2 + 4) + '"/>';
    })
    .join("");
  const mid = H / 2;

  /* Where the middle of the record sits, in gold, because it is structure
   * rather than a reading. On the pound this is the whole point: the mark is
   * hard right and the median is hard left, and the gap between them is what
   * twenty years of devaluation looks like in one line. */
  const medianMark =
    opts.median === undefined || opts.median === null
      ? ""
      : (() => {
          const mt = Math.max(0, Math.min(1, (opts.median - low) / (high - low)));
          const mx = (pad + mt * (W - pad * 2)).toFixed(1);
          return '<line class="median" x1="' + mx + '" y1="' + (mid - 6) +
                 '" x2="' + mx + '" y2="' + (mid + 6) + '"/>';
        })();

  return (
    '<svg class="gauge' + (opts.cls ? " " + opts.cls : "") + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' +
    '<rect class="track" x="' + pad + '" y="' + (mid - 2) + '" width="' + (W - pad * 2) + '" height="4" rx="2"/>' +
    '<rect class="fill" x="' + pad + '" y="' + (mid - 2) + '" width="' + (x - pad).toFixed(1) + '" height="4" rx="2"/>' +
    notches +
    medianMark +
    '<line class="mark' + (t < 0.02 ? " low" : "") + '" x1="' + x.toFixed(1) + '" y1="' + (mid - 7) +
    '" x2="' + x.toFixed(1) + '" y2="' + (mid + 7) + '"/>' +
    "</svg>"
  );
}

/* ---------- sparkline ----------
 * Values only, no axis, no labels. Its job is to say "rising, flat, or a
 * cliff in 2016" at a glance, in a list of two hundred rows.
 */

function spark(values, opts) {
  opts = opts || {};
  if (!values || values.length < 2) return '<span class="spark-none" aria-hidden="true"></span>';
  const w = opts.w || 92, h = opts.h || 24;
  const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  const span = hi - lo || 1;
  const step = (w - 3) / (values.length - 1);
  const pts = values.map((v, i) => (1.5 + i * step).toFixed(1) + "," + (h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1));
  const last = pts[pts.length - 1].split(",");
  const rising = values[values.length - 1] >= values[0];
  // A policy rate holds until the next decision, here as on the full chart:
  // each new level is reached by a riser at its own point, not by a slope.
  const line = opts.step
    ? pts.map((p, i) => (i ? pts[i].split(",")[0] + "," + pts[i - 1].split(",")[1] + " " : "") + p)
    : pts;
  return (
    '<svg class="spark ' + (rising ? "up" : "down") + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
    '<polyline points="' + line.join(" ") + '"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.8"/></svg>'
  );
}

/* ---------- charts ---------- */

function decimate(points, target) {
  target = target || 900;
  if (points.length <= target) return points;
  const step = points.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const isMulti = (series) => Array.isArray(series[0]) && Array.isArray(series[0][0]);

// The viewBox width a chart is drawn at on this screen (see lineChart).
const chartWidth = () => Math.min(1000, Math.max(340, Math.round(window.innerWidth * 0.9)));

// The advance of one character of a 10px IBM Plex Mono axis label, in SVG
// units: 0.6em, and a little over so an estimate errs towards room.
const TICK_CH = 6.2;
// The same for the 9.5px regime and event labels.
const LABEL_CH = 5.9;

/* A label on a chart. Charts run left to right in both languages (the
 * stylesheet pins .chart to ltr), so a label that is itself Arabic, a month or
 * a regime, is set right to left inside it, with its anchor swapped so it
 * still lands on the same side of x. Left to inherit the page's direction,
 * a regime name anchored at its band's left edge ran leftwards off the chart. */
function chartText(x, y, cls, anchor, text) {
  const rtl = ARABIC_RE.test(text);
  let a = anchor || "start";
  if (rtl && a !== "middle") a = a === "start" ? "end" : "start";
  return (
    '<text class="' + cls + '" x="' + x + '" y="' + y + '"' +
    (a !== "start" ? ' text-anchor="' + a + '"' : "") + (rtl ? ' direction="rtl"' : "") + ">" +
    esc(text) + "</text>"
  );
}

/* One or two series on shared axes. Comparison has already rebased both to
 * 100 at one date, or kept two series that share a unit as published, before
 * it gets here (comparePair), because putting a level in pounds and a level in
 * dollars on one axis would be a lie told with a straight line. */
function lineChart(series, opts) {
  opts = opts || {};
  const height = opts.height || 300;
  const events = opts.events || [];
  const animate = opts.animate !== false;
  const id = opts.id || "c";
  const unit = opts.unit || "";

  const sets = (isMulti(series) ? series : [series]).map((p) => decimate(p)).filter((p) => p.length);
  if (!sets.length) return '<p class="empty">No observations in this range.</p>';
  if (sets.length === 1 && sets[0].length <= 2) return sparseChart(sets[0], opts);

  // The viewBox is sized to roughly the CSS pixels it will occupy, so one SVG
  // unit is about one screen pixel and a 10px axis label renders at 10px. A
  // fixed 1000-unit box looks right on a desktop and shrinks the type to
  // three pixels on a phone, which is the same as not drawing it.
  const W = opts.width || chartWidth();
  const narrow = W < 700;
  const H = narrow ? Math.round(height * 0.78) : height;
  const m = { t: 18, r: 14, b: 26, l: narrow ? 42 : 58 };

  const allX = sets.reduce((a, s) => a.concat(s.map((p) => Date.parse(p[0]))), []);
  const allY = sets.reduce((a, s) => a.concat(s.map((p) => p[1])), []);
  const x0 = Math.min.apply(null, allX), x1 = Math.max.apply(null, allX);
  let y0 = Math.min.apply(null, allY), y1 = Math.max.apply(null, allY);
  const padY = (y1 - y0) * 0.08 || Math.abs(y1) * 0.1 || 1;
  y0 -= padY; y1 += padY;

  // Guides land on round numbers off a 1/2/5 ladder. Dividing the range into
  // fifths gives labels like 57.566, which reads as noise on a chart frame.
  const rawStep = (y1 - y0) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const step =
    [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((s) => s * mag).find((s) => s >= rawStep) || mag * 10;
  const ticks = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticks.push(v);

  /* Treasury bill auctions are counted in whole pounds, and "180,000,000,000"
   * does not fit a phone's 42-unit margin: it printed as "0,000,000" with the
   * rest off the screen. Past a million the axis counts in mn or bn, and the
   * margin is measured from the widest label actually drawn rather than
   * assumed, so nothing an axis says is ever cut off. */
  const top = Math.max.apply(null, ticks.map(Math.abs).concat([0]));
  const scale = top >= 1e9 && step >= 1e6 ? 1e9 : top >= 1e6 && step >= 1e3 ? 1e6 : 1;
  const tickText = ticks.map((v) => fmtTick(v, step, unit, scale));
  const widest = Math.max.apply(null, tickText.map((s) => s.length).concat([0]));
  m.l = Math.max(m.l, Math.ceil(widest * TICK_CH) + 12);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const px = (t) => m.l + ((t - x0) / (x1 - x0 || 1)) * iw;
  const py = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

  const guides = ticks.map((v, i) => {
    const y = py(v).toFixed(1);
    return (
      '<line class="grid" x1="' + m.l + '" y1="' + y + '" x2="' + (W - m.r) + '" y2="' + y + '"/>' +
      '<text class="tick" x="' + (m.l - 8) + '" y="' + (+y + 3) + '" text-anchor="end">' + tickText[i] + "</text>"
    );
  });
  // A zero line matters on anything that can go negative -- a trade balance
  // crossing it is the whole story -- and is clutter otherwise.
  /* Regimes are a wash behind the plot with their name set inside the top of
   * the band, deliberately at a different visual scale from the event markers:
   * an event is a dashed vertical rule with a figure above the frame, a regime
   * is a wide field with a name in it, so the two can share a chart without
   * competing. A band too narrow to letter keeps the wash and loses the name.
   * "Too narrow" is measured against the name itself: a fixed 150 units let
   * "Post-float managed rate" print across the next band on a phone. The name
   * of whichever regime is under the crosshair is in the readout either way. */
  const shownRegimes = (opts.regimes || [])
    .map((r) => {
      const a = Math.max(x0, Date.parse(r.from));
      const b = Math.min(x1, r.to ? Date.parse(r.to) : x1);
      return b > a ? { a: px(a), b: px(b), label: r.label || "", from: r.from, to: r.to || null } : null;
    })
    .filter(Boolean);
  const regimes = shownRegimes
    .map((r, i) => {
      const w = r.b - r.a;
      const room = 6 + r.label.length * LABEL_CH + 4 <= w;
      return (
        '<rect class="regime' + (i % 2 ? " alt" : "") + '" x="' + r.a.toFixed(1) +
        '" y="' + m.t + '" width="' + w.toFixed(1) + '" height="' + ih + '"/>' +
        (r.label && room ? chartText((r.a + 6).toFixed(1), m.t + 12, "regime-label", "start", r.label) : "")
      );
    })
    .join("");

  const zero =
    y0 < 0 && y1 > 0
      ? '<line class="zero" x1="' + m.l + '" y1="' + py(0).toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + py(0).toFixed(1) + '"/>'
      : "";

  let xTicks = [];
  const span = (x1 - x0) / 31536000000;
  // Roughly one label per 90 units of width, rounded up the 1/2/5/10 ladder,
  // so the year axis does not overprint itself on a narrow screen.
  const wantYears = Math.max(2, Math.floor(iw / (narrow ? 60 : 90)));
  if (span >= 2) {
    const stepY = [1, 2, 5, 10, 25].find((k) => span / k <= wantYears) || 50;
    const startY = new Date(x0).getUTCFullYear();
    for (let y = Math.ceil(startY / stepY) * stepY; Date.UTC(y, 0, 1) <= x1; y += stepY) {
      if (Date.UTC(y, 0, 1) >= x0) xTicks.push([Date.UTC(y, 0, 1), String(y)]);
    }
  } else {
    /* Under two years the axis counts months, or "1 year" on a daily series
     * carried a single label and "This year" none at all. The ladder keeps
     * January on it, and the year is written there and on the first tick, so
     * every label can be placed in time without the year repeated on each. */
    const stepM = [1, 2, 3, 4, 6, 12].find((k) => (span * 12) / k <= wantYears) || 12;
    const d = new Date(x0);
    for (let y = d.getUTCFullYear(), mo = d.getUTCMonth(); Date.UTC(y, mo, 1) <= x1; mo = (mo + 1) % 12, y += mo ? 0 : 1) {
      const at = Date.UTC(y, mo, 1);
      if (at >= x0 && mo % stepM === 0) xTicks.push([at, MONTHS[mo] + (!xTicks.length || !mo ? " " + y : "")]);
    }
    // Too short to hold two month starts: date its two ends instead.
    if (xTicks.length < 2) {
      const day = (at) => { const p = new Date(at).toISOString().slice(0, 10).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1]; };
      xTicks = [[x0, day(x0) + " " + new Date(x0).getUTCFullYear(), "start"], [x1, day(x1), "end"]];
    }
  }
  // Anything that would still touch its neighbour or leave the frame is dropped.
  let tickEnd = -Infinity;
  const years = xTicks.map((k) => {
    const x = px(k[0]), w = k[1].length * TICK_CH, anchor = k[2] || "middle";
    const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
    if (left < tickEnd + 8 || left < 0 || left + w > W) return "";
    tickEnd = left + w;
    return chartText(x.toFixed(1), H - 8, "tick", anchor, k[1]);
  });

  // Devaluations cluster -- November 2016 had three inside three weeks -- so
  // labels are dropped rather than allowed to overprint each other. Room is
  // the label's own width: a fixed 42 units let two "+16%" seven months apart
  // in 2022 print over each other on a phone. The rule stays either way, and
  // the readout says what it marks when the crosshair reaches it.
  // The biggest move is placed first, so the 2016 float's +67% is never the
  // label that loses its place to a +14% from eight months before it.
  const inRange = events
    .filter((e) => { const t = Date.parse(e.date); return t >= x0 && t <= x1; })
    .map((e) => { const o = { date: e.date, label: e.label, note: e.note, size: e.size || 0, x: px(Date.parse(e.date)) }; return o; })
    .sort((a, b) => a.x - b.x);
  const taken = [];
  inRange.slice().sort((a, b) => b.size - a.size).forEach((e) => {
    const label = (e.label || "").slice(0, 22);
    const w = label.length * LABEL_CH, l = e.x - w / 2, r = e.x + w / 2;
    if (!label || l < 0 || r > W || taken.some((s) => l < s[1] + 4 && s[0] < r + 4)) return;
    taken.push([l, r]);
    e.text = label;
  });
  const marks = inRange
    .map((e) => {
      const x = e.x.toFixed(1);
      return (
        '<line class="event" x1="' + x + '" y1="' + m.t + '" x2="' + x + '" y2="' + (m.t + ih) + '"/>' +
        (e.text ? chartText(x, m.t - 5, "event-label", "middle", e.text) : "")
      );
    })
    .join("");

  /* A policy rate holds at the level the committee set until the committee sets
   * another one. Joining two decisions with a straight line says the rate
   * drifted between them, which is a lie about how the corridor works, so a
   * stepped set gets square corners. Per set rather than per chart, because the
   * corridor chart puts stepped policy rates and a daily benchmark on one
   * frame. */
  const stepped = (i) => (Array.isArray(opts.step) ? !!opts.step[i] : !!opts.step);
  // A rate still in force should reach today, not stop on the day it last moved.
  const edge = (W - m.r).toFixed(1);
  const lastX = (data, i) =>
    stepped(i) ? edge : px(Date.parse(data[data.length - 1][0])).toFixed(1);

  const segments = (data, i) => {
    const step = stepped(i);
    const d = data
      .map((p, j) => {
        const x = px(Date.parse(p[0])).toFixed(1), y = py(p[1]).toFixed(1);
        if (!j) return "M" + x + "," + y;
        return step ? "H" + x + "V" + y : "L" + x + "," + y;
      })
      .join("");
    return step ? d + "H" + edge : d;
  };

  // The same run walked right to left, to close a filled shape back along it.
  const backwards = (data, i) => {
    const L = data.length - 1;
    let d = "";
    if (stepped(i)) {
      d += "H" + px(Date.parse(data[L][0])).toFixed(1);
      for (let j = L; j >= 1; j--) {
        d += "V" + py(data[j - 1][1]).toFixed(1) +
             "H" + px(Date.parse(data[j - 1][0])).toFixed(1);
      }
    } else {
      for (let j = L; j >= 0; j--) {
        d += "L" + px(Date.parse(data[j][0])).toFixed(1) + "," + py(data[j][1]).toFixed(1);
      }
    }
    return d;
  };

  /* Two sets that bound a third are a band, not two lines. The corridor is the
   * case this exists for: a floor, a ceiling, and where overnight money
   * actually cleared inside them. */
  let band = "";
  if (opts.band && sets[opts.band[0]] && sets[opts.band[1]]) {
    const li = opts.band[0], hi = opts.band[1];
    const lo = sets[li], up = sets[hi];
    band =
      '<path class="band" d="' + segments(up, hi) +
      "L" + lastX(lo, li) + "," + py(lo[lo.length - 1][1]).toFixed(1) +
      backwards(lo, li) + ' Z"/>';
  }

  const paths = sets
    .map((data, i) => {
      const d = segments(data, i);
      const area =
        i === 0 && sets.length === 1
          ? '<path class="area" d="' + d +
            "L" + lastX(data, i) + "," + py(y0).toFixed(1) +
            "L" + px(Date.parse(data[0][0])).toFixed(1) + "," + py(y0).toFixed(1) + '  Z"/>'
          : "";
      return area + '<path class="line s' + i + (animate ? " draw" : "") + '" d="' + d + '"/>';
    })
    .join("");

  return (
    '<svg class="chart" id="' + id + '" viewBox="0 0 ' + W + " " + H + '" ' +
    'style="--len:' + Math.round(iw * 1.6) + '" data-x0="' + x0 + '" data-x1="' + x1 + '" ' +
    'data-y0="' + y0 + '" data-y1="' + y1 + '" ' +
    'data-w="' + W + '" data-l="' + m.l + '" ' +
    'data-step="' + sets.map((s, i) => (stepped(i) ? 1 : 0)).join(",") + '" ' +
    // What the markers and the regime washes are, for the readout to say.
    (inRange.some((e) => e.note)
      ? 'data-events="' + esc(JSON.stringify(inRange.filter((e) => e.note).map((e) => [e.date, e.note]))) + '" '
      : "") +
    (shownRegimes.length
      ? 'data-regimes="' + esc(JSON.stringify(shownRegimes.map((r) => [r.from, r.to, r.label]))) + '" '
      : "") +
    'role="img" tabindex="0" ' +
    'aria-label="Time series chart, ' + sets[0].length +
    ' points. Use the arrow keys to read values.">' +
    regimes + guides.join("") + zero + years.join("") + band + marks + paths +
    '<g class="hover"></g></svg>'
  );
}

/* One reading is not a line. Drawn as one it was an empty frame with five
 * guides invented around a single number, and two readings joined by a line
 * read as a trend that two numbers cannot show (26 series have one or two).
 * So each reading is a marked point with its value above and its date below,
 * nothing is drawn between them, there is no axis to invent, and one line says
 * why there is nothing more. Two points still sit higher and lower as their
 * values do. */
function sparseChart(data, opts) {
  const unit = opts.unit || "";
  const W = opts.width || chartWidth();
  const H = W < 700 ? 150 : 170;
  const side = data.length === 2 ? Math.round(Math.max(70, W * 0.2)) : Math.round(W / 2);
  const m = { t: 40, r: side, b: 46, l: side };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x0 = Date.parse(data[0][0]), x1 = Date.parse(data[data.length - 1][0]);
  let y0 = Math.min(data[0][1], data[data.length - 1][1]), y1 = Math.max(data[0][1], data[data.length - 1][1]);
  const pad = (y1 - y0) * 0.5 || Math.abs(y1) * 0.1 || 1;
  y0 -= pad; y1 += pad;
  const px = (at) => m.l + ((at - x0) / (x1 - x0 || 1)) * iw;
  const py = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const points = data
    .map((p) => {
      const x = px(Date.parse(p[0])).toFixed(1), y = py(p[1]);
      return (
        '<circle class="point" cx="' + x + '" cy="' + y.toFixed(1) + '" r="4.5"/>' +
        chartText(x, (y - 11).toFixed(1), "point-label", "middle", fmt(p[1], unit)) +
        chartText(x, (y + 19).toFixed(1), "tick", "middle", niceDate(p[0]))
      );
    })
    .join("");
  const note = data.length === 2
    ? t("Two readings only: too few to show a trend.")
    : t("One reading only, so there is no line to draw.");
  return (
    '<svg class="chart sparse" id="' + (opts.id || "c") + '" viewBox="0 0 ' + W + " " + H + '" ' +
    'data-x0="' + x0 + '" data-x1="' + x1 + '" data-y0="' + y0 + '" data-y1="' + y1 + '" ' +
    'data-w="' + W + '" data-l="' + m.l + '" data-r="' + m.r + '" data-t="' + m.t + '" data-b="' + m.b + '" ' +
    'role="img" tabindex="0" aria-label="' + esc(note) + '">' +
    points + chartText((W / 2).toFixed(1), H - 6, "tick", "middle", note) +
    '<g class="hover"></g></svg>'
  );
}

/* The draw-on animation reveals the line by pulling a dash the length of the
 * whole path off it. It needs that length, and the stylesheet can only guess at
 * it from the width of the chart -- which is close enough for a smooth line and
 * badly wrong for a spiky one. CONIA's overnight volume covers 19,838 units
 * inside a 1,485-unit guess, so the dash repeats and the stroke ends up with
 * thirteen holes punched through it, permanently, because the animation holds
 * its end state. Measure the path instead, and take the dash off entirely once
 * the animation is done, so nothing can be left hidden by a stale dasharray. */
function armLines(svg) {
  if (!svg) return;
  svg.querySelectorAll(".line.draw").forEach((p) => {
    const len = Math.ceil(p.getTotalLength());
    if (len) p.style.setProperty("--len", len);
    const undash = () => {
      p.classList.remove("draw");
      p.style.removeProperty("--len");
    };
    p.addEventListener("animationend", undash, { once: true });
    // A hidden tab holds the animation clock at zero, and while it is held the
    // dash covers the entire path, so the chart is blank rather than
    // half-drawn. Losing the reveal costs far less than serving an empty
    // chart, so the dash comes off on a timer whether the animation ran or
    // not. The animation is 900ms plus at most a 240ms delay.
    setTimeout(undash, 2000);
  });
}

/* ---------- drawn again when the width changes ----------
 *
 * A chart's viewBox is sized to the screen it is drawn on, so a phone turned on
 * its side stretched a 340-unit chart across 718 pixels and its 10px axis
 * labels came out at 28. Each view hands over how to draw its chart, and when
 * the width a chart would be drawn at changes it is drawn again, without the
 * draw-on animation. Only the width counts: a phone's address bar showing and
 * hiding fires resize on every scroll and changes nothing but the height.
 */
const sized = [];
let sizedTimer = 0;

function keepSized(slot, draw) {
  if (slot) sized.push({ slot: slot, draw: draw, w: chartWidth() });
}

window.addEventListener("resize", () => {
  clearTimeout(sizedTimer);
  sizedTimer = setTimeout(() => {
    const w = chartWidth();
    for (let i = sized.length - 1; i >= 0; i--) {
      const s = sized[i];
      if (!s.slot.isConnected) sized.splice(i, 1);
      else if (s.w !== w) { s.w = w; s.draw(); }
    }
  }, 150);
});

/* The usual case in one call: draw a chart into its slot, arm and wire it, and
 * keep it sized. chart(animate) returns the markup and wire(svg) hooks up its
 * readout, which is put back as it was before every redraw so a reading left
 * on screen by a tap does not become the resting state. */
function mountChart(slot, readout, chart, wire) {
  if (!slot) return;
  const base = readout ? readout.innerHTML : "";
  const draw = (animate) => {
    slot.innerHTML = chart(animate);
    if (readout) readout.innerHTML = base;
    const svg = slot.querySelector("svg.chart");
    armLines(svg);
    if (svg && wire) wire(svg);
  };
  draw(true);
  keepSized(slot, () => draw(false));
}

/* Crosshair, per-line markers and readout. A touch counts as a pointer, so a
 * phone gets this without a second code path.
 *
 * opts.bandMid: [lo, hi] -- when set 0 is a benchmark read against a band
 * formed by two other sets (the corridor: CONIA against floor/ceiling), the
 * readout gets a live version of the gap-to-midpoint line the page already
 * states once, statically, for the latest reading. */
function wireHover(svg, series, units, readoutEl, labels, opts) {
  if (!svg || !readoutEl) return;
  /* The readout works off the full series, not the decimated set the chart
   * drew. A 5,172-point series is plotted at every sixth day, so reading the
   * drawn points would make one press of the right arrow jump a week and would
   * report the nearest drawn value rather than the real one. Scanning five
   * thousand points on a pointer move costs nothing, and the number under the
   * crosshair is then the number CBE published on that date. */
  const data = isMulti(series) ? series : [series];
  const x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
  const y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
  // The chart chose its own viewBox, margins and value range; read them back
  // rather than assume, or the crosshair and its markers land in the wrong
  // place. Same px()/py() as lineChart(), so a dot lands exactly on the line.
  const W = +svg.dataset.w || 1000;
  const m = { l: +svg.dataset.l || 58, r: +svg.dataset.r || 14, t: +svg.dataset.t || 18, b: +svg.dataset.b || 26 };
  const iw = W - m.l - m.r;
  const vbH = +(svg.getAttribute("viewBox") || "0 0 1000 300").split(/\s+/)[3];
  const ih = vbH - m.t - m.b;
  const px = (t) => m.l + ((t - x0) / (x1 - x0 || 1)) * iw;
  const py = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const g = svg.querySelector(".hover");
  const base = readoutEl.innerHTML;
  const unitList = Array.isArray(units) ? units : [units];

  // Which sets the chart drew as steps, read back like the margins are.
  const steps = (svg.dataset.step || "").split(",").map((s) => s === "1");
  // One precision per set, so a value does not change its decimals as you move.
  const digits = data.map(digitsFor);
  // The markers ([date, what it was]) and regimes ([from, to, name]) it drew.
  const marked = JSON.parse(svg.dataset.events || "[]");
  const eras = JSON.parse(svg.dataset.regimes || "[]");

  /* What each set read at a moment in time. A stepped set holds its value
   * until the next decision, so the honest answer is the last observation on
   * or before the moment: the rate in force, which is what the square-cornered
   * line already draws. Taking the nearest in time instead showed the next
   * decision's rate, dated weeks ahead, for the second half of every gap. A
   * stepped set that had not started yet has no value at all, rather than its
   * first one. Everything else keeps the nearest reading. */
  const nearest = (t) =>
    data.map((sr, k) => {
      if (steps[k]) {
        let held = null;
        for (let i = 0; i < sr.length && Date.parse(sr[i][0]) <= t; i++) held = sr[i];
        return held;
      }
      let best = sr[0], bestD = Infinity;
      for (let i = 0; i < sr.length; i++) {
        const d = Math.abs(Date.parse(sr[i][0]) - t);
        if (d < bestD) { bestD = d; best = sr[i]; }
      }
      return best;
    });

  /* The one number a comparison is actually for. Worded with the series'
   * own labels rather than a signed figure, so which side is ahead never
   * has to be worked out from a plus or a minus sign. fmtChange already
   * appends "pp" for a percent unit; anything else needs its unit said once,
   * or "13.62" reads as a real quantity when it is really index points. */
  const gapUnit = (unit) =>
    /percent/i.test(unit || "") ? "" : unit === "index" ? " " + t("pts") : unitTag(unit) ? " " + unitTag(unit) : "";
  const gapLine = (picks) => {
    if (picks.some((p) => !p)) return "";
    if (opts && opts.bandMid && picks.length > opts.bandMid[1]) {
      const mid = (picks[opts.bandMid[0]][1] + picks[opts.bandMid[1]][1]) / 2;
      const off = picks[0][1] - mid;
      const unit = unitList[0];
      const l0 = esc((labels && labels[0]) || "");
      return isFlat(off, unit)
        ? l0 + " " + t("on the midpoint")
        : l0 + " " + fmtChange(off, unit) + gapUnit(unit) + " " + t(off > 0 ? "above the midpoint" : "below the midpoint");
    }
    if (picks.length === 2 && unitList[0] === unitList[1]) {
      const diff = picks[1][1] - picks[0][1];
      const unit = unitList[0];
      const l0 = esc((labels && labels[0]) || t("the first"));
      const l1 = esc((labels && labels[1]) || t("the second"));
      return isFlat(diff, unit)
        ? t("about even")
        : l1 + " " + fmtChange(diff, unit) + gapUnit(unit) + " " + t(diff > 0 ? "above|one line against another" : "below|one line against another") + " " + l0;
    }
    return "";
  };

  const paint = (picks, at) => {
    // A stepped set is read at the moment itself, so the crosshair stays where
    // it was put rather than jumping back to the decision that set the level.
    const when = Math.max(x0, Math.min(x1, at));
    const bx = steps[0] || !picks[0] ? px(when) : px(Date.parse(picks[0][0]));
    // Each dot uses its own point's date, not the crosshair's shared x -- the
    // corridor's daily benchmark and stepped floor/ceiling do not share dates.
    // A stepped dot sits on its line at the crosshair, where the level is drawn.
    const dots = picks
      .map((p, i) =>
        p
          ? '<circle class="hover-dot s' + i + '" cx="' + (steps[i] ? px(when) : px(Date.parse(p[0]))).toFixed(1) +
            '" cy="' + py(p[1]).toFixed(1) + '" r="3.5"/>'
          : "")
      .join("");
    // The date the reading is for. On a stepped set that is the moment under
    // the crosshair, with the day the level was set when that is a different day.
    const day = steps[0] || !picks[0] ? new Date(when).toISOString().slice(0, 10) : picks[0][0];
    const since = steps[0] && picks.length === 1 && picks[0] && picks[0][0] !== day
      ? '<span class="when">' + t("in force since") + " " + niceDate(picks[0][0]) + "</span>"
      : "";
    /* A regime's name, whether or not its band had room to print it, and what
     * any marker within a few units of the crosshair records. A marker label
     * dropped for room, or a bare "+16%", is otherwise unexplained. */
    const era = eras.find((r) => day >= r[0] && (!r[1] || day <= r[1]));
    const near = marked.filter((e) => Math.abs(px(Date.parse(e[0])) - bx) <= 6).slice(0, 3);
    const context =
      (era ? '<span class="when">' + esc(era[2]) + "</span>" : "") +
      (near.length ? '<span class="mark-note">' + near.map((e) => esc(e[1])).join("; ") + "</span>" : "");
    g.innerHTML =
      '<line class="hover-line" x1="' + bx.toFixed(1) + '" y1="' + m.t + '" x2="' + bx.toFixed(1) + '" y2="' + (vbH - m.b) + '"/>' +
      dots;
    const gap = gapLine(picks);
    readoutEl.innerHTML =
      picks
        .map((p, i) => {
          // The unit rides along with the value, so a rebased index cannot be
          // mistaken for a real level once the static note above it scrolls
          // out of view.
          const tag = unitTag(unitList[i]);
          return (
            '<span class="val' + (i ? " alt" : "") + '">' + fmt(p ? p[1] : null, unitList[i], digits[i]) +
            (tag && p ? ' <i class="u">' + esc(tag) + "</i>" : "") + "</span>" +
            (labels && labels[i] ? '<span class="when">' + esc(labels[i]) + "</span>" : "")
          );
        })
        .join("") +
      (gap ? '<span class="gap">' + gap + "</span>" : "") +
      '<span class="when">' + niceDate(day) + "</span>" + since + context;
  };

  const clear = () => { g.innerHTML = ""; readoutEl.innerHTML = base; };

  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    const rel = ((ev.clientX - box.left) / box.width) * W;
    // A single reading has no width to map across.
    const at = iw > 0 ? x0 + ((rel - m.l) / iw) * (x1 - x0) : x0;
    paint(nearest(at), at);
  };
  svg.addEventListener("pointermove", move);
  /* A finger that taps and lifts sends no move at all, so on a phone the chart
   * only answered a sideways drag. The press reads it too. Nothing here calls
   * preventDefault, and the chart's touch-action leaves vertical panning to
   * the browser, so a swipe that starts on a chart still scrolls the page. */
  svg.addEventListener("pointerdown", move);
  // A mouse or pen clears the reading on leave, as before. A touch does not:
  // the moment a finger lifts is the moment it stops covering the chart, and
  // that is exactly when a phone reader wants the number to still be there.
  svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch") clear(); });

  /* The crosshair used to be mouse-only, so the one interactive thing on the
   * page could not be reached from a keyboard at all. Arrows walk the first
   * set one observation at a time; Home and End jump to the ends; Escape lets
   * go. The chart carries tabindex for this. */
  let idx = -1;
  svg.addEventListener("keydown", (ev) => {
    const n = data[0].length;
    if (ev.key === "ArrowRight") idx = idx < 0 ? n - 1 : Math.min(n - 1, idx + 1);
    else if (ev.key === "ArrowLeft") idx = idx < 0 ? n - 1 : Math.max(0, idx - 1);
    else if (ev.key === "Home") idx = 0;
    else if (ev.key === "End") idx = n - 1;
    else if (ev.key === "Escape") { idx = -1; clear(); return; }
    else return;
    ev.preventDefault();
    // Anchor on set 0 and take whatever the other sets had at that moment, so a
    // comparison reads at one date rather than at two.
    const at = Date.parse(data[0][idx][0]);
    paint(nearest(at), at);
  });
  svg.addEventListener("blur", clear);
}

/* ---------- transformations offered on a series page ---------- */

const TRANSFORMS = {
  level: { label: t("As published"), fn: (p) => p },
  yoy: {
    label: t("Change on a year earlier"),
    fn: (p) => {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const target = Date.parse(p[i][0]) - 31536000000;
        let j = i, bestD = Infinity, best = null;
        while (j >= 0 && Date.parse(p[j][0]) > target - 45 * 86400000) {
          const d = Math.abs(Date.parse(p[j][0]) - target);
          if (d < bestD) { bestD = d; best = p[j]; }
          j--;
        }
        if (best && best[1]) out.push([p[i][0], ((p[i][1] - best[1]) / Math.abs(best[1])) * 100]);
      }
      return out;
    },
  },
  index: {
    label: t("Rebased, first reading = 100"),
    fn: (p) => (p.length && p[0][1] ? p.map((o) => [o[0], (o[1] / p[0][1]) * 100]) : p),
  },
};

/* Both transformations divide by an earlier reading, and that only means
 * something for a level that stays on one side of zero. Inflation is already a
 * change on a year earlier, so taking its change on a year earlier gave 20.83%
 * against a published 14.5%; the current account goes negative, so rebasing it
 * gave -250 and its yearly change an axis to -2,400%. Decided from the unit and
 * the values rather than from a list of ids, so a new series is judged the same
 * way, and a withheld button says why rather than just not being there. */
function transformsFor(unit, observations) {
  let lo = Infinity, hi = -Infinity;
  (observations || []).forEach((o) => {
    if (o[1] < lo) lo = o[1];
    if (o[1] > hi) hi = o[1];
  });
  if (/percent/i.test(unit || "")) {
    return { keys: ["level"], why: t("No year-on-year or rebased view: this series is already a rate, so either would be a percentage of a percentage.") };
  }
  if (lo < 0 && hi > 0) {
    return { keys: ["level"], why: t("No year-on-year or rebased view: this series goes below zero, where a percentage of an earlier reading means nothing.") };
  }
  return { keys: Object.keys(TRANSFORMS), why: "" };
}

/* Two series on one axis, for Compare on a series page.
 *
 * Levels in different units on one axis are a lie told with a straight line,
 * so levels are rebased to 100, and both at the same moment: the first date
 * both have a reading, or failing that the later of the two starts, with the
 * earlier series taken at its last reading on or before that day. Each line
 * used to be rebased at its own first point, which put two bases years apart
 * under one label saying they shared one.
 *
 * The rule transformsFor applies holds here too: a rate, or anything that
 * crosses zero, is never rebased. Two such series in the same unit are drawn
 * as published; anything else is not drawn together, and the readout says
 * why. Returns { sets, units, note }, with sets null when there is no honest
 * way to draw the pair. */
function comparePair(a, unitA, b, unitB) {
  if (!a.length || !b.length) return { sets: null, units: null, note: t("Nothing to compare in this range.") };
  const rebaseable = (p, unit) => {
    if (/percent/i.test(unit || "")) return false;
    let lo = Infinity, hi = -Infinity;
    p.forEach((o) => { if (o[1] < lo) lo = o[1]; if (o[1] > hi) hi = o[1]; });
    return !(lo < 0 && hi > 0);
  };
  if (rebaseable(a, unitA) && rebaseable(b, unitB)) {
    const inA = new Set(a.map((o) => o[0]));
    const start = a[0][0] > b[0][0] ? a[0][0] : b[0][0];
    const shared = b.find((o) => o[0] >= start && inA.has(o[0]));
    const on = shared ? shared[0] : start;
    const held = (p) => {
      let v = null;
      for (const o of p) { if (o[0] > on) break; v = o[1]; }
      return v;
    };
    const baseA = held(a), baseB = held(b);
    if (baseA && baseB) {
      const rebase = (p, base) => p.filter((o) => o[0] >= on).map((o) => [o[0], (o[1] / base) * 100]);
      return { sets: [rebase(a, baseA), rebase(b, baseB)], units: ["index", "index"],
               note: t("Both rebased to 100 on") + " " + niceDate(on) };
    }
  }
  if ((unitA || "") === (unitB || "")) {
    return { sets: [a, b], units: [unitA, unitB], note: t("Both as published, in the same unit, with no rebasing") };
  }
  return { sets: null, units: null,
           note: t("Not drawn together: one of these is a rate or goes below zero, so it cannot be rebased, and the two are in different units.") };
}

/* The range buttons used to be one fixed list for all 1,300 series, which
 * served a daily FX series well and everything else badly. "1 year" on a
 * quarterly series is four points, and "Since March 2024" is a button that does
 * nothing on a series that stopped publishing in 2019. Since 961 of the 1,317
 * series are quarterly, the majority case was the one being served worst.
 *
 * Build the list out of what the series actually covers instead, and judge a
 * window by the series' own observed density rather than its nominal frequency:
 * a monthly series with a decade of gaps should not be offered a window that
 * lands four points in it.
 */
const FLOAT_2016 = "2016-11-03";
const FLOAT_2024 = "2024-03-06";

function rangesFor(meta) {
  const out = {};
  const first = meta && meta.first ? Date.parse(meta.first) : null;
  const last = meta && meta.last ? Date.parse(meta.last) : Date.now();
  const years = first === null ? 0 : (last - first) / 31536000000;
  const perYear = years > 0 && meta.n ? meta.n / years : 0;
  const worth = (y) => y < years && perYear * y >= 4;
  /* A window is the last y years of the series itself, given as the date it
   * starts, so applyRange cuts from there. Counted back from today, "1 year"
   * on a series that stopped in 2023 cut nothing, fell back to everything, and
   * still exported the file as "Range: 1 year". */
  const back = (y) => new Date(last - y * 31536000000).toISOString().slice(0, 10);

  if (worth(1)) out["1 year"] = back(1);
  if (worth(5)) out["5 years"] = back(5);
  if (worth(10)) out["10 years"] = back(10);
  out.Everything = null;

  // Only offer this year if the series has actually reached this year.
  if (new Date(last).getUTCFullYear() >= new Date().getUTCFullYear() && perYear >= 4) {
    out["This year"] = "ytd";
  }

  /* The two float dates mean something to the pound and to the money that
   * prices it, and nothing at all to tourist arrivals. They also have to be
   * inside the series' own span to be worth a button. */
  if (/^(fx|rates|govt|policy|interest_rates)$/.test((meta && meta.family) || "")) {
    if (last >= Date.parse(FLOAT_2016) && first !== null && first < Date.parse(FLOAT_2016)) {
      out["Since the 2016 float"] = FLOAT_2016;
    }
    if (last >= Date.parse(FLOAT_2024) && first !== null && first < Date.parse(FLOAT_2024)) {
      out["Since March 2024"] = FLOAT_2024;
    }
  }
  return out;
}

function applyRange(points, key, ranges) {
  const r = (ranges || {})[key];
  if (r === null || r === undefined) return points;
  const from =
    r === "ytd"
      ? Date.UTC(new Date().getUTCFullYear(), 0, 1)
      : typeof r === "string"
      ? Date.parse(r)
      : Date.now() - r * 31536000000;
  const cut = points.filter((p) => Date.parse(p[0]) >= from);
  return cut.length > 1 ? cut : points;
}

/* "Is this a lot?" answered against the series' own middle rather than its
 * extremes. A multiple is the honest form once a series has moved by more than
 * a factor of two: the pound is 6.6x its own median, and "558% above" is a true
 * sentence nobody can read. Returns the comparison only; the caller says what
 * it is being compared against, so the sentence can name the mark on the gauge. */
function vsMedian(latest, median) {
  if (median === null || median === undefined || median === 0) return "";
  if (latest === null || latest === undefined) return "";
  // A ratio across zero is meaningless: a deficit against a surplus median.
  if (median > 0 !== latest > 0) return "";
  const r = latest / median;
  return (
    t("Today's reading is") + " " +
    (r >= 2
      ? r.toFixed(1) + "× " + t("the median.")
      : Math.abs((r - 1) * 100).toFixed(0) + "% " + t(r >= 1 ? "above the median." : "below the median."))
  );
}

/* ---------- small shared bits of markup ---------- */

const skeleton = (rows) =>
  '<div class="wrap"><div class="skeleton">' +
  '<div class="sk-line"></div>'.repeat(rows || 6) +
  "</div></div>";

// A part may carry html instead of a label: a CBE table name, held left to
// right on /ar/ so its closing bracket stays where it belongs.
const crumbs = (parts) =>
  '<nav class="crumbs" aria-label="' + t("Breadcrumb") + '">' +
  parts
    .map((p) => {
      const inner = p.html || esc(p.label);
      return p.href ? '<a href="' + p.href + '">' + inner + "</a>" : "<span>" + inner + "</span>";
    })
    .join('<i aria-hidden="true">/</i>') +
  "</nav>";

/* Download a series as CSV without a round trip. The data is already in the
 * page; asking a server for it again would be theatre. */
function downloadCSV(id, observations, meta, note) {
  const head =
    "# " + ((meta && meta.title_en) || id) + "\n" +
    "# " + ATTRIBUTION + "\n" +
    // A computed series is Miqyas's arithmetic, and the file says so where it
    // credits the source, not only on the page it was downloaded from.
    (meta && meta.derived ? "# Computed by Miqyas from CBE data: " + (meta.method || "") + "\n" : "") +
    "# Unit: " + ((meta && meta.unit) || "not stated") + "\n" +
    // What the reader was looking at when they asked for it. A file of 1,200
    // rows out of 5,172 with nothing saying which 1,200 is a trap.
    (note ? "# " + note + "\n" : "") +
    // The address a footnote can point at, which a downloaded file outlives.
    "# Series page: " + seriesURL(id) + "\n" +
    "# Retrieved " + new Date().toISOString().slice(0, 10) + "\n" +
    "series_id,period,value\n";
  const body = observations.map((o) => id + "," + o[0] + "," + o[1]).join("\n");
  const blob = new Blob([head + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = id + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Copy a link: the address given, or the current page. A series page gives its
 * own pre-rendered address, /s/<id>/, rather than the hash route or the
 * /s/<id>/#/s/<id> the pre-rendered copy ends up at: that is the address
 * with the series' own title and share card, and one series should have one
 * address in a footnote. */
function copyLink(button, url) {
  navigator.clipboard.writeText(url || location.href).then(() => flash(button, t("Link copied")), () => {});
}

/* Copy any text, with a word on the button to say it went. */
function copyText(button, text, message) {
  navigator.clipboard.writeText(text).then(() => flash(button, message), () => {});
}

/* Tab-separated onto the clipboard, which is what pastes straight into a
 * spreadsheet cell by cell. For most of this audience that is the actual
 * destination, and a download is a detour through the filesystem. */
function copyTSV(button, rows, header) {
  const text =
    (header ? header.join("\t") + "\n" : "") + rows.map((r) => r.join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(
    () => flash(button, t("{n} rows copied").replace("{n}", num(rows.length))),
    () => {}
  );
}

/* ---------- addresses, tab titles and citations ---------- */

/* A series' own address: the pre-rendered page, which carries its title, its
 * share card and its figure in the HTML, in the language being read. */
const seriesURL = (id) => siteBase() + (RTL ? "ar/" : "") + "s/" + encodeURIComponent(id) + "/";

/* The browser tab, per page. Every route used to read "Miqyas: Egypt's economy
 * in numbers", so ten saved tabs, a bookmark folder and a reference manager
 * all held ten identical entries. */
function pageTitle(name) {
  document.title = name ? name + " | " + t("Miqyas") : t("Miqyas: Egypt's economy in numbers");
}

/* The citation for one series, as { html, text }. It names what a reader
 * needs to find the same numbers again: the series' address and id, the
 * newest period it holds, and the build it came from. The build date is the
 * site's, from status.json, not the reader's clock, so two readers on the
 * same day cite the same thing. A computed series is Miqyas's arithmetic on
 * CBE's numbers, and crediting it to CBE would put words in the Bank's mouth.
 *
 * On /ar/ the Arabic title leads and CBE's English title follows it, since
 * that is the name the Bank publishes; an Arabic title Miqyas wrote says so. */
function citation(data, meta, status) {
  const id = data.series_id;
  const obs = data.observations || [];
  const last = (meta && meta.last) || (obs.length ? obs[obs.length - 1][0] : "");
  const built = status && status.built_at ? niceDate(status.built_at.slice(0, 10)) : "";
  const url = seriesURL(id);
  const en = data.title_en || id;
  const sep = RTL ? "، " : ", ";
  // Each piece as [html, text]; the text is what the copy button puts on the clipboard.
  // On /ar/ the English title and the id are isolated one at a time, so a
  // line break inside either cannot carry a bracket to the wrong end.
  const name = RTL && arTitle(data)
    ? ["«" + esc(arTitle(data)) + "»" + sep + t("in English:") + " " + bdiLTR(esc(en)) + sep + t("id") + " " + bdiLTR(esc(id)),
       "«" + arTitle(data) + "»" + sep + t("in English:") + " " + en + sep + t("id") + " " + id]
    : ["<i>" + esc(en) + "</i> (" + esc(id) + ")", en + " (" + id + ")"];
  const plain = (s) => [esc(s), s];
  const pieces = (data.derived
    ? [plain(t("Miqyas")), name, plain(t("computed from Central Bank of Egypt data"))]
    : [plain(t("Central Bank of Egypt")), name]
  ).concat([plain(t("data to") + " " + periodLabel(last, data).replace(/[⁦-⁩]/g, ""))]);
  const where = (data.derived ? [] : [plain(t("Republished by Miqyas"))])
    .concat([[bdiLTR(esc(url)), url]])
    .concat(built ? [plain(t("build of") + " " + built)] : []);
  const ours = RTL && arTitle(data) && data.title_ar_source === "miqyas"
    ? plain(" " + t("The Arabic title is Miqyas's translation; CBE publishes this series under its English name.")) : ["", ""];
  const join = (k) => pieces.map((p) => p[k]).join(sep) + ". " + where.map((p) => p[k]).join(sep) + "." + ours[k];
  return { html: join(0), text: join(1) };
}

/* Say something happened, then put the label back. Shared by every copy button
 * so they all behave the same way. */
function flash(button, message) {
  const was = button.dataset.label || button.textContent;
  button.dataset.label = was;
  button.textContent = message;
  setTimeout(() => (button.textContent = was), 1800);
}
