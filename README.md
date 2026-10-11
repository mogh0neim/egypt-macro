# Miqyas

**[mogh0neim.github.io/egypt-macro](https://mogh0neim.github.io/egypt-macro/)**

> **Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.**
> This is an independent project. The CBE is the source of every number here; any
> error in the cleaning is ours, not theirs. For official figures, go to
> [cbe.org.eg](https://www.cbe.org.eg/en/).

Egypt's economy in numbers. Free.

Central Bank of Egypt statistics as clean data: more than 1,300 series,
charted, searchable and downloadable, with no key and no account. Coverage is
listed on the Data page; some series stop earlier than CBE's own.

*Miqyas* is the Nilometer on Rhoda Island: the graduated marble column Cairo read
the flood against to forecast the harvest and set the tax rate. Egypt's first
macroeconomic indicator, in service by 861 AD.

The CBE puts a genuinely valuable body of statistics on its website, spread
across live tables, Excel files and PDFs. This repository copies CBE's live
tables once a day and its Excel archive and publications once a week, cleans
them into one dataset, and commits the result.

Because every copy is committed, the git history is a dated record of what CBE
published, and of any later revisions, from 20 August 2026.
[What changed](https://mogh0neim.github.io/egypt-macro/#/changes) reads it, with
an [RSS feed](https://mogh0neim.github.io/egypt-macro/changes.xml) and a
[revisions-only feed](https://mogh0neim.github.io/egypt-macro/changes-revisions.xml).

## What's in here

| | |
|---|---|
| `data/raw/` | Responses exactly as CBE served them, gzipped. Rewritten only when the content actually changes. |
| `data/clean/series/` | Tidy long format: `series_id,period,value` |
| `data/clean/records/` | Auction results, one row per auction |
| `data/clean/anomalies.csv` | Dates where CBE published two conflicting values for the same series |
| `catalog/series.json` | Every series: id, title, unit, frequency, source URL |
| `catalog/summary.json` | Latest, previous, highest, lowest and coverage per series |
| `catalog/COVERAGE.md` | The same thing, readable |
| `catalog/last_run.json` | When the daily scrape last ran |
| `catalog/weekly_run.json` | When the weekly archive job last ran, and how many files CBE replaced or withdrew |
| `corpus/mpc/` | MPC statements as text, with the rate decision parsed out |
| `corpus/pages/` | Every PDF page as text, gzipped. What search runs on, and what a search result quotes |
| `corpus/extraction_report.json` | What extracted cleanly, what needed OCR, what failed |
| `events.json` | Devaluations and MPC decisions, for annotating charts |
| `data/mpc_calendar.json` | When the MPC meets next. The one hand-entered file here: CBE renders its schedule client-side and serves it through no endpoint |
| `ingest/` | The scrapers, plus the site build: exports, search index, page text, share cards, pre-rendered pages |
| `assets/fonts/` | Static IBM Plex and Almarai, so a CI runner draws the share cards in the site's own type |

Nothing in `data/` or `catalog/` is hand-edited. Timestamps live only in
`last_run.json` and `weekly_run.json`; a diff in `data/clean/` means a value was
added, changed or removed.

### Coverage

**More than 1,300 series and 420,000 observations**, from three sources: 30
live endpoints, 981 Excel files, and figures read from press-release text. On
top of that, about 1,500 documents with more than 50,000 pages of searchable
text, quoted back with the match highlighted, and every MPC rate decision since
June 2005. The exact counts for each build are in `status.json`.

- **Exchange rates**: CBE official rates for 18 currencies (buy and sell), daily
  since January 2005. Market rates for 9 currencies since 2014. Interbank
  weighted average since 2004.
- **Government securities**: every EGP treasury bill auction since January 2004
  with ISIN, tenor, amount offered, amount bid, amount accepted, and minimum,
  maximum and weighted-average yield. Also bonds (fixed coupon, floating rate,
  zero coupon), USD and EUR bills, and sukuk.
- **Money market**: daily and bi-weekly interbank rates across six tenors,
  CONIA and the CONIA compounded index.
- **Policy rates**: the discount rate back to January 1991, the overnight
  deposit and lending corridor, and the main operation rate.
- **Prices**: headline, core, regulated-item and fresh-produce inflation, both
  year-on-year and month-on-month, back to January 2000.
- **Auctions**: repo, deposit and foreign-exchange auctions.
- **Reserves and remittances**: read from press-release text and dated by the
  day of the release. CBE also publishes reserves monthly on its own site, and
  that series can differ from the first print kept here.
- **Rate decisions**: every MPC statement back to June 2005, with a diff
  against the previous one. Where CBE's own archive records no decision, it is
  recovered from the published corridor series.

From the Excel archive, which is where the rest of Egypt's macro record lives:

- **GDP** at factor cost and by expenditure, constant and current prices
- **Balance of payments**, quarterly and annual, back to FY2004/05
- **External and domestic debt**, by type and by debtor sector
- **Banking surveys**: M2 and counterparts, domestic credit, deposits by
  sector in pounds versus foreign currency
- **Foreign trade** by country and by degree of processing
- **State budget**: revenue, expenditure, deficit and financing
- **FDI, tourism, stock market indicators**

## The revision record

CBE overwrites its files in place when it revises a figure. Miqyas keeps a dated
copy of the daily tables from 20 August 2026: every run commits the raw response
and the cleaned table, so `git log` can say what a figure read on any day since.

What is checked for revisions:

- **Daily tables** (exchange rates, interest rates, CONIA, inflation, T-bill
  yields) and the **auction tables**: read every day. A changed or withdrawn
  figure counts as a revision.
- **The Excel archive and the documents**: read weekly. Each file's
  Last-Modified date and size are checked, a file CBE replaced is downloaded
  again and dated `changed_on` in its manifest, and a file CBE no longer lists
  keeps its entry with `withdrawn_on`. A changed archive figure counts as a
  revision only when a replaced file is behind it and the parser carries a
  `PARSER_VERSION`.
- **Press releases**: the newest are read again each day (`fetch_press.py
  --refresh N`). Reserves and remittances parsed from them, and every other
  series Miqyas computes, are never counted as revisions.

`ingest/build_changes.py` decides whose change each one was. A commit by a
person, a change in `PARSER_VERSION`, a clean table that changed when CBE's raw
file did not, or a date where CBE published two values, is re-read by Miqyas,
not revised by CBE. More than 500 changes in one scraper commit are held back
rather than reported.

**Every value as of any day.** `build_exports.py` turns the history into a
table with one row per value a series has held: `series_id, period, value,
first_seen, last_seen` (UTC days; `last_seen` is empty while the value is still
held). It is published as `parquet/revisions.parquet`, `bulk/revisions-csv.zip`
and the `revisions` table in `miqyas.sqlite`. What a series read on a day:

```sql
SELECT period, value FROM revisions
WHERE series_id = 'EG.FX.OFF.USD.SELL'
  AND first_seen <= '2026-09-01' AND (last_seen IS NULL OR last_seen >= '2026-09-01');
```

**A watchdog.** `.github/workflows/watchdog.yml` runs `ingest/health.py` every
night and opens a GitHub issue when the daily job is more than 30 hours old,
the weekly job more than 9 days old, the quarantined Excel files grow, or a
table loses rows.

The record only exists from the day the scraper started, and it cannot be
reconstructed afterwards. Building it needs the full history:
`fetch-depth: 0` in a workflow, no `--depth` on a clone.

## Using it

```bash
pip install -r requirements.txt

python ingest/cbe_client.py             # connectivity check -- run this first

# daily: the 30 live endpoints
python ingest/fetch_series.py
python ingest/derive_series.py          # yield curve, bid-to-cover
python ingest/fetch_press.py            # reserves, remittances, MPC text
python ingest/detect_events.py          # chart annotations
python ingest/summarise.py              # coverage and quality flags

# weekly: the archive and the corpus
python ingest/fetch_excel.py --download
python ingest/parse_excel.py
python ingest/fetch_docs.py --download
python ingest/extract_text.py
python ingest/mpc_archive.py

# on demand: read the scans that have no text layer (needs Tesseract)
python ingest/ocr_scans.py

# publish
python ingest/build_exports.py          # Parquet, SQLite, static API, zips
python ingest/build_search.py           # document search index
python ingest/build_site.py             # copy the front end in, make dist/ a site
```

Run them in that order - each reads what the previous one wrote. `--only
fx_official` limits to one dataset; `--skip-cached` on `fetch_press.py` reuses
already-downloaded pages instead of hitting CBE again.

### The site

`web/` is a static front end with no build step and no framework. `build_site.py`
copies it into `dist/`, which then *is* the deployable site root: `index.html` at
the top with `api/` and `search/` beside it.

```bash
python ingest/build_exports.py
python ingest/build_search.py
python ingest/build_site.py
python -m http.server 8765 --directory dist
# http://localhost:8765/
```

Serving the repository root instead also works - the front end detects that it is
running from `web/` and looks one level up for the data.

[`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs those three
steps and deploys `dist/` to GitHub Pages after every scrape. Nothing in `dist/`
is committed; it is derived in full from `data/`, `catalog/` and `corpus/`, which
are.

### Moving to a domain of its own

The site's address is one line, `url` in [`site.toml`](site.toml). Every
canonical link, share card, sitemap entry and feed link is built from it, so
nothing else in the code needs changing. The rest is done in GitHub and at
whoever sold the domain. Say the domain is `miqyas.org`:

1. **Tell GitHub the domain is yours.** On github.com, your profile picture,
   Settings, Pages, "Add a domain", type `miqyas.org`. GitHub shows a TXT
   record; add it at the domain seller (step 3) and press Verify. This stops
   anyone else pointing the domain at their own GitHub site.
2. **Point the repository at it.** In this repository: Settings, Pages, Custom
   domain, type `miqyas.org`, Save. No `CNAME` file is needed: the site is
   published by a workflow, and GitHub ignores that file for those.
3. **Point the domain at GitHub.** In the domain seller's DNS settings, add:
   - four `A` records for `miqyas.org` (the host is often written `@`):
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - four `AAAA` records for `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`,
     `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - one `CNAME` record for `www`, pointing at `mogh0neim.github.io`

   These are GitHub's published addresses; check them against GitHub's page
   "Managing a custom domain for your GitHub Pages site" on the day.
4. **Wait, then turn on HTTPS.** DNS takes from minutes to a day. When
   Settings, Pages shows the domain as checked, tick "Enforce HTTPS" (the
   certificate can take up to an hour to appear).
5. **Change the one line.** In `site.toml`, set `url = "https://miqyas.org/"`
   (with the slash at the end), commit and push. The publish workflow rebuilds
   every page with the new address.
6. **Check it.** Open `https://miqyas.org/`, view the page source and look for
   `rel="canonical"`: it should show the new address. The old address,
   `mogh0neim.github.io/egypt-macro/`, forwards to the new one by itself.

One thing does not move: favourites are kept in each reader's browser, under
the address they were saved on, so anyone who starred series on the old
address will find an empty list on the new one. Nobody outside has used the
site yet, so this is the time to move.

Update the links at the top of this README in the same commit.

**After the move, tell Google.** Do this once the new address works, not
before: on `github.io` the site's `robots.txt` sits under `/egypt-macro/`, where
search engines do not look for it, and submitting now would point Google at
addresses that are about to change.

1. Go to [Search Console](https://search.google.com/search-console), "Add
   property", choose "Domain" and type `miqyas.org`. Google shows a TXT record:
   add it at the domain seller, as in step 3 above, and press Verify.
2. In Search Console, open "Sitemaps", type `sitemap.xml` and Submit. It
   lists every page of the site in both languages. Its status should read
   "Success" within a day; the pages themselves are taken in over weeks.
3. Optionally, at [Bing Webmaster Tools](https://www.bing.com/webmasters),
   choose "Import from Google Search Console".

### Counting visits (off until you switch it on)

The site can count visits with [GoatCounter](https://www.goatcounter.com),
which sets no cookies. It is off: `goatcounter` in `site.toml` is empty, and
while it is empty no page contacts GoatCounter at all. To switch it on:

1. Make a free account at goatcounter.com. The "code" you pick is the first
   part of your dashboard address: `miqyas` for `miqyas.goatcounter.com`.
2. In `site.toml`, set `goatcounter = "miqyas"`, commit and push.
3. Open the site, click around, and check the dashboard a minute later.

Each page a reader opens then sends GoatCounter its name only, such as
`/tools/salary` or `/s/EG.FX.OFF.USD.SELL` (Arabic pages start `/ar`), never
what was typed into a search box or a calculator, and on arrival the address
of the site that linked there, without the rest of the link. The privacy
paragraph on the About page switches with the setting, so it is true either
way. Visits from `localhost` are never counted.

### The API

`build_exports.py` writes `dist/` - static JSON, no key, no rate limit:

```
dist/api/v1/series.json              every series with its latest value
dist/api/v1/series/<SERIES_ID>.json  full observations
dist/api/v1/sparks.json              48-point shapes, for list views
dist/api/v1/mpc.json                 every rate decision, with statement diffs
dist/search/                         sharded full-text index over the corpus
dist/status.json                     when it was built and how much is in it
dist/parquet/*.parquet               partitioned, sorted for DuckDB range reads
dist/parquet/revisions.parquet       every value each series has held, with first and last day
dist/miqyas.sqlite                   the whole thing, queryable, with a revisions table
dist/bulk/*.zip                      CSV bundles, including revisions-csv.zip
```

Datasets are declared in [`ingest/datasets.yaml`](ingest/datasets.yaml) - path,
shape, column-to-series mapping, and a minimum row count that makes the job fail
loudly rather than commit a truncated series.

### Series IDs

Dotted and stable. Once published, an ID never changes.

```
EG.FX.OFF.USD.SELL      CBE official USD selling rate
EG.RATE.ON.DEP          overnight deposit rate
EG.CPI.HDL.YOY          headline inflation, year on year
EG.CONIA.ON.RATE        CONIA overnight rate
EG.TB.SEC.3M.YLD        3-month T-bill secondary market yield
```

## Two things to know about the data

**Egypt's fiscal year runs 1 July to 30 June.** Fiscal-year quarters are not
calendar quarters: FY2024/25 Q1 is July–September 2024. Anything labelled by
fiscal year says so explicitly.

**Some dates are missing rather than zero.** A handful of rows in the official FX
series carry zeros where CBE published nothing. Those are dropped, not
forward-filled - a gap is a gap.

## Attribution

CBE's [disclaimer](https://www.cbe.org.eg/en/disclaimer) allows reuse of
information from its website if CBE is cited as the source, any transformation
is stated explicitly, and the information appears accurately. Miqyas cites CBE
on every page and file, states per series whether a value is reproduced, dated
by Miqyas or computed, and links each series to its CBE source where it has one.
Errors in cleaning or dating are ours: check against CBE before you cite. Raw
responses are kept in this repository under `data/raw/`.

If you use this data, cite the Central Bank of Egypt as the source. Every file
carries the same line:

> Source: Central Bank of Egypt (https://www.cbe.org.eg). Republished by Miqyas,
> an independent project not affiliated with, endorsed by, or connected to the
> Central Bank of Egypt. Values are cleaned and dated by Miqyas; check against
> CBE before citing.

If anything here should not be, [open an issue](https://github.com/mogh0neim/egypt-macro/issues)
and it will be removed.

The scraper requests each dataset once per day, one request at a time.

## Licence

Code: MIT. Data: belongs to the Central Bank of Egypt; see attribution above.
