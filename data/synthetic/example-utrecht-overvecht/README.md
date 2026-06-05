# Example: Utrecht  -  Overvecht (placeholder)

This folder is a placeholder showing the expected layout for a team submission. A real team would replace it with their own folder under `data/synthetic/<region-slug>/`.

## Expected contents

| File | Purpose |
|---|---|
| `population.parquet` (or `.csv`) | The synthetic micro-level table  -  one row per individual. |
| `households.parquet` (or `.csv`) | Optional aggregated view per household. |
| `catchment_join.parquet` | Optional Layer 2 join: population × RWZI catchment × land-use. |
| `quality-report.md` | Per the [template](../../../docs/kwaliteitsrapport-template.md). |
| `manifest.json` | `{ "region": "...", "seed": 42, "generator_commit": "...", "synthetic": true }` |

## Naming convention

`example-<gemeente>-<wijk-or-buurt>/` for illustrative examples; teams use `<team-slug>-<region>/` for their own submissions.

