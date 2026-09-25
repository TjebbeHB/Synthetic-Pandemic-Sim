# Pandemic Prep: tunnel from this Mac

Public address: https://pandemic-prep.tjebbe-boersma.com

The hostname uses a dedicated Cloudflare Tunnel named `pandemic-prep` in the account that owns `tjebbe-boersma.com`. Its proxied CNAME points to `5f4227df-6939-49ab-bea1-81ef64d11824.cfargotunnel.com`. The only hostname route forwards to `http://127.0.0.1:5187`; unmatched routes return 404.

The origin serves a copy of the production build from `~/Library/Application Support/PandemicPrep/site`. It does not expose the repository or a Vite development server. Keeping the installed build on the internal disk means the Expansion drive is needed to rebuild, but not to serve the installed version.

The two user LaunchAgents are:

- `com.tjebbe-boersma.pandemic-prep.origin`
- `com.tjebbe-boersma.pandemic-prep.tunnel`

Both are installed under `~/Library/LaunchAgents` with `RunAtLoad` and `KeepAlive`. They continue after the terminal/Codex task closes and restart on login or a process failure. The Mac must remain powered, awake, connected to the internet, and logged in. Screen locking is fine; logging out or sleeping interrupts hosting. These are user services, not system services that run before login. No power settings were changed.

The tunnel token is stored with owner-only permissions in `~/Library/Application Support/PandemicPrep/tunnel.token`, outside Git, and supplied via `--token-file`. Do not commit or paste its contents. The origin and connector have separate logs under `~/Library/Application Support/PandemicPrep/logs`.

## Update the installed website

From `onegov2-synthetic-data`:

```sh
node scripts/refresh-local-tunnel.mjs
```

This builds the app and replaces the installed public files. The previous release's hashed assets are retained for open browser tabs. Editing source files alone does not update the live domain. This operation is separate from the earlier private Sites deployment.

## Inspect or stop

```sh
launchctl print "gui/$(id -u)/com.tjebbe-boersma.pandemic-prep.origin"
launchctl print "gui/$(id -u)/com.tjebbe-boersma.pandemic-prep.tunnel"

# Stop these two services for the current login session:
launchctl bootout "gui/$(id -u)/com.tjebbe-boersma.pandemic-prep.tunnel"
launchctl bootout "gui/$(id -u)/com.tjebbe-boersma.pandemic-prep.origin"

# Start them again:
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.tjebbe-boersma.pandemic-prep.origin.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.tjebbe-boersma.pandemic-prep.tunnel.plist"
```

To permanently disable automatic startup, unload the services and remove only these two project-specific plist files. Other existing tunnels are independent.

## Verification

The local origin returns the simulator HTML, JavaScript, CSS and browser-worker bundles, while repository paths, traversal attempts and missing assets return 404. Cloudflare reports the connector healthy. Public HTTPS responses are checked against the locally installed files so an unrelated destination cannot be mistaken for a successful setup.

References: [Cloudflare tunnel API setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/), [run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/).
