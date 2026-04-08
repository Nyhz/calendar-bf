#!/bin/bash
# calendar-service.sh — launchd wrapper for Calendar
# Reads ~/.calendar/mode and starts in dev or prod accordingly.

set -euo pipefail

# launchd starts with a minimal environment — source Homebrew + node/pnpm
eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="/opt/homebrew/bin:$PATH"

CALENDAR_DIR="/Users/nyhzdev/devroom/battlefields/calendar"
MODE_FILE="$HOME/.calendar/mode"
PORT=3100

cd "$CALENDAR_DIR"

# Load .env.local
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

# Read mode (default: prod)
MODE="prod"
if [ -f "$MODE_FILE" ]; then
  MODE=$(cat "$MODE_FILE" | tr -d '[:space:]')
fi

echo "[CALENDAR] Starting in ${MODE} mode on port ${PORT}..."

# Ensure ALL child processes die when this script is killed.
cleanup() {
  kill -- -$$ 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT EXIT

if [ "$MODE" = "dev" ]; then
  pnpm dev --port "$PORT" &
else
  echo "[CALENDAR] Building for production..."
  pnpm build
  pnpm start --port "$PORT" &
fi

# Wait for the background process — this keeps the script alive so launchd
# tracks this PID. The trap ensures children are killed on SIGTERM.
wait
