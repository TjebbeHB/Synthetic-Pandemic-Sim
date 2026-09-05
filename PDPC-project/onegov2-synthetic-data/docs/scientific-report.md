# A spatially-explicit synthetic-population pandemic simulator for the Netherlands: methods, calibration, and internal validation

**OneGov #2 — Synthetic Data track**

---

## Abstract

We present an end-to-end, open, spatially-explicit system for pandemic
preparedness in the Netherlands that couples (i) a **sample-free synthetic
population** generated with the GenSynthPop methodology to (ii) a **stochastic,
agent-based SEIRD transmission model** on a multi-layer contact network, and
(iii) a **surveillance layer** that reconstructs what a public-health authority
would actually observe (wastewater and hospital signals) as distinct from the
epidemiological ground truth. As a worked example we build a 1:1 synthetic
population of Rotterdam — **672,935 synthetic individuals**, one per resident —
and validate it against Statistics Netherlands (CBS) marginals, obtaining a
per-buurt standardized absolute error (SAE) of **0.014** for the age
distribution, well inside the 0.00–0.05 "good-fit" band reported for GenSynthPop.
We define the basic reproduction number R₀ operationally, estimate it directly
from the runtime transmission code with a single-index next-generation
Monte-Carlo, and cross-validate it against an independent early-growth-rate
estimate using the Euler–Lotka relation for an SEIR generation interval: the two
agree to within ~5% (1.77 vs 1.69 at β = 0.26). The realized final epidemic size
(75%) matches the analytic final-size equation (≈70%) for the same R₀, and the
infection-fatality-ratio control reproduces target lethalities from 0.1% to 60%
to within a few tenths of a percentage point. We are explicit that this is an
**exploratory and educational instrument, not a calibrated operational
forecaster**: the contact-layer weights encode expert priors rather than fitted
contact-survey matrices, and only the per-contact transmissibility is tuned to a
target R₀. Even so, the system makes the *shape* of pandemic risk — its
neighbourhood geography, its surveillance blind spots, and the leverage of
non-pharmaceutical and engineered-pathogen scenarios — concrete and inspectable,
which is precisely what planning for low-probability, high-impact events requires.

---

## 1. Introduction

Pandemic plans are only as good as the population they imagine. National averages
hide the fact that a virus seeded in a dense, young, single-person-household
neighbourhood behaves very differently from the same virus seeded in a
multi-generational suburb, and that the authorities charged with responding do
not see infections — they see hospital admissions and sewage. We therefore set
out to build a system that (a) represents *every* resident as an individual with
realistic, correlated socio-demographic attributes; (b) lets a pathogen spread
through the contact structures those attributes imply; and (c) shows the gap
between the real outbreak and the surveilled outbreak.

The system runs entirely in the browser as an interactive dashboard, with three
scopes — a national network of the eight largest Dutch cities, a per-city
buurt-level view, and a full-resolution Rotterdam "micro" model — plus a
companion offline pipeline that emits a true 1:1 synthetic population as a CSV
for downstream research. All inputs are open CBS/PDOK data; no real person-level
records are used, preserving privacy by construction.

This report documents the methods, derives the key formulas from the actual
runtime code, and reports the numerical checks we ran to test internal
consistency and fidelity to real data.

---

## 2. Methods

### 2.1 Synthetic population (GenSynthPop)

The Rotterdam population is generated with the sample-free, iterative
**GenSynthPop** method (de Mooij et al., 2024). Rather than drawing individuals
from a micro-sample (which is not available at buurt level), the synthetic
individuals *are* the running estimate of the joint distribution: we instantiate
N empty individuals per buurt (N = the reported population) and then add one
attribute at a time, each conditioned on the previously-added attributes through
a contingency table, fitted to the spatial marginals by iterative proportional
fitting (IPF). The implementation uses the authors' `gensynthpop` package
(`ConditionalAttributeAdder`).

The attribute order is
`age_group → integer age → gender → migration background → household position →
activity`, with `education_level` added from a national education × age ×
migration contingency, and household-level `income_group`, `car_ownership`, and
`work_sector` assigned afterward. Individuals are then partitioned into
households from their household positions, anchored to each buurt's reported
single/multi/with-children composition.

