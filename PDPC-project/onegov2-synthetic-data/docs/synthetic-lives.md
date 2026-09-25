# Rotterdam synthetic lives

The default **Synthetische levens** workspace replaces the earlier live population builder for the new individual/network workflow. The older scenario atlas and Python generators remain available as historical implementations. They do not power this workspace. The browser and `npm run generate:lives` use the same new engine in `src/lives/generate.ts`.

## Use

1. Choose Rotterdam neighbourhoods and a source year. The included 2024 CBS snapshot works without a live data request. **Verbind met CBS** retrieves public CBS OData directly; failed requests preserve the previous source and population.
2. Select characteristics. Age and neighbourhood are mandatory. Household structure, school and employment are the recommended contact model. Events are optional assumptions. Income and cars require households. Missing observations remain missing; unknown employment creates no invented workplace.
3. Generate a sample or the complete selected population. Each record is one synthetic person. A sample is not weighted up to the city population. Smaller samples also change network connectivity.
4. Inspect a person, their relatives and clusters. Choose an index case and calculate a run, then replay or scrub days. The default index case is a connected employed parent where available, not a randomly selected resident; changing the index case is part of sensitivity analysis.
5. The ecosystem view shows a bounded readable subset with directed red numbered transmissions. The geographic view uses synthetic shared household points inside official polygons. Transmission lines connect home locations; their cluster identifies where the simulated exposure happened. Numbering is event order within the run; generation is distance from the index case.
6. Download person CSV, transmission JSON, and the quality/source report. CSV includes both `display_id` (such as R1) and zero-based numeric `id`, which connects to cluster and transmission records.

The new view and existing atlas have separate models and results. The earlier atlas is explicitly labelled in navigation; its historical assumptions have not been retroactively changed.

## Source contract

| Source | Use | Limit |
|---|---|---|
| CBS 85984NED (KWB 2024) / 86165NED (2025) | Population, age bands, sex, household margins, resident employment, school enrolment, attained education, income and cars | Reference moments vary by subject. Values are rounded; null is unknown/suppressed, not zero. 2025 currently lacks Rotterdam employment, education and income values. |
| CBS 71488ned, Rotterdam, same population year | Five-year age distribution and age-specific household position / institutional residence priors | Municipality-level priors do not identify individual family pairs or neighbourhood institutional locations. |
| CBS 85481NED, December 2024 | Share of employee jobs with destinations outside Rotterdam | Provisional jobs, not unique workers or trips; self-employed people are not represented. Within-city destinations remain distance-based assumptions. This period stays explicit even when selecting 2025 population data. |
| CBS / PDOK Wijk- en Buurtkaart 2024 | Official polygons, synthetic household placement | No actual addresses. Municipality query includes Hoek van Holland and the port; no bounding-box clipping. Newer boundary codes require matching geometry and are otherwise reported as unmapped. |

URLs:

- https://opendata.cbs.nl/ODataApi/OData/85984NED
- https://opendata.cbs.nl/ODataApi/OData/86165NED
- https://opendata.cbs.nl/ODataApi/OData/71488ned
- https://opendata.cbs.nl/ODataApi/OData/85481NED
- https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?f=json&limit=1000&gemeentecode=GM0599

The 2024 snapshot contains 87 inhabited buurten and 670,585 rounded residents. Botlek and Europoort each report five people but all-zero age margins; they are disabled rather than reconstructed. The full usable population is therefore **670,575 people across 85 buurten**, not the earlier 2025 population. This is a source-year/coverage distinction, not population loss during synthesis. Other small areas may have rounded zero persons in a small sample and receive no rate denominator.

## Generation and assumptions

