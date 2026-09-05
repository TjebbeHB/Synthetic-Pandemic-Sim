# Challenge Brief | Synthetic Data: Pandemic Preparedness

> **OneGov #2** · CBS · ODISSEI · Erasmus MC · Digicampus · 4–5 June 2026 · The Hague Tech
>
> *Build the synthetic population for pandemic preparedness  -  from public neighbourhood aggregates to micro-level reality.*
>
> **Challenge owner:** Marc Winsemius (Digicampus)
> **Co-owners:** Ruben Dood (CBS), Tom Emery (ODISSEI), Ted Oliekan (Erasmus MC)
> **Contact:** [hack@govtechnl.nl](mailto:hack@govtechnl.nl)

This is an English working translation of the original Dutch challenge brief.
The authoritative source is [`OneGov#2_Challenge_Brief_Synthetische_Data.pdf`](OneGov%232_Challenge_Brief_Synthetische_Data.pdf) and the version on the Alkemio platform.

---

## Background

When an infectious disease emerges, rapid insight into how a virus spreads through a population is critical. Epidemiological models such as *infection-and-recovery models* can map that spread, but they need **micro-level data**: synthetic individuals with realistic characteristics  -  age, housing situation, work sector, mobility patterns.

That micro-data does not exist as an openly available file. What is available are rich, reliable **aggregate statistics** at *buurt* and *wijk* level from CBS and RIVM  -  too coarse for direct modelling. The challenge is to upscale those grainy neighbourhood aggregates into a synthetic population that is **statistically correct, spatially coherent, and epidemiologically meaningful**.

In parallel, **wastewater surveillance**  -  measuring pathogens in sewage at RWZIs (rioolwaterzuiveringsinstallaties)  -  is a powerful early-warning system. The richer the underlying synthetic population, the better wastewater signals can be interpreted geographically and demographically.

CBS, ODISSEI, Erasmus MC and Digicampus bring these two worlds together in this challenge.

## Problem statement

Researchers and policymakers who want to model pandemic scenarios run into the same walls:

- **Micro-level population data is not publicly available.** Real person-level data is privacy-sensitive and therefore unusable for broad modelling.
- **Aggregate CBS neighbourhood data is rich but too coarse.** Infection-and-recovery models need individual synthetic persons, not neighbourhood sums.
- **There is no standardised method** to turn neighbourhood statistics into a synthetic population that also preserves spatial coherence and cross-domain relationships.
- **Wastewater-surveillance datasets lack the demographic and spatial context** needed to interpret signals well.

## The challenge

> *How do we generate, using only publicly available data, a micro-level synthetic population that is statistically consistent with CBS neighbourhood aggregates, preserves spatial structure, and is usable as input for both infection-and-recovery models and wastewater surveillance?*

The core task is to build a synthetic micro-level representation of (part of) the Netherlands, starting from aggregate neighbourhood data. Think of it as an algorithm that upscales a grainy photo to higher resolution: the output contains more detail than the input, but stays statistically consistent with the original.

## Two layers

Teams pick one as their focus, or show how both connect.

### Layer 1  -  Demographic population

Generate synthetic persons or households that match CBS neighbourhood statistics demographically and socio-economically. Epidemiologically relevant:

- Age distribution and household composition
- Housing type and occupancy rate
- Work sector and mobility pattern
- Spatial location at *buurt* level

### Layer 2  -  Wastewater-surveillance context

Link the synthetic population to RWZI data and land-use data so that wastewater signals can be interpreted geographically and demographically. Metagenomics-relevant:

- RWZI location, catchment area, connections
- Land use within the catchment
- Proximity to transport and gathering nodes
- Linking population density to wastewater infrastructure

## Guiding research questions

The challenge owners framed four questions teams can use as a compass:

1. **How do you generate synthetic individuals** that are statistically consistent with neighbourhood averages, without access to real person-level data?
2. **How do you preserve cross-domain relationships**, so that age, housing type, work sector and income of a synthetic person form a realistic whole?
3. **How do you ensure spatial coherence**, so that the synthetic population of a *buurt* is geographically plausible relative to neighbouring *buurten*?
4. **How do you make the dataset usable for both infection models and wastewater surveillance**, given their different spatial scales?

## Personas: who you are helping

