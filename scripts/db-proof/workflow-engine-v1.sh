#!/usr/bin/env bash
# ============================================================================
# WORKFLOW & APPROVAL ENGINE v1 — REAL per-role behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (prelude + seed), then executes the actual files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql
#   supabase/migrations/20260817130100_notification_events_v3_workflow_types.sql
#   supabase/rollbacks/*.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / requester / approver / delegate / owner /
#     admin / manager / plain member / engagement-truth member / revoked /
#     wrong-org / attacker) on every command and on RLS reads;
#   * the MODE MATRIX (single / all / any × approve / reject orders);
#   * idempotency (repeat decide, repeat start on a context entity);
#   * fill-once decisions + append-only transitions + frozen published steps
#     (trigger-enforced even against the superuser);
#   * ESCALATION IS A SAFE STATE: mark-overdue flips state and never touches
#     a decision; an escalated step remains decidable;
#   * rollback → re-apply round trip.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/workflow-engine-v1.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-workflow-engine-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIGRATION_TYPES="$REPO/supabase/migrations/20260817130100_notification_events_v3_workflow_types.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817130000_workflow_engine_v1.down.sql"
ROLLBACK_TYPES="$REPO/supabase/rollbacks/20260817130100_notification_events_v3_workflow_types.down.sql"

O1='01000000-0000-4000-8000-000000000001'
OWNER1='a1000000-0000-4000-8000-00000000000a'
ADMIN1='a2000000-0000-4000-8000-00000000000a'
MGR1='a3000000-0000-4000-8000-00000000000a'
MEMBER1='a4000000-0000-4000-8000-00000000000a'
ENGREQ='a5000000-0000-4000-8000-00000000000a'
OUT2='a7000000-0000-4000-8000-00000000000a'
NOONE='a8000000-0000-4000-8000-00000000000a'
CTX='c1000000-0000-4000-8000-00000000000c'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql
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

# Collapse a probe result to a single comparable token.
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

# Collapse a start result: any uuid → UUID, everything else verbatim.
uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

create_def() { # $1=actor $2=name $3=slug $4=steps-json → outcome token
  as authenticated "$1" "select public.create_workflow_definition_v1('$O1', '$2', '$3', 'generic_request', '$4'::jsonb);" | tok
}
latest_version() { q "select v.id from public.workflow_definition_versions v join public.workflow_definitions d on d.id = v.definition_id where d.slug = '$1' order by v.version desc limit 1;"; }
def_id() { q "select id from public.workflow_definitions where slug = '$1';"; }
start_as() { # $1=actor $2=def-id $3=title [$4=ctx]
  local ctx="${4:-}"
  if [ -n "$ctx" ]; then
    as authenticated "$1" "select public.start_workflow_instance_v1('$2', '$3', '{}'::jsonb, '$ctx');" | tok
  else
    as authenticated "$1" "select public.start_workflow_instance_v1('$2', '$3', '{}'::jsonb);" | tok
  fi
}
decide_as() { as authenticated "$1" "select public.decide_workflow_step_v1('$2', '$3', ${4:-null});" | tok; }

STEP_ALL_OA='[{"name":"Round 1","approval_mode":"all","approver_rule":{"kind":"org_role","roles":["owner","admin"]}}]'
STEP_TWO='[{"name":"Round 1","approval_mode":"single","approver_rule":{"kind":"org_role","roles":["owner","admin"]}},{"name":"Round 2","approval_mode":"all","approver_rule":{"kind":"requester_manager"}}]'
STEP_ANY='[{"name":"Round 1","approval_mode":"any","approver_rule":{"kind":"org_role","roles":["owner","admin"]}}]'
STEP_DL='[{"name":"Round 1","approval_mode":"all","approver_rule":{"kind":"org_role","roles":["owner","admin"]},"deadline_hours":1,"escalation_rule":{"action":"mark_escalated","notify_roles":["owner","admin"]}}]'
STEP_BAD='[{"name":"Round 1","approval_mode":"majority","approver_rule":{"kind":"org_role","roles":["owner"]}}]'

