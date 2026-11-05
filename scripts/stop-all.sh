#!/usr/bin/env bash
# Stops exactly the processes started by start-all.sh, using the PID files
# it wrote under run/. Never touches unrelated processes or system services.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/run"

stop_pid_file() {
  local file="$1" label="$2"
  if [ -f "$file" ]; then
    local pid
    pid=$(cat "$file")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "[stop-all] stopping $label (pid $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    else
      echo "[stop-all] $label not running (stale pid file)"
    fi
    rm -f "$file"
  else
    echo "[stop-all] no pid file for $label, skipping"
  fi
}

stop_pid_file "$RUN_DIR/app-beta-dev.pid" "app-beta dev server"
stop_pid_file "$RUN_DIR/app-alpha-dev.pid" "app-alpha dev server"
stop_pid_file "$RUN_DIR/nginx.pid" "nginx"
stop_pid_file "$RUN_DIR/fixture-api.pid" "fixture-api"

echo "[stop-all] done."
