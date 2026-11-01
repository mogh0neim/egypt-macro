"""Check the published API against its written contract, before it deploys.

The phone app reads api/v1 and old copies of the app stay on phones for years,
so a field that goes missing or changes type breaks people who never update.
The contract is the JSON Schema files in contract/api-v1/ (see its README).
This script checks every file of a built api/v1 against them, plus the links
between files that a schema cannot express, and exits non-zero on any break.

Only the slice of JSON Schema the contract uses is understood here: type,
required, properties, additionalProperties, items, prefixItems, enum, pattern,
minItems, maxItems, minimum. That keeps the deploy free of another dependency.
An unknown keyword is an error, so a schema can never promise more than is
checked.

Run:  python ingest/check_api.py [path/to/api/v1]     (default dist/api/v1)
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contract" / "api-v1"

# Which schema governs which file. series/*.json is every per-series file.
FILES = {
    "series.json": "series-index.schema.json",
    "sparks.json": "sparks.schema.json",
    "latest.json": "latest.schema.json",
    "mpc.json": "mpc.schema.json",
    "mpc_calendar.json": "mpc-calendar.schema.json",
    "events.json": "events.schema.json",
    "changes.json": "changes.schema.json",
}
SERIES_SCHEMA = "series.schema.json"

KNOWN = {"$schema", "$id", "title", "description", "type", "required", "properties",
         "additionalProperties", "items", "prefixItems", "enum", "pattern",
         "minItems", "maxItems", "minimum"}
TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
}


def validate(value, schema, path="$", errors=None, limit=20):
    """Return a list of 'path: problem' strings, empty when value fits schema."""
    errors = [] if errors is None else errors
    if len(errors) >= limit:
        return errors
    unknown = set(schema) - KNOWN
    if unknown:
        raise ValueError(f"schema at {path} uses unsupported keywords {sorted(unknown)}")

    if "type" in schema:
        kinds = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(TYPES[k](value) for k in kinds):
            errors.append(f"{path}: expected {'/'.join(kinds)}, got {type(value).__name__}")
            return errors
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} is not one of {schema['enum']}")
    if "pattern" in schema and isinstance(value, str) and not re.search(schema["pattern"], value):
        errors.append(f"{path}: {value!r} does not match {schema['pattern']}")
    if "minimum" in schema and TYPES["number"](value) and value < schema["minimum"]:
        errors.append(f"{path}: {value} is below {schema['minimum']}")

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required field {key!r}")
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in props:
                validate(item, props[key], f"{path}.{key}", errors, limit)
            elif extra is False:
                errors.append(f"{path}: unexpected field {key!r}")
            elif isinstance(extra, dict):
                validate(item, extra, f"{path}.{key}", errors, limit)

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: {len(value)} items, at least {schema['minItems']} expected")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: {len(value)} items, at most {schema['maxItems']} expected")
        prefix = schema.get("prefixItems", [])
        for i, item in enumerate(value):
            if len(errors) >= limit:
                break
            if i < len(prefix):
                validate(item, prefix[i], f"{path}[{i}]", errors, limit)
            elif "items" in schema:
                validate(item, schema["items"], f"{path}[{i}]", errors, limit)
    return errors


def load(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def check(api: pathlib.Path) -> list[str]:
    problems = []
    data = {}
    for name, schema_name in FILES.items():
        target = api / name
        if not target.exists():
            problems.append(f"{name}: missing")
            continue
        data[name] = load(target)
        problems += [f"{name} {e}" for e in validate(data[name], load(CONTRACT / schema_name))]

    series_schema = load(CONTRACT / SERIES_SCHEMA)
    index = data.get("series.json") or []
    ids = [s.get("series_id") for s in index if isinstance(s, dict)]

    # Links between files, which no single schema can see.
    if len(ids) != len(set(ids)):
        problems.append("series.json: a series_id appears twice")
    files = {p.stem for p in (api / "series").glob("*.json")}
    missing = sorted(set(ids) - files)
    if missing:
        problems.append(f"series/: no file for {len(missing)} indexed series, e.g. {missing[:3]}")
    for name in ("sparks.json",):
        stray = sorted(set(data.get(name) or {}) - set(ids))
        if stray:
            problems.append(f"{name}: {len(stray)} ids not in series.json, e.g. {stray[:3]}")
    latest = (data.get("latest.json") or {}).get("series") or {}
    if set(latest) != set(ids):
        problems.append(f"latest.json: covers {len(latest)} series, series.json has {len(ids)}")
    for s in index:
        row = latest.get(s.get("series_id")) if isinstance(s, dict) else None
        if row and (row.get("period") != s.get("last") or row.get("value") != s.get("latest_value")):
            problems.append(f"latest.json: {s['series_id']} disagrees with series.json")
            break

    bad = 0
    for sid in sorted(set(ids) & files):
        doc = load(api / "series" / f"{sid}.json")
        errors = validate(doc, series_schema, limit=3)
        if not errors and doc["series_id"] != sid:
            errors = [f"series_id is {doc['series_id']!r}"]
        if errors:
            bad += 1
            if bad <= 5:
                problems += [f"series/{sid}.json {e}" for e in errors]
    if bad > 5:
        problems.append(f"series/: {bad} files break the contract in all")
    return problems


def main() -> int:
    api = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "api" / "v1"
    problems = check(api)
    if problems:
        print("api/v1 breaks its contract (contract/api-v1/README.md):")
        for p in problems:
            print("  " + p)
        return 1
    print(f"api/v1 matches its contract ({api})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