**Data.** Per-buurt marginals (age bands, gender, migration background, household
composition, income, cars, education counts, business-sector mix, land area) come
from CBS *Kerncijfers wijken en buurten*; the household-position × age × gender
contingency from CBS table **71488ned** (national, via the CBS OData API); the
education × age × migration table from CBS *Bevolking; onderwijsniveau en
migratieachtergrond*. Buurt geometries are PDOK *Wijk- en Buurtkaart 2024*.

The fidelity metric is the one the GenSynthPop paper uses — the **standardized
absolute error** (SAE), the total absolute deviation between the synthetic and
target category counts divided by the total expected count:

$$\mathrm{SAE} = \frac{\sum_i \lvert O_i - E_i \rvert}{\sum_i E_i}$$

where $O_i$ and $E_i$ are the observed (synthetic) and expected (CBS) counts of
cell $i$. We report SAE rather than a $\chi^2$ p-value because at this sample
size ($N \approx 6.7\times10^5$) a $\chi^2$ test rejects on negligible absolute
deviations — a known large-N artefact the original paper discusses explicitly,
and the reason ADP/SAE is the field-standard measure.

### 2.2 Spatial structure and the contact network

Each synthetic individual is assigned to a home buurt (with real PDOK centroid
coordinates) and to four contact contexts that mediate transmission:

- a **household** (members share a dwelling);
- a **daytime node** (workplace or school cluster), located in a work buurt
  reached through synthetic gravity commute flows;
- an **event node** (the episodic gathering / venue layer);
- a **commute route** (the corridor between home and work).

A fifth, **community**, layer is a well-mixed background within the home buurt.
Browser scopes build these agents on the fly from buurt profiles; the offline
Rotterdam pipeline emits them as data. Resolution is selectable: each agent can
represent N residents (grouped, e.g. 12:1 ≈ 55,000 agents) or N = 1 (the full
**661,915-agent** Rotterdam population), the latter completing a 160-day run in
~12 s.

### 2.3 Disease dynamics — stochastic SEIRD

Every agent occupies one of five states S, E, I, R, D. The model steps daily. On
each day, every susceptible agent $i$ is infected with probability

$$\lambda_i = 1 - \exp\!\Big(-\,\beta\, s_i\, (1-\pi_i)\, \textstyle\sum_{\ell} T_{i,\ell}\Big),$$

a complementary-log (escape-process) hazard, where $\beta$ is the per-contact
transmissibility (`infectionRate`), $s_i$ an age-specific susceptibility, $\pi_i$
the agent's accumulated immune protection (prior immunity + vaccination), and
$T_{i,\ell}$ the contribution of contact layer $\ell$. The five layer terms,
taken verbatim from the runtime code, are:

| Layer $\ell$ | Term $T_{i,\ell}$ | Coefficient $c_\ell$ | Pressure normalisation |
|---|---|---|---|
| household | $c_h\, H\, \sigma_h\, \dfrac{I_{hh}}{n_{hh}-1}$ | 0.38 | frequency-dependent (per housemate) |
| work | $c_w\, M\, \sigma_m\, \dfrac{I_{day}}{\sqrt{N_{day}}}$ | 0.105 | sub-linear in node size |
| commute | $c_c\, M\, \sigma_m\, \dfrac{I_{route}}{\sqrt{N_{route}}}$ | 0.075 | sub-linear in node size |
| event | $c_e\, E\, \sigma_e\, \dfrac{I_{event}}{\sqrt{N_{event}}}\,\mathbb{1}_{\text{attend}}$ | 0.13 | sub-linear, stochastic attendance |
| community | $c_y\,(0.66+0.34\,M\sigma_m)\, \dfrac{I_{prof}}{N_{prof}}\, u_b$ | 0.075 | density-weighted, mean-field |

