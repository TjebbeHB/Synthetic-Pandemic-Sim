# Judging criteria

How the expert jury  -  including Ted Oliekan (Erasmus MC) and reviewers from CBS, ODISSEI and Digicampus  -  will weigh submissions. Four levels: **Must**, **Should**, **Should not**, **Could**.

A submission that fails any Must criterion is not a valid submission, regardless of how well it scores on the rest.

## ✅ Must  -  minimum requirements for a valid submission

| # | Criterion | How the jury checks |
|---|---|---|
| M1 | Micro-level synthetic dataset for at least one Dutch region | The submission ships a person- or household-level table for one or more *buurten* / *wijken* / *gemeente*. |
| M2 | Only publicly available sources | The PR description lists every source used and links to its public location; nothing closed or paywalled. |
| M3 | Open-source code and method | Repository is public and carries an OSI-approved licence (Apache-2.0, MIT, EUPL-1.2, …). |
| M4 | All must-have variables present | Every variable marked **must have** in [`docs/variables.md`](variables.md) appears in the output with its documented type and units. |

## ⭐ Should  -  distinguishing qualities

| # | Criterion | What it looks like |
|---|---|---|
| S1 | Cross-domain consistency | Joint distributions (age × household, work sector × income, …) are plausible, not just marginals. |
| S2 | Spatial coherence | Neighbourhood populations vary smoothly with geography; quality plots compare neighbouring *buurten*. |
| S3 | Quality parameters | A quality report (see [`kwaliteitsrapport-template.md`](kwaliteitsrapport-template.md)) reports goodness-of-fit against CBS marginals and joint distributions. |
| S4 | Wastewater linkage | Layer 2 variables (RWZI, catchment, land-use shares) are attached to the demographic layer. |

## ⚠ Should not  -  pitfalls to avoid

| # | Pitfall | Why it disqualifies (or seriously weakens) |
|---|---|---|
| X1 | Closed or paid sources used without disclosure | Violates M2; also breaks the "open by default" stance of the challenge. |
| X2 | Output that just reformats neighbourhood aggregates | No real upscaling  -  fails the core challenge ("upscaling a grainy photo"). |
| X3 | Non-reproducible or non-open code | Violates M3; jury cannot verify the method. |
| X4 | Privacy-careless handling | Anything that risks linking back to real individuals (see [`privacy-by-design.md`](privacy-by-design.md)). |

## ✨ Could  -  bonus for outstanding submissions

| # | Bonus | Evidence |
|---|---|---|
| C1 | Validated as input for a working infection-and-recovery model | A demo SEIR / agent-based run with the synthetic population, even at small scale. |
| C2 | Small-area realism | Plausible variation below *buurt* level (e.g. address-block, 100 m grid). |
| C3 | Epidemiologically meaningful patterns | E.g. clustering of vulnerable groups, age-segregated household clusters, commute structure. |
| C4 | Transferable approach | The same generator, same code, runs on a second region with only configuration changes. |
| C5 | Documented joins to other standards | Alignment with NL API Strategie, Common Ground, or known reference geodata. |

