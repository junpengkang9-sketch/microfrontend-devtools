#!/usr/bin/env bash
# Starts the full demo stack:
#   - fixture-api        127.0.0.1:18090
#   - nginx (online sim) 127.0.0.1:18080  (project-scoped config/prefix)
#   - app-alpha dev      127.0.0.1:18001
#   - app-beta dev       127.0.0.1:18002
# All processes are loopback-bound and PID-tracked under run/ for start-all
# / stop-all symmetry. Does not touch any system-wide nginx/service.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/run"
LOG_DIR="$ROOT/run/logs"
mkdir -p "$RUN_DIR" "$LOG_DIR"

NGINX_BIN="${NGINX_BIN:-/opt/homebrew/opt/nginx/bin/nginx}"

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

check_port_free() {
  local port="$1" name="$2"
  if port_in_use "$port"; then
    echo "[start-all] ERROR: port $port is already in use (needed for $name)." >&2
    echo "            Run scripts/stop-all.sh first, or free the port manually." >&2
    exit 1
  fi
}

pid_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1
}

wait_for_port_pid() {
  local port="$1" label="$2" pid=""
  for _ in $(seq 1 40); do
    pid=$(pid_for_port "$port")
    if [ -n "$pid" ]; then
      echo "$pid"
      return 0
    fi
    sleep 0.25
  done
  echo "[start-all] ERROR: $label did not start listening on port $port in time." >&2
  return 1
}

check_port_free 18090 "fixture-api"
check_port_free 18080 "nginx (online simulation, host v1)"
check_port_free 18085 "nginx (online simulation, host v2)"
check_port_free 18001 "app-alpha dev server"
check_port_free 18002 "app-beta dev server"

if [ ! -x "$NGINX_BIN" ]; then
  echo "[start-all] ERROR: nginx binary not found at $NGINX_BIN" >&2
  echo "            Install with: brew install nginx" >&2
  echo "            Or set NGINX_BIN=/path/to/nginx before running this script." >&2
  exit 1
fi

if [ ! -d "$ROOT/nginx/html" ] || [ ! -f "$ROOT/nginx/html/index.html" ]; then
  echo "[start-all] nginx/html is missing built artifacts; running build-online.sh first..."
  "$ROOT/scripts/build-online.sh"
fi

echo "[start-all] starting fixture-api on 127.0.0.1:18090 ..."
(cd "$ROOT/fixture-api" && nohup node server.js >"$LOG_DIR/fixture-api.log" 2>&1 &)
FIXTURE_PID=$(wait_for_port_pid 18090 "fixture-api") || exit 1
echo "$FIXTURE_PID" > "$RUN_DIR/fixture-api.pid"

echo "[start-all] starting nginx on 127.0.0.1:18080 (host v1) and 127.0.0.1:18085 (host v2) ..."
mkdir -p "$ROOT/nginx/logs" "$ROOT/nginx/temp"
(cd "$ROOT/nginx" && nohup "$NGINX_BIN" -p "$ROOT/nginx" -c nginx.conf >"$LOG_DIR/nginx-stdout.log" 2>&1 &)
wait_for_port_pid 18080 "nginx" >/dev/null || exit 1
wait_for_port_pid 18085 "nginx (host v2 vhost)" >/dev/null || exit 1
NGINX_PID=$(cat "$ROOT/nginx/logs/nginx.pid" 2>/dev/null || true)
echo "$NGINX_PID" > "$RUN_DIR/nginx.pid"

echo "[start-all] starting app-alpha dev server on 127.0.0.1:18001 ..."
(cd "$ROOT/app-alpha" && nohup npm run dev >"$LOG_DIR/app-alpha-dev.log" 2>&1 &)
ALPHA_PID=$(wait_for_port_pid 18001 "app-alpha dev server") || exit 1
echo "$ALPHA_PID" > "$RUN_DIR/app-alpha-dev.pid"

echo "[start-all] starting app-beta dev server on 127.0.0.1:18002 ..."
(cd "$ROOT/app-beta" && nohup npm run dev >"$LOG_DIR/app-beta-dev.log" 2>&1 &)
BETA_PID=$(wait_for_port_pid 18002 "app-beta dev server") || exit 1
echo "$BETA_PID" > "$RUN_DIR/app-beta-dev.pid"

echo
echo "[start-all] waiting for HTTP readiness..."
for i in $(seq 1 20); do
  ok=1
  API_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18090/api/whoami || true)
  if [ "$API_STATUS" != "200" ] && [ "$API_STATUS" != "401" ]; then ok=0; fi
  curl -sf http://127.0.0.1:18080/ >/dev/null 2>&1 || ok=0
  curl -sf http://127.0.0.1:18085/ >/dev/null 2>&1 || ok=0
  curl -sf http://127.0.0.1:18001/ >/dev/null 2>&1 || ok=0
  curl -sf http://127.0.0.1:18002/ >/dev/null 2>&1 || ok=0
  if [ "$ok" = "1" ]; then break; fi
  sleep 0.5
done

if [ "$ok" != "1" ]; then echo "[start-all] ERROR: HTTP readiness check failed; inspect run/logs" >&2; exit 1; fi

echo
echo "[start-all] all services started:"
echo "  fixture-api     : http://127.0.0.1:18090  (pid $(cat "$RUN_DIR/fixture-api.pid" 2>/dev/null))"
echo "  nginx host v1   : http://127.0.0.1:18080  (pid $(cat "$RUN_DIR/nginx.pid" 2>/dev/null)) (deprecated demo)"
echo "  nginx host v2   : http://127.0.0.1:18085  (pid $(cat "$RUN_DIR/nginx.pid" 2>/dev/null))  <- open this URL"
echo "  app-alpha       : http://127.0.0.1:18001  (pid $(cat "$RUN_DIR/app-alpha-dev.pid" 2>/dev/null))"
echo "  app-beta        : http://127.0.0.1:18002  (pid $(cat "$RUN_DIR/app-beta-dev.pid" 2>/dev/null))"
echo "Logs: $LOG_DIR"
