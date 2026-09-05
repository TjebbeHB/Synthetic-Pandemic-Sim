# Methods & Realism Assessment — Synthetic Netherlands Pandemic System

> **Archief uit het bronproject.** De kwalificaties hieronder zijn geen nieuwe onafhankelijke validatie. Voor de PDPC-doorontwikkeling gelden de [actuele reikwijdte en beperkingen](onegov2-synthetic-data/docs/pdpc-workspace.md), waaronder de scheiding tussen offline populatiedataset en interactieve engine.

*A candid, technical walk-through of how the whole thing works, what is genuinely
realistic, what is approximated or fudged, and where the modelling should not be
trusted. Written as an honest internal review, not a pitch — the polished
public-facing write-up lives in [`onegov2-synthetic-data/docs/scientific-report.md`](onegov2-synthetic-data/docs/scientific-report.md).*

Date: 2026-06-12.

---

## 0. TL;DR verdict

| Component | What it is | Honest grade |
|---|---|---|
| **Synthetic population (GenSynthPop)** | One synthetic row per resident, attributes conditioned on real CBS buurt marginals | **Good.** Method is faithful and the marginal fit is paper-grade (SAE 0.016–0.023). Cross-attribute correlations are imported from national tables, not local — a real but documented compromise. |
| **Nationwide build** | Same method scaled to all of NL | **Now complete: 17,939,650 people, 342/342 municipalities** (the earlier run was killed at 91 %; the missing 31 have since been built and appended). Fit is paper-grade (SAE 0.017–0.024). |
| **Netherlands macro model** | Metapopulation SEIRD over ~500 density clusters, coupled by gravity diffusion + the real NS rail backbone | **A legitimate spatial-epi approach, geography-real, parameters illustrative.** Cluster locations/populations come from the CBS/PDOK raster; the rail graph is the real intercity network; the coupling strengths are tunable dials, not fitted flows. |
| **Disease engine (agent SEIRD)** | 5-layer force-of-infection over weighted agents, R₀-calibrated | **Structurally realistic, parametrically hand-tuned.** Good bones (escape-hazard FOI, latent seeding, age-structured severity), but layer weights are expert judgement, not fitted to contact-survey data. |
| **Mobility & behaviour** | Commute links, daytime/event clusters, per-agent compliance & event affinity | **Stylised, not data-driven.** Plausible *structure*; the numbers are invented, transport mode is cosmetic, and there is no real origin–destination or time-use data behind it. |
| **Geographic resolution of the *simulator*** | 8 city-average nodes (national) or one city's buurten | **This is the biggest gotcha.** The 16-million-row population and the thing the simulator actually runs on are **two different objects**. |

**The single most important thing to understand:** the beautiful full-country
synthetic population is a *standalone dataset*. The interactive simulator does **not**
run on it. In "national" mode the simulator runs ~1,340 *weighted* agents over **8
city-average nodes**; in city mode it runs one city's buurten. They share data
sources and philosophy, but the 17.9 M-person CSV is not the simulation substrate.

---

## 1. The "all of NL" dataset — what happened, and the fix (now complete)

You were right that something looked wrong — but the cause was mundane, not a
modelling error, and it is now resolved.

**What had gone wrong**
- The full build (`build_netherlands_population.py`) had been **killed at ~91 %**.
- What you inspected — the sample CSV and summary JSON — were **stale leftovers
  from an earlier 5-municipality smoke test** (Groningen, Almere, Stadskanaal,
  Veendam, Zeewolde — the first five alphabetically). The build writes those files
  *only at the end*, so the kill left the old ones in place. Hence the appearance
  of "mainly Groningen / Stadskanaal / Zeewolde / Almere."
- The real `.csv.gz` already held **16,280,330 people across 311 of 342
  municipalities**; its gzip tail was just unfinalised (it ended mid-write).

