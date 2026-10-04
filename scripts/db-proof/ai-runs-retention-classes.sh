#!/usr/bin/env bash
# ============================================================================
# ai_runs retention classes v2 — scratch PostgreSQL proof.
#
# Spins up a THROWAWAY cluster (initdb in a temp dir, never a shared stack),
# runs ai-runs-retention-classes.proof.sql — which executes the REAL
# migrations verbatim (audit_v1, retention_redaction_v1, then the change under
# proof and its rollback) — prints every `PROOF ... PASS|FAIL`, and tears the
# cluster down. Exit 1 on any FAIL.
#
# Usage:  bash scripts/db-proof/ai-runs-retention-classes.sh
# Env:    PG_BIN (default: dir of `initdb` on PATH), PGPROOF_PORT (default 55433)
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
PORT="${PGPROOF_PORT:-55433}"
DIR="$(mktemp -d -t lmw-airuns-proof.XXXXXX)"
cleanup() { "$PG_BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1; rm -rf "$DIR"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null || { echo "initdb failed"; exit 2; }
"$PG_BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DIR/pg.log" -w start >/dev/null \
  || { echo "pg start failed"; cat "$DIR/pg.log"; exit 2; }
OUT="$( cd "$HERE" && "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -q \
        -f ai-runs-retention-classes.proof.sql 2>&1 )"
echo "$OUT" | grep -E "PROOF|baseline_swept|v2_swept|ERROR" | sed -E 's/^(psql:[^ ]+ )?NOTICE:  //'
if echo "$OUT" | grep -q "PROOF .* FAIL"; then echo "RESULT: FAIL"; exit 1; fi
echo "$OUT" | grep -c "PASS" | sed 's/^/RESULT: PASS count = /'
