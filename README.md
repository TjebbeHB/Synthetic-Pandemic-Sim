# OneGov #2 | Synthetic Data: Pandemic Preparedness

## Nederlands

> *Van buurtaggregaten naar een synthetische populatie die realistisch genoeg is om een uitbraak te modelleren.*

### De uitdaging in een alinea

Wanneer een nieuwe infectieziekte opkomt, is snel inzicht in verspreiding door de bevolking cruciaal. Epidemiologische **infection-and-recovery modellen** hebben data op **microniveau** nodig: synthetische personen met realistische leeftijd, huishoudtype, woningtype, werksector en mobiliteit. Zulke microdata is niet openbaar beschikbaar. Wat wel bestaat, zijn rijke en betrouwbare **aggregaten** op *buurt*- en *wijkniveau* van CBS en RIVM.

**Hoe genereren we, met alleen publiek beschikbare data, een synthetische micro-populatie die statistisch consistent is met CBS-buurtaggregaten, ruimtelijke structuur behoudt, en bruikbaar is voor infection-and-recovery modellen en rioolwatermonitoring (RWZI)?**

De volledige challenge staat in [CHALLENGE.md](CHALLENGE.md).

### Interactief pandemie-simulatieprototype

Deze fork bevat een browsergebaseerde, stochastische SEIR-simulator die de challenge-catalogus omzet in een speelbaar synthetisch populatiemodel. De simulator genereert gewogen synthetische agenten, huishoudens, werk- en schoolknooppunten, woon-werkcorridors, eventblootstelling, leeftijdsspecifieke vatbaarheid, sterfte en RWZI-proxysignalen.

De simulator heeft twee dataniveaus:

- **Nation level:** een gewogen Nederlands netwerk, opgeschaald naar de 18.044.027 inwoners uit de geuploade CBS-kerncijfersrij voor Nederland 2025.
- **Stads niveau:** De grote steden op BU-niveau, gegenereerd uit lokale kerncijfers-, nabijheids- en mobiliteits-CSV's, verrijkt met PDOK/CBS Wijk- en Buurtkaart 2024-centroiden.

Scenario-instellingen omvatten infectiekans, incubatietijd, besmettelijke periode, mobiliteit, events, huishoudblootstelling, beleidsmomenten, bestaande immuniteit, vaccinatie-uitrol, vaccineffectiviteit, sterftemultiplier en stochastische ensemble-runs met 10-90% onzekerheidsbanden.

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

De fetchers zijn bewust dunne wrappers rond publieke CBS/RIVM-open-data-endpoints. **Teams zijn vrij om iedere synthesemethode te kiezen**: IPF, agent-based modellen, generatieve modellen, enzovoort.

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


---

## English

> *From neighbourhood aggregates to a synthetic population realistic enough to model an outbreak.*
> 
### The challenge in one paragraph

When a new infectious disease emerges, rapid insight into how a virus spreads through a population is critical. Epidemiological **infection-and-recovery models** need data at the **micro level**: synthetic persons with realistic age, household, housing, work-sector and mobility characteristics. That micro-data does not exist as an openly available file. What does exist are rich, reliable **aggregates** at *buurt* and *wijk* level from CBS and RIVM.

**How do we generate, using only publicly available data, a micro-level synthetic population that is statistically consistent with CBS neighbourhood aggregates, preserves spatial structure, and can feed both infection-and-recovery models and wastewater (RWZI) surveillance?**

The full brief is in [CHALLENGE.md](CHALLENGE.md). The original Dutch PDF is [`OneGov#2_Challenge_Brief_Synthetische_Data.pdf`](OneGov%232_Challenge_Brief_Synthetische_Data.pdf) at the repo root.

New teams can start with [START_HERE.md](START_HERE.md).

### Interactive pandemic simulator prototype

This fork includes a browser-based stochastic SEIR simulator that turns the challenge catalogue into a playable synthetic population model. It generates weighted synthetic agents, households, work and school nodes, commute corridors, event exposure, age-specific susceptibility, mortality and RWZI proxy signals.

The simulator has two data scopes:

- **Nation level:** a weighted Dutch network scaled to the 18,044,027 residents in the uploaded 2025 CBS national row.
- **Local level:** neighbourhood profiles generated from local core-statistics, facility-distance and mobility CSV folders, enriched with PDOK/CBS Wijk- en Buurtkaart 2024 centroids.

Scenario controls include infection rate, incubation time, infectious period, mobility, events, household exposure, policy timing, prior immunity, vaccination rollout, vaccine effectiveness, mortality multiplier and stochastic ensemble runs with 10-90% uncertainty bands.

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
