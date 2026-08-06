#!/usr/bin/env bash
# ============================================================================
# FRESH-ORG OWNER MEMBERSHIP SEED — proof orchestrator.
#
# Resets the LOCAL disposable stack from EXACT working-tree migrations
# (main + 20260807090000), loads reference data, then runs the §8 proof
# (scripts/db-proof/org-owner-membership-seed-proof.sql) in one rolled-back
# transaction.
#
# LOCAL ONLY. Never point this at production. The local stack is the shared
# one (project_id=labourmarketai, port 54322) — the reset is destructive to
# other worktrees' local state, which is the documented trade-off of the
# shared stack.
#
# Usage: bash scripts/db-proof/org-owner-membership-seed.sh [--no-reset]
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"

DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

if [ "${1:-}" != "--no-reset" ]; then
  echo "[proof] supabase db reset (exact working-tree migrations)…"
  npx supabase db reset
fi

# The proof seeds its own reference rows (countries LT) — supabase/
# reference-data.sql is stale vs the current schema (skills.name_lt) and is
# NOT a dependency here.
#
# SQL is fed through STDIN (-f -): the Windows psql treats trailing
# arguments after the connection string as positionals and silently applies
# NOTHING (see apps/web/scripts/db-fixtures-local.ts for the 2026-07-25
# post-mortem of that trap).
echo "[proof] running org-owner-membership-seed-proof.sql…"
psql -v ON_ERROR_STOP=1 -f - "$DB" \
  < scripts/db-proof/org-owner-membership-seed-proof.sql \
  | tee /tmp/org-owner-membership-seed-proof.out

echo
if grep -q "FAIL" /tmp/org-owner-membership-seed-proof.out; then
  echo "[proof] RESULT: FAIL — see lines above"; exit 1
fi
PASSES=$(grep -c "PASS" /tmp/org-owner-membership-seed-proof.out || true)
echo "[proof] RESULT: $PASSES PASS, 0 FAIL"
echo "[proof] FRESH_ORGANIZATION_OWNER_MEMBERSHIP_DATABASE_MODEL_PROVEN"
