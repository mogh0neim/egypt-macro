# Miqyas

**[mogh0neim.github.io/egypt-macro](https://mogh0neim.github.io/egypt-macro/)**

> **Not affiliated with, endorsed by, or connected to the Central Bank of Egypt.**
> This is an independent project. The CBE is the source of every number here; any
> error in the cleaning is ours, not theirs. For official figures, go to
> [cbe.org.eg](https://www.cbe.org.eg/en/).

Everything the Central Bank of Egypt publishes, as clean data.

*Miqyas* is the Nilometer on Rhoda Island: the graduated marble column Cairo read
the flood against to forecast the harvest and set the tax rate. Egypt's first
macroeconomic indicator, in service by 861 AD.

The CBE puts a genuinely valuable body of statistics on its website and makes it
hard to use: no API, no bulk download, no history you can load into anything, and
files that get silently overwritten when figures are revised. This repository
scrapes all of it once a day, cleans it, and commits the result.

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
| `catalog/last_run.json` | When the scrape last ran |
| `corpus/mpc/` | MPC statements as text, with the rate decision parsed out |
| `corpus/pages/` | Every PDF page as text, gzipped. What search runs on |
| `corpus/extraction_report.json` | What extracted cleanly, what needed OCR, what failed |
| `events.json` | Devaluations and MPC decisions, for annotating charts |
| `ingest/` | The scrapers |

Nothing in `data/` or `catalog/` is hand-edited. Timestamps live only in
`last_run.json`, so a diff anywhere else means a number actually moved.

### Coverage

**1,300 series, 420,000 observations**, from three sources: 30 live endpoints,
981 Excel files, and figures that exist only inside press-release prose. On top
of that, 1,478 documents with 53,006 pages of searchable text, and every MPC rate
decision since June 2005.

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

## Why the git history matters

CBE overwrites its files in place when it revises a figure. There is no public
record anywhere of what a number said before it was revised.

Because every run commits the raw response, this repository accumulates one. Ask
what CBE was publishing on any past date and `git log` can answer it. That record
only exists from the day the scraper started, and it cannot be reconstructed
afterwards.

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
dist/miqyas.sqlite                   the whole thing, queryable
dist/bulk/*.zip                      CSV bundles
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