echo "=============================================================="
echo " WORKFLOW & APPROVAL ENGINE v1 — behavioural proof"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/workflow-engine-v1.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/workflow-engine-v1.seed.sql" >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- BEFORE: the engine does not exist ---"
check "workflow_instances absent before apply" "" "$(q "select to_regclass('public.workflow_instances');")"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"

echo
echo "--- A. authoring authority (governance owner/admin only) ---"
check "member cannot author"            "not_authorized" "$(create_def "$MEMBER1" 'Expenses' 'expenses_all' "$STEP_ALL_OA")"
check "manager cannot author"           "not_authorized" "$(create_def "$MGR1" 'Expenses' 'expenses_all' "$STEP_ALL_OA")"
check "attacker cannot author"          "not_authorized" "$(create_def "$NOONE" 'Expenses' 'expenses_all' "$STEP_ALL_OA")"
check "wrong-org owner cannot author"   "not_authorized" "$(create_def "$OUT2" 'Expenses' 'expenses_all' "$STEP_ALL_OA")"
check "anon is refused outright"        "DENIED" "$(as anon '' "select public.create_workflow_definition_v1('$O1','X','x_x','generic_request','$STEP_ALL_OA'::jsonb);" | tok)"
check "owner authors (mode=all)"        "created" "$(create_def "$OWNER1" 'Expenses' 'expenses_all' "$STEP_ALL_OA")"
check "duplicate slug refused"          "already_exists" "$(create_def "$OWNER1" 'Expenses' 'expenses_all' "$STEP_ALL_OA")"
check "admin authors (two rounds)"      "created" "$(create_def "$ADMIN1" 'Trips' 'trips_two' "$STEP_TWO")"
check "admin authors (mode=any)"        "created" "$(create_def "$ADMIN1" 'Fast lane' 'fast_any' "$STEP_ANY")"
check "invalid mode refused"            "invalid" "$(create_def "$OWNER1" 'Bad' 'bad_mode' "$STEP_BAD")"

DEF1=$(def_id expenses_all); VER1=$(latest_version expenses_all)
DEF2=$(def_id trips_two);    VER2=$(latest_version trips_two)
DEF3=$(def_id fast_any);     VER3=$(latest_version fast_any)

echo
echo "--- B. publish freezes; unpublished cannot start ---"
check "member cannot publish (no oracle)"    "not_found" "$(as authenticated "$MEMBER1" "select public.publish_workflow_version_v1('$VER1');" | tok)"
check "wrong-org owner cannot publish"       "not_found" "$(as authenticated "$OUT2" "select public.publish_workflow_version_v1('$VER1');" | tok)"
check "start before publish refused"         "not_published" "$(start_as "$ENGREQ" "$DEF1" 'Buy new drills')"
check "owner publishes"                      "published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER1');" | tok)"
check "publish is idempotent-honest"         "already_published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER1');" | tok)"
check "admin publishes def2"                 "published" "$(as authenticated "$ADMIN1" "select public.publish_workflow_version_v1('$VER2');" | tok)"
check "admin publishes def3"                 "published" "$(as authenticated "$ADMIN1" "select public.publish_workflow_version_v1('$VER3');" | tok)"
check "published steps frozen (even superuser)" "DENIED" "$(q "insert into public.workflow_version_steps (version_id, step_order, name, approval_mode, approver_rule) values ('$VER1', 9, 'Sneak', 'single', '{\"kind\":\"requester_manager\"}');" | tok)"

