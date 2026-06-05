# OneGov #2 | Synthetic Data: Pandemic Preparedness

> *From neighbourhood aggregates to a synthetic population realistic enough to model an outbreak.*

This repository hosts the challenge brief, supporting documents, a public-data variable catalogue, and starter tooling for the second **OneGov** hackathon, hosted by [GovTech NL](https://govtechnl.nl) with challenge owners **CBS**, **ODISSEI**, **Erasmus MC** and **Digicampus**.

- **Theme:** Synthetic Data
- **Date:** 4–5 June 2026
- **Location:** The Hague Tech, Den Haag
- **Challenge owner:** Marc Winsemius (Digicampus)
- **Co-owners:** Ruben Dood (CBS), Tom Emery (ODISSEI), Ted Oliekan (Erasmus MC)
- **Contact:** [hack@govtechnl.nl](mailto:hack@govtechnl.nl)

## The challenge in one paragraph

When a new infectious disease emerges, rapid insight into how a virus spreads through a population is critical. Epidemiological **infection-and-recovery models** need data at the **micro level**: synthetic persons with realistic age, household, housing, work-sector and mobility characteristics. That micro-data does not exist as an openly available file. What does exist are rich, reliable **aggregates** at *buurt* and *wijk* level from CBS and RIVM.

**How do we generate, using only publicly available data, a micro-level synthetic population that is statistically consistent with CBS neighbourhood aggregates, preserves spatial structure, and can feed both infection-and-recovery models and wastewater (RWZI) surveillance?**

The full brief is in [CHALLENGE.md](CHALLENGE.md). The original Dutch PDF is [`OneGov#2_Challenge_Brief_Synthetische_Data.pdf`](OneGov%232_Challenge_Brief_Synthetische_Data.pdf) at the repo root.

New teams can start with [START_HERE.md](START_HERE.md).

## Interactive pandemic simulator prototype

This fork also includes a browser-based stochastic SEIR simulator that turns
the challenge catalogue into a playable synthetic population model. It
generates weighted synthetic agents, households, work and school nodes, commute
corridors, event exposure, age-specific susceptibility, mortality and RWZI
proxy signals from a fixed seed.

The simulator has two data scopes:

- **Nation level:** a weighted Dutch network scaled to the 18,044,027 residents
  in the uploaded 2025 CBS national row.
- **The Hague level:** 111 BU-level Hague neighbourhood profiles generated from
  the local kerncijfers, facility-distance and mobility CSV folders, enriched
  with PDOK/CBS Wijk- en Buurtkaart 2024 centroids.

Scenario controls include infection rate, incubation time, infectious period,
mobility, events, household exposure, policy timing, prior immunity,
vaccination rollout, vaccine effectiveness, mortality multiplier and stochastic
ensemble runs with 10-90% uncertainty bands.

The **Cellular density** tab runs a separate cellular automaton experiment
inspired by epidemic CA literature. It uses a browser-ready raster generated
from the CBS/PDOK Wijk- en Buurtkaart 2024 `buurten` collection, with each cell
assigned `bevolkingsdichtheid_inwoners_per_km2`.

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

See [docs/google-abes-adapter.md](docs/google-abes-adapter.md) for the ABES
integration path and current limitations.

The simulator is a research prototype for exploration and pitching. It does
not use real person-level data and is not an operational forecast.

## Two layers

Teams pick one (or show how they connect):

1. **Layer 1  -  Demographic population.** Synthetic persons or households that match CBS *buurt* statistics on age, household composition, housing type, occupancy, work sector, mobility, and spatial location.
2. **Layer 2  -  Wastewater-surveillance context.** Link the synthetic population to RWZI (rioolwaterzuiveringsinstallatie) catchments and land-use data, so wastewater signals can be interpreted geographically and demographically.

## Repository layout

| Path | Purpose |
|---|---|
| [CHALLENGE.md](CHALLENGE.md) | Full challenge brief (English translation of the Dutch original) |
| [docs/](docs/) | Personas, scenarios, glossary, judging criteria, methodology notes, privacy guidance |
| [docs/README.md](docs/README.md) | Docs index for quick navigation during the hackathon |
| [docs/data-sources.md](docs/data-sources.md) | Every upstream source with URLs, licences and CBS table IDs |
| [docs/variables.md](docs/variables.md) | Human-readable variable catalogue with priority (must / should / could / would) |
| [data/variables.yaml](data/variables.yaml) | Machine-readable variable catalogue (source of truth) |
| [data/sources.yaml](data/sources.yaml) | Machine-readable source catalogue (URLs, licences) |
| [data/reference/](data/reference/) | Placeholder for downloaded upstream reference data (gitignored) |
| [data/synthetic/](data/synthetic/) | Where team-generated synthetic populations land |
| [tooling/](tooling/) | Optional Python starter: data fetchers, example IPF + MetaSyn scripts, catalogue tests |
| [resources/](resources/) | Variable overview spreadsheet (`SynthData.xlsx`) as delivered by the challenge owners |

## Quick start: explore the variable catalogue

```powershell
cd tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]

# Validate that the variable & source catalogues are well-formed
pytest -v

# Fetch a slice of CBS Kerncijfers wijken en buurten for one region
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference

# Minimal IPF demo on one buurt
python examples\01_ipf_minimal.py --buurt BU03440101
```

The fetchers are deliberately thin wrappers around public CBS / RIVM open-data endpoints. **Teams are free to choose any synthesis method** (IPF, agent-based, generative models, …). The reference library [MetaSyn](https://github.com/sodascience/metasyn) is documented as an option but not required.

See [data/README.md](data/README.md) for the data dictionary and provenance rules and [docs/methoden.md](docs/methoden.md) for a short comparison of synthesis approaches.

## Variables at a glance

The full table is in [docs/variables.md](docs/variables.md). Must-have variables come from:

| CBS table / source | Topic |
|---|---|
| **86165NED** | Kerncijfers wijken en buurten  -  demographics, housing, income, work, urbanicity |
| **82275NED** | Hoogst behaald onderwijsniveau bevolking  -  education level |
| **70262NED** | Bodemgebruik in Nederland  -  land use (residential / industry / agriculture / green / water) |
| **85870NED** | Nabijheidsstatistieken  -  distance to hospitals, airports, care homes |
| **84709NED** | ODiN (Onderweg in Nederland)  -  daily mobility, commute distance |
| Emissieregistratie | RWZI register  -  locations, capacities, catchment |
| PDOK GWSW WFS (RIONED) | RWZI catchment / management areas, **canonical** open layer |
| RIVM / NRS open GIS | RWZI catchment polygons, **secondary fallback** for the canonical PDOK layer |

**Optional reference (not must-have):** BAG (Basisregistratie Adressen en
Gebouwen) is available for teams that want to place synthetic households
on a real building or derive building-type detail. Submissions that stay
at *buurt* level do not need BAG. See [docs/data-sources.md](docs/data-sources.md#bag-basisregistratie-adressen-en-gebouwen-optional-reference).

Submissions must cover at least the must-have variables. See the [SynthData.xlsx](resources/SynthData.xlsx) source spreadsheet.

## Disclaimer

All data in this repository (and all output produced by the starter tooling) is **synthetic**. Upstream sources are **publicly available aggregate** statistics  -  no micro-data of real individuals is used. Prototypes built during the hackathon are research artefacts, not operational pandemic-preparedness systems, and require independent validation before any operational use.

## Licensing

See [CONTRIBUTING.md](CONTRIBUTING.md#licensing-of-contributions) for the
canonical rule. In short:

- This **starter repo** ships under **Apache-2.0** (code, see [LICENSE](LICENSE))
  and **CC BY 4.0** (data, docs, challenge text, see [LICENSE-DATA](LICENSE-DATA)).
- **Hackathon team submissions** must be open source under an
  **OSI-approved licence** for code (Apache-2.0, MIT, EUPL-1.2, …) and
  an open data licence (CC BY 4.0 recommended, CC0 also accepted) for
  the dataset and the quality report.
- Upstream open data keeps its own custodian licence (mostly CC BY for
  CBS); credit the source when you redistribute derived data.

## Contributing

Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). During the hackathon the rule is **one PR per team**.

## Submission

Submissions go through **Alkemio**, the central submission and review point for this challenge.

- **Alkemio submission space:** [Synthetische Data](https://alkem.io/onegov-hackathon/challenges/synthetischedata).
- Each team submits, via Alkemio: (1) a **link to its Pull Request** on this repo (one PR per team), (2) the **synthetic dataset** as an open file (CSV or Parquet), (3) the **quality report** following [docs/kwaliteitsrapport-template.md](docs/kwaliteitsrapport-template.md), and (4) the **pitch deck** (max. 10 slides).
- **The Alkemio submission is what the jury scores during the hackathon.** The PR is still required: it is the artefact the Alkemio submission points to, and it is leading for the post-hackathon review and merge into the central library.

See [CHALLENGE.md](CHALLENGE.md#submission) for the full description.
