#!/usr/bin/env bash
# ============================================================================
# Worker demand org attribution — REAL behaviour proof.
#
# Spins up a THROWAWAY Postgres 15 container and measures what the worker
# board RPC returns BEFORE and AFTER applying the actual files
#   supabase/migrations/20260807120000_worker_demand_org_attribution_v1.sql
#   supabase/rollbacks/20260807120000_worker_demand_org_attribution_v1.down.sql
# each executed VERBATIM — the BEFORE state is the ROLLBACK file itself (it
# restores the 20260711330000 profile-join body), so the production defect is
# reproduced from real SQL, never re-implemented.
#
# Phases: BEFORE (defect) -> APPLY -> AFTER matrix -> GRANTS -> ROLLBACK
#         (defect returns) -> RE-APPLY (idempotent).
#
# Never point this at production or at a shared local Supabase stack. It uses
# its own container name and its own port, and touches neither.
# Usage:  bash scripts/db-proof/worker-demand-org-attribution.sh
# ============================================================================
set -uo pipefail

CT=worker-demand-org-attribution-proof
PORT=55437
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG="$REPO/supabase/migrations/20260807120000_worker_demand_org_attribution_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260807120000_worker_demand_org_attribution_v1.down.sql"

WORKER='cccccccc-0000-4000-8000-000000000003'
PLAIN='dddddddd-0000-4000-8000-000000000004'
D1='41110000-0000-4000-8000-000000000001'
D2='41110000-0000-4000-8000-000000000002'
D3='41110000-0000-4000-8000-000000000003'

PASS=0; FAIL=0
declare -a FAILURES=()

q() { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1 | tr -d '\r'; }

as_role() { # $1=role $2=uid $3=sql
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r' | grep -v '^BEGIN$\|^ROLLBACK$\|^SET$' | sed '/^$/d'
begin;
set local role $1;
set local app.uid = '$2';
$3
rollback;
SQL
}

