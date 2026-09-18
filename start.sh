#!/usr/bin/env bash
# Starts Finanças (installed with install.sh) and opens it in the browser. Close with Ctrl+C.
#
# Usage: bash start.sh [--port 3000]
# Without --port (or PORT), it uses 3000, or the next free port if another program is using it.
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"
NODE_DIR="$ROOT/.runtime/node"
PORT_FILE="$ROOT/.runtime/port"

REQUESTED="${PORT:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --port | -p) REQUESTED="${2:-?}"; shift 2 || shift ;;
    --port=*) REQUESTED="${1#--port=}"; shift ;;
    *) printf 'Opção desconhecida: %s\nUso: bash start.sh [--port 3000]\n' "$1" >&2; exit 2 ;;
  esac
done
if [ -n "$REQUESTED" ] && ! { [[ "$REQUESTED" =~ ^[0-9]+$ ]] && [ "$REQUESTED" -ge 1 ] && [ "$REQUESTED" -le 65535 ]; }; then
  echo "Porta inválida: $REQUESTED" >&2
  exit 2
fi

if [ ! -x "$NODE_DIR/bin/node" ] || [ ! -d .next ]; then
  echo "O app ainda não foi instalado. Rode primeiro: bash install.sh" >&2
  exit 1
fi

open_browser() {
  if command -v open >/dev/null; then open "$1"; elif command -v xdg-open >/dev/null; then xdg-open "$1"; fi
}
# Anything accepting connections on the port, HTTP or not.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
app_running() {
  ps -eo args= | APP_MODULES="$ROOT/node_modules/" awk 'index($0, ENVIRON["APP_MODULES"]) { found = 1 } END { exit !found }'
}

# Already open (e.g. double-started): just show it.
if app_running; then
  if [ -f "$PORT_FILE" ]; then
    URL="http://127.0.0.1:$(cat "$PORT_FILE")"
    echo "O app já está aberto em $URL"
    open_browser "$URL" >/dev/null 2>&1 || true
  else
    echo "O app desta pasta já está aberto."
  fi
  exit 0
fi

if [ -n "$REQUESTED" ]; then
  if port_busy "$REQUESTED"; then
    echo "A porta $REQUESTED já está em uso por outro programa. Escolha outra: bash start.sh --port 3001" >&2
    exit 1
  fi
  PORT="$REQUESTED"
else
  PORT=""
  for candidate in $(seq 3000 3099); do
    if ! port_busy "$candidate"; then PORT="$candidate"; break; fi
  done
  [ -n "$PORT" ] || { echo "Nenhuma porta livre entre 3000 e 3099. Escolha uma: bash start.sh --port 8080" >&2; exit 1; }
fi

export PORT
export PATH="$NODE_DIR/bin:$PATH"
export COREPACK_HOME="$ROOT/.runtime/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1
export npm_config_update_notifier=false
URL="http://127.0.0.1:$PORT"
echo "$PORT" >"$PORT_FILE"

# Open the browser once the server answers.
(
  for _ in $(seq 60); do
    if curl -s -o /dev/null --max-time 1 "$URL"; then open_browser "$URL"; exit 0; fi
    sleep 1
  done
) >/dev/null 2>&1 &

echo "Iniciando em $URL — deixe esta janela aberta; Ctrl+C para fechar o app."
exec corepack pnpm start
