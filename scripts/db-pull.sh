#!/usr/bin/env bash
#
# Brings the running app's database down to this machine, so development happens against the shapes real
# data actually has — the merchant names, the odd instalment plans, the months where a refund outweighs
# the spending. Seeded data never reproduces those, and most of what breaks only breaks on them.
#
#   VPS_HOST=my-server ./scripts/db-pull.sh [app] [destino]
#
# The copy is a snapshot, not a link: nothing done to it reaches the server.
set -euo pipefail

: "${VPS_HOST:?Defina VPS_HOST, por exemplo: export VPS_HOST=meu-servidor}"
APP="${1:-finance_app}"
OUT="${2:-prisma/live.db}"
REMOTE_TMP="/tmp/${APP}-snapshot.db"

echo "→ Tirando snapshot de /srv/$APP em $VPS_HOST"
# VACUUM INTO, not cp: SQLite is being written to while this runs, and copying the file under a live
# writer can land a torn page or miss the write-ahead log. VACUUM INTO takes a consistent copy and
# needs no downtime.
ssh "root@$VPS_HOST" "
  set -e
  cd /srv/$APP
  docker compose exec -T app rm -f /tmp/snapshot.db
  docker compose exec -T app node -e \"
    const Database = require('better-sqlite3');
    new Database('/data/finance.db', { readonly: true }).exec(\\\"VACUUM INTO '/tmp/snapshot.db'\\\");
  \"
  docker compose cp app:/tmp/snapshot.db $REMOTE_TMP
  docker compose exec -T app rm -f /tmp/snapshot.db
"

mkdir -p "$(dirname "$OUT")"
scp -q "root@$VPS_HOST:$REMOTE_TMP" "$OUT"
ssh "root@$VPS_HOST" "rm -f $REMOTE_TMP"

# The branch may carry migrations the server has not seen yet; applying them here is what makes the copy
# usable with the code in the working tree.
DATABASE_URL="file:$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")" pnpm prisma migrate deploy

echo
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
echo "  Rodar o app contra ela:   DATABASE_URL=\"file:./$OUT\" pnpm dev"
echo "  Navegar nas tabelas:      DATABASE_URL=\"file:./$OUT\" pnpm db:studio"
echo
echo "  Contém dados financeiros reais. Está fora do git (*.db no .gitignore); apague quando terminar."
