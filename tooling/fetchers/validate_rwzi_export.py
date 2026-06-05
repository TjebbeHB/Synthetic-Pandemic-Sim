"""Validate a manually exported RWZI file from Emissieregistratie Watson.

Accepted input formats: CSV, XLSX, XLS.

Run:
    python -m fetchers.validate_rwzi_export --in ../data/reference/rwzi_export.csv
"""

from __future__ import annotations

import argparse
import importlib
from pathlib import Path


# Minimal canonical fields we expect to identify RWZI locations.
REQUIRED_CANONICAL_FIELDS = {
    "rwzi_naam",
    "plaats",
    "lat",
    "lon",
}

# Known aliases observed in Dutch open-data exports.
ALIASES = {
    "rwzi_naam": {"rwzi", "rwzi_naam", "naam", "naam_rwzi", "inrichting"},
    "plaats": {"plaats", "gemeente", "woonplaats"},
    "lat": {"lat", "latitude", "y", "coord_y", "coordinaat_y"},
    "lon": {"lon", "lng", "longitude", "x", "coord_x", "coordinaat_x"},
}


def _normalize(name: str) -> str:
    text = name.strip().lower()
    for char in (" ", "-", "/", "(", ")", "."):
        text = text.replace(char, "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def _load_frame(path: Path):
    try:
        pd = importlib.import_module("pandas")
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'pandas'. Install tooling deps with `pip install -e .[dev]`."
        ) from exc

    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    raise ValueError(f"Unsupported extension: {suffix}. Use CSV or Excel.")


def _resolve_columns(columns: list[str]) -> dict[str, str]:
    normalized_to_original = {_normalize(col): col for col in columns}
    resolved: dict[str, str] = {}
    for canonical, candidates in ALIASES.items():
        hit = next((c for c in candidates if c in normalized_to_original), None)
        if hit:
            resolved[canonical] = normalized_to_original[hit]
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--in",
        dest="input_file",
        required=True,
        help="Path to the RWZI export file (CSV/XLS/XLSX).",
    )
    args = parser.parse_args()
    input_file = Path(args.input_file)

    if not input_file.exists() or not input_file.is_file():
        print(f"Input file not found: {input_file}")
        raise SystemExit(2)

    try:
        if input_file.suffix.lower() in {".xlsx", ".xls"}:
            pd = importlib.import_module("pandas")
            excel = pd.ExcelFile(input_file)
            sheets_lower = {s.lower() for s in excel.sheet_names}
            if "metadata" in sheets_lower and any("meetresult" in s for s in sheets_lower):
                print(
                    "This looks like a Watson 'Meetresultaten' export. "
                    "Use `python -m fetchers.parse_watson_meetresultaten --in <file>` instead."
                )
                raise SystemExit(0)

        frame = _load_frame(input_file)
    except Exception as exc:
        print(f"Could not read file: {exc}")
        raise SystemExit(2) from exc

    resolved = _resolve_columns([str(col) for col in frame.columns])
    missing = sorted(REQUIRED_CANONICAL_FIELDS - set(resolved))

    print(f"Rows: {len(frame)}")
    print(f"Columns: {len(frame.columns)}")
    print("Detected mapping:")
    for canonical in sorted(REQUIRED_CANONICAL_FIELDS):
        actual = resolved.get(canonical)
        print(f"  {canonical}: {actual if actual else 'MISSING'}")

    if missing:
        print("Validation failed. Missing required fields: " + ", ".join(missing))
        raise SystemExit(1)

    print("Validation passed. RWZI export has the minimum required fields.")


if __name__ == "__main__":
    main()