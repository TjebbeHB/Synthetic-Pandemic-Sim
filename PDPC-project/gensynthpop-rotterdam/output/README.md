# Gegenereerde populatiebestanden

De grote person-level CSV's zijn bewust niet in Git opgenomen. De generator, benodigde brondata en validatiescripts staan wel in deze branch. De dashboards gebruiken de ingebouwde buurtprofielen en hebben deze grote bestanden niet nodig.

## Beschikbare download

[Rotterdamse synthetische populatie op Proton Drive](https://drive.proton.me/urls/N2KER5C6P0#jXJLFgifTVPy)

Dit is de eerder gedeelde download van `rotterdam_synthetic_population.csv`. Er wordt niet aangenomen dat deze link ook de latere v3- of landelijke bestanden bevat. De inhoud van de download is tijdens deze publicatie niet opnieuw opgehaald of gecontroleerd.

## Lokale bestanden buiten Git

- `rotterdam_synthetic_population.csv`
- `rotterdam_synthetic_population_v3.csv`
- `netherlands_synthetic_population.csv.gz`
- `netherlands_synthetic_population_sample.csv`

Bestandsgroottes en SHA-256-controlesommen staan in [het volledige lokale manifest](../../dataset-manifest.full-local.json). De bestaande bestanden blijven ongewijzigd op de lokale projectschijf. Voor hergeneratie: zie [de generatorhandleiding](../README.md). De bestaande buildsamenvatting in deze map beschrijft de lokale landelijke output; de CSV zelf is hier niet meegeleverd.

Het kleinere [publicatiemanifest](../../dataset-manifest.json) bevat uitsluitend databestanden die op deze branch beschikbaar zijn. Vanuit `PDPC-project` controleert `node scripts/verify-datasets.mjs` die bestanden.

The large generated population CSVs are distributed separately, not committed to Git. The existing Proton Drive link above refers to the earlier Rotterdam export; availability of later versions or national data at that link has not been verified. Both manifests distinguish the published source data from the complete local dataset copy.
