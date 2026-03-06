#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
CLIENT_DIR="$ROOT_DIR/client"

BACKEND_LOG="/tmp/todo-backend.log"
CLIENT_LOG="/tmp/todo-client.log"

kill_listen_port() {
  local port="$1"
  local pids=""
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "$pids" | xargs kill -15 2>/dev/null || true
  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

print_listen_port() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN | sed -n '1,3p'
}

echo "Stopping existing services on ports 3002/5173/5174..."
kill_listen_port 3002
kill_listen_port 5173
kill_listen_port 5174

echo "Starting backend..."
cd "$BACKEND_DIR"
nohup npm run start:dev > "$BACKEND_LOG" 2>&1 < /dev/null &
backend_pid=$!
disown "$backend_pid" 2>/dev/null || true
echo "backend_pid=$backend_pid"

echo "Starting client..."
cd "$CLIENT_DIR"
nohup npm run dev -- --host 0.0.0.0 > "$CLIENT_LOG" 2>&1 < /dev/null &
client_pid=$!
disown "$client_pid" 2>/dev/null || true
echo "client_pid=$client_pid"

sleep 3

start_ok=1

echo
echo "Backend listen check:"
if ! print_listen_port 3002; then
  echo "ERROR: backend is not listening on 3002"
  start_ok=0
fi

echo
echo "Client listen check:"
client_listen=0
if print_listen_port 5173; then
  client_listen=1
fi
if print_listen_port 5174; then
  client_listen=1
fi
if [[ "$client_listen" -ne 1 ]]; then
  echo "ERROR: client is not listening on 5173/5174"
  start_ok=0
fi

echo
echo "--- Backend log tail ---"
tail -n 20 "$BACKEND_LOG" || true

echo
echo "--- Client log tail ---"
tail -n 20 "$CLIENT_LOG" || true

if [[ "$start_ok" -ne 1 ]]; then
  exit 1
fi
