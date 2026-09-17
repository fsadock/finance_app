#!/usr/bin/env bash
# Installs or updates Finanças on macOS and Linux.
#
# Downloads a private copy of Node.js into .runtime/ (no admin rights, doesn't touch any Node you
# already have), installs dependencies with pnpm, prepares the database and builds the app.
# Running it again updates an existing install and keeps your data.
#
# Usage: bash install.sh
set -euo pipefail

# Keep in sync with install.ps1 and the pnpm version in package.json's "packageManager".
NODE_VERSION="24.21.0"
PORT="${PORT:-3000}"

cd "$(dirname "$0")"
ROOT="$PWD"
RUNTIME="$ROOT/.runtime"
NODE_DIR="$RUNTIME/node"

bold() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. System ────────────────────────────────────────────────────────────────
bold "Verificando o sistema"
case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux) OS="linux" ;;
  *) fail "sistema não suportado: $(uname -s). No Windows, use install.bat." ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) ARCH="x64" ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *) fail "processador não suportado: $(uname -m)." ;;
esac
if [ "$OS" = "linux" ] && ldd --version 2>&1 | grep -qi musl; then
  fail "distribuições com musl (ex.: Alpine) não são suportadas pelo Node.js oficial."
fi
for cmd in curl tar; do
  command -v "$cmd" >/dev/null || fail "o comando '$cmd' é necessário. Instale-o e rode de novo."
done
if command -v sha256sum >/dev/null; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
else
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
fi
echo "Sistema: $OS-$ARCH"

# Updating while the app runs fails halfway (files in use), so stop early.
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT"; then
  fail "o app parece estar rodando (porta $PORT). Feche-o e rode a instalação de novo."
fi

# ── 2. Node.js ───────────────────────────────────────────────────────────────
if [ -x "$NODE_DIR/bin/node" ] && [ "$("$NODE_DIR/bin/node" --version)" = "v$NODE_VERSION" ]; then
  bold "Node.js $NODE_VERSION já instalado"
else
  bold "Baixando Node.js $NODE_VERSION"
  FILE="node-v$NODE_VERSION-$OS-$ARCH.tar.gz"
  BASE="https://nodejs.org/dist/v$NODE_VERSION"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fL --progress-bar -o "$TMP/$FILE" "$BASE/$FILE" || fail "não foi possível baixar $BASE/$FILE"
  curl -fsSL -o "$TMP/SHASUMS256.txt" "$BASE/SHASUMS256.txt" || fail "não foi possível baixar as somas de verificação"
  EXPECTED="$(grep " $FILE\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)"
  [ -n "$EXPECTED" ] && [ "$(sha256 "$TMP/$FILE")" = "$EXPECTED" ] || fail "o download do Node.js está corrompido. Tente de novo."
  tar -xzf "$TMP/$FILE" -C "$TMP"
  rm -rf "$NODE_DIR"
  mkdir -p "$RUNTIME"
  mv "$TMP/node-v$NODE_VERSION-$OS-$ARCH" "$NODE_DIR"
fi

export PATH="$NODE_DIR/bin:$PATH"
# pnpm comes from Corepack (bundled with Node), pinned by "packageManager" in package.json.
export COREPACK_HOME="$RUNTIME/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1
export PRISMA_HIDE_UPDATE_MESSAGE=1
pnpm() { corepack pnpm "$@"; }

# ── 3. Dependencies ──────────────────────────────────────────────────────────
bold "Instalando dependências (pode levar alguns minutos)"
pnpm install --frozen-lockfile

# ── 4. Configuration and database ────────────────────────────────────────────
if [ ! -f .env ]; then
  bold "Criando o arquivo .env"
  cp .env.example .env
fi

if [ -f prisma/dev.db ]; then
  bold "Fazendo backup do banco de dados"
  mkdir -p prisma/backups
  BACKUP="prisma/backups/dev-$(date +%Y%m%d-%H%M%S).db"
  node -e "require('better-sqlite3')('prisma/dev.db', { readonly: true }).backup(process.argv[1]).then(() => {})" "$BACKUP"
  echo "Backup: $BACKUP"
fi

bold "Preparando o banco de dados"
pnpm db:setup

# ── 5. Build ─────────────────────────────────────────────────────────────────
bold "Compilando o app"
pnpm build
rm -rf .next/cache # only speeds up future builds; saves disk space

chmod +x start.sh
bold "Pronto!"
echo "Para abrir o app: bash start.sh  (ou ./start.sh)"
echo "Ele abre em http://127.0.0.1:$PORT. Deixe o terminal aberto enquanto usa o app."

if [ -t 0 ] && [ -z "${CI:-}" ]; then
  printf '\nAbrir o app agora? [S/n] '
  read -r answer
  case "$answer" in
    [nN]*) ;;
    *) exec ./start.sh ;;
  esac
fi
