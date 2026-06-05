# Variable catalogue

The full list of variables a submission can target, with priority, category, discipline and source. The machine-readable version of this table is [`../data/variables.yaml`](../data/variables.yaml); the original spreadsheet from the challenge owners is [`../resources/SynthData.xlsx`](../resources/SynthData.xlsx).

**Priorities.** Submissions must cover all **must-have** variables (M1–M4 in [`beoordelingscriteria.md`](beoordelingscriteria.md)). Should- and could-have variables boost the **Should** and **Could** scores.

**Disciplines.** *Epi* = directly used by infection-and-recovery models. *Soc* = social context that improves realism. *Meta* = metagenomics / wastewater surveillance.

## Must-have

| Variable | Category | Discipline | CBS table / source |
|---|---|---|---|
| Buurtcode / wijkcode (BU/WK) | Spatial | Soc | Kerncijfers wijken en buurten  -  `86165NED` |
| Bevolkingsomvang per buurt | Demographics | Epi | `86165NED` |
| Leeftijdsverdeling (0–14 / 15–24 / 25–44 / 45–64 / 65+) | Demographics | Epi | `86165NED` |
| Huishoudgrootte en -samenstelling | Demographics | Epi | `86165NED` |
| Aandeel niet-westerse achtergrond | Demographics | Soc | `86165NED` |
| Woningtype (appartement / rijtjeshuis / vrijstaand) | Housing | Epi | `86165NED` |
| Bezettingsgraad woning (personen per woning) | Housing | Epi | `86165NED` |
| Gemiddeld besteedbaar inkomen per huishouden | Socio-economic | Soc | `86165NED` |
| Stedelijkheidsgraad / urban-rural classificatie | Spatial | Epi | `86165NED` |
| Opleidingsniveau (laag / midden / hoog, % bevolking 25+) | Socio-economic | Soc | Onderwijsniveau  -  `82275NED` |
| RWZI-ID, naam, locatie, capaciteit | Spatial | Meta | RWZI-register  -  Emissieregistratie.nl |
| Catchment-oppervlak en aansluitingen | Spatial | Meta | RWZI-stroomgebiedskaart  -  PDOK GWSW WFS (canonical); RIVM / NRS open GIS as secondary fallback |
| Landgebruik: aandeel woongebied (% oppervlak) | Land use | Meta | Bodemgebruik  -  `70262NED` |
| Landgebruik: aandeel industrie / bedrijventerrein (%) | Land use | Meta | `70262NED` |
| Landgebruik: aandeel agrarisch (%) | Land use | Meta | `70262NED` |
| Nabijheid (lucht)haven (km tot dichtstbijzijnde) | Spatial | Meta | Nabijheidsstatistieken  -  `85870NED` |

## Should-have

| Variable | Category | Discipline | CBS table / source |
|---|---|---|---|
| Arbeidsmarktpositie (% werkend / werkloos / arbeidsongeschikt) | Socio-economic | Epi | `86165NED` |
| Uitkeringsontvangers (bijstand / WW / WAO, n en %) | Socio-economic | Soc | `86165NED` |
| WMO-gebruik (% met maatwerkvoorziening) | Health | Epi | `86165NED` |
| Jeugdzorggebruik (% 0–17 jaar) | Health | Soc | `86165NED` |
| Arbeidssector (zorg / onderwijs / industrie / diensten, %) | Socio-economic | Epi | Arbeidsdeelname  -  `82309NED` |
| Landgebruik: aandeel groen / natuur (%) | Land use | Meta | `70262NED` |
| Landgebruik: aandeel water / waterwegen (%) | Land use | Meta | `70262NED` |
| Schoolgaande kinderen per buurt (% 4–17 jaar) | Demographics | Epi | `86165NED` |
| Dagelijkse mobiliteit: woon-werkafstand (gem. km, % forensen) | Mobility | Epi | ODiN  -  `84709NED` |

## Could-have

| Variable | Category | Discipline | CBS table / source |
|---|---|---|---|
| Autobezit per huishouden | Mobility | Epi | `86165NED` |
| Nabijheid ziekenhuis / SEH (km) | Spatial | Epi | `85870NED` |
| Nabijheid verpleeghuis / verzorgingstehuis (km) | Spatial | Epi | `85870NED` |
| Instellingstype in catchment (school / ziekenhuis) | Spatial | Epi | `85870NED` / open BAG |

## Would-have

| Variable | Category | Discipline | CBS table / source |
|---|---|---|---|
| Toeristische overnachtingen per jaar (n) | Spatial | Epi | Logiesaccommodaties  -  `82059NED` |

## How to use this catalogue

- **For the generator**: load [`../data/variables.yaml`](../data/variables.yaml), filter on `priority: must-have`, and confirm every entry shows up in your output schema.
- **For the quality report**: pair each variable with a comparison against its source marginal (CBS table). See [`kwaliteitsrapport-template.md`](kwaliteitsrapport-template.md).
- **For the submission PR**: tick the corresponding box in [`../.github/pull_request_template.md`](../.github/pull_request_template.md).

