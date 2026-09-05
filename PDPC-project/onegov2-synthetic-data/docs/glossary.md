# Glossary

Terms used throughout the brief, the docs, and the variable catalogue. Dutch terms are kept where they are the authoritative form.

| Term | Meaning |
|---|---|
| **Buurt** | Smallest CBS statistical area in the Netherlands; below *wijk*. Each *buurt* has a code like `BU03440101`. |
| **Wijk** | Mid-level CBS area, groups multiple *buurten*. Code prefix `WK`. |
| **Gemeente** | Municipality (`GM` prefix). Aggregation of *wijken*. |
| **BAG** | Basisregistratie Adressen en Gebouwen  -  open national registry of Dutch addresses and buildings. |
| **CBS** | Centraal Bureau voor de Statistiek  -  Statistics Netherlands. |
| **CBS Open Data API** | OData endpoint at `opendata.cbs.nl/ODataApi` providing programmatic access to StatLine tables. |
| **StatLine** | CBS's main publication platform for aggregate statistics; identifies datasets by codes like `86165NED`. |
| **Kerncijfers wijken en buurten** | CBS table `86165NED`; the workhorse for demographic, housing, income, and work-sector marginals at *buurt* level. |
| **ODiN** | *Onderweg in Nederland*  -  annual CBS travel survey, table `84709NED`; source of mobility / commute variables. |
| **Bodemgebruik** | CBS table `70262NED`  -  land-use shares (residential / industry / agriculture / green / water) per area. |
| **Nabijheidsstatistieken** | CBS table `85870NED`  -  distances from residential addresses to facilities (hospitals, airports, care homes). |
| **Microniveau / Micro-level** | Records per individual or per household, as opposed to aggregates per area. |
| **Synthetic population** | A generated set of records that statistically resembles a real population but does not reveal real individuals. |
| **IPF** | *Iterative Proportional Fitting*  -  classic algorithm that adjusts a contingency table to match given marginals. |
| **Agent-based generation** | Methods that build a population agent-by-agent, often with rule-based or sampled attributes. |
| **Generative models** | Statistical or neural models (VAEs, GANs, copulas, …) trained or specified to produce new samples that match the joint distribution of inputs. |
| **MetaSyn** | Open-source library ([github.com/sodascience/metasyn](https://github.com/sodascience/metasyn)) for synthesising tabular data from distributional metadata. Documented as a reference, not required. |
| **Cross-domain consistency** | Property of a synthetic individual whose attributes (age × housing × work × income) co-vary realistically, not independently. |
| **Spatial coherence** | Property of a synthetic population whose neighbourhood profiles vary smoothly with geography, matching observed patterns. |
| **k-anonymity** | Disclosure-protection criterion: every record is indistinguishable from at least k − 1 others on a chosen set of quasi-identifiers. |
| **Disclosure protection** | The general practice of preventing re-identification of individuals from a published dataset. |
| **RWZI** | *Rioolwaterzuiveringsinstallatie*  -  wastewater treatment plant. |
| **Catchment** | Area whose wastewater drains into a specific RWZI. |
| **Emissieregistratie** | National emissions register ([emissieregistratie.nl](https://www.emissieregistratie.nl/)); publishes the RWZI register and capacities. |
| **NRS** | Nationale Rioolwatersurveillance  -  RIVM-led wastewater surveillance programme; publishes catchment GIS. |
| **Rioolsurveillance / Wastewater surveillance** | Monitoring pathogens (and other markers) at RWZIs as an early-warning signal. |
| **Metagenomics** | Sequencing of mixed-organism samples (e.g. wastewater) to identify pathogens; benefits from population context. |
| **Infection-and-recovery model (SIR / SEIR)** | Compartmental epidemiological models. Agent-based variants need a micro-level population. |
| **Doenvermogen** | Capacity to act under stress; not central to this challenge but recurring across the OneGov hackathon. |

