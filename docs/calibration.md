# Calibration: from "magic constants" to a target R₀

This note documents how the agent model's transmission parameters are set, why
the per-layer coefficients have the values they do, and how the scenario presets
and the **Calibrate β → target R₀** button work. It addresses the critique that
the contact-layer weights were hand-tuned without being tied to an
epidemiological target.

## What R₀ means here

R₀ (basic reproduction number) is the expected number of people one infectious
person infects in a **fully susceptible** population with **no interventions**.
It is the standard yardstick for "how transmissible is this pathogen", and every
respiratory pandemic scenario can be anchored to a literature value:

| Pathogen / scenario        | R₀ (literature)        | Source class |
|----------------------------|------------------------|--------------|
| Seasonal influenza         | 1.2 – 1.4              | RIVM / WHO influenza reviews |
| COVID-19 wild-type (2020)  | 2.4 – 3.4              | RIVM, Imperial, Eurosurveillance |
| COVID-19 Delta             | 4 – 6                  | CDC / ECDC variant reviews |
| Measles                    | 12 – 18                | WHO immunization standards |

We target **R₀ ≈ 2.6** for the default scenario (wild-type respiratory
pandemic), which is the centre of the COVID-19 wild-type range and a defensible
"new respiratory pathogen" baseline for pandemic-preparedness work.

## How the model produces R₀

The force of infection for a susceptible agent on a given day is

```
risk = 1 − exp(−β · susceptibility · (1 − immunity) · Σ_layer term_layer)
```

where each contact layer contributes

```
term_layer = COEFFICIENT_layer · intensity_layer · policyScale · pressure_layer
```

`β` is the `infectionRate` slider (per-contact transmissibility). The
`COEFFICIENT_layer` values are the exported `LAYER_COEFFICIENTS` in
[`src/simulation/engine.ts`](../src/simulation/engine.ts):

| Layer      | Coefficient | What it represents | Why this magnitude |
|------------|-------------|--------------------|--------------------|
| household  | 0.38        | shared dwelling, repeated close contact | Household secondary-attack rates dominate respiratory spread (≈30–40% SAR); highest weight. |
| event      | 0.13        | bars, venues, gatherings | Episodic but high-intensity / superspreading-prone; second highest. |
| work       | 0.105       | workplace / school clusters | Sustained daytime contact, but more ventilated/distanced than a home. |
| commute    | 0.075       | shared transit corridors | Short, intermittent exposure on routes between home and work. |
| community  | 0.075       | well-mixed neighbourhood background | Diffuse "everything else" term, scaled by urbanity/density. |

These ratios are the *structure* of the model (which settings matter relative to
each other). The single scalar `β` then sets the *level*, and that is what we
calibrate so the whole thing lands on a chosen R₀. In other words: the
coefficients encode epidemiological priors about settings; β is the one free knob
fitted to a target.

### Generation time

Two other parameters define the timescale and therefore translate R₀ into growth
rate: `incubationDays` (latent E→I, default 5) and `infectiousDays` (I→R/D,
default 7), giving a generation time of roughly 8–9 days for the default, in line
with early COVID-19 estimates.

## Measuring R₀ from the model

R₀ is not read off a formula — it is **measured from the exact runtime code** by
[`estimateR0`](../src/simulation/calibration.ts):

1. Place exactly **one** infectious agent in an otherwise fully-susceptible,
   intervention-free world (prior immunity, vaccination and policy all disabled).
2. Over one infectious period, accumulate who that index case infects, using the
   identical `susceptibleRisk` force of infection the live simulation uses.
3. Secondary cases are **not** allowed to transmit onward, so the count is a
   clean generation-1 R₀, not an attack rate.
4. Repeat for a few hundred index agents sampled across all neighbourhoods and
   average (weighted by how many real people each agent represents).

Because an index case only adds pressure to the nodes it belongs to (its
household, work cluster, event node, commute route and neighbourhood community
pool), only members of those nodes can be infected, so the inner loop is
restricted to them — fast enough to show a live **Model R₀** readout and to run
the calibration search in well under a second.

### Calibrating β

[`calibrateInfectionRate`](../src/simulation/calibration.ts) inverts the
relationship. Since `risk = 1 − exp(−β·…)` is almost linear in β in the
single-index low-hazard regime, it takes a proportional first guess
(`β · target / measured`) and then a few bisection steps to absorb the mild
saturation curvature. Typical result: target R₀ 2.6 → β ≈ 0.26; a full-lockdown
contact structure → β ≈ 0.22 lands R₀ ≈ 0.8.

> **Note:** with the default contact coefficients, the *previous* default
> `infectionRate = 0.62` actually produced R₀ ≈ 5.5. The shipped default is now
> `0.26`, calibrated to R₀ ≈ 2.6. This is exactly the kind of mismatch the
> calibration step is meant to catch.

## Scenario presets and realistic slider ranges

The presets in [`src/App.tsx`](../src/App.tsx) push the non-pharmaceutical knobs
to realistic extremes and carry a literature-anchored target R₀. Load a preset,
press **Calibrate β → target R₀**, then **Run model**.

| Preset | Events | Mobility | Household | Policy | Target R₀ | Real-world analogue |
|--------|--------|----------|-----------|--------|-----------|---------------------|
| Seasonal influenza | 0.80 | 1.0 | 1.0 | none | 1.3 | Annual flu wave, 30% prior immunity |
| COVID-19 baseline | 0.85 | 1.0 | 1.0 | none | 2.6 | 2020 wild-type, society open |
| Mild measures | 0.45 | 0.8 | 1.1 | day 14 | 1.8 | Advisories, partial WFH, events thinned |
| **Full lockdown** | **0.05** | **0.35** | **1.35** | day 7 | **0.8** | Venues shut, mobility cut, contacts forced home |
| No measures, dense mixing | 1.60 | 1.5 | 1.0 | none | 3.6 | Festivals on, no response (worst case) |

Why these extremes are realistic:

- **Events → 0.05 in lockdown.** Closing bars, venues and mass gatherings removes
  almost the entire episodic-superspreading layer; it should not be exactly 0
  (essential and informal gatherings persist), hence a small residual.
- **Household → 1.35 in lockdown.** "Stay home" *raises* household exposure: people
  spend more time indoors together, so the household layer is amplified, not cut —
  a frequently overlooked dynamic that the model now represents explicitly.
- **Mobility → 0.35 in lockdown** with an additional 80% `mobilityReduction`: work
  and commute layers are suppressed both by fewer trips (intensity) and by
  compliance-weighted policy reduction.
- **Events → 1.6 for "no measures"** lets the festival/superspreading layer run
  above its baseline, which is what drives R₀ up toward the Delta-like range.

Slider ranges were widened accordingly: events and mobility now span 0–2.0,
household exposure 0.4–2.0, and β 0.05–1.6 (which spans roughly R₀ 0.5 up into the
measles-like range at the default contact structure).

## Limitations

- R₀ is calibrated; the **per-layer split** is still expert-judgement, not fitted
  to contact-survey data (e.g. Pienter Corona / Mossong POLYMER matrices). Fitting
  the coefficients to an age-structured contact matrix is the natural next step.
- The estimate is a population-average R₀; it does not yet report the
  age-structured next-generation matrix or its dominant eigenvalue.
- Generation-time parameters are point values, not distributions fitted to a
  specific pathogen.
