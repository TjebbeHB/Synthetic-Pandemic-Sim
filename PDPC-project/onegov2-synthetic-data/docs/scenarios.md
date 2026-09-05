# Scenarios

Three concrete usage scenarios for the synthetic populations produced in this challenge. They map back to the two personas in [`personas.md`](personas.md) and to the judging criteria in [`beoordelingscriteria.md`](beoordelingscriteria.md).

---

## Scenario A  -  Seeding an infection-and-recovery model for a city district

**Persona.** Lena (RIVM).

**Goal.** Run an SEIR-style simulation of a respiratory outbreak in a Dutch city district, starting from a small number of index cases, and study how household composition and age structure shape the trajectory.

**Steps.**

1. Lena loads the synthetic population for one *wijk* (or a cluster of *buurten*) as a tabular file.
2. She groups individuals by household ID, then by *buurt*.
3. She seeds index cases in a small set of households and runs the SEIR model with age-stratified contact matrices.
4. She compares her runs to baseline scenarios with shuffled (de-correlated) attributes to see whether the cross-domain structure of the synthetic population actually matters.

**What the dataset must support.**

- Stable household identifiers grouping individuals into realistic households.
- Age bands (`0-14 / 15-24 / 25-44 / 45-64 / 65+`) consistent with the CBS marginals.
- A `buurt_code` per individual.
- Reproducibility: the same seed produces the same population.

---

## Scenario B  -  Interpreting a wastewater signal in an RWZI catchment

**Persona.** Daan (Erasmus MC).

**Goal.** Explain why two RWZIs draining similar-sized populations show very different pathogen-concentration trajectories.

**Steps.**

1. Daan picks two RWZIs and pulls their catchment polygons.
2. He intersects the catchments with the synthetic population's `buurt_code` (or coordinates) to get a population profile per catchment.
3. He overlays land-use shares (residential / industry / agricultural) inside each catchment.
4. He compares: do the catchments differ in household composition, work sector, age structure, or land-use mix in ways that match the observed difference in pathogen load?

**What the dataset must support.**

- RWZI catchments as a separate layer linked to the population layer.
- Land-use shares per catchment from CBS Bodemgebruik (`70262NED`).
- Aggregations per catchment (totals, age distributions, household types) that can be computed without exposing micro-records.

---

## Scenario C  -  Stress-testing a national early-warning prototype

**Persona.** Both, plus a hackathon jury.

**Goal.** Show that the synthesis approach is **transferable**: the same generator, with the same code path, produces a coherent population for a second region, not just the one the team developed against.

**Steps.**

1. The team picks a primary region (e.g. one *gemeente*) and builds + validates the synthetic population there.
2. They rerun the generator on a structurally different region (rural / mixed) without code changes  -  only configuration.
3. They show that the must-have variables still match CBS marginals within the agreed tolerance, and that spatial coherence holds.
4. The quality report includes both regions side by side.

**What the dataset must support.**

- A parameterised entry point (region / seed) that does not require hard-coded buurt lists.
- A quality report template that works on any region.
- No region-specific magic numbers baked into the generator.

