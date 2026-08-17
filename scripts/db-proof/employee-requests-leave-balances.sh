#!/usr/bin/env bash
# ============================================================================
# TYPED EMPLOYEE REQUESTS + LEAVE BALANCE POLICIES — behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful engine harness
# (scripts/db-proof/workflow-engine-v1.prelude.sql + .seed.sql) plus this
# module's prelude, applies the REAL files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql   (dependency)
#   supabase/migrations/20260817180000_employee_requests_v1.sql
#   supabase/migrations/20260817181000_leave_balance_policies_v1.sql
#   supabase/rollbacks/*.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX on create/withdraw/sync and on the policy upsert
#     (anon / requester / org owner / admin / manager / plain member /
#     engagement-truth member / wrong-org owner / attacker);
#   * MIRROR-SYNC SEMANTICS: create starts the engine instance atomically
#     (context generic_request + request id); engine-side approval leaves
#     the mirror stale until sync_employee_request_status_v1 repairs it
#     engine → mirror; withdraw syncs in the same transaction;
#   * per-type definition preference over the org-wide default; honest
#     'no_definition' / 'not_published' refusals that leave NO register row;
#   * RLS reads (requester / managing roles / nobody else) + writes RPC-only;
#   * policy CRUD authority (owner/admin only) + upsert semantics;
#   * rollback → re-apply round trip for BOTH files.
#
# NOTE: the derived balance arithmetic (half-days, clipping, carryover) is
# deliberately TS-side (NO stored balances by design) and proven by
# apps/web/lib/leave/balances-model.test.ts, not here.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/employee-requests-leave-balances.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-employee-requests-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG_ENGINE="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIG_REQ="$REPO/supabase/migrations/20260817180000_employee_requests_v1.sql"
MIG_POL="$REPO/supabase/migrations/20260817181000_leave_balance_policies_v1.sql"
ROLL_REQ="$REPO/supabase/rollbacks/20260817180000_employee_requests_v1.down.sql"
ROLL_POL="$REPO/supabase/rollbacks/20260817181000_leave_balance_policies_v1.down.sql"

O1='01000000-0000-4000-8000-000000000001'
OWNER1='a1000000-0000-4000-8000-00000000000a'
ADMIN1='a2000000-0000-4000-8000-00000000000a'
MGR1='a3000000-0000-4000-8000-00000000000a'
MEMBER1='a4000000-0000-4000-8000-00000000000a'
ENGREQ='a5000000-0000-4000-8000-00000000000a'
OUT2='a7000000-0000-4000-8000-00000000000a'
NOONE='a8000000-0000-4000-8000-00000000000a'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
set local app.is_admin = 'false';
$3
commit;
SQL
}

tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

create_req() { # $1=actor $2=type $3=title [$4=from] [$5=to]
  local f="${4:-}"; local t="${5:-}"
  as authenticated "$1" "select public.create_employee_request_v1('$O1', '$2', '$3', null, $( [ -n "$f" ] && echo "'$f'" || echo null ), $( [ -n "$t" ] && echo "'$t'" || echo null ));" | tok
}
seed_def() { # $1=actor $2=slug $3=name → create+publish via ENGINE commands
  as authenticated "$1" "select public.create_workflow_definition_v1('$O1', '$3', '$2', 'generic_request', '[{\"name\":\"Review\",\"approval_mode\":\"single\",\"approver_rule\":{\"kind\":\"org_role\",\"roles\":[\"owner\",\"admin\"]}}]'::jsonb);" | tok
}
publish_slug() { # $1=actor $2=slug
  local ver
  ver=$(q "select v.id from public.workflow_definition_versions v join public.workflow_definitions d on d.id = v.definition_id where d.slug = '$2' order by v.version desc limit 1;")
  as authenticated "$1" "select public.publish_workflow_version_v1('$ver');" | tok
}

echo "=============================================================="
echo " EMPLOYEE REQUESTS + LEAVE BALANCE POLICIES — behavioural proof"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/workflow-engine-v1.prelude.sql" >/dev/null || { echo "engine prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/workflow-engine-v1.seed.sql" >/dev/null || { echo "engine seed failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/employee-requests-leave-balances.prelude.sql" >/dev/null || { echo "module prelude failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- APPLYING the engine dependency + both module files verbatim ---"
for f in "$MIG_ENGINE" "$MIG_REQ" "$MIG_POL"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$f" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -20; echo "MIGRATION FAILED: $f"; exit 1; fi
  echo "  applied $(basename "$f")"
done

