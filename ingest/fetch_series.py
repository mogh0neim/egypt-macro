"""Fetch every historical-data dataset and write raw + tidy output.

Two artefacts per run:

  data/raw/series/<key>.html.gz   the response exactly as served, gzipped.
                                  Committing this is what makes the git history
                                  a vintage archive -- CBE silently overwrites
                                  revised figures, so the only record that a
                                  number ever read differently is ours.
  data/clean/series/<key>.csv     tidy long: series_id,period,value
  data/clean/records/<key>.csv    faithful table, for `records` datasets

Run:  python ingest/fetch_series.py [--only key1,key2] [--no-raw]
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import pathlib
import re
import sys
import traceback

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cbe_client import CBEClient, WAFRejected  # noqa: E402
from parse_table import concat_tables, parse_tables, to_number  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "series"
CLEAN_SERIES = ROOT / "data" / "clean" / "series"
CLEAN_RECORDS = ROOT / "data" / "clean" / "records"

# Wide enough to cover everything CBE holds; the endpoints clamp to their own
# coverage rather than erroring.
DATE_FROM = "01/01/1980"
DATE_TO = "31/12/2035"

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
        start=1,
    )
}


def normalise_date(raw: str, kind: str | None) -> str | None:
    """-> ISO date, or None if unparseable.

    CBE uses five different date renderings across these endpoints, which is
    why this is config-driven rather than guessed.
    """
    s = (raw or "").strip()
    if not s:
        return None

    if kind == "period_range":
        # "04/08/2026 - 17/08/2026" -> the period end
        parts = [p.strip() for p in s.split("-")]
        s = parts[-1] if parts else s
        kind = None

    if kind == "mon_year":
        # "Jun - 2026"
        m = re.match(r"([A-Za-z]{3})\w*\s*-\s*(\d{4})", s)
        if m:
            return f"{m.group(2)}-{_MONTHS[m.group(1).lower()]:02d}-01"
        return None

    if kind == "mon_year_text":
        # "Jul 2026"
        m = re.match(r"([A-Za-z]{3})\w*\s+(\d{4})", s)
        if m:
            return f"{m.group(2)}-{_MONTHS[m.group(1).lower()]:02d}-01"
        return None

    if kind == "dmy_text":
        # "18 Aug 2026"
        m = re.match(r"(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})", s)
        if m:
            return f"{m.group(3)}-{_MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
        return None

    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        try:
            return dt.date(y, mo, d).isoformat()
        except ValueError:
            return None
    return None


def write_raw_if_changed(path: pathlib.Path, payload: bytes) -> bool:
    """Write the gzipped response only if its content actually differs.

    Byte-level gzip determinism is not achievable here. mtime=0 removes the
    header timestamp, and compressing the original bytes avoids platform
    newline translation, but different zlib builds still emit different
    (equally valid) deflate streams for the same input -- so a Windows laptop
    and a Linux runner disagree no matter what.

    Comparing the *decompressed* content sidesteps all of it. If CBE served
    the same bytes as last time, the existing file is left alone and git sees
    no change. Without this, every run rewrote all 31 raw files, adding
    megabytes of meaningless blobs a day to a repository whose entire value is
    that a diff means something.

    Returns True if the file was written.
    """
    if path.exists():
        try:
            if gzip.decompress(path.read_bytes()) == payload:
                return False
        except (OSError, EOFError, gzip.BadGzipFile):
            pass  # unreadable or truncated -- rewrite it
    path.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    return True


def slug(text: str) -> str:
    """Turn a free-text key (a currency name) into an ID-safe token."""
    return re.sub(r"[^A-Za-z0-9]+", "", text).upper()


class Fetcher:
    def __init__(self, config: dict, client: CBEClient, write_raw: bool = True):
        self.cfg = config
        self.client = client
        self.write_raw = write_raw
        self.maps = {"currencies": config.get("currencies", {})}
        self.retrieved_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        self.catalog: list[dict] = []
        self.anomalies: list[tuple] = []

    # ---------- fetching ----------

    def _fetch(
        self, ds: dict, radio: str | None = None
    ) -> list[tuple[list[str], list[list[str]]]]:
        """-> every table in the response, in document order."""
        spec = self.client.form_spec(ds["path"])
        options = spec.select_options if ds.get("select") == "all" else None
        raw = self.client.historical(
            spec, DATE_FROM, DATE_TO, options=options, radio=radio
        )
        text = raw.decode("utf-8", "replace")

        if self.write_raw:
            RAW.mkdir(parents=True, exist_ok=True)
            name = ds["key"] + (f".{radio}" if radio else "") + ".html.gz"
            write_raw_if_changed(RAW / name, raw)

        return parse_tables(text)

    # ---------- shaping ----------

    def _wide(self, ds: dict, cols, rows, id_pattern, unit_default) -> list[tuple]:
        date_col = ds["date_col"]
        if date_col not in cols:
            raise ValueError(f"date column {date_col!r} not in {cols}")
        di = cols.index(date_col)
        kind = ds.get("date_kind")
        zero_missing = ds.get("zero_is_missing", False)
        out = []
        for name, meta in ds["columns"].items():
            if name not in cols:
                continue  # variant-specific column (inflation y/y vs m/m)
            ci = cols.index(name)
            suffix = meta["suffix"]
            if not isinstance(suffix, str):
                # YAML 1.1 reads bare ON/OFF/YES/NO as booleans, which once
                # produced a series literally called EG.IBK.D.True. Quote it.
                raise ValueError(
                    f"{ds['key']}: suffix for column {name!r} parsed as "
                    f"{type(suffix).__name__} ({suffix!r}) -- quote it in datasets.yaml"
                )
            sid = id_pattern.format(suffix=suffix)
            unit = meta.get("unit", unit_default)
            self._register(sid, ds, name, unit)
            drop_zero = zero_missing and not meta.get("zero_ok", False)
            for row in rows:
                period = normalise_date(row[di], kind)
                value = to_number(row[ci])
                if period is None or value is None:
                    continue
                # CBE prints 0.000% on days it published no rate. A zero rate
                # is not a real observation -- keeping it would put a spike to
                # the floor in every chart and wreck the series minimum.
                if drop_zero and value == 0:
                    continue
                out.append((sid, period, value))
        return out

    def _long_by_key(self, ds: dict, cols, rows) -> list[tuple]:
        di = cols.index(ds["date_col"])
        ki = cols.index(ds["key_col"])
        keymap = self.maps.get(ds.get("key_map"), {})
        kind = ds.get("date_kind")
        zero_missing = ds.get("zero_is_missing", False)
        out = []
        seen = set()
        for name in ds["value_cols"]:
            ci = cols.index(name)
            for row in rows:
                key = keymap.get(row[ki].strip(), slug(row[ki]))
                sid = ds["id_pattern"].format(key=key, col=name.upper())
                period = normalise_date(row[di], kind)
                value = to_number(row[ci])
                if period is None or value is None:
                    continue
                if zero_missing and value == 0:
                    continue  # a zero exchange rate means "not published"
                if sid not in seen:
                    seen.add(sid)
                    self._register(sid, ds, f"{row[ki].strip()} {name}", ds.get("unit"))
                out.append((sid, period, value))
        return out

    def _register(self, sid: str, ds: dict, label: str, unit: str | None) -> None:
        self.catalog.append(
            {
                "series_id": sid,
                "title_en": f"{ds['title_en']} - {label}",
                "dataset": ds["key"],
                "family": ds["family"],
                "freq": ds.get("freq"),
                "unit": unit,
                "source_url": "https://www.cbe.org.eg" + ds["path"],
            }
        )

    # ---------- per-dataset entry point ----------

    def run(self, ds: dict) -> dict:
        result = {"key": ds["key"], "status": "ok", "rows": 0, "series": 0}
        variants = ds.get("variants") or [{"radio": None, "id_pattern": ds.get("id_pattern")}]

        if ds["shape"] == "records":
            # Auction results arrive as one table per tenor, same columns.
            cols, rows = concat_tables(self._fetch(ds))
            result["rows"] = len(rows)
            if rows:
                CLEAN_RECORDS.mkdir(parents=True, exist_ok=True)
                with (CLEAN_RECORDS / f"{ds['key']}.csv").open(
                    "w", newline="", encoding="utf-8"
                ) as fh:
                    w = csv.writer(fh)
                    w.writerow(cols)
                    w.writerows(rows)
            return result

        # A dataset may return several panels that are NOT the same measure --
        # the interbank endpoints give rates then volumes. Those are declared
        # in `tables:`. Anything else must be a single table, and we raise
        # rather than quietly using the first one.
        panels = ds.get("tables")

        observations: list[tuple] = []
        raw_rows = 0
        for variant in variants:
            tables = self._fetch(ds, radio=variant.get("radio"))
            if not tables:
                continue
            if panels is None and len(tables) > 1:
                raise ValueError(
                    f"{ds['key']}: response has {len(tables)} tables but no "
                    "`tables:` config -- refusing to guess which one is the data"
                )
            raw_rows = max(raw_rows, sum(len(r) for _c, r in tables))

            for i, panel in enumerate(panels or [ds]):
                if i >= len(tables):
                    break
                cols, rows = tables[i]
                if not rows:
                    continue
                pattern = (
                    panel.get("id_pattern")
                    or variant.get("id_pattern")
                    or ds["id_pattern"]
                )
                if ds["shape"] == "wide":
                    spec = dict(ds)
                    spec["columns"] = panel.get("columns", ds.get("columns"))
                    observations += self._wide(
                        spec, cols, rows, pattern, panel.get("unit", ds.get("unit"))
                    )
                elif ds["shape"] == "long_by_key":
                    observations += self._long_by_key(ds, cols, rows)
                else:
                    raise ValueError(f"unknown shape {ds['shape']}")

        result["rows"] = raw_rows
        result["series"] = len({o[0] for o in observations})

        observations = self._dedupe(ds, observations)

        if observations:
            observations.sort(key=lambda o: (o[0], o[1]))
            CLEAN_SERIES.mkdir(parents=True, exist_ok=True)
            with (CLEAN_SERIES / f"{ds['key']}.csv").open(
                "w", newline="", encoding="utf-8"
            ) as fh:
                w = csv.writer(fh)
                w.writerow(["series_id", "period", "value"])
                w.writerows(observations)
        return result

    def _dedupe(self, ds: dict, observations: list[tuple]) -> list[tuple]:
        """Collapse repeated (series, period) pairs, recording what was dropped.

        CBE occasionally lists two different values for the same date -- the
        interbank weighted average has four such days, and on 2017-08-07 the
        two differ by 1.7%. We keep the first as served and write the conflict
        to data/clean/anomalies.csv rather than silently picking one.
        """
        first: dict[tuple[str, str], float] = {}
        conflicts: list[tuple] = []
        for sid, period, value in observations:
            key = (sid, period)
            if key not in first:
                first[key] = value
            elif first[key] != value:
                conflicts.append((sid, period, first[key], value, ds["key"]))

        if conflicts:
            self.anomalies.extend(conflicts)
            print(
                f"       {ds['key']}: {len(conflicts)} conflicting duplicate(s), "
                "kept first, logged to data/clean/anomalies.csv"
            )
        return [(sid, period, value) for (sid, period), value in first.items()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated dataset keys")
    ap.add_argument("--no-raw", action="store_true", help="skip writing data/raw")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    cfg = yaml.safe_load((pathlib.Path(__file__).parent / "datasets.yaml").read_text(encoding="utf-8"))
    datasets = cfg["datasets"]
    if args.only:
        wanted = {k.strip() for k in args.only.split(",")}
        datasets = [d for d in datasets if d["key"] in wanted]

    fetcher = Fetcher(cfg, CBEClient(delay=args.delay), write_raw=not args.no_raw)

    results, failures = [], []
    for ds in datasets:
        try:
            res = fetcher.run(ds)
        except WAFRejected as exc:
            print(f"FATAL  {ds['key']}: {exc}", file=sys.stderr)
            return 2  # a blocked IP is not a per-dataset problem; stop.
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL   {ds['key']}: {type(exc).__name__}: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            failures.append(ds["key"])
            continue

        floor = ds.get("expect_min_rows", 0)
        if res["rows"] < floor:
            print(
                f"SHORT  {ds['key']}: {res['rows']} rows, expected >= {floor}",
                file=sys.stderr,
            )
            failures.append(ds["key"])
            res["status"] = "short"
        else:
            print(f"ok     {ds['key']:26s} rows={res['rows']:<7d} series={res['series']}")
        results.append(res)

    if fetcher.catalog:
        (ROOT / "catalog").mkdir(exist_ok=True)
        path = ROOT / "catalog" / "series.json"
        # Merge, never replace. A `--only` run knows about a handful of
        # datasets; overwriting would silently delete the metadata for every
        # series it did not touch, including the derived ones.
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        by_id = {c["series_id"]: c for c in existing}
        for entry in fetcher.catalog:
            by_id[entry["series_id"]] = entry
        path.write_text(
            json.dumps(sorted(by_id.values(), key=lambda c: c["series_id"]), indent=1),
            encoding="utf-8",
        )
        # A per-series timestamp rewrote the whole catalog on every run even
        # when nothing moved. One file-level timestamp instead.
        (ROOT / "catalog" / "last_run.json").write_text(
            json.dumps({"retrieved_at": fetcher.retrieved_at, "series": len(by_id)}, indent=1),
            encoding="utf-8",
        )
        print(f"\ncatalog: {len(fetcher.catalog)} series this run, {len(by_id)} total")

    if fetcher.anomalies:
        with (ROOT / "data" / "clean" / "anomalies.csv").open(
            "w", newline="", encoding="utf-8"
        ) as fh:
            w = csv.writer(fh)
            w.writerow(["series_id", "period", "kept", "discarded", "dataset"])
            w.writerows(sorted(fetcher.anomalies))
        print(f"anomalies: {len(fetcher.anomalies)} conflicting duplicates logged")

    total = sum(r["rows"] for r in results)
    print(f"total rows: {total:,}   datasets ok: {len(results) - len(failures)}/{len(datasets)}")

    if failures:
        print(f"FAILURES: {', '.join(failures)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
