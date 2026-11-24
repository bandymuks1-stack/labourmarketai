#!/usr/bin/env bash
# ============================================================================
# Durable workspace pointer v2 — REAL per-actor proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (prelude + seed), then measures the validation trigger's accept/reject
# matrix
#   OLD DRAFT (defect reproduced) -> V2 -> V2 RE-APPLY (idempotent)
#   -> ROLLBACK -> RE-APPLY
# around the actual files
#   supabase/migrations/20260714210000_company_memberships_v1.sql   (superseded)
#   supabase/migrations/20260817160000_durable_workspace_pointer_v2.sql
#   supabase/rollbacks/20260817160000_durable_workspace_pointer_v2.down.sql
# each executed VERBATIM. Nothing here re-implements them.
#
# Every pointer probe runs under `set local role authenticated` with a real
# actor GUC, against the reproduced owner-only profiles UPDATE policy, so RLS
# and the trigger genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/durable-workspace-pointer-v2.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-pointer-v2-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OLD_DRAFT="$REPO/supabase/migrations/20260714210000_company_memberships_v1.sql"
MIGRATION="$REPO/supabase/migrations/20260817160000_durable_workspace_pointer_v2.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817160000_durable_workspace_pointer_v2.down.sql"

P_OWNER='10000000-0000-4000-8000-000000000001'
P_CM_MGR='10000000-0000-4000-8000-000000000002'
P_CM_MEM='10000000-0000-4000-8000-000000000003'
P_EC_EMP='10000000-0000-4000-8000-000000000004'
P_EC_MGR='10000000-0000-4000-8000-000000000005'
P_REVOKED='10000000-0000-4000-8000-000000000006'
P_OTHER='10000000-0000-4000-8000-000000000007'
ORG_A='a0000000-0000-4000-8000-00000000000a'
ORG_B='b0000000-0000-4000-8000-00000000000b'
ORG_C='c0000000-0000-4000-8000-00000000000c'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql
as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
$3
commit;
SQL
}

tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$|^(UPDATE|INSERT|DELETE|SELECT) [0-9 ]+$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL)'; then
          if echo "$out" | grep -q 'active_organization_not_member'; then echo "DENIED-42501"; else echo "DENIED"; fi
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