You build a synthetic dataset, but you design for the people who will work with it. Two personas reflect the diversity of use.

### 01 · Lena  -  Epidemiologist, RIVM

Lena models the spread of respiratory infections in urban areas. She needs micro-level population data to feed her infection-and-recovery models but cannot work with real person-level data. She wants a dataset that is demographically realistic and that she can load directly into her Python environment.

Hits these problems:

- Publicly available data is aggregated at *buurt* level  -  too coarse for her models.
- Building synthetic populations herself takes weeks; she has no time for data wrangling.
- She does not know whether the cross-domain relationships in the data are correct, and finds it hard to validate.

> *"If I don't know whether the dataset is epidemiologically realistic, I can't trust the model outcomes."*

### 02 · Daan  -  Data analyst (wastewater surveillance), Erasmus MC

Daan analyses pathogen concentrations in wastewater from dozens of RWZIs in the Netherlands. He wants to link wastewater signals to the demographic and spatial context of the catchment, but that context is missing. A synthetic population linked to RWZI catchments would enrich his analyses directly.

Hits these problems:

- RWZI catchments contain no demographic information about residents.
- He cannot explain peaks in pathogen concentration without knowing what kind of population lives there.
- Linking spatial and demographic layers currently costs a lot of manual work per region.

> *"A wastewater signal without population context is an alarm without an address."*

## Starting point: open source and open data

This challenge is built entirely on publicly available sources, for both the data and the software.

**Data.** All variables come from CBS StatLine, the RWZI register (Emissieregistratie.nl) and open GIS sources from RIVM and NRS. Closed data or data behind a paywall is explicitly excluded. Teams show in their submission which sources they used.

