# OneGov #2 | Synthetic Data: Pandemic Preparedness

## Nederlands

> *Van buurtaggregaten naar een synthetische populatie die realistisch genoeg is om een uitbraak te modelleren.*

Deze repository bevat de challenge brief, ondersteunende documentatie, een publieke-data-variabelencatalogus, starter tooling en een interactief pandemie-simulatieprototype voor de tweede **OneGov** hackathon, georganiseerd door [GovTech NL](https://govtechnl.nl) met challenge-eigenaren **CBS**, **ODISSEI**, **Erasmus MC** en **Digicampus**.

- **Thema:** Synthetic Data
- **Datum:** 4-5 juni 2026
- **Locatie:** The Hague Tech, Den Haag
- **Challenge-eigenaar:** Marc Winsemius (Digicampus)
- **Co-eigenaren:** Ruben Dood (CBS), Tom Emery (ODISSEI), Ted Oliekan (Erasmus MC)
- **Contact:** [hack@govtechnl.nl](mailto:hack@govtechnl.nl)

### De uitdaging in een alinea

Wanneer een nieuwe infectieziekte opkomt, is snel inzicht in verspreiding door de bevolking cruciaal. Epidemiologische **infection-and-recovery modellen** hebben data op **microniveau** nodig: synthetische personen met realistische leeftijd, huishoudtype, woningtype, werksector en mobiliteit. Zulke microdata is niet openbaar beschikbaar. Wat wel bestaat, zijn rijke en betrouwbare **aggregaten** op *buurt*- en *wijkniveau* van CBS en RIVM.

**Hoe genereren we, met alleen publiek beschikbare data, een synthetische micro-populatie die statistisch consistent is met CBS-buurtaggregaten, ruimtelijke structuur behoudt, en bruikbaar is voor infection-and-recovery modellen en rioolwatermonitoring (RWZI)?**

De volledige challenge staat in [CHALLENGE.md](CHALLENGE.md). De oorspronkelijke Nederlandse PDF staat in [`OneGov#2_Challenge_Brief_Synthetische_Data.pdf`](OneGov%232_Challenge_Brief_Synthetische_Data.pdf).

Nieuwe teams kunnen beginnen met [START_HERE.md](START_HERE.md).

### Interactief pandemie-simulatieprototype

Deze fork bevat een browsergebaseerde, stochastische SEIR-simulator die de challenge-catalogus omzet in een speelbaar synthetisch populatiemodel. De simulator genereert gewogen synthetische agenten, huishoudens, werk- en schoolknooppunten, woon-werkcorridors, eventblootstelling, leeftijdsspecifieke vatbaarheid, sterfte en RWZI-proxysignalen.

De simulator heeft twee dataniveaus:

- **Nation level:** een gewogen Nederlands netwerk, opgeschaald naar de 18.044.027 inwoners uit de geuploade CBS-kerncijfersrij voor Nederland 2025.
- **The Hague level:** 111 Haagse buurten op BU-niveau, gegenereerd uit lokale kerncijfers-, nabijheids- en mobiliteits-CSV's, verrijkt met PDOK/CBS Wijk- en Buurtkaart 2024-centroiden.

Scenario-instellingen omvatten infectiekans, incubatietijd, besmettelijke periode, mobiliteit, events, huishoudblootstelling, beleidsmomenten, bestaande immuniteit, vaccinatie-uitrol, vaccineffectiviteit, sterftemultiplier en stochastische ensemble-runs met 10-90% onzekerheidsbanden.

De tab **Cellular density** draait een apart cellular-automaton experiment, geïnspireerd op epidemische CA-literatuur. Deze gebruikt een browserklare rasterkaart uit de CBS/PDOK Wijk- en Buurtkaart 2024 `buurten`-collectie, waarbij iedere cel `bevolkingsdichtheid_inwoners_per_km2` krijgt toegewezen.

```bash
npm install
npm run dev
```

Genereer de Haagse/Nationale profiel-JSON opnieuw uit de lokale CSV-mappen:

```bash
python3 scripts/build_dutch_profiles.py
```

Genereer het nationale cellular-automaton dichtheidsraster opnieuw vanuit PDOK/CBS:

```bash
python3 scripts/build_ca_density_grid.py
```

Genereer een Google ABES `home_work` backendconfiguratie uit dezelfde profielen:

```bash
python3 scripts/write_google_abes_config.py --mode hague --output artifacts/google-abes-hague.pbtxt
```

Zie [docs/google-abes-adapter.md](docs/google-abes-adapter.md) voor het ABES-integratiepad en de huidige beperkingen.

De simulator is een onderzoeksprototype voor verkenning en pitchdoeleinden. Er wordt geen echte persoonsdata gebruikt en het is geen operationeel voorspellingsinstrument.

### Twee lagen

Teams kiezen een laag, of laten zien hoe de lagen verbonden kunnen worden:

1. **Laag 1 - Demografische populatie.** Synthetische personen of huishoudens die aansluiten op CBS-*buurt*statistieken over leeftijd, huishoudsamenstelling, woningtype, bezetting, werksector, mobiliteit en ruimtelijke locatie.
2. **Laag 2 - Rioolwatersurveillance-context.** Koppel de synthetische populatie aan RWZI-stroomgebieden en landgebruik, zodat rioolwatersignalen geografisch en demografisch geïnterpreteerd kunnen worden.

### Repository-indeling

| Pad | Doel |
|---|---|
| [CHALLENGE.md](CHALLENGE.md) | Volledige challenge brief |
| [docs/](docs/) | Persona's, scenario's, glossary, beoordelingscriteria, methoden, privacyrichtlijnen |
| [docs/README.md](docs/README.md) | Documentatie-index |
| [docs/data-sources.md](docs/data-sources.md) | Upstream bronnen met URL's, licenties en CBS-tabel-ID's |
| [docs/variables.md](docs/variables.md) | Leesbare variabelencatalogus met prioriteit |
| [data/variables.yaml](data/variables.yaml) | Machineleesbare variabelencatalogus |
| [data/sources.yaml](data/sources.yaml) | Machineleesbare broncatalogus |
| [data/reference/](data/reference/) | Placeholder voor gedownloade referentiedata |
| [data/synthetic/](data/synthetic/) | Locatie voor gegenereerde synthetische populaties |
| [tooling/](tooling/) | Python-startertooling: fetchers, IPF- en MetaSyn-voorbeelden, catalogustests |
| [resources/](resources/) | Variabelenoverzicht (`SynthData.xlsx`) zoals aangeleverd door de challenge-eigenaren |
| [src/](src/) | Browserapplicatie en simulatiemodellen |
| [scripts/](scripts/) | Datageneratoren en ABES-configuratiehulpmiddelen |

### Quick start: variabelencatalogus verkennen

```powershell
cd tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]

# Valideer de variabelen- en broncatalogi
pytest -v

# Haal een selectie CBS Kerncijfers wijken en buurten op voor een regio
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference

# Minimale IPF-demo op een buurt
python examples\01_ipf_minimal.py --buurt BU03440101
```

De fetchers zijn bewust dunne wrappers rond publieke CBS/RIVM-open-data-endpoints. **Teams zijn vrij om iedere synthesemethode te kiezen**: IPF, agent-based modellen, generatieve modellen, enzovoort. De referentielibrary [MetaSyn](https://github.com/sodascience/metasyn) is gedocumenteerd als optie, maar niet verplicht.

Zie [data/README.md](data/README.md) voor de data dictionary en herkomstregels, en [docs/methoden.md](docs/methoden.md) voor een korte vergelijking van synthesemethoden.

### Variabelen in het kort

De volledige tabel staat in [docs/variables.md](docs/variables.md). Must-have variabelen komen uit:

| CBS-tabel / bron | Onderwerp |
|---|---|
| **86165NED** | Kerncijfers wijken en buurten - demografie, wonen, inkomen, werk, stedelijkheid |
| **82275NED** | Hoogst behaald onderwijsniveau bevolking - opleidingsniveau |
| **70262NED** | Bodemgebruik in Nederland - landgebruik |
| **85870NED** | Nabijheidsstatistieken - afstand tot ziekenhuizen, luchthavens, zorglocaties |
| **84709NED** | ODiN (Onderweg in Nederland) - dagelijkse mobiliteit, woon-werkafstand |
| Emissieregistratie | RWZI-register - locaties, capaciteit, stroomgebied |
| PDOK GWSW WFS (RIONED) | RWZI-beheergebieden, **canonieke** open laag |
| RIVM / NRS open GIS | RWZI-stroomgebiedpolygonen, **secundaire fallback** |

**Optionele referentie:** BAG (Basisregistratie Adressen en Gebouwen) is beschikbaar voor teams die synthetische huishoudens op echte gebouwen willen plaatsen of gebouwdetail willen afleiden. Inzendingen op *buurt*niveau hebben BAG niet nodig. Zie [docs/data-sources.md](docs/data-sources.md#bag-basisregistratie-adressen-en-gebouwen-optional-reference).

Inzendingen moeten minimaal de must-have variabelen afdekken. Zie ook [SynthData.xlsx](resources/SynthData.xlsx).

### Disclaimer

Alle data in deze repository, en alle output uit de startertooling, is **synthetisch**. Upstream bronnen zijn **publieke aggregaten**; er wordt geen microdata van echte individuen gebruikt. Prototypes uit de hackathon zijn onderzoeksartefacten, geen operationele pandemievoorbereidingssystemen, en vereisen onafhankelijke validatie voor operationeel gebruik.

### Licentie

Zie [CONTRIBUTING.md](CONTRIBUTING.md#licensing-of-contributions) voor de canonieke regel. Kort samengevat:

- Deze **starter repo** gebruikt **Apache-2.0** voor code, zie [LICENSE](LICENSE), en **CC BY 4.0** voor data, docs en challenge-tekst, zie [LICENSE-DATA](LICENSE-DATA).
- **Hackathoninzendingen** moeten open source zijn onder een **OSI-goedgekeurde licentie** voor code en een open-datalicentie voor datasets en kwaliteitsrapportage.
- Upstream open data behoudt de licentie van de oorspronkelijke beheerder. Vermeld de bron wanneer afgeleide data wordt verspreid.

### Bijdragen

Issues en pull requests zijn welkom; zie [CONTRIBUTING.md](CONTRIBUTING.md). Tijdens de hackathon geldt: **een PR per team**.

### Inzending

Inzendingen verlopen via **Alkemio**, het centrale indien- en reviewpunt voor deze challenge.

- **Alkemio submission space:** [Synthetische Data](https://alkem.io/onegov-hackathon/challenges/synthetischedata).
- Elk team dient via Alkemio in: (1) een **link naar de Pull Request** op deze repo, (2) de **synthetische dataset** als open bestand (CSV of Parquet), (3) het **kwaliteitsrapport** volgens [docs/kwaliteitsrapport-template.md](docs/kwaliteitsrapport-template.md), en (4) de **pitch deck** (max. 10 slides).
- **De Alkemio-inzending is wat de jury beoordeelt tijdens de hackathon.** De PR blijft vereist als artefact waar de Alkemio-inzending naar verwijst.

Zie [CHALLENGE.md](CHALLENGE.md#submission) voor de volledige beschrijving.

---

## English

> *From neighbourhood aggregates to a synthetic population realistic enough to model an outbreak.*

This repository hosts the challenge brief, supporting documents, a public-data variable catalogue, starter tooling, and an interactive pandemic-simulation prototype for the second **OneGov** hackathon, hosted by [GovTech NL](https://govtechnl.nl) with challenge owners **CBS**, **ODISSEI**, **Erasmus MC** and **Digicampus**.

- **Theme:** Synthetic Data
- **Date:** 4-5 June 2026
- **Location:** The Hague Tech, The Hague
- **Challenge owner:** Marc Winsemius (Digicampus)
- **Co-owners:** Ruben Dood (CBS), Tom Emery (ODISSEI), Ted Oliekan (Erasmus MC)
- **Contact:** [hack@govtechnl.nl](mailto:hack@govtechnl.nl)

### The challenge in one paragraph

When a new infectious disease emerges, rapid insight into how a virus spreads through a population is critical. Epidemiological **infection-and-recovery models** need data at the **micro level**: synthetic persons with realistic age, household, housing, work-sector and mobility characteristics. That micro-data does not exist as an openly available file. What does exist are rich, reliable **aggregates** at *buurt* and *wijk* level from CBS and RIVM.

**How do we generate, using only publicly available data, a micro-level synthetic population that is statistically consistent with CBS neighbourhood aggregates, preserves spatial structure, and can feed both infection-and-recovery models and wastewater (RWZI) surveillance?**

The full brief is in [CHALLENGE.md](CHALLENGE.md). The original Dutch PDF is [`OneGov#2_Challenge_Brief_Synthetische_Data.pdf`](OneGov%232_Challenge_Brief_Synthetische_Data.pdf) at the repo root.

New teams can start with [START_HERE.md](START_HERE.md).

### Interactive pandemic simulator prototype

This fork includes a browser-based stochastic SEIR simulator that turns the challenge catalogue into a playable synthetic population model. It generates weighted synthetic agents, households, work and school nodes, commute corridors, event exposure, age-specific susceptibility, mortality and RWZI proxy signals.

The simulator has two data scopes:

- **Nation level:** a weighted Dutch network scaled to the 18,044,027 residents in the uploaded 2025 CBS national row.
- **The Hague level:** 111 BU-level Hague neighbourhood profiles generated from local core-statistics, facility-distance and mobility CSV folders, enriched with PDOK/CBS Wijk- en Buurtkaart 2024 centroids.

Scenario controls include infection rate, incubation time, infectious period, mobility, events, household exposure, policy timing, prior immunity, vaccination rollout, vaccine effectiveness, mortality multiplier and stochastic ensemble runs with 10-90% uncertainty bands.

The **Cellular density** tab runs a separate cellular automaton experiment inspired by epidemic CA literature. It uses a browser-ready raster generated from the CBS/PDOK Wijk- en Buurtkaart 2024 `buurten` collection, with each cell assigned `bevolkingsdichtheid_inwoners_per_km2`.

```bash
npm install
npm run dev
```

Regenerate the Hague/National profile JSON from the local CSV folders:

```bash
python3 scripts/build_dutch_profiles.py
```

Regenerate the national cellular-automaton density grid from PDOK/CBS:

```bash
python3 scripts/build_ca_density_grid.py
```

Generate a Google ABES `home_work` backend config from the same profiles:

```bash
python3 scripts/write_google_abes_config.py --mode hague --output artifacts/google-abes-hague.pbtxt
```

See [docs/google-abes-adapter.md](docs/google-abes-adapter.md) for the ABES integration path and current limitations.

The simulator is a research prototype for exploration and pitching. It does not use real person-level data and is not an operational forecast.

### Two layers

Teams pick one layer, or show how they connect:

1. **Layer 1 - Demographic population.** Synthetic persons or households that match CBS *buurt* statistics on age, household composition, housing type, occupancy, work sector, mobility, and spatial location.
2. **Layer 2 - Wastewater-surveillance context.** Link the synthetic population to RWZI catchments and land-use data, so wastewater signals can be interpreted geographically and demographically.

### Repository layout

| Path | Purpose |
|---|---|
| [CHALLENGE.md](CHALLENGE.md) | Full challenge brief |
| [docs/](docs/) | Personas, scenarios, glossary, judging criteria, methodology notes, privacy guidance |
| [docs/README.md](docs/README.md) | Docs index |
| [docs/data-sources.md](docs/data-sources.md) | Upstream sources with URLs, licences and CBS table IDs |
| [docs/variables.md](docs/variables.md) | Human-readable variable catalogue with priority |
| [data/variables.yaml](data/variables.yaml) | Machine-readable variable catalogue |
| [data/sources.yaml](data/sources.yaml) | Machine-readable source catalogue |
| [data/reference/](data/reference/) | Placeholder for downloaded upstream reference data |
| [data/synthetic/](data/synthetic/) | Where team-generated synthetic populations land |
| [tooling/](tooling/) | Python starter tooling: fetchers, IPF and MetaSyn examples, catalogue tests |
| [resources/](resources/) | Variable overview spreadsheet (`SynthData.xlsx`) as delivered by the challenge owners |
| [src/](src/) | Browser app and simulation models |
| [scripts/](scripts/) | Data generators and ABES configuration helpers |

### Quick start: explore the variable catalogue

```powershell
cd tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]

# Validate that the variable and source catalogues are well-formed
pytest -v

# Fetch a slice of CBS Kerncijfers wijken en buurten for one region
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference

# Minimal IPF demo on one buurt
python examples\01_ipf_minimal.py --buurt BU03440101
```

The fetchers are deliberately thin wrappers around public CBS/RIVM open-data endpoints. **Teams are free to choose any synthesis method**: IPF, agent-based models, generative models, and so on. The reference library [MetaSyn](https://github.com/sodascience/metasyn) is documented as an option but not required.

See [data/README.md](data/README.md) for the data dictionary and provenance rules, and [docs/methoden.md](docs/methoden.md) for a short comparison of synthesis approaches.

### Variables at a glance

The full table is in [docs/variables.md](docs/variables.md). Must-have variables come from:

| CBS table / source | Topic |
|---|---|
| **86165NED** | Kerncijfers wijken en buurten - demographics, housing, income, work, urbanicity |
| **82275NED** | Hoogst behaald onderwijsniveau bevolking - education level |
| **70262NED** | Bodemgebruik in Nederland - land use |
| **85870NED** | Nabijheidsstatistieken - distance to hospitals, airports, care homes |
| **84709NED** | ODiN (Onderweg in Nederland) - daily mobility, commute distance |
| Emissieregistratie | RWZI register - locations, capacities, catchment |
| PDOK GWSW WFS (RIONED) | RWZI catchment / management areas, **canonical** open layer |
| RIVM / NRS open GIS | RWZI catchment polygons, **secondary fallback** |

**Optional reference:** BAG (Basisregistratie Adressen en Gebouwen) is available for teams that want to place synthetic households on real buildings or derive building-type detail. Submissions that stay at *buurt* level do not need BAG. See [docs/data-sources.md](docs/data-sources.md#bag-basisregistratie-adressen-en-gebouwen-optional-reference).

Submissions must cover at least the must-have variables. See the [SynthData.xlsx](resources/SynthData.xlsx) source spreadsheet.

### Disclaimer

All data in this repository, and all output produced by the starter tooling, is **synthetic**. Upstream sources are **publicly available aggregate** statistics; no micro-data of real individuals is used. Hackathon prototypes are research artefacts, not operational pandemic-preparedness systems, and require independent validation before any operational use.

### Licensing

See [CONTRIBUTING.md](CONTRIBUTING.md#licensing-of-contributions) for the canonical rule. In short:

- This **starter repo** ships under **Apache-2.0** for code, see [LICENSE](LICENSE), and **CC BY 4.0** for data, docs and challenge text, see [LICENSE-DATA](LICENSE-DATA).
- **Hackathon team submissions** must be open source under an **OSI-approved licence** for code and an open data licence for datasets and quality reports.
- Upstream open data keeps its own custodian licence. Credit the source when redistributing derived data.

### Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). During the hackathon the rule is **one PR per team**.

### Submission

Submissions go through **Alkemio**, the central submission and review point for this challenge.

- **Alkemio submission space:** [Synthetische Data](https://alkem.io/onegov-hackathon/challenges/synthetischedata).
- Each team submits, via Alkemio: (1) a **link to its Pull Request** on this repo, (2) the **synthetic dataset** as an open file (CSV or Parquet), (3) the **quality report** following [docs/kwaliteitsrapport-template.md](docs/kwaliteitsrapport-template.md), and (4) the **pitch deck** (max. 10 slides).
- **The Alkemio submission is what the jury scores during the hackathon.** The PR is still required as the artefact the Alkemio submission points to.

See [CHALLENGE.md](CHALLENGE.md#submission) for the full description.
