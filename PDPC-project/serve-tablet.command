#!/bin/bash
# ---------------------------------------------------------------------------
# Double-click to serve the simulator to a TABLET on the same Wi-Fi.
# Builds the app, then serves it on your local network. Open the "Network"
# URL it prints on your iPad/Android (same Wi-Fi), then use the browser's
# "Add to Home Screen" to launch it full-screen, like a native app.
#
# (On the tablet only the Agent-network and Surveillance tabs appear — the
#  heavy Rotterdam-micro / cellular views are hidden on touch devices.)
# ---------------------------------------------------------------------------
pause_and_exit() { echo; echo "Press any key to close…"; read -n 1 -s -r; exit "${1:-1}"; }

cd "$(dirname "$0")/onegov2-synthetic-data" || { echo "!! app folder not found"; pause_and_exit 1; }

for dir in /opt/homebrew/bin /usr/local/bin /usr/bin; do
  case ":$PATH:" in *":$dir:"*) ;; *) PATH="$dir:$PATH" ;; esac
done
if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true; fi
if ! command -v npm >/dev/null 2>&1; then echo "!! Node.js not found — install from https://nodejs.org"; pause_and_exit 1; fi

[ -d node_modules ] || { echo "==> Installing dependencies (one-off)…"; npm install || pause_and_exit 1; }

echo "==> Building the app…"
npm run build || { echo "!! Build failed."; pause_and_exit 1; }

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo
echo "============================================================"
echo " On your tablet (same Wi-Fi), open:"
[ -n "$IP" ] && echo "     http://$IP:4173" || echo "     the http://<Network> address printed below"
echo " Then: Share → Add to Home Screen  → launches full-screen."
echo " Press Ctrl+C here to stop."
echo "============================================================"
echo
npm run preview -- --host --port 4173
pause_and_exit 0