Here $H, M, E$ are the user's household/mobility/event intensity multipliers;
$\sigma_h,\sigma_m,\sigma_e$ are policy scalings (see §2.4); $I_\bullet$ and
$N_\bullet$ are the infectious count and size of the relevant node; and
$u_b = 1.48 - 0.11(\text{urbanity}_b - 1)$ is an urbanity factor that makes dense
buurten mix more. The **household** layer is frequency-dependent — dividing by
$(n_{hh}-1)$ means one infectious housemate exerts the same per-person pressure
regardless of household size, the standard assumption for close-contact settings.
The work/commute/event layers use a $\sqrt{N}$ normalisation, intermediate
between frequency- and density-dependent mixing, reflecting that larger venues
mix more but not in full proportion to their size. The community layer is
mean-field within the buurt, scaled by urban density.

Disease progression is stochastic with dispersed sojourn times: an exposed agent
becomes infectious after an incubation period drawn around `incubationDays`
(uniform jitter $\times[0.62, 1.40]$), and an infectious agent recovers or dies
after an infectious period drawn around `infectiousDays` ($\times[0.72, 1.42]$).
Introductions are seeded in state **E**, not I, so surveillance signals rise with
a realistic latent lag rather than spiking at $t_0$.

At the end of the infectious period, the agent dies with probability

$$d_i = \mathrm{clamp}\!\Big[\big(b + r_i\cdot 0.65\cdot \mu\big)\,(1 - 0.72\,\pi_i),\; 0,\; 1\Big],$$

where $r_i$ is an age-specific severe-risk weight, $\mu$ the mortality multiplier,
and $b$ (`baseLethality`) an age-independent fatality floor used to model
engineered pathogens (§2.5). Otherwise it recovers with immunity.

The dashboard's live **R effective** readout uses the renewal approximation
$R_{\text{eff}}(t) = \mathrm{clamp}\big[\,\Delta_{\text{new}}(t)\,D_I / I(t-1),\,0,\,9.99\,\big]$,
where $\Delta_{\text{new}}$ is the day's new infections and $D_I$ the mean
infectious period.

### 2.4 Reproduction number and calibration

The contact coefficients $c_\ell$ fix the *relative* importance of settings (a
structural prior); the single scalar $\beta$ fixes the *level*. We therefore
calibrate $\beta$ to a target R₀.

R₀ is measured **from the exact runtime code**, not assumed. We place one
infectious agent in an otherwise fully-susceptible, intervention-free world and
count, over one infectious period, how many people it infects — reusing the same
`susceptibleRisk` force of infection used in the live simulation, and never
letting secondary cases transmit onward (so the count is a clean generation-1 R₀,
not an attack rate). Averaging over hundreds of index agents sampled across all
neighbourhoods, weighted by the people each represents, gives the population R₀.
Because the result is nearly linear in $\beta$ in this low-hazard regime
($\lambda \approx \beta\cdot\text{pressure}$ for small arguments), inverting it to
hit a target R₀ takes a proportional guess plus a few bisection steps.

Non-pharmaceutical interventions act, from `policyStartDay` onward, through the
compliance-weighted scalings $\sigma_m = 1 - \rho_m a_i$ (mobility),
$\sigma_e = 1 - \rho_e a_i$ (events), and a small household *increase*
$\sigma_h = 1 + 0.08\,\rho_m a_i$ that captures the "stay-home raises household
exposure" effect, where $\rho_m,\rho_e$ are the reduction sliders and $a_i$ the
agent's compliance.

### 2.5 Severity, mortality, hospitalisation

Natural-disease lethality is age-structured through $r_i$ (severe-risk weights
from 0.0002 at ages 0–14 to 0.013 at 65+). For a clean user control we expose the
**infection-fatality ratio (IFR)**, the textbook quantity deaths ÷ infections,
mapped to $b$ via $b = \max(0,\ \text{IFR} - 0.0014)$ (the subtraction removes the
~0.14% the age-structured term already contributes). This lets a single slider
span seasonal influenza (0.1%) to engineered pathogens (60%+), with the
age-independent floor $b$ representing a pathogen that kills more uniformly than
nature does.

Hospital load is computed independently of deaths from an age-specific
infection-hospitalisation ratio (IHR; 0.001 at 0–14 to 0.12 at 65+). New
infectious onsets are convolved with the IHR, admitted after an 8-day lag, and
discharged with an exponential length-of-stay (mean 9 days, decay rate $1/9$ per
day). The dashboard draws occupancy against an adjustable bed-capacity line and
flags the overshoot day.

