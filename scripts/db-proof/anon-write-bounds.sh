#!/usr/bin/env bash
# ============================================================================
# ANON WRITE BOUNDS — run the rolled-back, lowest-boundary proof in both modes.
#
#   NEGATIVE CONTROL (apply=0): no migration — the abuse must SUCCEED.
#   WITH MIGRATION  (apply=1): the migration, verbatim minus its own
#                              begin/commit, inside the proof transaction.
#
# Every probe runs as the `anon` role via psql — the position of a client
# holding only the public key and calling the database directly, past every
# Next.js route and in-memory limiter. psql runs with --single-transaction and
# ON_ERROR_STOP, so an error at any line rolls back everything; the proof
# itself ends with an explicit ROLLBACK. Targets the LOCAL stack only.
# Usage:  bash scripts/db-proof/anon-write-bounds.sh
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME="20260829130000_anon_write_bounds_v1"
MIGRATION="$REPO/supabase/migrations/$NAME.sql"
COPY="$(mktemp -t "$NAME.XXXXXX.sql")"
trap 'rm -f "$COPY"' EXIT
# strip ONLY whole-line `begin;` / `commit;` — every other byte is verbatim
sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$MIGRATION" > "$COPY"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-54322}" PGUSER="${PGUSER:-postgres}" \
       PGPASSWORD="${PGPASSWORD:-postgres}" PGDATABASE="${PGDATABASE:-postgres}"
run() {
  echo "=============== apply=$1 ==============="
  ( cd "$REPO" && psql --single-transaction -v ON_ERROR_STOP=1 -q \
      -v apply="$1" -v migration_copy="$COPY" \
      -f scripts/db-proof/anon-write-bounds.sql 2>&1 ) \
    | grep -E "PROOF|ERROR" | sed -E 's/^(psql:[^ ]+ )?NOTICE:  //; s/^ *//'
}
run 0
echo
run 1
