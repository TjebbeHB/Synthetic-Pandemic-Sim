"""Parse Watson 'Meetresultaten' export into normalized files.

This script is a **parser, not an automated fetcher**. The Watson portal
(https://data.emissieregistratie.nl/watson) is publicly accessible without
login, but exports are produced by a user-driven query in the browser UI.

Workflow:
  1. Open https://data.emissieregistratie.nl/watson (no login required).
  2. Use the on-screen filters to scope your query (RWZI, stof, periode).
  3. Export the result as Excel and save it as
     `data/reference/Watson_Meetresultaten.xlsx`.
  4. Run this script to normalise the export.

Input is the Excel export with typically two sheets:
- Metadata
- Meetresultaten

Output:
- <prefix>.csv (normalized column names)
- <prefix>.provenance.json (query settings + parsing metadata)

Run:
    python -m fetchers.parse_watson_meetresultaten \
      --in ../data/reference/Watson_Meetresultaten.xlsx \
      --out-dir ../data/reference
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
from pathlib import Path


def _norm_col(name: str) -> str:
    text = str(name).strip().lower()
    for char in (" ", "-", "/", "(", ")", "."):
        text = text.replace(char, "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def _load_excel(path: Path):
    try:
        pd = importlib.import_module("pandas")
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'pandas'. Install tooling deps with `pip install -e .[dev]`."
        ) from exc

    return pd.ExcelFile(path), pd


def _extract_metadata(df) -> dict[str, str]:
    if df.shape[1] < 2:
        return {}
    metadata: dict[str, str] = {}
    left = df.iloc[:, 0]
    right = df.iloc[:, 1]
    for key, value in zip(left, right):
        key_str = str(key).strip() if key is not None else ""
        val_str = str(value).strip() if value is not None else ""
        if not key_str or key_str.lower() == "nan":
            continue
        if not val_str or val_str.lower() == "nan":
            continue
        metadata[key_str] = val_str
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="input_file", required=True, help="Path to Watson export xlsx.")
    parser.add_argument(
        "--out-dir",
        default="../data/reference",
        help="Directory for normalized outputs (csv + provenance json).",
    )
    parser.add_argument(
        "--prefix",
        default="watson_meetresultaten",
        help="Output filename prefix.",
    )
    args = parser.parse_args()

    input_file = Path(args.input_file)
    out_dir = Path(args.out_dir)
    prefix = args.prefix

    if not input_file.exists() or not input_file.is_file():
        print(f"Input file not found: {input_file}")
        raise SystemExit(2)

    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        excel, pd = _load_excel(input_file)
    except Exception as exc:
        print(f"Could not read excel file: {exc}")
        raise SystemExit(2) from exc

    sheet_names = list(excel.sheet_names)
    metadata_sheet = next((s for s in sheet_names if s.lower() == "metadata"), None)
    meet_sheet = next((s for s in sheet_names if "meetresult" in s.lower()), None)

    if meet_sheet is None:
        # Fallback: use first sheet when meetresultaten naming is missing.
        meet_sheet = sheet_names[0]

    meet_df = excel.parse(meet_sheet)
    meet_df.columns = [_norm_col(c) for c in meet_df.columns]

    # Drop fully empty rows to keep output tidy.
    meet_df = meet_df.dropna(how="all")

    # Canonical renames for the most relevant fields.
    renames = {
        "stofnaam": "stof_naam",
        "jaar": "rapportage_jaar",
        "rwzicode": "rwzi_code",
        "locatie": "rwzi_locatie",
        "aantal": "aantal_metingen",
        "gem": "gemiddelde",
        "med": "mediaan",
    }
    cols = dict(meet_df.columns.map(lambda c: (c, renames.get(c, c))))
    meet_df = meet_df.rename(columns=cols)

    metadata: dict[str, str] = {}
    if metadata_sheet is not None:
        metadata_df = excel.parse(metadata_sheet)
        metadata = _extract_metadata(metadata_df)

    csv_path = out_dir / f"{prefix}.csv"
    provenance_path = out_dir / f"{prefix}.provenance.json"

    meet_df.to_csv(csv_path, index=False)

    provenance = {
        "source": {
            "system": "emissieregistratie-watson",
            "url": "https://data.emissieregistratie.nl/watson",
            "input_file": str(input_file),
            "sheet_names": sheet_names,
            "meetresultaten_sheet": meet_sheet,
            "metadata_sheet": metadata_sheet,
        },
        "extraction": {
            "parsed_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "rows": int(len(meet_df)),
            "columns": list(map(str, meet_df.columns)),
        },
        "query_settings": metadata,
        "notes": [
            "No RWZI catchment geometry is included in this export.",
            "Use rwzi_code/rwzi_locatie as join keys if no separate catchment source is available.",
        ],
    }

    provenance_path.write_text(json.dumps(provenance, indent=2), encoding="utf-8")

    print(f"Wrote normalized data: {csv_path}")
    print(f"Wrote provenance: {provenance_path}")
    print(f"Rows: {len(meet_df)} | Columns: {len(meet_df.columns)}")


if __name__ == "__main__":
    main()