echo
echo "--- A. leave policy CRUD authority (org owner/admin only) ---"
check "manager cannot set policy"          "not_authorized" "$(as authenticated "$MGR1" "select public.set_leave_balance_policy_v1('$O1','annual_leave',20,2,true);" | tok)"
check "plain member cannot set policy"     "not_authorized" "$(as authenticated "$MEMBER1" "select public.set_leave_balance_policy_v1('$O1','annual_leave',20,2,true);" | tok)"
check "attacker cannot set policy"         "not_authorized" "$(as authenticated "$NOONE" "select public.set_leave_balance_policy_v1('$O1','annual_leave',20,2,true);" | tok)"
check "wrong-org owner cannot set policy"  "not_authorized" "$(as authenticated "$OUT2" "select public.set_leave_balance_policy_v1('$O1','annual_leave',20,2,true);" | tok)"
check "anon is refused outright"           "DENIED" "$(as anon '' "select public.set_leave_balance_policy_v1('$O1','annual_leave',20,2,true);" | tok)"
check "invalid absence type refused"       "invalid" "$(as authenticated "$OWNER1" "select public.set_leave_balance_policy_v1('$O1','holidays',20,0,true);" | tok)"
check "out-of-range days refused"          "invalid" "$(as authenticated "$OWNER1" "select public.set_leave_balance_policy_v1('$O1','annual_leave',500,0,true);" | tok)"
check "owner saves policy"                 "saved" "$(as authenticated "$OWNER1" "select public.set_leave_balance_policy_v1('$O1','annual_leave',20,2,true);" | tok)"
check "admin upserts same org+type"        "saved" "$(as authenticated "$ADMIN1" "select public.set_leave_balance_policy_v1('$O1','annual_leave',25.5,0,true);" | tok)"
check "upsert kept ONE row"                "1" "$(q "select count(*) from public.leave_balance_policies where organization_id='$O1' and absence_type='annual_leave';")"
check "upsert updated the numbers"         "25.5" "$(q "select annual_entitlement_days from public.leave_balance_policies where organization_id='$O1' and absence_type='annual_leave';")"
check "NO seeded rows beyond the one set"  "1" "$(q "select count(*) from public.leave_balance_policies;")"
check "engagement-truth member READS it"   "1" "$(as authenticated "$ENGREQ" "select count(*) from public.leave_balance_policies;" | tok)"
check "outsider reads NOTHING"             "0" "$(as authenticated "$NOONE" "select count(*) from public.leave_balance_policies;" | tok)"
check "anon: table denied"                 "DENIED" "$(as anon '' "select count(*) from public.leave_balance_policies;" | tok)"
check "direct INSERT denied (RPC-only)"    "DENIED" "$(as authenticated "$OWNER1" "insert into public.leave_balance_policies (organization_id, absence_type, annual_entitlement_days, created_by) values ('$O1','sickness',10,'$OWNER1');" | tok)"

echo
echo "--- B. requests: honest refusals before any template exists ---"
check "no published definition -> no_definition" "no_definition" "$(create_req "$ENGREQ" remote_work 'Work from home in March')"
check "...and NO register row was left behind"   "0" "$(q "select count(*) from public.employee_requests;")"

echo
echo "--- C. seed the conventional templates THROUGH the engine commands ---"
check "member cannot author the template"  "not_authorized" "$(seed_def "$MEMBER1" employee_request_default 'Standard request approval')"
check "owner authors the default template" "created" "$(seed_def "$OWNER1" employee_request_default 'Standard request approval')"
check "owner publishes it"                 "published" "$(publish_slug "$OWNER1" employee_request_default)"
check "admin authors a per-type template"  "created" "$(seed_def "$ADMIN1" employee_request_equipment_request 'Equipment approval')"
check "admin publishes it"                 "published" "$(publish_slug "$ADMIN1" employee_request_equipment_request)"
check "unpublished per-type template too"  "created" "$(seed_def "$ADMIN1" employee_request_benefit_request 'Benefit approval')"

echo
echo "--- D. create: validation + authority + atomic engine start ---"
check "attacker cannot create (no oracle)" "not_found" "$(create_req "$NOONE" remote_work 'Work from home')"
check "wrong-org owner cannot create"      "not_found" "$(create_req "$OUT2" remote_work 'Work from home')"
check "invalid type refused"               "invalid" "$(create_req "$ENGREQ" annual_leave 'Sneaky leave request')"
check "title bounds enforced"              "invalid" "$(create_req "$ENGREQ" remote_work 'ab')"
check "reversed dates refused"             "invalid" "$(create_req "$ENGREQ" remote_work 'Bad dates' 2026-09-10 2026-09-01)"
INST1=$(create_req "$ENGREQ" remote_work 'Work from home in March' 2026-03-02 2026-03-06)
check "engagement-truth member creates -> instance uuid" "UUID" "$(echo "$INST1" | uu)"
REQ1=$(q "select id from public.employee_requests where workflow_instance_id='$INST1';")
check "register row exists, mirror pending" "pending" "$(q "select status from public.employee_requests where id='$REQ1';")"
check "engine context is generic_request + request id" "generic_request|$REQ1" "$(q "select context_entity_type||'|'||context_entity_id from public.workflow_instances where id='$INST1';")"
check "engine title mirrors the request title" "Work from home in March" "$(q "select title from public.workflow_instances where id='$INST1';")"
INST2=$(create_req "$MEMBER1" equipment_request 'New drill' )
check "membership-truth member creates too" "UUID" "$(echo "$INST2" | uu)"
check "per-type template preferred over default" "employee_request_equipment_request" "$(q "select d.slug from public.workflow_instances i join public.workflow_definition_versions v on v.id=i.version_id join public.workflow_definitions d on d.id=v.definition_id where i.id='$INST2';")"
check "unpublished per-type template -> not_published" "not_published" "$(create_req "$MEMBER1" benefit_request 'Gym pass')"
check "...and its register row was rolled back" "0" "$(q "select count(*) from public.employee_requests where request_type='benefit_request';")"