echo
echo "--- C. start + org boundary over BOTH membership truths ---"
check "attacker cannot start (no oracle)"    "not_found" "$(start_as "$NOONE" "$DEF1" 'Buy new drills')"
check "wrong-org member cannot start"        "not_found" "$(start_as "$OUT2" "$DEF1" 'Buy new drills')"
check "title bounds enforced"                "invalid" "$(start_as "$ENGREQ" "$DEF1" 'ab')"
INST1=$(start_as "$ENGREQ" "$DEF1" 'Buy new drills')
check "ENGAGEMENT-truth member CAN start"    "UUID" "$(echo "$INST1" | uu)"
INST2=$(start_as "$MEMBER1" "$DEF1" 'Repeat guard' "$CTX")
check "membership-truth member CAN start (with context)" "UUID" "$(echo "$INST2" | uu)"
check "repeat start on same context is idempotent" "already_pending" "$(start_as "$MEMBER1" "$DEF1" 'Repeat guard' "$CTX")"
check "every step resolved approvers at start (2 slots)" "2" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST1';")"

echo
echo "--- D. RLS reads (fail-closed SELECT-only) ---"
check "requester sees own instance"          "1" "$(as authenticated "$ENGREQ" "select count(*) from public.workflow_instances where id='$INST1';" | tok)"
check "approver (admin role) sees it"        "1" "$(as authenticated "$ADMIN1" "select count(*) from public.workflow_instances where id='$INST1';" | tok)"
check "governance owner sees it"             "1" "$(as authenticated "$OWNER1" "select count(*) from public.workflow_instances where id='$INST1';" | tok)"
check "plain member sees NOTHING"            "0" "$(as authenticated "$MGR1" "select count(*) from public.workflow_instances where id='$INST1';" | tok)"
check "wrong-org owner sees NOTHING"         "0" "$(as authenticated "$OUT2" "select count(*) from public.workflow_instances where id='$INST1';" | tok)"
check "attacker sees NOTHING"                "0" "$(as authenticated "$NOONE" "select count(*) from public.workflow_instances where id='$INST1';" | tok)"
check "anon: table denied"                   "DENIED" "$(as anon '' "select count(*) from public.workflow_instances;" | tok)"
check "transitions scoped the same"          "0" "$(as authenticated "$MGR1" "select count(*) from public.workflow_transitions where instance_id='$INST1';" | tok)"
check "direct INSERT denied (writes RPC-only)" "DENIED" "$(as authenticated "$OWNER1" "insert into public.workflow_transitions (instance_id, action) values ('$INST1','started');" | tok)"
check "direct UPDATE denied"                 "DENIED" "$(as authenticated "$OWNER1" "update public.workflow_instances set status='approved' where id='$INST1';" | tok)"

echo
echo "--- E. decide: mode=all matrix + idempotency (INST1: OWNER1+ADMIN1) ---"
check "non-approver member cannot decide (no oracle)" "not_found" "$(decide_as "$MGR1" "$INST1" approved)"
check "requester cannot decide own request"  "not_found" "$(decide_as "$ENGREQ" "$INST1" approved)"
check "1st of 2 approvals records"           "recorded" "$(decide_as "$ADMIN1" "$INST1" approved)"
check "repeat decide is idempotent"          "already_decided" "$(decide_as "$ADMIN1" "$INST1" approved)"
check "flip attempt after decide refused"    "already_decided" "$(decide_as "$ADMIN1" "$INST1" rejected)"
check "2nd approval completes instance"      "approved" "$(decide_as "$OWNER1" "$INST1" approved)"
check "decide after completion is honest"    "already_decided" "$(decide_as "$OWNER1" "$INST1" approved)"
check "instance terminal state approved"     "approved" "$(q "select status from public.workflow_instances where id='$INST1';")"
check "ledger recorded the completion"       "1" "$(q "select count(*) from public.workflow_transitions where instance_id='$INST1' and action='completed';")"

