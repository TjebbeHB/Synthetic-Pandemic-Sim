# PDPC Rotterdam: methoden en verificatie

## Reikwijdte

Modelversie `pdpc-rotterdam-1`. De nieuwe omgeving bouwt voort op de bestaande SEIRD-engine en `buildRotterdamMicroWorld`. De engine en populatiegenerator zijn inhoudelijk niet gewijzigd voor deze kaartvernieuwing. De volledige offline populatie is beschikbaar als dataset, niet gekoppeld als input van de nieuwe kaart.

Ingebouwde bronnen: `src/data/cityProfiles.json` en `src/data/rotterdamBuurten.json`. Het stadsprofiel bevat 672.960 inwoners; de 74 modelbuurten samen 661.915. Filter: ten minste 250 inwoners. De geometrie bevat ook niet-gemodelleerde gebieden; grijs betekent buiten model, niet nul infecties. Codekoppeling is getest, grensharmonisatie 2024-2025 nog niet.

## Definities

| Maat | Berekening |
|---|---|
| Besmettelijk | I op dag t, gewogen naar inwoners. Niet E + I. |
| Zevendaagse incidentie | Nieuwe infecties gedurende dagen max(1,t-6) tot en met t. Per run berekend als cumulatief(t) minus cumulatief(max(0,t-7)); dag-0-introducties zijn uitgesloten. |
| Cumulatief | E + I + R + D; inclusief startinfecties. Geen herinfecties in deze engine. |
| Kaartnoemer | De CBS-inwoners van de thuisbuurt, vast in de tijd; ook na overlijden. |
| Overleden | Cumulatieve modelsterfte D, geen voorspelde of waargenomen sterfte. |
| Band | Gemiddelde, geinterpoleerd 10e en 90e percentiel van afzonderlijke runs. Incidentiepercentielen worden berekend uit incidentie per run, niet door percentielen van twee dagen af te trekken. |
| Naar piek | De eerste dag waarop het gemiddelde aantal besmettelijke inwoners over de runs maximaal is. Niet het gemiddelde van de afzonderlijke piekdagen. |

Het stadstotaal wordt per run geaggregeerd voordat de percentielen worden berekend: de band voor de stad is dus niet de som van buurtpercentielen. Kaart, buurtprofiel, ranglijst en curve delen dezelfde samenvattingsdata. De curve toont aantallen; de kaart en buurtwaarde tonen inwoners per 100.000 of procenten, zoals gelabeld.

## Scenario en herhaalbaarheid

- Vaste populatieseed: `20260604`. De epidemieseed is instelbaar; run i gebruikt seed + i * 9973. Nieuwe seeds veranderen niet de onderliggende contactpopulatie.
- Agentresolutie: ongeveer 1, 4, 12 of 28 inwoners per agent, met afronding per buurt. Startinfecties zijn agents, niet inwoners; ze worden begrensd door het aantal agents in de gekozen buurt.
- Standaard: 3 runs, 120 dagen, ongeveer 12 inwoners per agent. Uitvoeringsgrenzen: 1-16 runs en 30-180 dagen. De hoogst mogelijke resolutie met veel runs kan aanzienlijk meer geheugen en tijd vergen.
- Scenario's blijven concepten tot expliciete start. De browser rekent in een worker, bewaart per run buurttotalen en geeft de individuele tijdreeksen na elke run vrij. Annuleren verwijdert de berekening, niet de bestaande resultaten.
- JSON bewaart conceptinstellingen, modelversie en populatieseed. CSV bewaart alle dagen, buurten, vier uitkomstmaten en toegepaste instellingen; `deceased` wordt daarin per 100.000 inwoners uitgedrukt. De CSV heeft Engelse kolomnamen en decimale punten voor verwerking in analysesoftware.
- De referentiecurve is uitsluitend de vorige voltooide berekening in deze browsersessie. Bij andere instellingen/resolutie is het een andere modelconditie, geen causale schatting van een maatregel. Resultaten verdwijnen bij herladen; conceptinstellingen blijven lokaal bewaard. Exporteer resultaten die bewaard moeten blijven.

## Belangrijkste aannames

