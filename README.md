# Miqyas

**[mogh0neim.github.io/egypt-macro](https://mogh0neim.github.io/egypt-macro/)**

> **Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.**
> This is an independent project. The CBE is the source of every number here; any
> error in the cleaning is ours, not theirs. For official figures, go to
> [cbe.org.eg](https://www.cbe.org.eg/en/).

Egypt's economy in numbers. Free.

Everything the Central Bank of Egypt publishes, as clean data: 1,317 series,
charted, searchable and downloadable, with no key and no account.

*Miqyas* is the Nilometer on Rhoda Island: the graduated marble column Cairo read
the flood against to forecast the harvest and set the tax rate. Egypt's first
macroeconomic indicator, in service by 861 AD.

The CBE puts a genuinely valuable body of statistics on its website and makes it
hard to use: no API, no bulk download, no history you can load into anything, and
files that get silently overwritten when figures are revised. This repository
scrapes all of it once a day, cleans it, and commits the result.

Because every copy is committed, the git history is a dated record of what CBE
published, and of any later revisions.
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
`last_run.json` and `weekly_run.json`, so a diff anywhere else means the
content changed.

### Coverage

**1,300 series, 420,000 observations**, from three sources: 30 live endpoints,
981 Excel files, and figures that exist only inside press-release prose. On top
of that, 1,478 documents with 53,006 pages of searchable text, quoted back with
the match highlighted, and every MPC rate decision since June 2005.

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
- **Reserves and remittances**: parsed out of press-release text, because CBE
  publishes neither as a series anywhere.
- **Rate decisions**: all 169 MPC statements back to June 2005, with a diff
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

The CBE's [disclaimer](https://www.cbe.org.eg/en/disclaimer) permits reuse of
information obtained from its website, on two conditions: that the Central Bank
of Egypt is cited as the source, and that any transformation of the data is
stated explicitly. Both are honoured here - the raw responses sit alongside the
cleaned output so any transformation can be checked against what CBE actually
served.

If you use this data, cite the Central Bank of Egypt as the source.

The scraper requests each dataset once per day, one request at a time.

## Licence

Code: MIT. Data: belongs to the Central Bank of Egypt; see attribution above.