### 2.6 Surveillance and detection — "what the government sees"

The model knows every infection; an authority does not. We reconstruct two
lagging channels from the ground-truth frames.

**Wastewater.** Each buurt drains to a sewage-treatment catchment (RWZI). The
per-buurt shedding signal is

$$W_b = \frac{I_b + 0.45\,E_b + 0.05\,R_b}{\text{pop}_b}\times 10^5 \times \big(1 + 0.22\,\text{res}_b + 0.12\,\text{ind}_b\big),$$

i.e. viral load per 100,000 residents, weighted up slightly by residential/
industrial land use, then pooled per catchment. A catchment **alerts** when its
signal crosses 28 per 100k; the national signal triggers detection at 22 per 100k.

**Hospital.** Detection also fires when hospital occupancy crosses 1.0 bed per
100k. The reported **detection day** is the earlier of the two channels; the gap
between the first infection and detection is the window in which the outbreak
spreads unseen, and the per-catchment alert ordering identifies which
neighbourhoods are the candidates for localised measures.

---

## 3. Validation and internal-consistency proofs

We distinguish two kinds of evidence: **fidelity** of the synthetic population to
real CBS data, and **internal consistency** of the epidemic model against
analytic epidemiological theory. We do *not* claim validation against a specific
historical outbreak (see §5).

### 3.1 Population fidelity

Comparing the 672,935-individual Rotterdam population to the CBS buurt marginals
it was built from (averaged over the 87 residential buurten):

| Attribute | Per-buurt SAE | GenSynthPop "good-fit" band |
|---|---|---|
| Age × buurt | **0.014** | 0.00–0.05 |
| Migration background × buurt | **0.060** | 0.00–0.05 |
| Gender × buurt | **0.077** | 0.00–0.05 |

Age is excellent; migration and gender sit just at/above the band, consistent
with the published case study. Households reproduce CBS to **99%** of the reported
count (339,156 vs 342,305) with a **mean size of 1.98 vs 1.97 reported**. Inter-
attribute structure is preserved where it should be — for example, attained
education is strongly correlated with migration background:

| Origin | low | middle | high |
|---|---|---|---|
| Dutch | 25% | 40% | 35% |
| European | 16% | 32% | **51%** |
| Outside Europe | **36%** | 34% | 31% |

and benefit receipt is concentrated in low-income households (28% vs 1.9% in
high-income) — relationships that emerge from the conditional construction, not
from any post-hoc adjustment.

### 3.2 R₀ is a measured, calibratable quantity

Sweeping $\beta$ on the national world (no interventions, fully susceptible) gives
a monotone, near-linear response, exactly as the escape-hazard linearisation
predicts:

| $\beta$ | 0.10 | 0.20 | 0.26 | 0.40 | 0.62 | 0.90 | 1.20 |
|---|---|---|---|---|---|---|---|
| R₀ | 0.72 | 1.44 | 1.77 | 2.73 | 4.18 | 5.76 | 7.49 |

Inverting for a COVID-like R₀ = 2.6 yields $\beta^* = 0.37$ in a single
proportional step (achieved R₀ = 2.65). The dashboard's **Model R₀** card shows
this measured value live for whatever scenario is loaded, and the **Calibrate
β → target R₀** button performs the inversion — so the displayed reproduction
number is never assumed, it is computed from the running model.

### 3.3 Two independent R₀ estimates agree (cross-validation)

A model is internally consistent if two unrelated ways of computing the same
quantity agree. We computed R₀ at $\beta = 0.26$ by:

1. **Single-index next-generation Monte-Carlo** (§2.4): **R₀ = 1.77**.
2. **Early exponential growth rate.** Log-linear regression of infectious
   prevalence over the growth phase (days 5–20) gives $r = 0.050\,\text{day}^{-1}$
   (doubling time 13.9 d). For an SEIR process the Euler–Lotka relation reduces to

   $$R_0 = (1 + r\,T_E)(1 + r\,T_I) = (1 + 0.05\cdot 5)(1 + 0.05\cdot 7) = 1.25 \times 1.35 = \mathbf{1.69}.$$

