# `tooling/`  -  starter Python tooling

> **Optional.** Teams are free to pick any language or framework. This folder is here so you can start exploring CBS data and the catalogues in five minutes.

## What's in here

| Path | Purpose |
|---|---|
| `pyproject.toml` | Pinned starter dependencies (pandas, pyarrow, cbsodata, pyyaml). Optional extras: `gis`, `synth`, `dev`. |
| `fetchers/cbs_statline.py` | Thin wrapper around the CBS Open Data API via [`cbsodata`](https://pypi.org/project/cbsodata/). |
| `fetchers/rwzi_register.py` | Downloads open RWZI spatial layers from PDOK WFS (`beheerstedelijkwater:BeheerBouwwerk`, `beheerstedelijkwater:BeheerGebied`) as GeoJSON. |
| `fetchers/validate_rwzi_export.py` | Validates a manual Watson export (CSV/XLS/XLSX) for required RWZI fields. |
| `fetchers/parse_watson_meetresultaten.py` | Parses Watson `Metadata` + `Meetresultaten` sheets to normalized CSV and provenance JSON. |
| `fetchers/landgebruik.py` | Stub for CBS Bodemgebruik (`70262NED`). |
| `examples/01_ipf_minimal.py` | Minimal Iterative Proportional Fitting demo on one *buurt*. |
| `examples/02_metasyn_demo.py` | Stub showing where MetaSyn fits in the pipeline. |
| `tests/test_catalogues.py` | Validates `data/variables.yaml` and `data/sources.yaml`. Runs in CI. |

## Quick start

```powershell
cd tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]

pytest -v
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference
python -m fetchers.rwzi_register --out ..\data\reference
# Optional: parse Watson measurement export to normalized CSV + provenance
python -m fetchers.parse_watson_meetresultaten --in ..\data\reference\Watson_Meetresultaten.xlsx --out-dir ..\data\reference
python examples\01_ipf_minimal.py --buurt BU03440101
```

## Design notes

- Fetchers are **read-only and idempotent**  -  repeated calls land identical files in `data/reference/`.
- No synthesis method is enforced. The examples are illustrative starting points; replace them with your own.
- All scripts take a `--seed` where randomness is involved, for reproducibility.

