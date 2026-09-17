#!/usr/bin/env bash
# Starts Finanças (installed with install.sh) and opens it in the browser. Close with Ctrl+C.
set -euo pipefail

cd "$(dirname "$0")"
NODE_DIR="$PWD/.runtime/node"
export PORT="${PORT:-3000}"
URL="http://127.0.0.1:$PORT"

if [ ! -x "$NODE_DIR/bin/node" ] || [ ! -d .next ]; then
  echo "O app ainda não foi instalado. Rode primeiro: bash install.sh" >&2
  exit 1
fi

export PATH="$NODE_DIR/bin:$PATH"
export COREPACK_HOME="$PWD/.runtime/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1

if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "O app já está rodando em $URL"
else
  # Open the browser once the server answers.
  (
    for _ in $(seq 60); do
      if curl -s -o /dev/null --max-time 1 "$URL"; then
        if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL"; fi
        exit 0
      fi
      sleep 1
    done
  ) >/dev/null 2>&1 &
  echo "Iniciando em $URL — deixe esta janela aberta; Ctrl+C para fechar o app."
  exec corepack pnpm start
fi

if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL"; fi
