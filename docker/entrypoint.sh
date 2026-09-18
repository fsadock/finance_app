#!/bin/sh
# Container start: back up the database if migrations are pending, migrate, ensure categories, serve.
# Uses node_modules/.bin directly (not pnpm), so the app starts without internet access.
set -eu

DB="${DATABASE_URL#file:}"
BIN=/app/node_modules/.bin
BACKUPS="$(dirname "$DB")/backups"

if [ -f "$DB" ] && ! "$BIN/prisma" migrate status >/dev/null 2>&1; then
  mkdir -p "$BACKUPS"
  backup="$BACKUPS/finance-$(date +%Y%m%d-%H%M%S).db"
  node -e "require('better-sqlite3')(process.argv[1], { readonly: true }).backup(process.argv[2]).then(() => {})" "$DB" "$backup"
  echo "Backup antes das migrações: $backup"
  # keep the 10 most recent (names sort by date, so the glob lists the oldest first)
  set -- "$BACKUPS"/finance-*.db
  while [ $# -gt 10 ]; do rm -f -- "$1"; shift; done
fi

"$BIN/prisma" migrate deploy
"$BIN/tsx" prisma/seed.ts

# 0.0.0.0 inside the container; compose.yaml publishes it on the host's 127.0.0.1 only.
exec "$BIN/next" start -H 0.0.0.0 -p 3000