echo
echo "--- F. multi-step single→all + rejection (def2, requester MEMBER1) ---"
INST3=$(start_as "$MEMBER1" "$DEF2" 'Trip to Rotterdam')
check "start ok"                             "UUID" "$(echo "$INST3" | uu)"
check "single mode: first decision advances" "step_approved" "$(decide_as "$OWNER1" "$INST3" approved)"
check "round 2 is now the live one"          "2" "$(q "select current_step_order from public.workflow_instances where id='$INST3';")"
check "requester_manager resolves managers minus requester" "3" "$(q "select count(*) from public.workflow_instance_approvers a join public.workflow_instance_steps s on s.id=a.instance_step_id where s.instance_id='$INST3' and s.step_order=2;")"
check "rejection rejects the instance"       "rejected" "$(decide_as "$MGR1" "$INST3" rejected "'not this month'")"
check "instance terminal state rejected"     "rejected" "$(q "select status from public.workflow_instances where id='$INST3';")"
check "reason captured in the slot"          "not this month" "$(q "select reason from public.workflow_instance_approvers where instance_id='$INST3' and decision='rejected';")"

echo
echo "--- G. fill-once + append-only hold even against the superuser ---"
check "decided slot immutable (fill-once trigger)" "DENIED" "$(q "update public.workflow_instance_approvers set decision='approved' where instance_id='$INST3' and decision='rejected';" | tok)"
check "transition UPDATE blocked"            "DENIED" "$(q "update public.workflow_transitions set action='approved' where instance_id='$INST3' and action='rejected';" | tok)"
check "transition DELETE blocked"            "DENIED" "$(q "delete from public.workflow_transitions where instance_id='$INST3';" | tok)"

echo
echo "--- H. any-mode + delegation (delegate can decide; boundary enforced) ---"
INST6=$(start_as "$ENGREQ" "$DEF3" 'Fast question')
check "start ok"                             "UUID" "$(echo "$INST6" | uu)"
check "delegate to wrong-org member refused" "invalid_delegate" "$(as authenticated "$ADMIN1" "select public.delegate_workflow_step_v1('$INST6', 'out2@proof.test');" | tok)"
check "delegate to unknown address refused (no oracle)" "invalid_delegate" "$(as authenticated "$ADMIN1" "select public.delegate_workflow_step_v1('$INST6', 'ghost@proof.test');" | tok)"
check "delegate to same-org colleague"       "delegated" "$(as authenticated "$ADMIN1" "select public.delegate_workflow_step_v1('$INST6', 'manager1@proof.test');" | tok)"
check "ledger recorded the delegation"       "1" "$(q "select count(*) from public.workflow_transitions where instance_id='$INST6' and action='delegated';")"
check "any-mode: DELEGATE's approval completes" "approved" "$(decide_as "$MGR1" "$INST6" approved)"
check "the original approver stays accountable (decided_by=delegate)" "$MGR1" "$(q "select decided_by from public.workflow_instance_approvers where instance_id='$INST6' and approver_profile_id='$ADMIN1';")"
INST8=$(start_as "$MEMBER1" "$DEF3" 'Any-mode rejection')
check "any-mode: first rejection rejects"    "rejected" "$(decide_as "$ADMIN1" "$INST8" rejected)"

echo
echo "--- I. withdraw / cancel authority ---"
INST4=$(start_as "$MEMBER1" "$DEF1" 'Will be withdrawn')
check "non-requester cannot withdraw (no oracle)" "not_found" "$(as authenticated "$OWNER1" "select public.withdraw_workflow_instance_v1('$INST4');" | tok)"
check "requester withdraws"                  "withdrawn" "$(as authenticated "$MEMBER1" "select public.withdraw_workflow_instance_v1('$INST4');" | tok)"
check "repeat withdraw is honest"            "not_pending" "$(as authenticated "$MEMBER1" "select public.withdraw_workflow_instance_v1('$INST4');" | tok)"
check "open steps were skipped, not decided" "skipped" "$(q "select status from public.workflow_instance_steps where instance_id='$INST4' and step_order=1;")"
INST5=$(start_as "$ENGREQ" "$DEF1" 'Will be cancelled')
check "member cannot cancel (no oracle)"     "not_found" "$(as authenticated "$MEMBER1" "select public.cancel_workflow_instance_v1('$INST5');" | tok)"
check "governance owner cancels"             "cancelled" "$(as authenticated "$OWNER1" "select public.cancel_workflow_instance_v1('$INST5');" | tok)"

