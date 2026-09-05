# Privacy by design

Even though this challenge uses only **publicly available aggregate data** as input, the *output*  -  a micro-level synthetic population  -  must remain demonstrably **non-attributable** to real individuals. This page lists the minimum precautions a submission is expected to follow.

## Why this matters

- CBS publishes aggregates *because* they cannot be reduced to identifiable individuals. If a synthetic record can be linked back to a real person  -  even probabilistically  -  that protection has been weakened.
- Combining several public sources can still create quasi-identifiers (e.g. rare combinations of *buurt* + age + work sector + housing type).
- The hackathon outputs are open-source by requirement; once published they are public forever. Plan for that.

## Inputs: what you may use

✅ Aggregate, openly licensed sources only (CBS StatLine, BAG, Emissieregistratie, RIVM/NRS open GIS).
❌ CBS Remote Access microdata, even if a team member has clearance. Do not use it as a seed; do not redistribute it.
❌ Any scraped person-level source.
❌ LLM-generated "imagined" persons that claim to be based on real individuals.

## Output: minimum precautions

1. **No real identifiers.** No real BSNs, names, addresses, or phone numbers. Where you need a stable ID, generate a synthetic UUID and tag the dataset as synthetic (e.g. a `synthetic: true` column or a manifest field).
2. **k-anonymity on quasi-identifiers.** Pick a sensible set of quasi-identifiers (e.g. *buurt* + age band + household type + work sector) and verify that every combination occurs at least *k* times in the output. *k* ≥ 5 is a reasonable starting point; *k* ≥ 10 is stronger.
3. **Small-cell suppression at source.** If you generate from a CBS marginal that was already suppressed (often values < 5 in CBS), do not "fill in" those cells from an unrelated source.
4. **No back-derivation of suppressed CBS cells.** If your synthesis method can in principle reconstruct a suppressed CBS cell (e.g. by reading another table that constrains it), document and break that path.
5. **Coordinates.** If you place households at coordinates, jitter them to the *buurt* centroid or a 100 m grid; never to a real BAG address.
6. **Reproducibility, not exposure.** A fixed seed is required for reproducibility, but combined with the generator the seed should not reveal anything beyond what the source aggregates already disclose.

## What to put in the submission

- A short paragraph in the quality report (`kwaliteitsrapport-template.md`) titled **Privacy measures** that explicitly lists:
  - The quasi-identifier set you chose.
  - The minimum cell count observed and the *k* value you achieved.
  - Coordinate granularity (centroid / grid / building) and the jitter rule.
  - Any cells you intentionally suppressed.
- A licence on the code that allows redistribution (Apache-2.0 / MIT / EUPL-1.2).
- A note in the README of your submission telling future users the dataset is synthetic and how to verify it.

## Out of scope for this challenge

- Differential privacy guarantees on the generator (welcome as bonus, not required).
- Formal disclosure-control audits  -  challenge owners may run those post-hackathon.