De vijf contactlagen, leeftijdsafhankelijke susceptibility/sterfterisico's, naleving, evenementvoorkeuren en woon-werktoewijzingen zijn de bestaande modelconstructie. De labels maken een aanname niet tot een waarneming. De getoonde pendelgewichten zijn aantallen gewogen modelreizigers; ze zeggen niets over feitelijke route, reistijd of verkeersvolume.

De slider voor de latente periode correspondeert met het bestaande veld `incubationDays`, dat de overgang E naar I stuurt. Het is niet de tijd tot symptoomaanvang. Alle invoergrenzen vallen binnen de grenzen die de engine accepteert; er zijn tests tegen stille begrenzing. De sterftefactor is geen ingestelde IFR. De minimale factor is 0,05 omdat de bestaande engine een nulwaarde begrenst.

Maatregelen gaan in op een simulatiedag. De meeste worden met synthetische individuele naleving geschaald; isolatie wordt uniform op externe infectiedruk toegepast. Vaccinatie is een vereenvoudigde leeftijdsprioritaire uitrol met bescherming, geen gevalideerd schema met alle biologische vertragingen, waning en varianten.

Institutionele groepen van circa 50 bewoners in de offline generator kunnen bewust collectieve/zorglocaties voorstellen. Dit is te onderscheiden van eerder geconstateerde onwaarschijnlijke reguliere huishoudens en leeftijdscombinaties. De nieuwe buurtkaart repareert die bestanden niet en vormt geen bewijs dat hun gezamenlijke verdelingen of contactnetwerken voldoen aan wetenschappelijke eisen.

Een bruikbare vervolgvalidatie vraagt: onafhankelijke leeftijd-huishoudencontroles, contactmatrices en mobiliteitsstromen; geografische harmonisatie; gevoeligheidsanalyse voor resolutie, parameters en populatieseed; en vergelijking met historische surveillance inclusief het waarnemingsproces. Tot die tijd is de toepassing geschikt voor demonstratie en hypothesevorming, niet zelfstandig beleidsadvies.

## Verificatie

`npm run test:pdpc` voert zes geautomatiseerde tests uit: invoergrenzen, percentielen, zeven dagen incidentie, vaste kleuren/noemers/missingness, geometriekoppeling en echte Rotterdam-runs. Die laatste controleren herhaalbaarheid, variatie tussen seeds en behoud van inwoners per dag en buurt.

`scripts/qa-pdpc.mjs` test de browserbediening en schrijft screenshots en een controleverslag naar `artifacts/pdpc-qa/`. Hiervoor zijn Playwright en Chrome nodig. `PLAYWRIGHT_MODULE`, `CHROME_PATH` en `PDPC_URL` kunnen lokale paden en de server overriden. Standaard URL: http://127.0.0.1:5187. De test gebruikt een eigen browserprofiel en past niet de opgeslagen instellingen van de gebruiker aan.

De data worden met `../scripts/verify-datasets.mjs` gecontroleerd tegen het manifest. De bronkopiecontrole omvat CSV/gzip, tabellen, geografische data en JSON in data-, datasource- en outputmappen. Bouw-/cachebestanden worden niet als brondata meegerekend.

## Bronverwijzingen

- [CBS/PDOK Wijken en buurten](https://www.pdok.nl/introductie/-/article/cbs-wijken-en-buurten): kaartgrenzen; de ingebouwde metadata en originele scripts blijven leidend voor het gebruikte jaar.
- [CBS StatLine](https://opendata.cbs.nl/statline/): statistische buurtprofielen en oorspronkelijke exports in de projectmap.
- [GenSynthPop, de Mooij et al. (2024)](https://doi.org/10.1007/s10458-024-09680-7): referentiemethode voor de offline generator, geen automatische validatie van deze implementatie.
- [OpenStreetMap-attributie](https://www.openstreetmap.org/copyright) en [tile policy](https://operations.osmfoundation.org/policies/tiles/): optionele online straatkaart, alleen tegels van zichtbare kaartvensters. Geen bulkdownload of gegarandeerde offline straatkaart. Lokale buurtgeometrie blijft zonder tegelserver beschikbaar.
- [Leaflet](https://leafletjs.com/reference.html): kaartbediening.
