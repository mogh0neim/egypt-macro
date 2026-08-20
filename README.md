# Egypt Macro

Everything the Central Bank of Egypt publishes, as clean data.

The CBE puts a genuinely valuable body of statistics on its website and makes it
hard to use: no API, no bulk download, no history you can load into anything, and
files that get silently overwritten when figures are revised. This repository
scrapes all of it once a day, cleans it, and commits the result.

**Nothing here is official.** It is a mirror. The Central Bank of Egypt is the
source of every number; errors in the cleaning are ours.

## What's in here

| | |
|---|---|
| `data/raw/` | Responses exactly as CBE served them. Committed daily. |
| `data/clean/series/` | Tidy long format: `series_id,period,value` |
| `data/clean/records/` | Auction results, one row per auction |
| `catalog/series.json` | Every series: id, title, unit, frequency, source URL |
| `ingest/` | The scrapers |

### Coverage

30 datasets, ~147,000 observations.

- **Exchange rates** — CBE official rates for 18 currencies (buy and sell), daily
  since January 2005. Market rates for 9 currencies since 2014. Interbank
  weighted average since 2004.
- **Government securities** — every EGP treasury bill auction since January 2004
  with ISIN, tenor, amount offered, amount bid, amount accepted, and minimum,
  maximum and weighted-average yield. Also bonds (fixed coupon, floating rate,
  zero coupon), USD and EUR bills, and sukuk.
- **Money market** — daily and bi-weekly interbank rates across six tenors,
  CONIA and the CONIA compounded index.
- **Policy rates** — the discount rate back to January 1991, the overnight
  deposit and lending corridor, and the main operation rate.
- **Prices** — headline, core, regulated-item and fresh-produce inflation, both
  year-on-year and month-on-month, back to January 2000.
- **Auctions** — repo, deposit and foreign-exchange auctions.

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

python ingest/cbe_client.py      # connectivity check -- run this first
python ingest/fetch_series.py    # the 30 datasets
python ingest/derive_series.py   # yield curve and bid-to-cover from auctions
python ingest/fetch_press.py     # reserves, remittances, MPC statements
python ingest/detect_events.py   # regenerate chart annotations
python ingest/summarise.py       # coverage report and quality flags
```

Run them in that order — each reads what the previous one wrote. Individual
datasets with `--only fx_official`, and `--skip-cached` on `fetch_press.py`
reuses already-downloaded pages instead of hitting CBE again.

Datasets are declared in [`ingest/datasets.yaml`](ingest/datasets.yaml) — path,
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
forward-filled — a gap is a gap.

## Attribution

The CBE's [disclaimer](https://www.cbe.org.eg/en/disclaimer) permits reuse of
information obtained from its website, on two conditions: that the Central Bank
of Egypt is cited as the source, and that any transformation of the data is
stated explicitly. Both are honoured here — the raw responses sit alongside the
cleaned output so any transformation can be checked against what CBE actually
served.

If you use this data, cite the Central Bank of Egypt as the source.

The scraper requests each dataset once per day, one request at a time.

## Licence

Code: MIT. Data: belongs to the Central Bank of Egypt; see attribution above.
