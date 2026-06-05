# Data sources

Every source referenced by the must-have, should-have, could-have and would-have variables in [`variables.md`](variables.md). All are publicly available and openly licensed. The machine-readable version is [`../data/sources.yaml`](../data/sources.yaml).

## CBS StatLine tables (open data)

| ID | Title | Used for | Direct link |
|---|---|---|---|
| **86165NED** | Kerncijfers wijken en buurten | Demographics, household composition, housing, income, work sector, urbanicity, WMO/jeugdzorg use | <https://opendata.cbs.nl/#/CBS/nl/dataset/86165NED> |
| **82275NED** | Hoogst behaald onderwijsniveau bevolking | Education level (low / mid / high, % of 25+) | <https://opendata.cbs.nl/#/CBS/nl/dataset/82275NED> |
| **70262NED** | Bodemgebruik in Nederland | Land use shares: residential, industry, agriculture, green, water | <https://opendata.cbs.nl/#/CBS/nl/dataset/70262NED> |
| **85870NED** | Nabijheidsstatistieken | Distance to hospital, GP, care home, airport, station, school | <https://opendata.cbs.nl/#/CBS/nl/dataset/85870NED> |
| **84709NED** | Onderweg in Nederland (ODiN) | Daily mobility, commute distance, share of commuters | <https://opendata.cbs.nl/#/CBS/nl/dataset/84709NED> |
| **82309NED** | Arbeidsdeelname; kerncijfers | Work-sector breakdown (healthcare, education, industry, services) | <https://opendata.cbs.nl/#/CBS/nl/dataset/82309NED> |
| **82059NED** | Logiesaccommodaties; gasten en overnachtingen | Tourist overnight stays (would-have) | <https://opendata.cbs.nl/#/CBS/nl/dataset/82059NED> |

All CBS Open Data tables are accessible through the **CBS Open Data API**: <https://opendata.cbs.nl/ODataApi/odata/>. The starter tool [`tooling/fetchers/cbs_statline.py`](../tooling/fetchers/cbs_statline.py) wraps this endpoint via the [`cbsodata`](https://pypi.org/project/cbsodata/) library.

**Licence:** CBS publishes its open data under the [Statistics Netherlands open-data policy](https://www.cbs.nl/en-gb/about-us/copyright-conditions), which permits redistribution with attribution.

### Per-city data (nation network + city tabs)

The simulator's **National** scope is a network of city-wide CBS averages, and
each **city tab** (Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Groningen,
Arnhem, Leeuwarden) is built from that city's real CBS *buurt* rows, so each city
spreads according to its own demographics and density (e.g. Groningen's student
age profile, Amsterdam's single-person households). Inputs:

| Input | Source | Notes |
|---|---|---|
| `CSV-kerncijfers/*_NL_and_Big_Cities.csv` | CBS **86165NED** (gemeente + buurt rows for the 7 cities) | city averages + buurt detail |
| `CSV-kerncijfers/*_National_and_DenHaag.csv` | CBS **86165NED** (NL + Den Haag) | national context + Den Haag |
| Buurt centroids | **PDOK/CBS Wijk- en Buurtkaart 2024 OGC API** | `buurten` collection, matched on `buurtcode`/`gemeentecode` |

Regenerate with [`scripts/build_city_profiles.py`](../scripts/build_city_profiles.py)
→ writes [`src/data/cityProfiles.json`](../src/data/cityProfiles.json). Near-empty
micro-buurten (pop < 250, typically industrial/water) are excluded from the
residential-spread model (< ~1% of city population). To extend nation mode to all
~342 gemeenten, drop a national gemeente export in and run
[`scripts/build_nation_profiles.py`](../scripts/build_nation_profiles.py).

## RWZI register and catchments

| Source | Used for | Link |
|---|---|---|
| **RWZI-register** (Emissieregistratie) | RWZI ID, name, location, capacity, connections | <https://www.emissieregistratie.nl/> |
| **RWZI-stroomgebiedskaart, PDOK GWSW WFS** (canonical) | Catchment / management areas (`beheerstedelijkwater:BeheerGebied`) and point locations (`beheerstedelijkwater:BeheerBouwwerk`) per RWZI | <https://www.pdok.nl/introductie/-/article/beheer-stedelijk-watersystemen-gwsw> · WFS: <https://service.pdok.nl/rioned/beheer-stedelijk-watersystemen-gwsw/wfs/v1_0> |
| **RWZI-stroomgebiedskaart** (RIVM / NRS, secondary) | Fallback catchment polygons via the NRS programme; use only where PDOK GWSW does not cover the region | <https://www.rivm.nl/coronavirus-covid-19/onderzoek/rioolwater> · <https://nationaalgeoregister.nl/> |

Each city's buurten are assigned to multiple **sewer sub-catchments** (k-means on
buurt centroids in `build_city_profiles.py`), each named after its largest
neighbourhood, so a wastewater uptick localises to specific neighbourhoods. The
[Surveillance tab](../src/components/SurveillanceView.tsx) uses these to show
"real situation vs. what the government sees": viral load per catchment
(`src/simulation/detection.ts`) is an early-warning signal that crosses its alert
threshold days before hospital occupancy does, and the first catchments to alert
are the candidates for localised measures. Replace the synthetic catchments with
the real GWSW polygons below for an operational version.

The **canonical catchment source** is the PDOK GWSW WFS published by RIONED. It is an open WFS (CC0) and is the source consumed by [`tooling/fetchers/rwzi_register.py`](../tooling/fetchers/rwzi_register.py). The RIVM / NRS layer is kept as a documented secondary source: use it only when PDOK GWSW does not cover the region of interest, and note the fallback in your quality report.

If neither layer covers the region you need, the parsed Watson export
([`tooling/fetchers/parse_watson_meetresultaten.py`](../tooling/fetchers/parse_watson_meetresultaten.py))
still provides `rwzi_code` and `rwzi_locatie` as join keys; treat that as a
final fallback rather than a primary catchment source.

## BAG (Basisregistratie Adressen en Gebouwen)  -  optional reference

| Source | Used for | Link |
|---|---|---|
| **BAG** (open) | Address points, building footprints, building year, function | <https://bag.basisregistraties.overheid.nl/> |
| **BAG via PDOK** | Same data, served as WFS / Atom GIS feeds | <https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1> |

BAG is **not a must-have data source**. It is an *optional reference layer*
for teams that want to place synthetic households on a real building rather
than the *buurt* centroid, or that want to derive building-type detail for
instellingstype-in-catchment (could-have). Submissions that stay at *buurt*
level do not need BAG.

## Reference and inspiration (optional)

| Source | Why | Link |
|---|---|---|
| **MetaSyn** | Reference open-source library for synthetic tabular data | <https://github.com/sodascience/metasyn> |
| **ODISSEI** | Dutch research infrastructure for social science; community resource | <https://odissei-data.nl/> |
| **NL API Strategie** | Government API conventions | <https://gitdocumentatie.logius.nl/publicatie/api/adr/> |
| **Common Ground** | Architectural principles for Dutch government data | <https://commonground.nl/> |
| **GreenPT API** | LLM access for teams that want to integrate generative steps | <https://greenpt.nl/> |

## Excluded by policy

Per the challenge brief and [`CONTRIBUTING.md`](../CONTRIBUTING.md):

- ❌ Any closed or paywalled data source.
- ❌ Real CBS microdata (CBS Remote Access, *beveiligde omgeving*). Even if a team has access, do **not** use it as input to a synthesised dataset that is then published.
- ❌ Scraped sources whose licence does not permit redistribution.
