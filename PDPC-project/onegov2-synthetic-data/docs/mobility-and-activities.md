# Rotterdam: geography, activities and mobility

## Implemented in this update

- The map has an explicit responsive height, protected from the legacy dashboard's global Leaflet `height: 100%` rule. ResizeObserver updates Leaflet when the available space changes.
- Wijk and buurt filters use the same geographic membership rules in the map, ecosystem and transmission table. Official 2024 CBS/PDOK wijk boundaries and names are bundled in `src/data/rotterdamWijken.json`; its `source` field records the download endpoint. Coordinates are rounded to six decimals, not invented or geocoded from names.
- CBS buurt codes map to their parent wijk through the municipality and wijk digits. Wijk counts sum the generated residents of constituent buurten. This does not recreate an independent CBS wijk total from rounded buurt statistics.
- Polygon shading shows infectious people as a fraction of all generated residents in that area on the selected day. Grey/dashed polygons mean no generated residents, not zero infections. At day 0, the first patient is included if a simulation exists.
- Person dots are a spread-out display sample (maximum 1,500), plus the inspected person, index case and displayed transmission endpoints. Polygon counts include everyone. At most 120 chronological transmission lines are shown; the numbered table and full trace export remain available.
- Locations are shared synthetic household points inside buurt polygons. Transmission lines connect home locations, not observed travel routes or infection venues. People without a matching boundary remain in population counts and contacts.
- A per-person example-week agenda displays home/unassigned time, school, work, Saturday events and travel. It uses the same `attends` function as the epidemic model. Working students can have school followed by work. Day selection in this agenda is an illustrative weekday, independent of the outbreak playback day.
- Clock times and 30-minute travel legs are explicit assumptions. The epidemic model still uses daily attendance and daily hazards, not the agenda's hours. Travel does not create extra infection contacts. Sport, shopping, visiting and transport modes have not yet been fitted or added as new contacts.

## How GenSynthPop and ABM fit together

Population synthesis supplies the people and household attributes. An agent-based model (ABM) describes their changing states, activities, movements and interactions. The current contact simulation is already a simple ABM with daily attendance. These are complementary layers, not mutually exclusive packages.

[MATSim](https://matsim.org/) is an open-source framework specifically for large-scale agent-based transport simulation. It could consume a richer synthetic population and activity plans. Introducing it would require a transport network, destinations and calibration; a geographic display alone does not require replacing the existing engine.

## ODiN integration path

Use the [CBS corrected ODiN 2024 research description](https://www.cbs.nl/nl-nl/longread/rapportages/2026/onderweg-in-nederland--odin---2024-correctie-onderzoeksbeschrijving?onepage=true) and the codebook for the exact release used. ODiN is a one-day travel survey, not a longitudinal record of social contacts. Its population is people aged 6+ in private households; younger children and institutional residents need separate assumptions or sources.

1. Start with published aggregate mobility targets and a documented baseline year. Obtain a permitted research extract through DANS or CBS Microdata if detailed diaries are needed. Do not imply that unrestricted CBS Open Data exposes individual diaries.
2. Derive weighted activity/trip distributions by suitable age, work/study status and day type. Select the appropriate person/trip weights and retain people with zero trips when estimating participation. Check effective sample support before splitting by geography or demographics.
3. Sample coherent daily plans, respecting household care, school/work conflicts, return journeys and feasible travel times. Assign destinations using local employment, school and facility data plus broader mobility priors. Do not treat independently sampled trips as a coherent day.
4. Add other activities (shopping, sport, visiting) as named shared venue groups with plausible attendance. Only turn co-presence into a contact after defining duration, overlap and setting-specific assumptions.
5. Validate mode share, trip frequency, distance, timing and between-area flows against held-out measurements, then assess contact and epidemic calibration separately. Preserve source, year, release, weights, random seed and uncertainty with each generated population.

For the 2024 release, CBS documents a method-break correction and changes to the DANS extract: fewer/coarser variables and randomized origin/destination postcodes. Fine geographic estimates may be unreliable. Therefore, precise wijk-to-wijk flows cannot be assumed available or reliable; broader-area estimates are a prior to validate locally. Do not pool years across methodological changes without an explicit harmonization decision.

Boundary reference: [CBS/PDOK Wijken en buurten](https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten).
