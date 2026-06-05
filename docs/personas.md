# Personas

Two personas guide the design of submissions in this challenge. They are composites based on the user research that informed the challenge brief, not real individuals. Use them to keep your dataset and code grounded in concrete needs.

---

## 01 · Lena  -  *the epidemiologist who needs a population she can trust*

**Role.** Senior epidemiologist, RIVM.

**Situation.** Lena models the spread of respiratory infections in urban areas. Her infection-and-recovery models (SIR / SEIR variants, agent-based extensions) need a synthetic population at micro level. She cannot legally work with real person-level records and does not have months to build a population herself.

**Profile.**

| | |
|---|---|
| Discipline | Epidemiology, infectious-disease modelling |
| Tooling | Python (pandas, NumPy, NetworkX), occasional R |
| Data appetite | One Dutch region at a time, easily loaded into memory or chunked |
| Output she needs | A tabular synthetic population with stable variable names and a quality report |

**Pain points.**

- Public CBS data is aggregated at *buurt* level  -  too coarse for her models.
- Building a synthetic population herself takes weeks of data wrangling.
- She cannot easily validate whether the cross-domain relationships (age × work sector × household) are realistic.
- Without that validation, she cannot defend her model outcomes to policy.

**What "good" looks like for Lena.**

- A clear data dictionary, one file per population, deterministic given a seed.
- Variables that map directly to the building blocks of an infection model: age band, household ID, contact-relevant sector, location at *buurt* level.
- A quality report that compares the synthetic marginals against CBS source statistics.

> *"If I don't know whether the dataset is epidemiologically realistic, I can't trust the model outcomes."*

---

## 02 · Daan  -  *the data analyst who needs a population around a sewer*

**Role.** Data analyst (wastewater surveillance), Erasmus MC.

**Situation.** Daan analyses pathogen concentrations in wastewater samples from dozens of RWZIs across the Netherlands. A spike in a signal is hard to interpret without knowing *who* lives in the catchment that drains into that RWZI. Currently he stitches together demographics by hand, per region.

**Profile.**

| | |
|---|---|
| Discipline | Wastewater epidemiology, metagenomics |
| Tooling | Python + GIS (geopandas, shapely), QGIS for exploration |
| Data appetite | All RWZI catchments in the Netherlands, joined to a demographic layer |
| Output he needs | A geographic join: synthetic-population aggregates per RWZI catchment, plus land-use context |

**Pain points.**

- RWZI catchment polygons contain no demographic information.
- Pathogen peaks cannot be explained without knowing the population that drains into the sampling point.
- Manually joining spatial and demographic layers per region is slow and error-prone.
- Public CBS data is on *buurt* boundaries, which do not align with catchment boundaries.

**What "good" looks like for Daan.**

- The synthetic population carries a `buurt_code` and a coordinate, so it can be intersected with any catchment polygon.
- The catchment join is precomputed for the regions covered by the submission.
- Land-use context (residential / industry / agriculture / green / water shares) is attached to the catchment.

> *"A wastewater signal without population context is an alarm without an address."*

