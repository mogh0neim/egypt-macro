# The api/v1 contract

Miqyas publishes its data as plain JSON files at
`https://mogh0neim.github.io/egypt-macro/api/v1/`. No key, no sign-up. This page
is the promise about their shape, for anyone who builds on them, including the
Miqyas phone app. Copies of an app stay on people's phones for years, so the
rules below do not bend.

## The files

| File | What it holds | Schema |
|---|---|---|
| `latest.json` | The newest value of every series, and the one before it, in one small file. Check this first. | `latest.schema.json` |
| `series.json` | Every series: titles in English and Arabic, unit, frequency, first and last dates, latest value, highs and lows. | `series-index.schema.json` |
| `series/{series_id}.json` | One series in full, every observation, oldest first. | `series.schema.json` |
| `sparks.json` | A small trend line per series (up to 49 points). | `sparks.schema.json` |
| `mpc.json` | Every Monetary Policy Committee statement on file, with the decision and rates where they could be read. | `mpc.schema.json` |
| `mpc_calendar.json` | When the committee meets next. | `mpc-calendar.schema.json` |
| `events.json` | Exchange-rate regimes and big one-day moves, for marking charts. | `events.schema.json` |
| `changes.json` | What moved and what CBE restated, day by day. | `changes.schema.json` |

The schemas are published next to the data, under `api/v1/schema/`.

## The rules

1. **Nothing in v1 is removed or renamed, and no field changes type.** A field marked required stays, with the same meaning.
2. **New things can appear.** A new field, a new file, a new series, a new `family` or `freq` code, a new event type. Anything reading v1 must ignore what it does not know.
3. **A series id is never renamed or reused.** A series CBE stops publishing stays, with its last value and a `stale_days` count.
4. **A change that breaks rule 1 means `v2`,** published alongside v1, which keeps updating until the last app that reads it is retired.
5. **Dates are `YYYY-MM-DD`.** A monthly, quarterly or yearly value is dated by the last day of its period.
6. **`latest.json` changes its `data_version` only when a number changes,** never because the site was rebuilt. Compare it with what you saved to know whether to fetch anything else.
7. **Optional fields can be missing,** not just null. The MPC `decision` is one of `hold`, `hike`, `cut`, or missing when it could not be read. Treat missing as unknown, never as "hold".

## How it is enforced

Every build runs `ingest/check_api.py`, which checks each file against its
schema, and checks that the files agree with each other (every indexed series
has its own file, `latest.json` matches `series.json`). If anything breaks, the
site does not deploy and the last good version stays up. The checker's own
tests are in `tests/test_api_contract.py`.

## Credit

Every series file carries an `attribution` line. Show it wherever the numbers
are shown. The data is the Central Bank of Egypt's; Miqyas is not affiliated
with the CBE.
