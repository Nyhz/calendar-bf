#!/bin/bash
# calendar-ctl.sh — CLI control for Calendar launchd service
#
# Usage:
#   calendar start       Load and start the service
#   calendar stop        Stop and unload the service
#   calendar restart     Restart the service (same mode)
#   calendar dev         Switch to dev mode and restart
#   calendar prod        Switch to prod mode and restart
#   calendar status      Show service status, mode, and uptime
#   calendar logs        Tail the service log

set -euo pipefail

SERVICE_LABEL="com.calendar.app"
PLIST="$HOME/Library/LaunchAgents/${SERVICE_LABEL}.plist"
MODE_FILE="$HOME/.calendar/mode"
LOG_FILE="$HOME/.calendar/logs/calendar.log"
GUI_DOMAIN="gui/$(id -u)"
PORT=3100

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
AMBER='\033[0;33m'
DIM='\033[0;90m'
RESET='\033[0m'

is_running() {
  launchctl print "${GUI_DOMAIN}/${SERVICE_LABEL}" &>/dev/null \
    || lsof -i :${PORT} -sTCP:LISTEN &>/dev/null
}

get_mode() {
  if [ -f "$MODE_FILE" ]; then
    cat "$MODE_FILE" | tr -d '[:space:]'
  else
    echo "prod"
  fi
}

get_pid() {
  local pid
  pid=$(launchctl print "${GUI_DOMAIN}/${SERVICE_LABEL}" 2>/dev/null \
    | grep -m1 "pid =" \
    | awk '{print $3}')
  if [ -z "$pid" ] || [ "$pid" = "0" ]; then
    pid=$(lsof -i :${PORT} -sTCP:LISTEN -t 2>/dev/null | head -1)
  fi
  echo "$pid"
}

get_uptime() {
  local pid
  pid=$(get_pid)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    ps -p "$pid" -o etime= 2>/dev/null | tr -d ' '
  else
    echo "-"
  fi
}

cmd_start() {
  if is_running; then
    echo -e "${AMBER}Calendar is already running.${RESET}"
    return
  fi
  if [ ! -f "$PLIST" ]; then
    echo -e "${RED}Plist not found at ${PLIST}${RESET}"
    exit 1
  fi
  echo "Starting Calendar..."
  launchctl bootstrap "${GUI_DOMAIN}" "$PLIST"
  echo -e "${GREEN}Calendar started in $(get_mode) mode.${RESET}"
}

cmd_stop() {
  if ! is_running; then
    echo -e "${DIM}Calendar is not running.${RESET}"
    return
  fi
  echo "Stopping Calendar..."
  if ! launchctl bootout "${GUI_DOMAIN}/${SERVICE_LABEL}" 2>/dev/null; then
    local pid
    pid=$(get_pid)
    if [ -n "$pid" ] && [ "$pid" != "0" ]; then
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      sleep 1
    fi
  fi
  echo -e "${DIM}Calendar stopped.${RESET}"
}

cmd_restart() {
  if ! is_running; then
    echo -e "${AMBER}Calendar is not running. Starting...${RESET}"
    cmd_start
    return
  fi
  echo "Restarting Calendar..."
  if ! launchctl kickstart -k "${GUI_DOMAIN}/${SERVICE_LABEL}" 2>/dev/null; then
    cmd_stop
    sleep 1
    cmd_start
  fi
  echo -e "${GREEN}Calendar restarted in $(get_mode) mode.${RESET}"
}

cmd_dev() {
  echo "dev" > "$MODE_FILE"
  echo -e "Mode set to ${GREEN}dev${RESET}."
  cmd_restart
}

cmd_prod() {
  echo "prod" > "$MODE_FILE"
  echo -e "Mode set to ${AMBER}prod${RESET} (will build on start)."
  cmd_restart
}

cmd_status() {
  local mode
  mode=$(get_mode)

  echo ""
  echo "═══════════════════════════════════════════"
  echo "  CALENDAR — STATUS"
  echo "═══════════════════════════════════════════"

  if is_running; then
    local pid uptime
    pid=$(get_pid)
    uptime=$(get_uptime)
    echo -e "  Service: ${GREEN}RUNNING${RESET}"
    echo -e "  Mode:    ${mode}"
    echo -e "  PID:     ${pid}"
    echo -e "  Uptime:  ${uptime}"
  else
    echo -e "  Service: ${RED}STOPPED${RESET}"
    echo -e "  Mode:    ${mode} (will use on next start)"
  fi

  echo -e "  Port:    ${PORT}"
  echo ""

  # Caddy status
  if brew services info caddy 2>/dev/null | grep -qi "running"; then
    echo -e "  Caddy:   ${GREEN}RUNNING${RESET}"
  else
    echo -e "  Caddy:   ${RED}STOPPED${RESET}"
  fi

  echo "═══════════════════════════════════════════"
  echo ""
}

cmd_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No log file found at ${LOG_FILE}"
    exit 1
  fi
  tail -f "$LOG_FILE"
}

# --- Main ---
case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  dev)     cmd_dev ;;
  prod)    cmd_prod ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *)
    echo "Usage: calendar {start|stop|restart|dev|prod|status|logs}"
    exit 1
    ;;
esac