echo
echo "--- J. ESCALATION IS A SAFE STATE (marks + notifies, never approves) ---"
CRE=$(create_def "$OWNER1" 'Urgent buy' 'urgent_dl' "$STEP_DL"); VER4=$(latest_version urgent_dl); DEF4=$(def_id urgent_dl)
check "deadline template created+published"  "created|published" "$CRE|$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER4');" | tok)"
INST7=$(start_as "$ENGREQ" "$DEF4" 'Urgent drill bits')
check "start ok"                             "UUID" "$(echo "$INST7" | uu)"
q "update public.workflow_instance_steps set deadline_at = now() - interval '2 hours' where instance_id='$INST7';" >/dev/null
check "member cannot run the overdue sweep"  "NOROWS" "$(as authenticated "$MEMBER1" "select instance_id from public.mark_overdue_workflow_steps_v1('$O1');" | tok)"
check "owner sweep reports the overdue step" "$INST7|1" "$(as authenticated "$OWNER1" "select instance_id||'|'||step_order from public.mark_overdue_workflow_steps_v1('$O1');" | tok)"
check "step is marked escalated"             "escalated" "$(q "select status from public.workflow_instance_steps where instance_id='$INST7';")"
check "NO decision was written by escalation" "0" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST7' and decision is not null;")"
check "instance stays pending"               "pending" "$(q "select status from public.workflow_instances where id='$INST7';")"
check "sweep is idempotent"                  "NOROWS" "$(as authenticated "$OWNER1" "select instance_id from public.mark_overdue_workflow_steps_v1('$O1');" | tok)"
check "escalated step is STILL decidable"    "recorded" "$(decide_as "$ADMIN1" "$INST7" approved)"
check "…and completes normally"              "approved" "$(decide_as "$OWNER1" "$INST7" approved)"

echo
echo "--- K. notification type widening (v3) verbatim + rollback ---"
APPLY_T=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION_TYPES" 2>&1)
if echo "$APPLY_T" | grep -qiE 'ERROR|FATAL'; then echo "$APPLY_T" | head -10; echo "TYPES MIGRATION FAILED"; exit 1; fi
check "widened constraint admits workflow_step_pending" "INSERT 0 1" "$(q "insert into public.notification_events (recipient_profile_id, event_type, entity_type, entity_id, dedupe_key) values ('$OWNER1','workflow_step_pending','workflow_instance','$INST7','workflow_step_pending:$INST7');")"
check "old vocabulary still admitted"        "INSERT 0 1" "$(q "insert into public.notification_events (recipient_profile_id, event_type, entity_type, entity_id, dedupe_key) values ('$OWNER1','booking_proposed','booking_request','$INST7','booking_proposed:$INST7');")"
q "delete from public.notification_events;" >/dev/null
ROLL_T=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK_TYPES" 2>&1)
if echo "$ROLL_T" | grep -qiE 'ERROR|FATAL'; then echo "$ROLL_T" | head -10; echo "TYPES ROLLBACK FAILED"; exit 1; fi
check "rollback narrows the constraint back" "DENIED" "$(q "insert into public.notification_events (recipient_profile_id, event_type, entity_type, entity_id, dedupe_key) values ('$OWNER1','workflow_step_pending','workflow_instance','$INST7','x');" | tok)"

echo
echo "--- L. engine rollback → re-apply round trip ---"
ROLL_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$ROLL_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "rollback removes the engine"          "" "$(q "select to_regclass('public.workflow_instances');")"
check "rollback removes the commands"        "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'workflow_%';")"
REAPPLY=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$REAPPLY" | grep -qiE 'ERROR|FATAL'; then echo "$REAPPLY" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "re-apply is clean"                    "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
