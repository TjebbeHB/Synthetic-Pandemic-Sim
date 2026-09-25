# Research workflow — September 2026

Main UI: CBS population generation (Rotterdam buurten, province, Netherlands municipalities), then a Rotterdam population map. Earlier contact simulations and dashboards are lazy loaded from the top-right settings cog; their code remains intact.

Methods source of truth: `docs/research-methods.md` and `docs/research-data-dictionary.md`. The build copies these to public download URLs, and the exporter embeds the same documents. Run `npm run test:lives`, `npm run test:research`, `npm run test:pdpc`, then `npm run build`.

Recreate the small public research examples before deployment when methods/generator change:

```sh
npm run export:research -- --scope rotterdam --count 5000 --features households,schools,work,events,education,income,cars --activities --translink --out public/research/rotterdam-5000.zip
npm run export:research -- --scope national --count 100000 --translink --out public/research/netherlands-100000.zip
npm run export:research -- --scope national --full --translink --out public/research/netherlands-full.zip
```

Generated ZIPs are ignored by Git; their generation commands are versioned here. Browser exports remain fully on the user's machine. Runs over 250,000 people stream to a user-selected file using the File System Access API (desktop Chrome/Edge), with the CLI as a fallback. The browser caps activity diaries at 100,000 people. National data is processed municipality by municipality; geographic routing between municipalities is not implemented.

NS setup: register at https://apiportal.ns.nl/startersguide, obtain product access and its subscription key, set `NS_API_KEY` in the local process environment, then run `node scripts/fetch-ns-stations.mjs`. Import the resulting normalized `output/ns-stations.json` in the UI. Never add API keys to browser code, source files or research exports. The connector has an unauthenticated failure check; an authenticated live request is pending the user's key.

Scale validation (seed 20260925, household/school/work features): 17,942,942 people in 342 municipalities, 671 MB ZIP, about 117 seconds on the development machine, peak sampled RSS 1.42 GB. Every ZIP entry passed CRC, and an independent CSV scan counted all person rows. Software checks are not an independent assessment of population realism. Household residual +0.58%; primary enrollment shortfall 1.32%, secondary 0.22% due to eligibility caps. Outputs retain individual municipal residuals.

Deploy using the existing custom tunnel workflow in `docs/local-tunnel.md`. Do not replace the domain or expose the development server. Keep external-drive development files separate from the internal-disk production origin.

## Historical source years

The main generator now supports 2022–2025. Selecting a year fetches it live and caches it for this browser session; a failed load keeps the previous active year. Downloads use that year in the filename and manifest. The 2022 municipality catalogue contains 345 municipalities and different province-field suffixes. Annual KWB fields are resolved by semantic names, with reviewed attainment aliases; unavailable school/work counts remain null. Rotterdam commute periods match 2022/2023/2024; the 2025 choice explicitly uses December 2024. The map remains a labelled 2024 geographic reference. Fixed downloadable examples remain 2024 artifacts.

Regression checks: `npm run test:years`. Live checks generated Rotterdam and national archives for 2022, 2023 and 2025. CLI example: `npm run export:research -- --scope national --year 2022 --count 5000 --out output/national-2022.zip`. No authentication is needed.