check() { # $1=label $2=expected $3=actual
  if [ "$3" = "$2" ]; then
    PASS=$((PASS+1)); printf '  PASS  %-66s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected [$2] got [$3]")
    printf '  FAIL  %-66s expected [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

contains() { # $1=label $2=needle $3=haystack
  if printf '%s' "$3" | grep -qi -- "$2"; then
    PASS=$((PASS+1)); printf '  PASS  %-66s (matched "%s")\n' "$1" "$2"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected to contain [$2] got [$3]")
    printf '  FAIL  %-66s expected to contain [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/worker-demand-org-attribution.seed.sql" >/dev/null 2>&1; }

board_total()   { as_role authenticated "$1" "select count(*) from public.list_open_demand_for_workers();"; }
board_demand()  { as_role authenticated "$1" "select count(*) from public.list_open_demand_for_workers() where id='$2';"; }
board_company() { as_role authenticated "$1" "select string_agg(company_name, ',' order by company_name) from public.list_open_demand_for_workers() where id='$2';"; }

banner() { echo; echo "════════════════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════════════════"; }

cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "worker demand org attribution proof"
echo "throwaway container: $CT  (port $PORT)  — shared local stack untouched"

if docker ps -a --format '{{.Names}}' | grep -qx "$CT"; then docker rm -f "$CT" >/dev/null; fi
docker run -d --name "$CT" -e POSTGRES_PASSWORD=proof -p "$PORT":5432 postgres:15 >/dev/null || {
  echo "could not start container"; exit 1; }

for _ in $(seq 1 60); do
  docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/worker-demand-org-attribution.prelude.sql" >/dev/null || {
  echo "prelude failed"; exit 1; }

# BEFORE state = the ROLLBACK file, verbatim: the 20260711330000 profile-join
# body that is live in production today.
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null || {
  echo "could not install the BEFORE (rollback) definition"; exit 1; }
seed
echo "harness ready — production (profile-join) definition installed"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 1 — BEFORE: the defect as it exists in production"
# ════════════════════════════════════════════════════════════════════════════
check "BEFORE: 3 submitted demands render as 5 rows (fan-out)"          "5" "$(board_total $WORKER)"
check "BEFORE: multi-org demand D1 appears TWICE"                       "2" "$(board_demand $WORKER $D1)"
check "BEFORE: D1 is attributed to BOTH companies (Alfa AND Beta)"      "Alfa,Beta" "$(board_company $WORKER $D1)"
check "BEFORE: pre-org demand D2 also duplicates"                       "2" "$(board_demand $WORKER $D2)"
check "BEFORE: D3 (unverified org company) rides in on the OTHER company" "Delta" "$(board_company $WORKER $D3)"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 2 — APPLY the migration VERBATIM"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; then
  echo "  applied 20260807120000"; PASS=$((PASS+1))
else
  echo "  MIGRATION APPLY FAILED"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$MIG"
  FAIL=$((FAIL+1)); FAILURES+=("migration did not apply")
fi

SECDEF="$(q "select prosecdef::text||'/'||coalesce(array_to_string(proconfig,','),'<none>') from pg_proc where proname='list_open_demand_for_workers';")"
check "APPLY: RPC is SECURITY DEFINER with search_path pinned"          "true/search_path=public" "$SECDEF"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 3 — AFTER: one row per demand, correct attribution"
# ════════════════════════════════════════════════════════════════════════════
check "AFTER: the board returns 2 rows (D1 + D2; D3 fail-closed)"       "2" "$(board_total $WORKER)"
check "AFTER: D1 appears exactly ONCE"                                  "1" "$(board_demand $WORKER $D1)"
check "AFTER: D1 is attributed to its OWN organization's company"       "Alfa" "$(board_company $WORKER $D1)"
check "AFTER: pre-org D2 appears exactly ONCE"                          "1" "$(board_demand $WORKER $D2)"
check "AFTER: D2 falls back to the owner's OLDEST verified company"     "Alfa" "$(board_company $WORKER $D2)"
check "AFTER: D3 is HIDDEN — verified gate never satisfied by another company" "0" "$(board_demand $WORKER $D3)"
check "AFTER: no duplicate ids (count = distinct count)"                "true" "$(as_role authenticated $WORKER "select (count(*) = count(distinct id))::text from public.list_open_demand_for_workers();")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 4 — AFTER: caller surface unchanged"
# ════════════════════════════════════════════════════════════════════════════
check "AFTER: a non-worker gets an EMPTY result, not an error"          "0" "$(board_total $PLAIN)"
UNAUTH="$(as_role authenticated '' "select count(*) from public.list_open_demand_for_workers();")"
contains "AFTER: no uid raises 'Not authenticated'"                     "Not authenticated" "$UNAUTH"
ANON="$(as_role anon '' "select count(*) from public.list_open_demand_for_workers();")"
contains "AFTER: anon cannot execute the RPC"                           "permission denied" "$ANON"
check "GRANTS: anon EXECUTE is false" "false" \
  "$(q "select has_function_privilege('anon','public.list_open_demand_for_workers()','execute')::text;")"
check "GRANTS: authenticated EXECUTE is true" "true" \
  "$(q "select has_function_privilege('authenticated','public.list_open_demand_for_workers()','execute')::text;")"
check "DATA: the migration mutated NO rows (3 demands intact)"          "3" "$(q "select count(*) from public.customer_requests;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 5 — ROLLBACK VERBATIM (must reintroduce the defect, by design)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null 2>&1; then
  echo "  rollback applied cleanly"; PASS=$((PASS+1))
else
  echo "  ROLLBACK FAILED"; FAIL=$((FAIL+1)); FAILURES+=("rollback did not apply")
fi
check "ROLLBACK: the fan-out returns (5 rows again)"                    "5" "$(board_total $WORKER)"
check "ROLLBACK: D1 duplicates again"                                   "2" "$(board_demand $WORKER $D1)"
check "ROLLBACK: mutates NO data (3 demands intact)"                    "3" "$(q "select count(*) from public.customer_requests;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 6 — RE-APPLY (idempotency: same state as the first apply)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; then
  echo "  re-applied cleanly"; PASS=$((PASS+1))
else
  echo "  RE-APPLY FAILED"; FAIL=$((FAIL+1)); FAILURES+=("re-apply did not succeed")
fi
check "RE-APPLY: 2 rows again"                                          "2" "$(board_total $WORKER)"
check "RE-APPLY: D1 once, attributed Alfa"                              "Alfa" "$(board_company $WORKER $D1)"
check "RE-APPLY: anon EXECUTE still revoked"                            "false" \
  "$(q "select has_function_privilege('anon','public.list_open_demand_for_workers()','execute')::text;")"

# ── summary ─────────────────────────────────────────────────────────────────
banner "RESULT"
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo; echo "  failures:"; for f in "${FAILURES[@]}"; do echo "    - $f"; done
  exit 1
fi
echo; echo "  worker demand org attribution behaviour proven end to end."