**The 31 that were missing — and why.** They split into two groups:
- **~19 that *failed mid-build*** (Amersfoort, Heerlen, Venlo, Assen, Capelle,
  Lansingerland, …). Root cause: a `ZeroDivisionError` in the shared household
  partitioner — in tiny / CBS-suppressed buurten the household-type counts round
  to zero, leaving an empty "overflow" list (`overflow[k % 0]`). Rotterdam never
  hit it; small rural buurten nationwide do. **This is the same code path that
  produced the 1,026-person mega-households.** A single capacity guard (ensure
  enough homes for the adults at ~2 per multi-home) fixes *both* — and only
  activates for pathological buurten, so the validated outputs are unchanged.
- **12 that the kill never reached** — the high-code tail GM1960–GM1992
  (West Betuwe → Voorne aan Zee).

**Fix applied.** A crash-safe `finalize_netherlands.py` streamed the 16.28 M valid
rows into a fresh, cleanly-closed gzip, then synthesised only the 31 missing
municipalities (with the partitioner fixed) and appended them — no 50-minute
re-run. Final, verified:

```
Individuals : 17,939,650   (342 / 342 municipalities, 14,089 buurten)
Per-buurt SAE: age 0.0235 · gender 0.0198 · migration 0.0165   (paper good-fit ≤ 0.05)
Households   : 8,340,872 · mean size 2.15 · single-person 46.0 % · 5+ 2.1 %   (CBS ≈ 2.1 / ~49 %)
```

**One remaining caveat (honest).** The 311 municipalities carried over from the
original run were built *before* the partitioner fix, so the dataset's
`max_household_size` is still **1,026** (in those carried-over rows only; the 31
rebuilt ones cap at ~50–100). To propagate the cap everywhere, the full build can
be re-run now that the bug is fixed (~50 min) — the method and the fit are
unaffected either way. **"Too ambitious" was right in one sense:** a single-shot,
~50-minute build that only finalises at the end is fragile; the build is now
crash-safe and resumable (see §8).

---

## 2. System architecture in one diagram

```
        CBS StatLine (open aggregate data)
        ├─ 85984NED  Kerncijfers wijken en buurten  (buurt marginals)
        ├─ 71488ned  household-position × age × gender (national joint)
        └─ education × age × migration (national joint)
                    │
   ┌────────────────┴───────────────────┐
   │                                     │
(A) SYNTHETIC POPULATION            (B) AGENT SIMULATOR (browser, TS)
   GenSynthPop, Python                   ~1,340 weighted agents
   1 row per resident                    8 city nodes (national) │ buurten (city)
   → CSV  (standalone deliverable)       5-layer SEIRD force of infection
                                         R₀-calibrated, NPI levers, surveillance
```

(A) and (B) are **methodologically siblings, not pipeline stages.** (A) is not fed
into (B) at full resolution. This is fine — but it must be stated, because a reader
naturally assumes the 16 M-person dataset *is* what gets simulated.

---

## 3. Part A — Synthetic population: method

**Faithful to GenSynthPop** (de Mooij et al. 2024). Per municipality:

1. **Instantiate** exactly `population` empty individuals per CBS buurt.
2. **Conditionally add attributes** with `ConditionalAttributeAdder`, each new
   attribute drawn from a contingency table conditioned on previously-added ones:
   `age_group → age → gender → migration → household-position → activity →
   education`. This preserves correlations (children are in school, seniors are
   retired, etc.).
3. **Partition into households** anchored to each buurt's reported
   single/no-kids/with-kids composition, with age-plausible parent–child links.
4. **Household-level draws**: income tercile, car ownership (Poisson to match
   cars-per-household), work sector from the buurt's SBI establishment mix.

### What is genuinely good / realistic
- **Spatial marginal fit is excellent and measured, not asserted.** Per-buurt SAE
  0.016–0.023 across 12,265 buurten — inside the paper's "good" band, and it
  *improves* with scale because large-N noise averages out.
- **Correlations are preserved, not independent sampling.** The conditional chain
  means age×activity, age×household-position, age×migration×education are
  jointly plausible, which is the whole point of GenSynthPop over naïve marginal
  sampling.
- **Real geography.** Every person carries a real CBS `neighb_code`, so the data
  can be joined to mobility, RWZI catchments, facilities, land use.
- **Honest provenance.** Everything traces to a named public CBS table; no real
  microdata is touched. National household mean (2.16) and single-share (46 %) land
  close to CBS (2.1 / ~49 %).

