"""Fetch a CBS StatLine table via the public CBS Open Data API.

Thin wrapper around the `cbsodata` package. Writes a parquet file to the
output directory, named after the table id and (optionally) the region filter.

Examples
--------
    python -m fetchers.cbs_statline --table 86165NED --out ../data/reference
    python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" \
        --out ../data/reference

Notes
-----
* Region filtering is done client-side after download: the CBS API returns
  all rows for the chosen table, and we filter on the column that holds the
  area name (`WijkenEnBuurten` / `RegioS` depending on the table).
* This script is intentionally minimal. Extend it in your fork as needed.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", required=True, help="CBS table id, e.g. 86165NED.")
    parser.add_argument(
        "--region",
        default=None,
        help="Optional substring match on the area name column.",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Output directory. A parquet file is written here.",
    )
    args = parser.parse_args()

    table: str = args.table
    region: str | None = args.region
    out = Path(args.out)

    try:
        cbsodata = importlib.import_module("cbsodata")
        pd = importlib.import_module("pandas")
    except ImportError as exc:  # pragma: no cover - install hint
        print(
            "Missing dependency: install the starter tooling with "
            "`pip install -e .[dev]` from the tooling/ folder."
        )
        raise SystemExit(1) from exc

    out.mkdir(parents=True, exist_ok=True)
    print(f"Fetching CBS table {table} ...")
    rows = cbsodata.get_data(table)
    df = pd.DataFrame(rows)

    if region:
        area_col = next(
            (c for c in df.columns if c in {"WijkenEnBuurten", "RegioS", "Regio"}),
            None,
        )
        if area_col is None:
            print(
                f"Could not find a region column in table {table}; "
                f"available columns: {list(df.columns)[:10]} ..."
            )
            sys.exit(2)
        before = len(df)
        df = df[df[area_col].astype(str).str.contains(region, case=False, na=False)]
        print(f"Filtered {before} → {len(df)} rows on {area_col} ~ '{region}'.")

    suffix = f"_{region.lower().replace(' ', '-')}" if region else ""
    target = out / f"{table}{suffix}.parquet"
    df.to_parquet(target, index=False)
    print(f"Wrote {target} ({len(df)} rows, {len(df.columns)} columns).")


if __name__ == "__main__":
    main()
