# `data/`  -  variable & source catalogues, generated outputs

> **Synthetic only.** This folder contains the machine-readable catalogues teams build against and the place where generated synthetic populations land. No real person-level data lives here.

## Layout

- [`variables.yaml`](variables.yaml)  -  machine-readable variable catalogue. Source of truth for **what** must be in a submission.
- [`sources.yaml`](sources.yaml)  -  machine-readable source catalogue. Source of truth for **where** every variable comes from (URL, table ID, licence).
- [`reference/`](reference/)  -  placeholder for downloaded CBS / RIVM / NRS reference data (gitignored, fetched via [`../tooling/fetchers/`](../tooling/fetchers/)).
- [`synthetic/`](synthetic/)  -  where teams place their generated synthetic populations (gitignored, except small `example-*/` illustrations of the expected format).

## Generating data

The challenge brief explicitly leaves the choice of synthesis method to teams. The starter tooling in [`../tooling/`](../tooling/) provides:

- thin fetchers around the public CBS Open Data API and the RWZI register;
- two example scripts: a minimal IPF and a MetaSyn demo;
- catalogue tests that validate [`variables.yaml`](variables.yaml) and [`sources.yaml`](sources.yaml).

```powershell
cd ..\tooling
pip install -e .[dev]
pytest -v                                     # validate the catalogues
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference
python examples\01_ipf_minimal.py             # minimal IPF demo on one buurt
```

## Expected output schema (illustrative)

A Layer 1 submission typically produces a table like:

| person_id | household_id | buurt_code | age_band | household_type | housing_type | work_sector | income_band | … | synthetic |
|---|---|---|---|---|---|---|---|---|---|
| 1 | h1 | BU03440101 | 25-44 | couple-with-children | apartment | services | mid | … | true |
| 2 | h1 | BU03440101 | 25-44 | couple-with-children | apartment | healthcare | mid | … | true |

A Layer 2 join attaches `rwzi_id`, `catchment_id`, and land-use shares to the *buurt*. See [`example-utrecht-overvecht/`](synthetic/example-utrecht-overvecht/) (placeholder, populated by teams or by the starter).

## Provenance rules

Every variable in a submission must:

1. Appear in [`variables.yaml`](variables.yaml) (extend the catalogue if you need a new one).
2. Trace back to an entry in [`sources.yaml`](sources.yaml) (extend with public, openly licensed sources only).
3. Be reproducible from a fixed seed.

See [`../docs/privacy-by-design.md`](../docs/privacy-by-design.md) for the minimum privacy precautions on the output.