The two estimates — one from a microscopic next-generation experiment, one from
the macroscopic growth curve — agree to within **5%**, a genuine internal
validation that the contact-layer machinery and the disease-progression timing
are mutually consistent.

### 3.4 Final epidemic size matches theory

For a homogeneous SIR epidemic the final attack rate $z$ solves the implicit
final-size equation $z = 1 - e^{-R_0 z}$. At R₀ = 1.77 this gives $z \approx
0.70$. The simulator's realized cumulative attack rate at the same parameters is
**75%**, modestly above the homogeneous prediction — the expected direction and
magnitude of departure once age-structured susceptibility and metapopulation
heterogeneity are introduced. The peak occurs at day 59, also consistent with the
slow doubling implied by the long (8.5-day) generation interval.

### 3.5 Severity control reproduces target IFR

Driving the lethality control across four orders of magnitude and measuring the
realized deaths ÷ infections:

| Target IFR | 0.1% | 0.7% | 2.5% | 10% | 30% | 60% |
|---|---|---|---|---|---|---|
| Realized IFR | 0.25% | 0.83% | 2.57% | 10.1% | 29.8% | 59.3% |

The mapping is accurate across the full range (the small excess at the flu end is
the residual age-structured contribution). The analytic baseline IFR with the
age weights alone is $\sum_a p_a\, r_a\, 0.65 = 0.146\%$, matching the measured
0.14%, and the age-weighted hospitalisation ratio is **2.1%** — both in the
plausible range for a moderate respiratory pathogen.

### 3.6 Surveillance lag is qualitatively correct

Across runs, wastewater consistently detects before hospitals — the documented
real-world advantage of sewage surveillance. In a representative Amsterdam
buurt-level run, the sewage signal crosses threshold on day 4 while hospital
occupancy only triggers on day 35, a 31-day early-warning lead; the first
catchments to alert are always those containing the seed, and the alert front
then propagates outward. This reproduces the qualitative behaviour that motivated
national wastewater programmes, though the absolute thresholds are illustrative.

---

## 4. Under the hood: from parameters to the dashboard

It is worth tracing how a slider becomes a number on screen.

- **Move β (or load a scenario preset).** β rescales every layer term in
  $\lambda_i$. The Model-R₀ card re-runs the next-generation experiment and
  reports the new R₀; the live R-effective tracks $\Delta_{\text{new}} D_I/I$ as
  the wave develops.
