# Synthesis methods

A short, opinion-light overview of methods teams commonly use to upscale CBS *buurt* aggregates into a synthetic micro-level population. The challenge brief deliberately leaves the choice open  -  your method must be justified in the pitch.

## 1. Iterative Proportional Fitting (IPF)

**Idea.** Start from a seed contingency table (e.g. national joint distribution of age × household type × housing type). Iteratively scale the rows and columns so that every marginal matches the CBS *buurt* aggregates. Sample individuals from the resulting fitted table.

**Strengths.**

- Mature, fast, well documented, deterministic given a seed.
- Preserves the joint structure of the seed table, just rescaled to local marginals.
- Plays well with [MetaSyn](https://github.com/sodascience/metasyn) and standard Python (`ipfn`, `pandas`).

**Limitations.**

- Quality of the output is bounded by the quality of the seed joint distribution.
- Cells that are zero in the seed stay zero  -  sparsity can be brittle.
- Spatial coherence requires extra work (run per *buurt*, then smooth across neighbours).

**Good fit for.** Layer 1 demographics on a national seed, applied per *buurt*.

## 2. Agent-based / synthetic-reconstruction methods

**Idea.** Build the population person-by-person and household-by-household using rule-based or sampled draws against multiple constraints (demographics, housing, work). Often combined with a Combinatorial Optimisation step (e.g. simulated annealing) to fit local aggregates.

**Strengths.**

- Naturally produces household groupings and relationships.
- Easy to extend with extra rules (e.g. children live with parents, students cluster).
- Composes well with downstream agent-based infection models.

**Limitations.**

- Computationally heavier, especially for full-country runs.
- Quality depends on the heuristics encoded in the rules.

**Good fit for.** Teams that intend to validate against an agent-based SEIR run (Could-criterion C1).

## 3. Generative models (copulas, VAEs, GANs, …)

**Idea.** Fit a generative model on a seed dataset (e.g. publicly available aggregated joint tables or a synthetic seed produced by another method) and sample from it conditional on *buurt* aggregates.

**Strengths.**

- Captures non-linear cross-domain relationships if seed data supports it.
- Flexible: same model can generate counterfactuals or scenario variants.

**Limitations.**

- Risk of producing implausible joint draws if the seed is too thin.
- Harder to certify privacy properties (k-anonymity is not automatic).
- Reproducibility requires fixed seeds and pinned framework versions.

**Good fit for.** Teams with prior experience in tabular generative modelling and time to validate.

## 4. Hybrid pipelines

Many published Dutch synthetic-population studies combine the above: e.g. IPF for demographic marginals, an agent-based step for household assembly, a coordinate sampler for spatial placement, a separate join for RWZI / land-use context.

A hybrid is fine for this challenge as long as every stage is documented and reproducible.

## Choosing a method (decision sketch)

- Limited time, single region, focus on Layer 1 → **IPF** with a national seed.
- Plan to validate via an agent-based SEIR run → **Agent-based reconstruction**.
- Want to demonstrate transferability and have ML experience → **Generative model** on top of IPF.
- Need wastewater linkage (Layer 2) → method-agnostic: build Layer 1 first, then join RWZI catchments and land-use to the population spatially.

## What to put in your pitch

- Which method, and why (one slide).
- Which seed / prior you used and where it came from.
- How you validated the result (link to [`kwaliteitsrapport-template.md`](kwaliteitsrapport-template.md)).
- Known failure modes and what you would do given more time.

