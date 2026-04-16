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

# Pre-start cleanup — kill any process still holding our port from a previous
# run. launchd's SIGKILL bypasses our SIGTERM trap, leaving orphan servers
# (and multi-GB of leaked turbopack cache) behind.
kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[CALENDAR] Port ${port} held by PIDs: ${pids} — sending SIGTERM"
    kill $pids 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
      [ -z "$pids" ] && break
      sleep 1
    done
    if [ -n "$pids" ]; then
      echo "[CALENDAR] Port ${port} still held — sending SIGKILL to ${pids}"
      kill -9 $pids 2>/dev/null || true
      sleep 1
    fi
  fi
}

kill_port "$PORT"

# Sweep stray calendar servers rooted under our working directory.
pkill -f "next-server.*${CALENDAR_DIR}" 2>/dev/null || true
pkill -f "next dev.*${CALENDAR_DIR}" 2>/dev/null || true
sleep 1

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
