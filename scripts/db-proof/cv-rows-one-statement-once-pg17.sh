#!/usr/bin/env bash
# Proof for 20261106090000_cv_rows_one_statement_once on PostgreSQL 17 with production's shape:
# the same columns, checks, foreign keys, RLS policies, column grants and ICU locale, filled
# with synthetic rows only. Runs in a throwaway local container, never against production.
#
# It adds to cv-rows-one-statement-once.sh what that one can't show: the writes under RLS as
# `authenticated`, the time writers wait, what a stuck writer or reader does to the apply and
# the rollback, the largest possible index key, and that the rollback restores the function
# production runs today, byte for byte.
#
# Usage: scripts/db-proof/cv-rows-one-statement-once-pg17.sh
#        EDU_ROWS=100000 ACH_ROWS=100000 scripts/db-proof/cv-rows-one-statement-once-pg17.sh
set -uo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/../.." && { pwd -W 2>/dev/null || pwd; })"
C="cv-rows-proof-$$"
IMAGE="${IMAGE:-postgres:17.6-bookworm}"

docker run -d --rm --name "$C" -e POSTGRES_PASSWORD=scratch-only -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8" \
  "$IMAGE" -c maintenance_work_mem=32MB -c max_parallel_maintenance_workers=1 >/dev/null || exit 2
trap 'docker rm -f "$C" >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do
  [ "$(docker exec "$C" psql -U postgres -qAtc 'select 1' 2>/dev/null)" = "1" ] && break
  sleep 1
done
docker cp "$ROOT/supabase/migrations/20261106090000_cv_rows_one_statement_once.sql" "$C:/tmp/up.sql" >/dev/null
docker cp "$ROOT/supabase/rollbacks/20261106090000_cv_rows_one_statement_once.down.sql" "$C:/tmp/down.sql" >/dev/null
docker cp "$ROOT/scripts/db-proof/cv-rows-one-statement-once-pg17.inner.sh" "$C:/tmp/inner.sh" >/dev/null

docker exec -e EDU_ROWS="${EDU_ROWS:-1000}" -e ACH_ROWS="${ACH_ROWS:-1000}" -e PGUSER=postgres -e PGDATABASE=postgres "$C" bash /tmp/inner.sh
