"""Build the published artefacts: Parquet, SQLite, bulk zips, and a static API.

Everything here is derived from data/clean and catalog. Nothing calls CBE.

The Parquet layout is chosen for DuckDB-WASM in the browser: one file per
family, sorted by (series_id, period) so row groups can be skipped, with row
groups small enough that a query fetches kilobytes over HTTP range requests
instead of the whole file. That is what makes a backend unnecessary.

The API is static JSON on a CDN rather than a server. It answers the two
questions that matter -- what series exist, and what are this series's
observations -- with no key, no rate limit, and no bill.

Run:  python ingest/build_exports.py
"""

from __future__ import annotations

import collections
import csv
import hashlib
import json
import pathlib
import shutil
import sqlite3
import zipfile

import duckdb

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERIES_DIR = ROOT / "data" / "clean" / "series"
RECORDS_DIR = ROOT / "data" / "clean" / "records"
CATALOG = ROOT / "catalog"
DIST = ROOT / "dist"
PARQUET = DIST / "parquet"
API = DIST / "api" / "v1"
BULK = DIST / "bulk"

# Enough shape for a 90-pixel sparkline, and no more.
SPARK_POINTS = 48

# 60 MB of observations does not need many partitions, but splitting by family
# means a chart of the policy rate never downloads the FX series.
FAMILIES = {
    "fx": ["EG.FX."],
    "rates": ["EG.IBK.", "EG.CONIA.", "EG.RATE."],
    "govt": ["EG.TB."],
    "prices": ["EG.CPI."],
    "external": ["EG.RES.", "EG.EXT."],
    "excel": ["EG.XL."],
}


def family_of(series_id: str) -> str:
    for name, prefixes in FAMILIES.items():
        if any(series_id.startswith(p) for p in prefixes):
            return name
    return "other"


def load_observations() -> list[tuple[str, str, float]]:
    rows: list[tuple[str, str, float]] = []
    for path in sorted(SERIES_DIR.glob("*.csv")):
        with path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                try:
                    rows.append((row["series_id"], row["period"], float(row["value"])))
                except (KeyError, ValueError):
                    continue
    return rows


