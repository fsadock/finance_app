#!/usr/bin/env bash
#
# Runs one SQL statement against the database inside the running container.
#
#   VPS_HOST=my-server ./scripts/db-query.sh "select count(*) from \"Transaction\""
#   VPS_HOST=my-server ./scripts/db-query.sh --write "update ..."   # só com --write
#
# The image has no sqlite3 binary, so this goes through the better-sqlite3 the app already ships with.
# Read-only unless --write is passed: a typo against production should fail, not silently rewrite rows.
set -euo pipefail

: "${VPS_HOST:?Defina VPS_HOST, por exemplo: export VPS_HOST=meu-servidor}"

WRITE=false
if [ "${1:-}" = "--write" ]; then
  WRITE=true
  shift
fi
APP="${APP:-finance_app}"
SQL="${1:?Informe o SQL. Ex.: ./scripts/db-query.sh 'select * from Account'}"

ssh "root@$VPS_HOST" "cd /srv/$APP && docker compose exec -T -e SQL=\"$SQL\" -e WRITE=$WRITE app node -e '
  const Database = require(\"better-sqlite3\");
  const db = new Database(\"/data/finance.db\", { readonly: process.env.WRITE !== \"true\" });
  const stmt = db.prepare(process.env.SQL);
  // A statement that returns nothing (update, insert) has no columns to read back.
  const out = stmt.reader ? stmt.all() : stmt.run();
  console.log(JSON.stringify(out, null, 1));
'"