echo
echo "--- E. RLS reads + writes RPC-only ---"
check "requester sees own request"         "1" "$(as authenticated "$ENGREQ" "select count(*) from public.employee_requests where id='$REQ1';" | tok)"
check "org owner sees it (register)"       "1" "$(as authenticated "$OWNER1" "select count(*) from public.employee_requests where id='$REQ1';" | tok)"
check "org manager sees it (register)"     "1" "$(as authenticated "$MGR1" "select count(*) from public.employee_requests where id='$REQ1';" | tok)"
check "plain member does NOT see it"       "0" "$(as authenticated "$MEMBER1" "select count(*) from public.employee_requests where id='$REQ1';" | tok)"
check "wrong-org owner sees NOTHING"       "0" "$(as authenticated "$OUT2" "select count(*) from public.employee_requests where id='$REQ1';" | tok)"
check "attacker sees NOTHING"              "0" "$(as authenticated "$NOONE" "select count(*) from public.employee_requests where id='$REQ1';" | tok)"
check "anon: table denied"                 "DENIED" "$(as anon '' "select count(*) from public.employee_requests;" | tok)"
check "direct INSERT denied"               "DENIED" "$(as authenticated "$OWNER1" "insert into public.employee_requests (organization_id, requester_profile_id, request_type, title) values ('$O1','$OWNER1','other','Direct write');" | tok)"
check "direct UPDATE denied"               "DENIED" "$(as authenticated "$ENGREQ" "update public.employee_requests set status='approved' where id='$REQ1';" | tok)"

echo
echo "--- F. mirror-sync semantics (engine truth wins; repair engine->mirror) ---"
check "engine-side approval completes the instance" "approved" "$(as authenticated "$ADMIN1" "select public.decide_workflow_step_v1('$INST1', 'approved');" | tok)"
check "mirror is now STALE (still pending)" "pending" "$(q "select status from public.employee_requests where id='$REQ1';")"
check "attacker cannot sync (no oracle)"    "not_found" "$(as authenticated "$NOONE" "select public.sync_employee_request_status_v1('$REQ1');" | tok)"
check "requester syncs -> mirror repaired"  "synced" "$(as authenticated "$ENGREQ" "select public.sync_employee_request_status_v1('$REQ1');" | tok)"
check "mirror now approved"                 "approved" "$(q "select status from public.employee_requests where id='$REQ1';")"
check "repeat sync is honest"               "unchanged" "$(as authenticated "$ENGREQ" "select public.sync_employee_request_status_v1('$REQ1');" | tok)"
check "manager may also sync (register audience)" "unchanged" "$(as authenticated "$MGR1" "select public.sync_employee_request_status_v1('$REQ1');" | tok)"

echo
echo "--- G. withdraw (engine + mirror in ONE transaction) ---"
REQ2=$(q "select id from public.employee_requests where workflow_instance_id='$INST2';")
check "non-requester cannot withdraw (no oracle)" "not_found" "$(as authenticated "$OWNER1" "select public.withdraw_employee_request_v1('$REQ2');" | tok)"
check "requester withdraws"                "withdrawn" "$(as authenticated "$MEMBER1" "select public.withdraw_employee_request_v1('$REQ2');" | tok)"
check "mirror withdrawn"                   "withdrawn" "$(q "select status from public.employee_requests where id='$REQ2';")"
check "engine instance withdrawn too"      "withdrawn" "$(q "select status from public.workflow_instances where id='$INST2';")"
check "repeat withdraw is honest"          "not_pending" "$(as authenticated "$MEMBER1" "select public.withdraw_employee_request_v1('$REQ2');" | tok)"
check "already-decided request cannot be withdrawn" "not_pending" "$(as authenticated "$ENGREQ" "select public.withdraw_employee_request_v1('$REQ1');" | tok)"

echo
echo "--- H. rollback -> re-apply round trip (both files) ---"
for f in "$ROLL_POL" "$ROLL_REQ"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$f" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -10; echo "ROLLBACK FAILED: $f"; exit 1; fi
done
check "rollback removes employee_requests"     "" "$(q "select to_regclass('public.employee_requests');")"
check "rollback removes leave_balance_policies" "" "$(q "select to_regclass('public.leave_balance_policies');")"
check "rollback removes the module commands"   "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_employee_request_v1','withdraw_employee_request_v1','sync_employee_request_status_v1','set_leave_balance_policy_v1');")"
check "the ENGINE survives the module rollback" "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"
for f in "$MIG_REQ" "$MIG_POL"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$f" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -10; echo "RE-APPLY FAILED: $f"; exit 1; fi
done
check "re-apply is clean"                  "employee_requests" "$(q "select to_regclass('public.employee_requests');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