### What is approximated or weak (the "bad")
- **Correlations are NATIONAL, not local.** Buurt-level joints (e.g. education ×
  age × migration) aren't published, so the national joint is reused everywhere
  and only re-fitted to local *marginals*. A high-migration, low-income buurt gets
  the *national* education-by-migration pattern, not its own. Defensible (it's
  exactly what the paper does when low-aggregation tables are missing) but it
  means within-buurt socio-economic texture is smoother than reality.
- **Education for the working-age is national, income is a buurt tercile, and the
  two are not correlated to each other.** A genuinely better model would link
  income to education/occupation (CBS 85064NED). Right now income is essentially a
  household-level lottery weighted by buurt income shares.
- **Activity priors are hand-set proportions**, nudged by the buurt's worker
  intensity — not a fitted labour-market model. (This is also where a real bug
  lived: high-employment buurten could push the "employed" share past the
  available pool and produce a negative probability — now fixed by capping
  `employed ≤ employed+not_working`.)
- **Household partitioner is pragmatic, not the paper's suitability-scored
  grouper.** It anchors household *counts/types* to CBS and fills them, which keeps
  the single-share honest — but the overflow/institutional logic produces a small
  number of absurd "households" (max size **1,026**). These should be capped or
  split; a pandemic centre will (rightly) flag them.
- **CBS cell suppression** in small buurten is handled by backfilling a whole
  zeroed marginal from the national distribution (84 buurten). Reasonable, but
  those buurten are then "nationally average," not locally specific.
- **`age` within a band is uniform random** (with a mild decay above 65). Fine for
  5-band work, wrong if you need single-year age structure.

**Bottom line on (A):** trustworthy as a *spatial demographic* synthetic
population at buurt resolution; treat its *socio-economic correlations* and
*household interiors* as nationally-flavoured approximations, and clean the
household-size tail before operational use.

---

## 4. Part B — Disease engine: method

A discrete-day **agent SEIRD** model (`src/simulation/engine.ts`). Each day, every
susceptible agent's infection probability is an **escape hazard** summed over five
contact layers:

```
risk = 1 − exp( −β · susceptibility · (1−immunity) · Σ_layer T_layer )
```

with layers **household, work, commute, event, community**, each a coefficient ×
intensity × policy-scale × local infectious pressure. Pressure in a shared node is
the count of infectious members divided by (household) size or √size (work/event)
— a saturating, density-aware contact term. Disease progression uses randomised
incubation/infectious durations; death risk is age-structured severity ×
`mortalityMultiplier` plus an age-independent `baseLethality` floor (for engineered
pathogens). Seeds start **exposed**, not infectious, so surveillance signals rise
with a realistic lag.

### What is genuinely good / realistic
- **The functional form is correct.** Escape-hazard FOI with multiple settings is
  the standard, defensible way to combine contact layers; it saturates properly
  (no probabilities > 1) and is density-weighted.
- **R₀ is *calibrated*, not guessed.** A single-generation next-generation
  Monte-Carlo (`calibration.ts`) reuses the exact engine FOI to estimate R₀, and a
  bisection sets β to hit a target. The UI shows the live model-R₀, so claims are
  checkable, and it cross-validates against the growth-rate SEIR identity.
- **Age structure where it matters:** susceptibility, severe-risk (IFR ramps from
  0.0002 at 0–14 to 0.013 at 65+), event attendance and vaccination priority are
  all age-dependent.
- **"Stay home raises household exposure"** is explicitly modelled — lockdown
  *increases* the household term while cutting events/mobility. This second-order
  effect is frequently missed and is a genuine strength.
- **Latent-seed surveillance lag** and the wastewater/hospital detection model
  (`detection.ts`) reproduce the real "blind window" between true spread and
  official detection — the most policy-relevant feature here.
- **NPI toolkit (new):** masks, school closure, case-isolation/test-trace and
  travel restriction each act on the *specific layers they should* — e.g. case
  isolation cuts community/work shedding but **not** within-household, because you
  cannot isolate from the people you live with. Verified monotonic (peak infectious
  240,929 → 100,174 with 85 % isolation → 43,127 for the full package).

