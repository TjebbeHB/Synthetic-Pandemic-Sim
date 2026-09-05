# Running the simulator on a tablet

The **Agent-network** and **Surveillance** views are now tablet-ready: a
responsive, touch-friendly layout plus an installable PWA (full-screen, custom
icon, works offline once installed). The heavy **Rotterdam-micro** and
experimental **cellular** views are automatically hidden on touch devices
(`@media (pointer: coarse)`), since they're built for a desktop GPU.

## Quickest — same Wi-Fi demo (full-screen, ~1 min)

1. On the laptop, double-click **`serve-tablet.command`** (in the project root).
   It builds the app and serves it on your local network, printing a
   `http://<your-ip>:4173` address.
2. On the tablet (same Wi-Fi), open that address in Safari/Chrome.
3. **Share → Add to Home Screen.** Launch it from the home-screen icon — it
   opens full-screen, no browser chrome, looking like a native app.

> Over plain Wi-Fi (http) you get the full-screen app but not offline caching,
> because browsers only enable service workers on secure origins. That's fine
> for a live demo. For true installable + offline, use the HTTPS option below.

## Best — installable + offline (HTTPS)

Service workers (and the "Install app" prompt) need HTTPS. Deploy the built
`dist/` folder to any free static host:

```bash
npm run build          # produces dist/ (with manifest + service worker)
# then drag the dist/ folder onto https://app.netlify.com/drop
# …or:  npx vercel deploy --prod dist
# …or:  any static host / GitHub Pages
```

Open the resulting `https://…` URL on the tablet → it offers **Install**, runs
full-screen, and works **offline** after the first load (all data is precached,
~3.4 MB).

## What works on the tablet

- **Agent network** — scenario controls (accordion groups), the live Netherlands
  map (pinch-zoom), the metric cards incl. R₀ and deceased, the Map/Trends
  toggle, and the agent inspector.
- **Surveillance** — the real-vs-observed chart, detection summary, and the
  sewer-catchment alert table.

Layout adapts automatically: side-by-side controls + map in landscape, a single
scrolling column in portrait, with larger touch targets throughout.
