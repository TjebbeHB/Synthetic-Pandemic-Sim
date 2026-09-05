# Start Here (Hackathon Teams)

If you are starting the challenge now, follow this order.

## 1) Understand scope (10 min)

- Read [CHALLENGE.md](CHALLENGE.md).
- Skim [docs/beoordelingscriteria.md](docs/beoordelingscriteria.md).
- Check the must-have variables in [docs/variables.md](docs/variables.md).

## 2) Pick your approach (10 min)

- Population first: focus on Layer 1.
- Wastewater first: focus on Layer 2.
- Hybrid: do a thin Layer 1 + Layer 2 link for one region.

## 3) Set up tooling (10 min)

```powershell
cd tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]
pytest -v
```

## 4) Pull reference data (20–30 min)

- CBS sample fetch:

```powershell
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference
```

- RWZI locations and **catchment areas** via the canonical PDOK GWSW WFS
  (RIONED). This is an open WFS, no login required:

```powershell
python -m fetchers.rwzi_register --out ..\data\reference
```

  Output: `pdok_gwsw_rwzi.geojson` (point locations,
  `beheerstedelijkwater:BeheerBouwwerk`) and `pdok_gwsw_beheergebied.geojson`
  (catchment / management areas, `beheerstedelijkwater:BeheerGebied`).

- Optional, **wastewater measurements via Watson** (manual export, no
  login):

  The Watson portal at <https://data.emissieregistratie.nl/watson> is
  publicly accessible without login. Exports are produced via a four-tab
  wizard in the browser UI; there is no automated fetcher because the
  query is user-driven. Walk through the tabs left-to-right:

  1. **Stof** tab. Pick one or more substance categories from the list
     (Antivlooienmiddelen, Bestrijdingsmiddelen, Biociden, E-PRTR,
     Hormonen / medicijnen, Industriële stoffen, KRW-stoffen,
     Medicijnen mens, Metalen en elementen, ...). Expand a category and
     tick the specific stoffen you need.
  2. **RWZI** tab. Pick the RWZIs to export. RWZIs are grouped by
     stroomgebied (EEMS, MAAS, RIJN-NOORD, RIJN-OOST, RIJN-WEST,
     SCHELDE, NIET INGEDEELD / N.N.B.). Select all groups for a
     national export, or expand a group to pick individual plants.
  3. **Rapportage** tab. Set: Soort = `Meetresultaten per stof`, Type
     afvalwater = `Effluent` (or `Influent`), Berekening =
     `Vracht` / `Vracht per VE` / `Gehalte`, Periode van / t/m to the
     date range you want, Rapporteren = `Per stof gehele periode`.
  4. **Exporteer** tab. Review the selection summary on screen and
     click **Download**. Save the resulting Excel file as
     `data/reference/Watson_Meetresultaten.xlsx`.

  Then run the parser to normalise the export:

  ```powershell
  python -m fetchers.parse_watson_meetresultaten --in ..\data\reference\Watson_Meetresultaten.xlsx --out-dir ..\data\reference
  ```

  This step is optional; teams that only build Layer 1 (demographics)
  can skip it.

- **Catchment fallback path.** The PDOK GWSW WFS above is the canonical
  catchment source. If, for the region you are working on, PDOK GWSW does
  not deliver usable polygons, fall back to: (a) the RIVM / NRS open GIS
  layer (see [`docs/data-sources.md`](docs/data-sources.md#rwzi-register-and-catchments)),
  or, as a last resort, (b) `rwzi_code` and `rwzi_locatie` from the parsed
  Watson export as join keys. Document any fallback in your quality report.

## 5) Build a first synthetic slice

- Use [tooling/examples/01_ipf_minimal.py](tooling/examples/01_ipf_minimal.py) as a baseline.
- Generate one neighbourhood/region end-to-end first.
- Save outputs in `data/synthetic/<your-team>/`.

## 6) Keep your submission valid

- Use only public/open data sources.
- Keep your method and code open source.
- Include source list and quality report.
- Cover all must-have variables.

Reference templates:
- [docs/kwaliteitsrapport-template.md](docs/kwaliteitsrapport-template.md)
- [docs/privacy-by-design.md](docs/privacy-by-design.md)