### What is approximated or weak (the "bad")
- **Layer coefficients are expert judgement, not fitted** to a contact matrix
  (POLYMOD / PiCo / Mossong). So the *relative* contribution of work vs events vs
  community is a modelling choice. R₀ is calibrated as a whole; the *split* is not
  validated.
- **No age-structured next-generation matrix.** R₀ is a population average; the
  model does not report the dominant eigenvalue of an age-mixing matrix, so it
  can't speak to who-infects-whom by age.
- **Generation-time parameters are point values × noise**, not pathogen-specific
  fitted distributions. No explicit pre-symptomatic vs symptomatic infectiousness
  profile — infectiousness is flat over the infectious period.
- **Weighted agents, not individuals.** In national mode ~1,340 agents each
  represent ~2,500 people; a single agent's state change moves thousands of people
  at once. This is why city mode needs near-uniform per-agent weighting or the
  dynamics blow up — a known sharp edge.
- **R-effective in the live frame is a crude ratio** (new exposures × infectious
  days ÷ previous infectious), fine as a dashboard readout, not a rigorous Rt
  estimator.
- **Healthcare capacity is a static line**, not a feedback (no care-quality
  collapse raising IFR once beds overrun — it's drawn, not dynamically coupled).

---

## 5. Mobility & behaviour realism (the part you asked about)

This is the weakest-but-most-visible area, so it deserves a frank table. "Realism"
is graded relative to what a national modelling centre would expect.

| Mechanism | How it's modelled | Realism |
|---|---|---|
| **Workplace location** | With prob ≈ buurt `commuterShare`, an agent works in one of a handful of **hardcoded inter-city commute links**; else works in the home buurt. | ⚠️ Structurally plausible (people commute to bigger cities) but the links and shares are **invented constants**, not CBS/ODiN origin–destination data. |
| **Workplaces / schools** | Agents in the same buurt+sector are split into a **fixed 8 (or 5 for schools) clusters** of roughly equal size. Contact ∝ infectious/√size. | ⚠️ A reasonable abstraction of "places where people gather by day," but the count is arbitrary and there are **no real establishment sizes** (despite SBI counts being available). |
| **Events / gatherings** | Province- or hub-scoped clusters (4–7); daily Bernoulli attendance on `eventAffinity × eventIntensity`. | ⚠️ Captures episodic super-spreading qualitatively; magnitudes are tuned, not measured. |
| **Commuting / routes** | All commuters on a link share a `route` node → a commute contact layer. | ⚠️ Correct idea; occupancy is synthetic, not NS/transit load data. |
| **Transport mode (car/train/bike/foot)** | Assigned per agent from urbanity + train access + age. | ❌ **Cosmetic.** It feeds the agent codename/inspector but is **never read by the transmission engine.** "Rail commuters spread more" is implied in the UI and *not actually modelled* — only *whether* you commute matters, not *how*. |
| **`mobilityFrequency` (often/sometimes/rarely)** | Assigned per agent. | ❌ Also descriptive only — not in the FOI. |
| **Community contact** | Per-buurt pressure × an urbanity factor (denser = more mixing). | ✅ Simple but defensible; density-driven mixing is real. |
| **Behavioural compliance** | Per-agent `compliance ∈ [0.08, 0.96]` from age/sector/event-affinity; scales every NPI's effect and vaccine uptake. | ⚠️ Behaviourally *motivated* and heterogeneous (good), but the formula is heuristic and **static over time** — no pandemic fatigue, no fear-driven self-regulation, no feedback from case counts. |
| **Event affinity** | Per-agent propensity, higher for hospitality workers / event-dense buurten. | ⚠️ Heterogeneous and plausible; numbers invented. |
| **Within-day schedule / time-use** | None. "Daytime" is an abstract node, one step per day. | ❌ No time-of-day, no contact durations, no weekday/weekend — a discrete daily model. |

### Honest summary of mobility/behaviour
- **The *shape* is realistic:** five plausible mixing settings, density weighting,
  commuting toward larger cities, heterogeneous individual behaviour, age-graded
  event-going. Qualitatively, the right things drive the curve.
- **The *quantities* are not data-driven:** no real OD matrix, no transit loads, no
  workplace-size distribution, no time-use survey, no contact-matrix calibration.
  The transport-mode labelling actively over-promises relative to the maths.
- **Behaviour is static and exogenous:** people don't change behaviour in response
  to the epidemic (the largest single behavioural driver in real pandemics).
- **Net:** good for *qualitative scenario comparison and intuition-building* ("what
  if we close schools and isolate cases?"), **not** for quantitative forecasting of
  a specific Dutch outbreak. Treat absolute peak sizes and dates as illustrative.

### The Netherlands macro model (new tab)

A separate **metapopulation** view that addresses the §2 "8 nodes nationally"
limitation head-on. It models the country as **~509 population clusters** derived
from the CBS/PDOK population-density raster (each a real lat/lon + population),
coupled by two channels:

- **Gravity diffusion** — each cluster mixes with its nearest neighbours, weighted
  ∝ destination population ÷ distance², i.e. short-range town-to-town creep.
- **Rail coupling** — clusters on the **real NS intercity backbone** (51 edges over
  40 hub cities) additionally mix regardless of distance, so an outbreak *jumps*
  Amsterdam→Eindhoven→Maastricht along the line. Turning rail coupling down visibly
  contains the spread — a direct, legible "travel restriction" lever.

Each cluster runs an SEIRD update; the dial set is R₀, incubation, infectious
period, IFR, index-cluster, inter-town mobility, rail coupling, and a measures
package (start day + strength that cuts both transmission and coupling).

**Upgrades since the first cut** (addressing the "stylised mobility" critique):

- **Radiation mobility kernel** (Simini et al. 2012), toggleable against gravity.
  It derives commuting flows from the population distribution *alone* — no fitted
  constant — and reproduces the real Randstad corridors. Verified: it produces a
  slightly lower/later national peak than naïve gravity (different spatial mixing),
  same final size. This is the "structure from data" fix without needing an O–D
  download.
- **Behavioural (time-varying) mobility.** Mobility and transmission now fall as
  the *visible hospital burden* rises and rebound as it recedes, driving endogenous
  multi-wave dynamics. Two interpretable dials: **heeding** (how strongly people
  respond; 0 = they ignore the news) and **alarm sensitivity** (how early they
  react). Verified: heeding 0→0.7 cuts the national peak 3.56M→1.28M and final size
  17.7M→12.3M, with awareness peaking at 100 % and realised mobility bottoming at
  30 %. This is the single biggest realism gain — real epidemics are shaped by
  reactive behaviour, not just policy.
- **Agent (12:1) run mode.** Each cluster becomes a population of integer agents
  (1 agent ≙ 12 people); transitions are stochastic Binomial draws on the agent
  counts — statistically equivalent to simulating all ~1.5M agents under
  homogeneous within-cluster mixing, but O(clusters) so it scales nationally.
  Adds demographic stochasticity (verified: different seeds give different peaks /
  timing, and small outbreaks can fade out) that the deterministic ODE cannot show.

**On the real CBS O–D matrix:** the openly-available commuter matrix (CBS
**83658NED**) is at COROP granularity (40 regions), not gemeente — and gemeente×
gemeente O–D and NS station-to-station flows are not in open OData. The COROP
matrix is downloaded to `scripts/cbs_commuter_corop_83658NED.csv` for validation;
wiring it requires assigning each cluster to a COROP region (a boundary-polygon
step). Radiation is used instead as the data-free structural model, and the COROP
matrix is the documented benchmark/next step.

**Realism grade:** the *geography* is real (cluster positions/populations, rail
topology); mobility *structure* is now radiation-derived rather than a bare guess,
and behaviour is endogenous. Remaining gaps: no fitted O–D magnitudes (COROP
benchmark not yet wired), no age structure within a cluster, IHR for the alarm
signal is a crude multiplier of IFR. Right tool for "how fast does it cross the
country, and does cutting rail / reacting earlier help"; not a cluster-level case
forecast. Complements, does not replace, the agent model.

---

## 6. Consolidated assumptions

**Population**
- Buurt population counts are exact targets; suppressed marginals → national fill.
- Inter-attribute correlations are national, re-fit only to local marginals.
- Income ⟂ education (not jointly modelled); age uniform within band.
- Household counts/types anchored to CBS; interiors heuristic (size tail uncapped).

**Epidemic**
- Homogeneous mixing *within* each contact node; saturating density term.
- Flat infectiousness over a randomised infectious period; exposed seeding.
- Age-structured susceptibility/severity; uniform `baseLethality` floor optional.
- NPIs act on specific layers, scaled by static per-agent compliance, from a single
  `policyStartDay`.
- Weighted agents (national ≈ 1:2,500); 8 city nodes stand in for the country.
- Healthcare capacity is a threshold line, not a dynamic feedback on mortality.

**Mobility/behaviour**
- Commute links and shares are fixed constants, not OD data.
- Workplaces/schools/events are equal-ish synthetic clusters of fixed count.
- Transport mode and travel frequency are descriptive, not mechanistic.
- No within-day scheduling, contact durations, or behavioural adaptation.

---

## 7. Validity envelope — what to trust, what not to

**Trust:**
- The synthetic population's **buurt-level demographic marginals** and spatial
  structure (age/gender/migration/household-mix per neighbourhood).
- **Qualitative** epidemic dynamics and **relative** comparisons between policies
  (does isolation beat masks-alone? does early action bend the curve?).
- The **surveillance "blind window"** narrative (true spread vs detected spread).
- R₀ as a **calibrated, displayed** quantity.

**Do not trust (as-is):**
- Any **absolute** forecast — peak size, peak day, total deaths for a real outbreak.
- **Within-buurt socio-economic correlations** and household interiors (and the
  giant-household tail) without cleanup.
- Anything implying **transport mode** changes transmission.
- City-to-city spread quantities (links are invented), or sub-national geography in
  the *simulator* (it is 8 nodes nationally).

---

## 8. Recommendations (to make a national centre genuinely happy)

**Quick / high-value**
1. **Make the nationwide build crash-safe.** Write per-municipality CSV shards (or
   flush+checkpoint the gzip and a progress manifest) so a kill loses one
   municipality, not the wrap-up. Then a "resume from municipality N" flag. *(The
   current run is 91 % on disk and salvageable — finishing the last 31
   municipalities or re-running with checkpointing both work.)*
2. **Cap/split household sizes.** Bound non-institutional households (e.g. ≤ 8) and
   model institutions (dorms, care homes) as an explicit separate type.
3. **Stop advertising transport mode** as epidemiological, or actually wire it into
   the commute layer (mode-specific contact intensity) so the label is honest.

**Deeper / for credibility**
4. **Calibrate layer coefficients to a Dutch contact matrix** (PiCo / Mossong) and
   report an age-structured next-generation matrix R₀, not just a scalar.
5. **Add behavioural feedback** (compliance responding to case counts / fatigue).
6. **Use real mobility data** (CBS/ODiN OD flows, station/road loads) for commute
   links and event scoping.
7. **Couple healthcare capacity to mortality** (IFR rises when beds overrun).
8. **Correlate income with education/occupation** (CBS 85064NED) and add
   buurt-level joints where CBS publishes them.

---

*Files referenced: population generator
[`gensynthpop-rotterdam/build_netherlands_population.py`](gensynthpop-rotterdam/build_netherlands_population.py),
[`build_rotterdam_population.py`](gensynthpop-rotterdam/build_rotterdam_population.py);
engine [`onegov2-synthetic-data/src/simulation/engine.ts`](onegov2-synthetic-data/src/simulation/engine.ts),
world/mobility [`netherlandsSeed.ts`](onegov2-synthetic-data/src/simulation/netherlandsSeed.ts),
agent traits [`agentProfile.ts`](onegov2-synthetic-data/src/simulation/agentProfile.ts),
calibration [`calibration.ts`](onegov2-synthetic-data/src/simulation/calibration.ts),
detection [`detection.ts`](onegov2-synthetic-data/src/simulation/detection.ts).*
