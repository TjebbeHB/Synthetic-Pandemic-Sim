## Summary

<!-- One paragraph: what does this PR add or change? -->

## Type of contribution

- [ ] **Hackathon team submission** (one PR per team  -  fork → PR into `main`)
- [ ] Starter-repo improvement (docs, fetchers, catalogue, CI)
- [ ] Bug fix
- [ ] Other (describe)

---

## For hackathon team submissions

### Team

- **Team name:**
- **Members:**
- **Region(s) covered:**
- **Layer focus:** [ ] Layer 1 (demographics) [ ] Layer 2 (RWZI / land-use) [ ] Both

### ✅ Must-have checklist (jury blocking)

- [ ] **M1**  -  Submission contains a micro-level synthetic dataset for at least one Dutch region.
- [ ] **M2**  -  Only publicly available sources used; every source is listed below and links to a public location.
- [ ] **M3**  -  Code and method are open-source under an OSI-approved licence (Apache-2.0, MIT, EUPL-1.2, …); dataset and quality report under CC BY 4.0 or CC0. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#licensing-of-contributions) for the canonical rule.
- [ ] **M4**  -  Output covers every variable marked `must-have` in [`data/variables.yaml`](../data/variables.yaml).

### ⭐ Should-have evidence (linked in the PR body)

- [ ] **S1**  -  Cross-domain consistency (cross-tabs + divergence metric).
- [ ] **S2**  -  Spatial coherence (neighbour comparison, optional Moran's I).
- [ ] **S3**  -  Quality report following [`docs/kwaliteitsrapport-template.md`](../docs/kwaliteitsrapport-template.md).
- [ ] **S4**  -  Wastewater linkage (RWZI / catchment / land-use joined to demographics).

### Privacy by design

- [ ] No real BSNs, names, addresses, or phone numbers in the output.
- [ ] Quasi-identifiers documented and `k` reported in the quality report (see [`docs/privacy-by-design.md`](../docs/privacy-by-design.md)).
- [ ] Coordinates jittered or aggregated; no real BAG addresses used as output coordinates.

### Sources used

<!-- One bullet per source, e.g.: CBS 86165NED (Kerncijfers wijken en buurten)  -  https://opendata.cbs.nl/#/CBS/nl/dataset/86165NED -->

### Reproduction

```powershell
# Single command that reproduces the submission from a clean checkout:
```

### Pitch artefacts

- [ ] Pitch deck (max. 10 slides)  -  link or attachment
- [ ] Quality report  -  file in the PR
- [ ] Demo recording or live-demo slot booked

---

## For starter-repo improvements

- [ ] Docs / data / catalogue changes updated together (variables, sources, README, docs).
- [ ] `pytest -v` passes locally (`tooling/`).
- [ ] CI ([`.github/workflows/validate.yml`](workflows/validate.yml)) is green.
- [ ] Related issue: #

