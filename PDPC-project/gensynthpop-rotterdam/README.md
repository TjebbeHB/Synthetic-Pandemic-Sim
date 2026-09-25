# Synthetische populatie van Rotterdam (GenSynthPop)

> Historische generator. Voor de verbeterde Rotterdamse familiecombinaties, leeftijdsquota, activiteitstoewijzing en export met dezelfde engine als de app, gebruik `npm run generate:lives` vanuit `../onegov2-synthetic-data`. Zie [Synthetische levens](../onegov2-synthetic-data/docs/synthetic-lives.md). Onderstaande resultaten gelden voor de eerdere pipeline en valideren de nieuwe versie niet.

## Nederlands

> *Een volledige synthetische micro-populatie voor Rotterdam, gebouwd uit publieke CBS-aggregaten en bedoeld als reproduceerbare input voor epidemische simulaties.*

Deze map bevat de **synthetische-populatiegenerator** die naast de OneGov-pandemiesimulator is gebruikt. Waar de browserapp werkt met ongeveer 1.300 **gewogen agenten**, genereert deze pipeline een dataset op individuniveau: **672.935 synthetische inwoners van Rotterdam**, met één rij per synthetische inwoner.

De methode volgt de GenSynthPop-aanpak uit de literatuur: de Mooij et al. (2024), *Autonomous Agents and Multi-Agent Systems* 38:48. De gebruikte Python-package en referentie-implementatie staan op [GenSynthPop-Python](https://github.com/A-Practical-Agent-Programming-Language/GenSynthPop-Python).

Belangrijk: dit is **geen echte persoonsdata**. De records zijn synthetisch en worden geconstrueerd uit publieke, geaggregeerde CBS-statistieken. Het doel is om een realistische populatiestructuur te krijgen zonder microdata over echte personen te gebruiken.

### 🇳🇱 Heel Nederland (nieuw)

Dezelfde pijplijn draait nu voor **het hele land**: `build_netherlands_population.py` genereert een synthetische populatie van **~17,9 miljoen inwoners** over alle ~14.000 CBS-buurten in 342 gemeenten — één rij per synthetische inwoner.

- **Bron:** in plaats van de lokaal gedownloade CSV (alleen grote steden) worden de buurt-marginalen voor heel Nederland rechtstreeks uit CBS StatLine **OData-tabel 85984NED** ("Kerncijfers wijken en buurten 2024") gehaald en lokaal gecachet.
- **Geheugen:** de populatie wordt **per gemeente** gesynthetiseerd en gestreamd naar een gzip-CSV, zodat het piekgeheugen wordt bepaald door de grootste gemeente (Amsterdam, ~0,9M) in plaats van de volle 17,9M.
- **Onderdrukte cellen:** kleine buurten waar CBS een hele marginale onderdrukt, worden bijgevuld vanuit de nationale verdeling, geschaald naar de buurtpopulatie, zodat elke inwoner geplaatst blijft.

Uitvoer (in `output/`):

| Bestand | Inhoud |
|---|---|
| `netherlands_synthetic_population.csv.gz` | volledige 1:1-populatie (gzip) |
| `netherlands_synthetic_population_sample.csv` | willekeurige 250k-rijen voorvertoning |
| `netherlands_build_summary.json` | per-gemeente + nationaal fit-rapport |

De nationale CSV heeft dezelfde kolommen als Rotterdam plus `gemeente_code` en `gemeente_name`.

```bash
.venv/bin/python build_netherlands_population.py            # heel Nederland (~50 min)
.venv/bin/python build_netherlands_population.py --limit 5  # eerste 5 gemeenten (snelle test)
.venv/bin/python build_netherlands_population.py --frac 0.1 # 10% geschaald (snel, klein)
.venv/bin/python validate_netherlands.py                   # goodness-of-fit rapport
```

### Output

De belangrijkste output is:

- Lokaal bestand: `output/rotterdam_synthetic_population.csv`
- Downloadbare CSV: [rotterdam_synthetic_population.csv op Proton Drive](https://drive.proton.me/urls/N2KER5C6P0#jXJLFgifTVPy)
- Omvang: ongeveer **77 MB**
- Rijen: **672.935 synthetische inwoners** plus header

De CSV bevat deze kolommen:

| Kolom | Betekenis |
|---|---|
| `agent_id` | Unieke synthetische ID (`RT...`) |
| `neighb_code`, `buurt_name` | CBS-buurtcode en buurtnaam, bijvoorbeeld `BU0599...` |
| `age`, `age_group` | Leeftijd als integer en CBS-leeftijdsgroep |
| `gender` | Man / vrouw |
| `migration_background` | Nederlands / Europees / buiten Europa, volgens CBS-herkomstcategorieën |
| `education_level` | Laag / midden / hoog / niet van toepassing voor personen jonger dan 15 |
| `activity` | Minderjarig / student / werkend / niet-werkend / gepensioneerd |
| `work_sector` | Sector van werkende personen, gegroepeerd in 8 SBI-categorieën, of `none` |
| `household_role` | Alleenstaand / partner / ouder / alleenstaande ouder / kind / medebewoner / institutioneel |
| `household_id`, `household_size` | Het synthetische huishouden waarin de persoon woont |
| `income_group` | Laag / midden / hoog, gebaseerd op huishoudensinkomen-tercielen |
| `car_ownership` | 0 / 1 / 2+ auto's in het huishouden |

### Waarom dit relevant is voor de hackathon

Pandemiemodellen worden realistischer wanneer personen niet alleen als losse punten bestaan, maar in een sociaal en ruimtelijk plausibele structuur staan. Deze generator maakt daarom synthetische inwoners met:

- leeftijd, gender en migratieachtergrond per CBS-buurt;
- huishoudens met rollen en huishoudgrootte;
- activiteit, onderwijsniveau en werksector;
- inkomensgroep en autobezit als gedrags- en mobiliteitsproxy's;
- buurtlocatie, zodat de output gekoppeld kan worden aan mobiliteit, RWZI-gebieden, voorzieningen en infectiedynamiek.

Dit maakt de dataset bruikbaar als startpunt voor agent-based epidemiemodellen, scenario-analyse en validatie van de lichtere interactieve simulator.

### Methode

De generator volgt de kernlogica uit de GenSynthPop-paper:

1. **Initialisatie per buurt.** Voor iedere Rotterdamse CBS-buurt worden precies zoveel lege synthetische personen aangemaakt als de gerapporteerde buurtpopulatie.
2. **Conditioneel attributen toevoegen.** Attributen worden iteratief toegevoegd met `gensynthpop.ConditionalAttributeAdder`. Elk nieuw attribuut wordt geconditioneerd op eerder toegevoegde attributen via contingentietabellen. Zo blijven verbanden tussen variabelen behouden, bijvoorbeeld leeftijd met activiteit of huishoudpositie.
3. **Huishoudens vormen.** Personen worden op basis van huishoudposities gegroepeerd in synthetische huishoudens. De verdeling wordt per buurt verankerd aan CBS-huishoudcompositie, met leeftijdsplausibele ouder-kindcombinaties.

De gebruikte opbouw is:

```text
age_group -> integer age -> gender -> migration_background -> household position -> activity
```

Daarna worden onderwijsniveau, inkomen, autobezit en werksector toegevoegd met buurt- en CBS-afhankelijke verdelingen.

### Databronnen

Alle input komt uit publieke CBS-data of uit lokaal aangeleverde CSV-bestanden met CBS-tabellen:

- **Buurtmarges** uit `CSV-kerncijfers/..._NL_and_Big_Cities.csv`, gebaseerd op CBS Kerncijfers wijken en buurten voor gemeente Rotterdam (`GM0599`). Deze leveren onder andere leeftijdsgroepen, gender, migratieachtergrond, huishoudcompositie, onderwijsdeelname en werkzame beroepsbevolking.
- **Huishoudpositie x leeftijd x gender** uit CBS-tabel **71488ned**, nationaal via de CBS OData API opgehaald en gecachet in `datasources/`. Deze tabel levert de lagere-aggregatiecorrelatie die met buurtmarges wordt gefit via IPF, conform de mixed-aggregation-opzet van GenSynthPop.
- **Onderwijs x leeftijd x migratieachtergrond** uit de CBS-export `CSV_additional_data/Bevolking__onderwijsniveau_en_migratieachtergrond...`. CBS publiceert onderwijsniveau niet op buurtniveau; daarom wordt onderwijs geconditioneerd op twee buurtaccurate kenmerken: leeftijd en migratieachtergrond.
- **Inkomen, autobezit en werksector** uit buurtmarges van dezelfde Kerncijfers-CSV. `income_group` volgt de gerapporteerde inkomensverdeling, `car_ownership` reproduceert het auto's-per-huishoudenniveau, en `work_sector` wordt voor werkenden getrokken uit de lokale SBI-bedrijfsvestigingenmix.

Bekende beperking: `income_group` is op dit moment vooral ruimtelijk realistisch, omdat het op buurt is geconditioneerd. Het is nog niet volledig geconditioneerd op onderwijsniveau of huishoudtype. Daarvoor is een extra inkomen-x-kenmerken-contingentietabel nodig, bijvoorbeeld uit CBS **85064NED**.

### Validatie

De validatie vergelijkt de synthetische populatie per buurt met de CBS-doelmarges. De maat is **standardized absolute error**; lager is beter. De paper rapporteert waarden rond 0,00-0,05 voor zeer sterke fit.

Run:

```bash
.venv/bin/python validate.py
```

Huidige resultaten:

| Attribuut | Per-buurt SAE |
|---|---:|
| `age_group` | **0.014** |
| `migration_background` | **0.060** |
| `gender` | **0.077** |

Een inhoudelijke consistentiecheck laat zien dat activiteit logisch samenhangt met leeftijd: 0-14 jaar is vrijwel volledig minderjarig, 15-24 jaar is grotendeels student, 25-64 jaar is vooral werkend of niet-werkend, en 65+ is grotendeels gepensioneerd.

Huishoudens: ongeveer **339.000 synthetische huishoudens**, tegenover **342.000 gerapporteerde huishoudens**. De gemiddelde huishoudgrootte is **1,98** synthetisch versus **1,97** gerapporteerd. De generator voorkomt ouderloze gezinnen en gebruikt leeftijdsplausibele ouder-kindmatching.

Bekende beperking: eenpersoonshuishoudens zijn nog iets oververtegenwoordigd, ongeveer **59% synthetisch** versus **49% gerapporteerd**. De huidige pragmatische huishoudpartitioner gebruikt nog niet de volledige suitability-scored `HouseholdGrouper` uit de paper.

### Zelf draaien

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_rotterdam_population.py
.venv/bin/python validate.py
```

De build duurt lokaal ongeveer een minuut. CBS-tabel `71488ned` wordt bij de eerste run opgehaald en daarna in `datasources/` gecachet.

### Uitbreiden

Elk extra persoonskenmerk bestaat in principe uit één `ConditionalAttributeAdder`-stap plus een passende CBS-contingentietabel. Logische volgende verbeteringen zijn:

- inkomen conditioneren op onderwijs, leeftijd en huishoudtype;
- autobezit conditioneren op huishoudtype en inkomen;
- onderwijsniveau verfijnen met meer leeftijds- en herkomstcategorieën;
- de huishoudgrouper vervangen door de volledige suitability-scored methode uit GenSynthPop;
- dezelfde pipeline toepassen op Den Haag of heel Nederland.

CBS-tabellen uit de referentiecasus voor Den Haag die kunnen helpen bij rijkere attributen: `84583NED` kerncijfers, `03759ned` leeftijd x gender, `84910NED` migratie naar leeftijd, `85453NED` onderwijs naar herkomst, `83488NED` rijbewijzen, `85064NED` huishoudinkomen en `81845NED` voertuigbezit.

---

## English

> *A full synthetic micro-population for Rotterdam, built from public CBS aggregates and designed as reproducible input for epidemic simulation.*

This folder contains the **synthetic population generator** used alongside the OneGov pandemic simulator. The browser app uses roughly 1,300 **weighted agents**; this pipeline generates an individual-level dataset: **672,935 synthetic residents of Rotterdam**, with one row per synthetic resident.

The method follows the GenSynthPop approach from de Mooij et al. (2024), *Autonomous Agents and Multi-Agent Systems* 38:48. The Python package and reference implementation are available at [GenSynthPop-Python](https://github.com/A-Practical-Agent-Programming-Language/GenSynthPop-Python).

Important: this is **not real person-level data**. Records are synthetic and constructed from public, aggregate CBS statistics. The goal is to create realistic population structure without using microdata about real individuals.

### 🇳🇱 Whole of the Netherlands (new)

The same pipeline now runs for **the entire country**: `build_netherlands_population.py` generates a synthetic population of **~17.9 million residents** across all ~14,000 CBS buurten in 342 municipalities — one row per synthetic resident.

- **Source:** instead of the locally-downloaded CSV (big cities only), the buurt marginals for all of NL are pulled directly from CBS StatLine **OData table 85984NED** ("Kerncijfers wijken en buurten 2024") and cached locally.
- **Memory:** the population is synthesised **one municipality at a time** and streamed to a gzip CSV, so peak memory is bounded by the largest single gemeente (Amsterdam, ~0.9M) rather than the full 17.9M.
- **Suppressed cells:** small buurten where CBS suppresses a whole marginal are backfilled from the national distribution, scaled to the buurt population, so every resident stays placed.

Outputs (in `output/`):

| File | Contents |
|---|---|
| `netherlands_synthetic_population.csv.gz` | full 1:1 population (gzip) |
| `netherlands_synthetic_population_sample.csv` | random 250k-row preview |
| `netherlands_build_summary.json` | per-municipality + national fit report |

The national CSV has the same columns as Rotterdam plus `gemeente_code` and `gemeente_name`.

```bash
.venv/bin/python build_netherlands_population.py            # whole country (~50 min)
.venv/bin/python build_netherlands_population.py --limit 5  # first 5 municipalities (quick test)
.venv/bin/python build_netherlands_population.py --frac 0.1 # 10% scaled-down (fast, small)
.venv/bin/python validate_netherlands.py                   # goodness-of-fit report
```

### Output

The main output is:

- Local file: `output/rotterdam_synthetic_population.csv`
- Downloadable CSV: [rotterdam_synthetic_population.csv on Proton Drive](https://drive.proton.me/urls/N2KER5C6P0#jXJLFgifTVPy)
- Size: about **77 MB**
- Rows: **672,935 synthetic residents** plus header

The CSV contains these columns:

| Column | Description |
|---|---|
| `agent_id` | Unique synthetic ID (`RT...`) |
| `neighb_code`, `buurt_name` | CBS buurt code and neighbourhood name, for example `BU0599...` |
| `age`, `age_group` | Integer age and CBS age band |
| `gender` | Male / female |
| `migration_background` | Dutch / European / outside Europe, following CBS origin categories |
| `education_level` | Low / middle / high / not applicable for people younger than 15 |
| `activity` | Minor / student / employed / not working / retired |
| `work_sector` | Sector for employed people, grouped into 8 SBI categories, or `none` |
| `household_role` | Single / partner / parent / single parent / child / co-resident / institutional |
| `household_id`, `household_size` | The synthetic household this person lives in |
| `income_group` | Low / middle / high, based on household standardized-income terciles |
| `car_ownership` | 0 / 1 / 2+ cars in the household |

### Why this matters for the hackathon

Pandemic models become more realistic when people are not just isolated points, but part of a plausible social and spatial structure. This generator therefore creates synthetic residents with:

- age, gender and migration background per CBS neighbourhood;
- households with roles and household size;
- activity, education level and work sector;
- income group and car ownership as behavioural and mobility proxies;
- neighbourhood location, so the output can be linked to mobility, wastewater catchments, facilities and infection dynamics.

That makes the dataset useful as a starting point for agent-based epidemic models, scenario analysis and validation of the lighter interactive simulator.

### Method

The generator follows the core logic from the GenSynthPop paper:

1. **Instantiate per neighbourhood.** For each Rotterdam CBS neighbourhood, it creates exactly as many empty synthetic persons as the reported neighbourhood population.
2. **Add attributes conditionally.** Attributes are added iteratively with `gensynthpop.ConditionalAttributeAdder`. Each new attribute is conditioned on previously added attributes via contingency tables, preserving inter-attribute relationships such as age with activity or household position.
3. **Form households.** People are grouped into synthetic households based on household positions. The distribution is anchored to each neighbourhood's reported household composition, with age-plausible parent-child matching.

The attribute sequence is:

```text
age_group -> integer age -> gender -> migration_background -> household position -> activity
```

Education level, income, car ownership and work sector are then added with neighbourhood-level and CBS-derived distributions.

### Data Sources

All input comes from public CBS data or locally supplied CSV files containing CBS tables:

- **Neighbourhood marginals** from `CSV-kerncijfers/..._NL_and_Big_Cities.csv`, based on CBS Kerncijfers wijken en buurten for Rotterdam (`GM0599`). These provide age bands, gender, migration background, household composition, education enrolment and employed labour force.
- **Household position x age x gender** from CBS table **71488ned**, fetched nationally through the CBS OData API and cached in `datasources/`. This supplies the lower-aggregation correlation fitted to neighbourhood marginals with IPF, matching GenSynthPop's mixed-aggregation design.
- **Education x age x migration background** from the CBS export `CSV_additional_data/Bevolking__onderwijsniveau_en_migratieachtergrond...`. CBS does not publish education level at neighbourhood level, so education is conditioned on two neighbourhood-accurate attributes: age and migration background.
- **Income, car ownership and work sector** from neighbourhood marginals in the same Kerncijfers CSV. `income_group` follows the reported income distribution, `car_ownership` reproduces cars per household, and `work_sector` is drawn for employed people from the local SBI business-establishment mix.

Known gap: `income_group` is currently mostly spatially realistic because it is conditioned on neighbourhood. It is not yet fully conditioned on education or household type. That would require an additional income-by-characteristics contingency table, for example from CBS **85064NED**.

### Validation

Validation compares the synthetic population per neighbourhood with the CBS target marginals. The metric is **standardized absolute error**; lower is better. The paper reports values around 0.00-0.05 for very strong fit.

Run:

```bash
.venv/bin/python validate.py
```

Current results:

| Attribute | Per-neighbourhood SAE |
|---|---:|
| `age_group` | **0.014** |
| `migration_background` | **0.060** |
| `gender` | **0.077** |

A consistency check shows that activity aligns plausibly with age: ages 0-14 are almost entirely minors, ages 15-24 are mostly students, ages 25-64 are mainly employed or not working, and ages 65+ are mostly retired.

Households: about **339,000 synthetic households**, compared with **342,000 reported households**. Mean household size is **1.98** synthetic versus **1.97** reported. The generator prevents parentless families and uses age-plausible parent-child matching.

Known limitation: single-person households are still slightly overrepresented, about **59% synthetic** versus **49% reported**. The current pragmatic household partitioner does not yet use the full suitability-scored `HouseholdGrouper` from the paper.

### Run it yourself

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_rotterdam_population.py
.venv/bin/python validate.py
```

The build takes about one minute locally. CBS table `71488ned` is fetched on the first run and then cached in `datasources/`.

### Extending

Each additional person attribute is essentially one `ConditionalAttributeAdder` step plus a suitable CBS contingency table. Natural next improvements are:

- condition income on education, age and household type;
- condition car ownership on household type and income;
- refine education level with more age and origin categories;
- replace the household grouper with the full suitability-scored method from GenSynthPop;
- apply the same pipeline to The Hague or the whole Netherlands.

CBS tables from the reference The Hague case study that can help with richer attributes: `84583NED` core statistics, `03759ned` age x gender, `84910NED` migration by age, `85453NED` education by origin, `83488NED` driving licences, `85064NED` household income and `81845NED` vehicle ownership.