- Largest-remainder allocation preserves the requested person count and reconciles each neighbourhood's broad age margins to its allocated count. Within bands, use Rotterdam five-year frequencies. Individual ages are uniform within five-year bins; the open 95+ group is represented as 95–104. Sex is assigned to a neighbourhood count, without claiming a fitted age-by-sex association.
- Preserve ages while allocating families. Each parent is 18–50 years older than every assigned child; two assigned parents differ by at most 12 years; siblings differ by at most 12 years. These are configurable code assumptions, not a catalogue of every real family type. Adult children can remain at home. Remaining adults are assigned to single or no-child households. Household count/composition targets can conflict with these constraints and remain visible in validation.
- If no new parent is feasible, try an existing compatible family without changing anyone's age. Otherwise mark the minor's household unresolved and disable its household contacts; never silently claim a valid family. This can occur in tiny or contradictory rounded inputs.
- Institutional residence follows Rotterdam age-specific shares. Minor, adult and 65+ groups are separated into assumed contact groups of 20. These are not real institutions or capacity estimates.
- Primary/secondary school groups are separated by age, tertiary groups by five-year cohort. Resident enrolment counts are capped by eligible population, with target/actual counts in the quality report. Enrolment can overlap or use different reference dates; exact reproduction is not always possible. Students can also work.
- Employment is allocated from neighbourhood resident worker totals, ages 15–74, weighted by explicit age/student priors. Counts are capped when inputs exceed eligible residents. Nonworkers remain nonworkers; institutional residents are excluded from employment allocation. This is not a detailed unemployment, retirement or informal-care model.
- Work teams have up to 16 people, school groups up to 25 students, events up to 40 attendees. Existing employed adults provide assumed staff connections: one per class and one per five institution residents. Staff retain their own households and follow workdays. Remaining workplaces use observed external-job share and assumed within-city distance preference. External workplaces contain selected residents only; no outside population is invented.
- Work is Monday–Friday, with assumed three-day and five-day patterns, or two days for working students. School follows weekdays; selected events take place Saturdays. Staff, sources and recipients use the same attendance rule. Exact hours, hybrid work, shifts, occupations, travel contacts, staff rotation and nonresident introductions remain future extensions.
- Optional education obeys minimum attainment ages and otherwise fits available local broad distributions. Missing categories stay unknown. Old Western/non-Western origin categories are not relabelled European/non-European.
- Optional income uses national 40/40/20 group thresholds, not terciles. Household earnings/employment/education rankings and car allocation weights are declared assumptions. Members inherit the same household income and car count. These socioeconomic links still need observed joint distributions.

## Transmission semantics

This is an illustrative SEIR contact simulation, not an epidemiologically calibrated forecast. No mortality prediction is made by this workspace. Day 0 is the initial snapshot; contact day 1 is Monday. The index case has the chosen number of transmitting days starting on day 1; later infections become infectious after their configured latent interval.

At each day, the engine constructs coattendees per active cluster, sums hazards for susceptible people, and samples infection. Conditional on infection, it selects a cluster/source using their hazard contributions. The source must be infectious and present; newly infected people cannot transmit within the same step. Each infected person has exactly one recorded incoming edge, except the index case. No retrospective tracing is fabricated from group memberships.

Stored output is compact: infection/onset/recovery times and transmission events. Graph display is deliberately bounded; exports retain every event. Rates in the neighbourhood view use generated residents, include the seed in cumulative cases, and never extrapolate sample outcomes to the true city population.

## Reproduce and check

```sh
npm ci
npm run test:lives
npm run test:pdpc
npm run build
# Full selected 2024 Rotterdam, bundled public-data snapshot:
npm run generate:lives -- --seed 20260915 --out output/synthetic-lives
# Live CBS input or a smaller run:
npm run generate:lives -- --live --year 2024 --count 5000 --seed 42
```

The CLI writes `people.csv`, `clusters.json`, and `quality.json`. Generated outputs are ignored by Git. Record the output report with each research run; it contains source values, dates, generation options, excluded areas, warnings, and model version.

Regression checks cover quota conservation, multiple seeds, family age/role constraints, worker totals, missing data, feature dependencies, education eligibility, valid shared household geography, staff connections, reproducibility, SEIR count conservation and causal coattendance for every transmission. These tests establish implementation consistency. Independent household/contact validation and sensitivity analysis over population seeds, family rules, attendance and transmission parameters are still required for scientific use.