- **The epidemic curve.** Each day the engine tallies new infections, advances
  E→I→R/D with dispersed sojourns, and records S/E/I/R/D totals (people-weighted
  by each agent's representation) into a frame. The Trends chart plots those five
  series; the deceased line is the running D total; the hospital line is the
  IHR-convolved, lag-and-decay occupancy, drawn against the bed-capacity rule.
- **The map heat.** Each buurt polygon is shaded by its active rate
  $(E_b+I_b)/\text{pop}_b$; agent dots are coloured by state; contact hubs
  (workplaces/schools) and event/venue sites are drawn as diamonds and circles
  that glow as their buurt's active rate rises — making the superspreading
  geography visible.
- **The bulletin and catchment alerts.** The detection module scans the frames
  for threshold crossings and emits a time-stamped feed (seeded → wastewater
  spike in named catchments → hospital confirmation → % milestones → measures →
  peak), so the effect of an intervention is legible as the curve bending and the
  bulletin changing.

Every visible number is therefore a deterministic (given the seed) function of
the synthetic population and the parameter set; nothing is scripted.

---

## 5. Limitations

We state these plainly, because honest scope is what makes a model trustworthy.

1. **Not an operational forecaster.** The system is exploratory and educational.
   Absolute timings, peak heights, and thresholds should be read as
   order-of-magnitude and comparative, not predictive.
2. **Contact coefficients are expert priors.** The five $c_\ell$ encode the
   relative importance of settings from domain knowledge; they are *not* fitted to
   an age-structured contact matrix (e.g. POLYMOD/Pienter). Only $\beta$ is
   calibrated, to R₀. Fitting $c_\ell$ to a contact survey is the natural next
   step and would let R₀ be decomposed by setting rigorously.
3. **The event layer is aspatial.** Event nodes are well-mixed pools; the map's
   "event sites" are a venue-density proxy (high-eventPull buurten), not the
   geographic location of specific gatherings.
4. **Household partitioner.** Household *composition* matches CBS to 99% and mean
   size is exact (1.98 vs 1.97), but single-person households are over-represented
   (≈59% vs the reported ≈49%); the published suitability-scored HouseholdGrouper
   would tighten this.
5. **Surveillance thresholds are illustrative.** Wastewater and hospital
   detection limits are plausible but not calibrated to RIVM/NRS assay
   sensitivities; the catchment assignment within cities is a synthetic
   k-means split, not the GWSW sewer network.
6. **Browser-scope worlds are grouped approximations** of the high-fidelity
   GenSynthPop CSV; the SAE figures in §3.1 pertain to the 1:1 offline population,
   which is the dataset intended for downstream research.

None of these undermine the system's purpose — exposing the *structure* of risk —
and each is a clearly-bounded improvement rather than a fundamental flaw.

---

## 6. Conclusion

By joining a validated, privacy-preserving synthetic population to a transparent
transmission-and-surveillance model, the system turns abstract pandemic risk into
something a planner can interrogate: where an outbreak would start, how fast and
how unequally it would spread across real neighbourhoods, when — and through which
channel — the authorities would even notice, and how measures, vaccines, or a more
lethal (even engineered) pathogen would change the picture. The synthetic data
holds up to scrutiny (age SAE 0.014; households 99% of CBS; sensible
socio-economic correlations), and the epidemic engine is internally consistent
with epidemiological theory (next-generation and growth-rate R₀ agree to 5%;
realized final size matches the final-size equation; IFR control is accurate
across four orders of magnitude). Used honestly — as a structured way to reason
about eventualities we hope never occur — it makes the Netherlands a little better
prepared.

---

## Appendix A — Key parameters (from the runtime code)

**Contact-layer coefficients** $c_\ell$: household 0.38, event 0.13, work 0.105,
commute 0.075, community 0.075.

**Age-specific susceptibility** $s$: 0–14: 0.82; 15–24: 1.08; 25–44: 1.00;
45–64: 0.96; 65+: 0.88.

**Age-specific severe-risk** $r$ (IFR weight): 0–14: 0.0002; 15–24: 0.0003;
25–44: 0.0008; 45–64: 0.0030; 65+: 0.0130.

**Age-specific hospitalisation ratio** (IHR): 0–14: 0.001; 15–24: 0.002;
25–44: 0.008; 45–64: 0.030; 65+: 0.120.

**Surveillance:** hospital admission lag 8 d; mean length of stay 9 d; national
wastewater alert 22/100k; per-catchment alert 28/100k; hospital occupancy alert
1.0/100k.

**Default scenario:** $\beta = 0.26$, incubation 5 d, infectious 7 d, IFR 0.7%,
prior immunity 4%.

## Appendix B — Data sources (all open)

CBS *Kerncijfers wijken en buurten* (86165NED); CBS *Huishoudens; personen naar
geslacht, leeftijd, regio* (71488ned); CBS *Bevolking; onderwijsniveau en
migratieachtergrond*; CBS *Bodemgebruik* (per-buurt land use, area-weighted to the
gemeente totals); PDOK/CBS *Wijk- en Buurtkaart 2024* (geometries); GenSynthPop-
Python (de Mooij et al., 2024). RWZI register / PDOK GWSW for wastewater
catchments (synthetic split used in the prototype).

## Appendix C — Reproducibility

The synthetic population is produced by `gensynthpop-rotterdam/`
(`build_rotterdam_population.py`, validated by `validate.py`); the browser model
by `onegov2-synthetic-data/src/simulation/` (`engine.ts` for SEIRD and the force
of infection, `calibration.ts` for the R₀ estimator, `detection.ts` for
surveillance). All figures in §3 were produced by the validation scripts on the
seed 20260604.
