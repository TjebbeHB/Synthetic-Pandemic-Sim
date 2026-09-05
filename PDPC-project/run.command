#!/bin/bash
# ---------------------------------------------------------------------------
# Double-clickable launcher (macOS) for the Synthetic Netherlands Pandemic
# Simulator. Just double-click this file in Finder. It will:
#   1. find Node.js,
#   2. install dependencies the first time,
#   3. start the dev server and open your browser.
# Leave the Terminal window open while you use the app. To stop: press Ctrl+C
# or close the window.
# ---------------------------------------------------------------------------

# Keep the window readable if anything goes wrong.
pause_and_exit() {
  echo
  echo "Press any key to close this window..."
  read -n 1 -s -r
  exit "${1:-1}"
}

# Always work from the app folder next to this script, regardless of where
# Finder launched it from.
cd "$(dirname "$0")/onegov2-synthetic-data" || {
  echo "!! Could not find the 'onegov2-synthetic-data' folder next to this launcher."
  pause_and_exit 1
}

echo "============================================================"
echo " PDPC - Rotterdam Scenario-atlas"
echo " Folder: $(pwd)"
echo "============================================================"
echo

# Finder gives scripts a minimal PATH, so add the usual Node install locations.
for dir in /opt/homebrew/bin /usr/local/bin /usr/bin; do
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) PATH="$dir:$PATH" ;;
  esac
done
# Fall back to an nvm-managed Node if Homebrew/system Node isn't present.
if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "!! Node.js was not found (the 'npm' command is missing)."
  echo "   Install the LTS version from https://nodejs.org and then"
  echo "   double-click this launcher again."
  pause_and_exit 1
fi

echo "Using node $(node -v) / npm $(npm -v)"
echo

# Install dependencies on first run (or if they were removed).
if [ ! -d node_modules ]; then
  echo "==> First launch: installing dependencies (one-off, ~1 minute)..."
  if ! npm ci; then
    echo
    echo "!! 'npm ci' failed. Check your internet connection and try again."
    pause_and_exit 1
  fi
  echo
fi

echo "==> Starting the dev server. Your browser will open automatically."
echo "    Keep this window open. Press Ctrl+C (or close the window) to stop."
echo

# Hand control to Vite; --open launches the browser when the server is ready.
npm run dev -- --host 127.0.0.1 --port 5187 --open

# If the server stops (Ctrl+C or crash), keep the window so any message is seen.
pause_and_exit 0
