# Quality report  -  template

Copy this template into your submission as `quality-report.md` (or as a notebook that produces these artefacts). It maps directly to the **Should** and **Could** criteria in [`beoordelingscriteria.md`](beoordelingscriteria.md).

A submission without a quality report is hard to score on S1–S3; please include one even if it is minimal.

---

## 1. Coverage

- **Region(s):** *e.g. gemeente Utrecht, 124 buurten*
- **Number of synthetic individuals:** *e.g. 360 412*
- **Number of synthetic households:** *e.g. 178 050*
- **Random seed:** *e.g. 42*
- **Generator version / git commit:** *e.g. `abcdef0`*

## 2. Variable coverage

| Variable | Priority | Present? | Source table |
|---|---|---|---|
| Buurtcode | must | ✅ | CBS `86165NED` |
| Age band | must | ✅ | CBS `86165NED` |
| … | | | |

(Generate this table from your output schema vs. [`variables.yaml`](../data/variables.yaml).)

## 3. Marginal fit (must-have variables)

For each must-have variable, compare the synthetic marginal to the CBS source marginal at *buurt* level.

Report at least one of:

- **Mean Absolute Percentage Error (MAPE)** per variable, averaged over *buurten*.
- **Total Absolute Error / Total Population** per *buurt*, averaged.
- **χ² goodness-of-fit** for categorical variables.

| Variable | Metric | Value | Threshold |
|---|---|---|---|
| Age band | MAPE | … | < 5 % |
| Household type | χ² p-value | … | > 0.05 |
| … | | | |

Include at least one **plot** of synthetic vs. source marginals (per *buurt* or per age band).

## 4. Cross-domain consistency (S1)

Pick two or three cross-tabulations that matter epidemiologically, e.g.:

- Age × household type
- Work sector × age
- Income band × housing type

Compare the synthetic joint distribution to a public reference (a CBS publication that contains the cross-tab, or a national seed). Report a divergence measure (KL, Jensen-Shannon, χ²) and a 2-D heatmap.

## 5. Spatial coherence (S2)

Plot, for one or two variables, the synthetic *buurt* marginal vs. neighbour *buurten*. Highlight outliers. Optional: Moran's I or another spatial autocorrelation metric on the synthetic marginals vs. the CBS marginals.

## 6. Wastewater linkage (S4, only if Layer 2 is included)

- Which RWZIs are covered?
- Population (synthetic) and land-use shares per catchment.
- Sanity checks: does the synthetic population per catchment roughly match the catchment's "connected population" in the RWZI register?

## 7. Privacy measures (mandatory)

Refer to [`privacy-by-design.md`](privacy-by-design.md). Report:

- Quasi-identifier set.
- Minimum cell count / *k* achieved.
- Coordinate granularity and jitter rule.
- Suppressed cells, if any.

## 8. Reproducibility

- Single command to reproduce: `…`
- Approximate run time and memory.
- Source data provenance: which CBS / RIVM versions were used and when they were downloaded.

## 9. Known limitations

A short bullet list. Honesty here helps the jury more than over-claiming.