# Probe: actor $1 points their own profile at org $2 (RETURNING proves the row
# actually changed — an RLS-filtered 0-row update reads as NOROWS, not ok).
point() { as authenticated "$1" "update public.profiles set active_organization_id='$2' where id=auth.uid() returning active_organization_id;" | tok; }
clearp() { as authenticated "$1" "update public.profiles set active_organization_id=null where id=auth.uid() returning coalesce(active_organization_id::text,'null');" | tok; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/durable-workspace-pointer-v2.seed.sql" >/dev/null; }

apply() { # $1 = file, $2 = label
  local out; out=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$1" 2>&1)
  if echo "$out" | grep -qiE '^(ERROR|FATAL)'; then echo "$out" | head -20; echo "$2 FAILED"; exit 1; fi
}

echo "=============================================================="
echo " Durable workspace pointer v2 — trigger accept/reject matrix"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/durable-workspace-pointer-v2.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
seed || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- OLD DRAFT $(basename "$OLD_DRAFT") verbatim: the defect it would ship ---"
apply "$OLD_DRAFT" "OLD DRAFT"
check "old draft: org owner accepted (control)"                    "$ORG_A"       "$(point "$P_OWNER" "$ORG_A")"
check "old draft DEFECT: CM-only ACTIVE manager is 42501-REJECTED" "DENIED-42501" "$(point "$P_CM_MGR" "$ORG_A")"
check "old draft DEFECT: CM-only ACTIVE member is 42501-REJECTED"  "DENIED-42501" "$(point "$P_CM_MEM" "$ORG_A")"
check "old draft: EC employee also rejected (slug set too narrow)" "DENIED-42501" "$(point "$P_EC_EMP" "$ORG_A")"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim (v2 over the draft = worst-case path) ---"
# Fresh actor rows first (the old draft's own backfill already stamped
# pointers) so the v2 backfill is measured from a clean NULL state — while the
# SCHEMA state stays "old draft applied", the worst-case apply path.
seed
apply "$MIGRATION" "V2"

echo
echo "--- V2 backfill + seeds (measured BEFORE any probe mutates pointers) ---"
check "backfill: owner defaulted to OLDEST owned org"            "$ORG_A" \
      "$(q "select active_organization_id from public.profiles where id='$P_OWNER';")"
check "backfill: non-owners left NULL (no invented membership)"  "1" \
      "$(q "select count(*) from public.profiles where id='$P_REVOKED' and active_organization_id is null;")"
check "'viewer' slug seeded exactly once"                        "1" \
      "$(q "select count(*) from public.relationship_types where slug='viewer';")"

echo
echo "--- V2 accept matrix: every workspace the app's switcher offers ---"
check "org owner -> owned org"                                   "$ORG_A"  "$(point "$P_OWNER" "$ORG_A")"
check "org owner -> their OTHER owned org"                       "$ORG_B"  "$(point "$P_OWNER" "$ORG_B")"
check "GOVERNANCE truth: CM-only ACTIVE manager accepted (the fix)" "$ORG_A" "$(point "$P_CM_MGR" "$ORG_A")"
check "GOVERNANCE truth: CM-only ACTIVE member (any role) accepted" "$ORG_A" "$(point "$P_CM_MEM" "$ORG_A")"
check "EMPLOYMENT truth: EC ACTIVE employee accepted"            "$ORG_A"  "$(point "$P_EC_EMP" "$ORG_A")"
check "EMPLOYMENT truth: EC ACTIVE manager accepted"             "$ORG_A"  "$(point "$P_EC_MGR" "$ORG_A")"
check "clearing the pointer to NULL is always allowed"           "null"    "$(clearp "$P_EC_EMP")"

echo
echo "--- V2 reject matrix: everything else stays default-closed ---"
check "wrong org: owner of ORG_C rejected for ORG_A"             "DENIED-42501" "$(point "$P_OTHER" "$ORG_A")"
check "revoked CM + ended EC: rejected"                          "DENIED-42501" "$(point "$P_REVOKED" "$ORG_A")"
check "CM manager rejected for an org they are NOT in"           "DENIED-42501" "$(point "$P_CM_MGR" "$ORG_C")"
check "RLS: an actor cannot move ANOTHER profile's pointer"      "NOROWS" \
      "$(as authenticated "$P_OTHER" "update public.profiles set active_organization_id='$ORG_C' where id='$P_OWNER' returning 1;" | tok)"
check "INSERT path validated too (new profile, foreign org)"     "DENIED-42501" \
      "$(q "insert into public.profiles (id, active_organization_id) values (gen_random_uuid(), '$ORG_A') returning 1;" | tok)"

echo
echo "--- V2 RE-APPLY: idempotent, and the backfill never overwrites a choice ---"
q "update public.profiles set active_organization_id = null where id = '$P_OWNER';" >/dev/null
point "$P_OWNER" "$ORG_B" >/dev/null   # deliberate non-default choice
apply "$MIGRATION" "V2 RE-APPLY"
check "re-apply clean + explicit ORG_B choice NOT overwritten"   "$ORG_B" \
      "$(q "select active_organization_id from public.profiles where id='$P_OWNER';")"
check "re-apply: still exactly one 'viewer' slug"                "1" \
      "$(q "select count(*) from public.relationship_types where slug='viewer';")"
check "re-apply: CM-only manager still accepted"                 "$ORG_A" "$(point "$P_CM_MGR" "$ORG_A")"

echo
echo "--- grants / hygiene ---"
check "trigger fn is SECURITY DEFINER with search_path pinned"   "1" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validate_active_organization' and p.prosecdef and 'search_path=public' = any(p.proconfig);")"
check "trigger fn: anon holds NO execute"                        "f" \
      "$(q "select has_function_privilege('anon','public.validate_active_organization()','execute');")"
check "trigger fn: authenticated holds NO execute (trigger-only)" "f" \
      "$(q "select has_function_privilege('authenticated','public.validate_active_organization()','execute');")"
check "no policy was added or dropped on profiles (still 2)"     "2" \
      "$(q "select count(*) from pg_policies where tablename='profiles';")"

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
apply "$ROLLBACK" "ROLLBACK"
check "rollback: column gone"                                    "0" \
      "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='active_organization_id';")"
check "rollback: trigger function gone"                          "0" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validate_active_organization';")"
check "rollback: unused 'viewer' slug removed"                   "0" \
      "$(q "select count(*) from public.relationship_types where slug='viewer';")"

echo
echo "--- RE-APPLY after rollback (migration is re-runnable) ---"
apply "$MIGRATION" "RE-APPLY"
check "re-apply after rollback: CM-only manager accepted again"  "$ORG_A" "$(point "$P_CM_MGR" "$ORG_A")"
check "re-apply after rollback: wrong org still rejected"        "DENIED-42501" "$(point "$P_OTHER" "$ORG_A")"
check "re-apply after rollback: backfill refilled the owner"     "1" \
      "$(q "select count(*) from public.profiles where id='$P_OWNER' and active_organization_id='$ORG_A';")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