**Software.** Teams are free to choose their technical approach. As a reference and inspiration, the open-source library [MetaSyn](https://github.com/sodascience/metasyn) is available. Its use is **not required**. What is required is that the developed code and methodology are released open source after the hackathon.

## Variables and sources

The full variable list with CBS table IDs, priority (must / should / could / would) and direct links to all sources is in this repository:

- [`docs/variables.md`](docs/variables.md)  -  human-readable table
- [`data/variables.yaml`](data/variables.yaml)  -  machine-readable catalogue
- [`docs/data-sources.md`](docs/data-sources.md)  -  every source with URL and licence
- [`resources/SynthData.xlsx`](resources/SynthData.xlsx)  -  the source spreadsheet

## Judging criteria

Teams are judged by an expert jury with expertise in epidemiology, data science and open-source development, including Ted Oliekan (Erasmus MC). Four levels:

### ✅ Must: minimum requirements for a valid submission

- The submission contains a **synthetic dataset at micro level** (person or household) for at least one Dutch region.
- The dataset is demonstrably based on **only publicly available sources**; a list of used sources is part of the submission.
- The developed **code and method are published open source**, for example via GitHub.
- The dataset contains at least the **must-have variables** as listed in [`docs/variables.md`](docs/variables.md).

### ⭐ Should: distinguishing qualities

- The dataset preserves **cross-domain relationships**: variables of a synthetic individual form an internally consistent whole.
- The dataset has **spatial coherence**: neighbourhood populations are realistic relative to surrounding *buurten*.
- The output contains **quality parameters** showing how well the synthetic data matches source statistics.
- **Wastewater-surveillance variables** (RWZI, catchment, land use) are linked to the demographic layer.

### ⚠ Should not: pitfalls to avoid

- Using closed or paid data sources without disclosure.
- A dataset that only reformats neighbourhood aggregates without real micro-level synthesis.
- Code or methodology that is not reproducible or not released open source.

### ✨ Could: bonus for outstanding submissions

- The synthetic population is validated as input for a **working infection-and-recovery model**.
- **Small-area realism**: the dataset performs realistically below *buurt* level too.
- **Epidemiologically meaningful patterns** are demonstrably present, e.g. clustering of vulnerable groups.
- The approach is **transferable**: the method works for other regions or time points as well.

## Deliverables

At the end of the hackathon every team delivers:

- A **synthetic dataset** (as an open file, e.g. CSV or Parquet) for at least one Dutch region.
- The **source code and method description**, open-source published via GitHub or a comparable platform.
- An **overview of used data sources** and a **quality report** for the dataset.
- A **pitch** (max. 5 minutes): which approach you chose, its strengths and limitations, and how the dataset is usable for pandemic modelling.
- A **pitch deck** (max. 10 slides).

## Submission

Submissions for this challenge go through **Alkemio**, the central
inlever- and review-platform used by the jury.

**Alkemio submission space:** [Synthetische Data](https://alkem.io/onegov-hackathon/challenges/synthetischedata).

What each team submits via Alkemio:

1. A **link to the team's Pull Request** on this repository
   ([github.com/govtechnl/onegov2-synthetic-data](https://github.com/govtechnl/onegov2-synthetic-data)),
   one PR per team.
2. The **synthetic dataset** as an open file (CSV or Parquet) for at least
   one Dutch region.
3. The **quality report** following [`docs/kwaliteitsrapport-template.md`](docs/kwaliteitsrapport-template.md).
4. The **pitch deck** (max. 10 slides, PDF or link).

**The Alkemio submission is what the jury scores during the hackathon.**
The Pull Request is still required: it is the artefact teams point to from
their Alkemio submission, and it is leading for the post-hackathon review
and merge of high-quality contributions into the central library.

## Technical framing

When building the synthetic dataset you will hit a number of methodological choices:

- **Synthesis methods.** Common approaches are *iterative proportional fitting* (IPF), agent-based population generation, or generative models. Teams choose their own method; the choice must be justified in the pitch. See [`docs/methoden.md`](docs/methoden.md).
- **Scale.** Source data is available at *buurt* and *wijk* level. Synthetic output must be at micro level (persons or households) but does not have to cover the whole country. A demonstrably scalable approach on one representative region is enough.
- **Privacy by design.** The dataset must never be traceable to real individuals. Teams show which privacy measures were taken (disclosure protection, k-anonymity, …). See [`docs/privacy-by-design.md`](docs/privacy-by-design.md).
- **Open source.** All code and method descriptions are open-source after the hackathon. The synthetic dataset itself is published as an open file.

## Resources

| Source | Available via |
|---|---|
| CBS StatLine | [statline.cbs.nl](https://opendata.cbs.nl/statline)  -  Kerncijfers wijken en buurten (`86165NED`), Bodemgebruik (`70262NED`), Nabijheidsstatistieken (`85870NED`), ODiN (`84709NED`), Onderwijsniveau (`82275NED`) |
| CBS Open Data API | [opendata.cbs.nl/ODataApi](https://opendata.cbs.nl/ODataApi/odata/)  -  programmatic access used by [`tooling/fetchers/cbs_statline.py`](tooling/fetchers/cbs_statline.py) |
| RWZI register | [emissieregistratie.nl](https://www.emissieregistratie.nl/)  -  locations, capacities and catchments of wastewater treatment plants |
| RWZI catchment maps (canonical) | PDOK GWSW WFS (RIONED), `beheerstedelijkwater:BeheerGebied` and `beheerstedelijkwater:BeheerBouwwerk`  -  <https://service.pdok.nl/rioned/beheer-stedelijk-watersystemen-gwsw/wfs/v1_0> |
| RWZI catchment maps (secondary) | RIVM / NRS  -  open GIS files with catchment polygons per RWZI, used as fallback where PDOK GWSW does not cover the region |
| BAG (open, optional reference) | [bag.basisregistraties.overheid.nl](https://bag.basisregistraties.overheid.nl/)  -  addresses and buildings; **not** a must-have, useful for placing synthetic households on a real building |
| MetaSyn (reference) | [github.com/sodascience/metasyn](https://github.com/sodascience/metasyn)  -  open-source library for synthetic data |
| GreenPT API (optional) | [greenpt.nl](https://greenpt.nl/)  -  API access for teams that want to integrate LLM calls |
| Junction platform | [hackjunction.app](https://hackjunction.app)  -  all challenge material and team registration |

## Disclaimer

The synthetic datasets and methods produced by this hackathon are published as open source. Inclusion in follow-up research or policy programmes depends on further quality review by the challenge owners. This challenge is an innovation exercise; datasets require additional validation before use in operational models.

Challenge owner: Marc Winsemius (Digicampus) · Co-owners: Ruben Dood (CBS), Tom Emery (ODISSEI), Ted Oliekan (Erasmus MC) · Questions: [hack@govtechnl.nl](mailto:hack@govtechnl.nl).