def main() -> int:
    # Clear only the folders this script owns. Wiping all of dist/ would take
    # dist/search with it, which build_search.py writes and which takes far
    # longer to rebuild.
    for folder in (PARQUET, API, BULK):
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir(parents=True, exist_ok=True)

    observations = load_observations()
    catalog = json.loads((CATALOG / "series.json").read_text(encoding="utf-8"))
    summary = json.loads((CATALOG / "summary.json").read_text(encoding="utf-8"))
    by_id = {c["series_id"]: c for c in catalog}
    print(f"{len(observations):,} observations across {len({o[0] for o in observations}):,} series")

    con = duckdb.connect()
    # Let DuckDB read the CSVs itself. Feeding it 350k rows through
    # executemany takes minutes; this takes under a second.
    con.execute(
        f"""CREATE TABLE obs AS
            SELECT series_id, CAST(period AS DATE) AS period, CAST(value AS DOUBLE) AS value
            FROM read_csv_auto('{(SERIES_DIR / "*.csv").as_posix()}', header=true,
                               columns={{'series_id':'VARCHAR','period':'VARCHAR','value':'VARCHAR'}})
            WHERE TRY_CAST(value AS DOUBLE) IS NOT NULL"""
    )
    con.execute(
        "CREATE TABLE series AS SELECT * FROM read_json_auto(?)",
        [str((CATALOG / "series.json").as_posix())],
    )

    # ---- Parquet, one file per family ----
    grouped = collections.defaultdict(list)
    for sid, period, value in observations:
        grouped[family_of(sid)].append(sid)
    for family in sorted(grouped):
        prefixes = FAMILIES.get(family)
        where = (
            " OR ".join(f"series_id LIKE '{p}%'" for p in prefixes)
            if prefixes
            else " AND ".join(
                f"series_id NOT LIKE '{p}%'" for ps in FAMILIES.values() for p in ps
            )
        )
        out = PARQUET / f"{family}.parquet"
        con.execute(
            f"""COPY (SELECT * FROM obs WHERE {where} ORDER BY series_id, period)
                TO '{out.as_posix()}'
                (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)"""
        )
        n = con.execute(f"SELECT count(*) FROM obs WHERE {where}").fetchone()[0]
        print(f"  parquet/{family}.parquet  {n:,} rows  {out.stat().st_size/1e6:.1f} MB")

    con.execute(
        f"""COPY (SELECT * FROM obs ORDER BY series_id, period)
            TO '{(PARQUET / "all.parquet").as_posix()}'
            (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM series) TO '{(PARQUET / "series.parquet").as_posix()}'
            (FORMAT PARQUET, COMPRESSION ZSTD)"""
    )

    # ---- SQLite, for anyone who would rather just query it ----
    sqlite_path = DIST / "miqyas.sqlite"
    # Rebuilt from scratch each run; dist/ is no longer wiped wholesale, so the
    # previous file has to be removed explicitly. Sweeping the glob rather than
    # the one path means a rename does not leave 50 MB of orphan behind.
    for stale in DIST.glob("*.sqlite"):
        stale.unlink()
    db = sqlite3.connect(sqlite_path, isolation_level=None)
    # Pragmas must come before any statement opens a transaction. Without them
    # the 380k-row insert spends its time on journal flushes.
    db.execute("PRAGMA journal_mode=OFF")
    db.execute("PRAGMA synchronous=OFF")
    db.executescript(
        """
        CREATE TABLE series (series_id TEXT PRIMARY KEY, title_en TEXT, title_ar TEXT,
                             dataset TEXT, family TEXT, freq TEXT, unit TEXT,
                             source_url TEXT, source_file TEXT, derived INTEGER,
                             method TEXT, period_basis TEXT);
        CREATE TABLE observations (series_id TEXT, period TEXT, value REAL,
                                  PRIMARY KEY (series_id, period));
        """
    )
    db.executemany(
        "INSERT INTO series VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                c["series_id"], c.get("title_en"), c.get("title_ar"), c.get("dataset"),
                c.get("family"), c.get("freq"), c.get("unit"), c.get("source_url"),
                c.get("source_file"), int(bool(c.get("derived"))), c.get("method"),
                c.get("period_basis"),
            )
            for c in catalog
        ],
    )
    db.execute("BEGIN")
    db.executemany("INSERT OR REPLACE INTO observations VALUES (?,?,?)", observations)
    db.execute("COMMIT")
    db.executescript("CREATE INDEX obs_period ON observations(period);")
    db.commit()
    db.close()
    print(f"  miqyas.sqlite  {sqlite_path.stat().st_size/1e6:.1f} MB")

    # ---- Static API ----
    (API / "series").mkdir(parents=True, exist_ok=True)
    per_series: dict[str, list] = collections.defaultdict(list)
    for sid, period, value in observations:
        per_series[sid].append([period, value])

    summary_by_id = {s["series_id"]: s for s in summary}
    index = []
    for sid, points in per_series.items():
        points.sort()
        meta = by_id.get(sid, {})
        stats = summary_by_id.get(sid, {})
        (API / "series" / f"{sid}.json").write_text(
            json.dumps(
                {
                    "series_id": sid,
                    **{k: meta.get(k) for k in
                       ("title_en", "title_ar", "unit", "freq", "family", "dataset",
                        "source_url", "source_file", "derived", "method", "period_basis")},
                    "observations": points,
                    "count": len(points),
                    "attribution": "Source: Central Bank of Egypt. Republished by Miqyas, an unofficial mirror.",
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        index.append(
            {
                "series_id": sid,
                "title_en": meta.get("title_en"),
                "title_ar": meta.get("title_ar"),
                "family": meta.get("family"),
                "freq": meta.get("freq"),
                "unit": meta.get("unit"),
                "n": len(points),
                "first": points[0][0],
                "last": points[-1][0],
                "latest_value": points[-1][1],
                "highest": stats.get("highest"),
                "lowest": stats.get("lowest"),
                "previous": stats.get("previous"),
            }
        )

    index.sort(key=lambda s: s["series_id"])
    (API / "series.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"  api/v1/series.json  {len(index):,} series indexed")

    # ---- Sparklines ----
    # One 48-point shape per series, values only. This is what lets a browse
    # list show 200 series with a chart each without 200 fetches: the whole
    # file is smaller than a single daily series, and the shape is all a
    # 90-pixel sparkline can render anyway.
    sparks = {}
    for sid, points in per_series.items():
        values = [v for _, v in points]
        if len(values) < 2:
            continue
        if len(values) > SPARK_POINTS:
            step = len(values) / SPARK_POINTS
            values = [values[int(i * step)] for i in range(SPARK_POINTS)] + [values[-1]]
        sparks[sid] = [round(v, 4) for v in values]
    (API / "sparks.json").write_text(json.dumps(sparks, separators=(",", ":")), encoding="utf-8")
    print(f"  api/v1/sparks.json  {len(sparks):,} sparklines  "
          f"{(API / 'sparks.json').stat().st_size/1e6:.1f} MB")

    # ---- The MPC archive, so the site can show the rate decisions ----
    mpc_src = ROOT / "corpus" / "mpc_archive.json"
    if mpc_src.exists():
        mpc = json.loads(mpc_src.read_text(encoding="utf-8"))
        # The diffs carry full sentence text and run to a megabyte. The site
        # only needs how much moved and how much of the language changed.
        slim = {
            "count": mpc.get("count"),
            "range": mpc.get("range"),
            "statements": mpc.get("statements", []),
            "diffs": [
                {
                    "from_date": d.get("from_date"),
                    "to_date": d.get("to_date"),
                    "similarity": d.get("similarity"),
                    "sentence_overlap": d.get("sentence_overlap"),
                    "added": len(d.get("sentences_added") or []),
                    "removed": len(d.get("sentences_removed") or []),
                    "changed": len(d.get("sentences_changed") or []),
                    "rate_move": d.get("rate_move"),
                }
                for d in mpc.get("diffs", [])
            ],
        }
        (API / "mpc.json").write_text(json.dumps(slim, ensure_ascii=False), encoding="utf-8")
        print(f"  api/v1/mpc.json  {slim['count']} statements")

    events = ROOT / "events.json"
    if events.exists():
        shutil.copy(events, API / "events.json")

    # ---- Bulk zips ----
    for name, folder in (("series", SERIES_DIR), ("records", RECORDS_DIR)):
        if not folder.exists():
            continue
        with zipfile.ZipFile(BULK / f"{name}-csv.zip", "w", zipfile.ZIP_DEFLATED) as z:
            for path in sorted(folder.glob("*.csv")):
                z.write(path, f"{name}/{path.name}")
            z.write(CATALOG / "series.json", "catalog/series.json")
            z.writestr(
                "README.txt",
                "Miqyas bulk export -- Egypt's macroeconomic record\n\n"
                "Source: Central Bank of Egypt (cbe.org.eg).\n"
                "Not affiliated with or endorsed by the CBE.\n\n"
                "Cite the Central Bank of Egypt as the source. Any transformation\n"
                "applied here is recorded in catalog/series.json under 'method'.\n",
            )
        print(f"  bulk/{name}-csv.zip")

    # ---- Manifest with hashes, so a mirror can verify itself ----
    manifest = []
    for path in sorted(DIST.rglob("*")):
        if path.is_file():
            manifest.append(
                {
                    "path": path.relative_to(DIST).as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )
    (DIST / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    total = sum(m["bytes"] for m in manifest)
    print(f"\ndist/ holds {len(manifest):,} files, {total/1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
