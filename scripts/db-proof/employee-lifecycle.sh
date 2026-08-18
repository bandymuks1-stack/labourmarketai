#!/usr/bin/env bash
# ============================================================================
# Employee Lifecycle v1 — REAL per-role authority-matrix proof.
#
# Expects a THROWAWAY Postgres 15 container named $CT to be running (same
# convention as document-file-layer.sh):
#   docker run -d --name lifecycle-proof -e POSTGRES_PASSWORD=x postgres:15
# Loads the faithful harness (prelude + seed), then executes the ACTUAL
# migration file
#   supabase/migrations/20260817190000_employee_lifecycle_v1.sql
# and the ACTUAL rollback VERBATIM, measuring per role:
#   org owner / org manager / worker (self) / second worker / wrong-org
#   owner / attacker / platform admin / direct-write attacker.
# Covers: template authoring authority, run start/snapshot, stage
# transitions with history, reference-link verification (work_tasks /
# document_acknowledgements / asset_assignments incl. wrong-worker and
# wrong-org scoping), checklist completion gating, offboarding asset-return
# gating, end-engagement wrap around the canonical end path (last-owner
# protection intact), append-only ledger immutability, revoked direct
# writes, rollback + clean re-apply.
#
# Every probe runs under `set local role authenticated` (or `anon`), never
# as the superuser, so RLS genuinely decides the result.
# Never point this at production or at a shared local Supabase stack.
# ============================================================================
set -uo pipefail

CT=${CT:-lifecycle-proof}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260817190000_employee_lifecycle_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817190000_employee_lifecycle_v1.down.sql"

OWNER='11111111-1111-4111-8111-111111111111'
MGR='22222222-2222-4222-8222-222222222222'
W1='33333333-3333-4333-8333-333333333333'
W2='44444444-4444-4444-8444-444444444444'
OWNERB='55555555-5555-4555-8555-555555555555'
ATTACKER='66666666-6666-4666-8666-666666666666'
PLATFORM='77777777-7777-4777-8777-777777777777'
ORG_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ORG_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
EC_OWN='e0000000-0000-4000-8000-00000000000a'
EC1='e0000000-0000-4000-8000-000000000001'
EC2='e0000000-0000-4000-8000-000000000002'
EC_PERSONAL='e0000000-0000-4000-8000-000000000003'
TASK_DONE='40000000-0000-4000-8000-000000000001'
TASK_OPEN='40000000-0000-4000-8000-000000000002'
ACK_OK='50000000-0000-4000-8000-000000000001'
ACK_PENDING='50000000-0000-4000-8000-000000000002'
ASSIGN_A='a5100000-0000-4000-8000-000000000001'

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
set local app.is_admin = '${4:-false}';
$3
commit;
SQL
}
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }
is_uuid() { echo "$1" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-64s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-64s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

echo "=============================================================="
echo " Employee Lifecycle v1 — per-role authority proof"
echo "=============================================================="
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT not ready"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/employee-lifecycle.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/employee-lifecycle.seed.sql"   >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo "-- apply the REAL migration VERBATIM"
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" >/dev/null 2>&1; then
  check "migration applies cleanly" "ok" "ok"
else
  check "migration applies cleanly" "ok" "FAILED"; echo "aborting"; exit 1
fi

ITEMS='[{"kind":"task","title":"Safety intro task","required":true},
        {"kind":"document_ack","title":"Read the safety policy","required":true},
        {"kind":"custom","title":"Meet the team","required":true},
        {"kind":"asset_issue","title":"Receive tools","required":false},
        {"kind":"training_note","title":"First-aid basics","required":false}]'

echo "-- 1. template authoring authority"
R=$(as authenticated "$MGR" "select public.create_onboarding_template_v1('$ORG_A','Standard onboarding','', '$ITEMS'::jsonb);" | tok)
check "manager creates template" "created" "$R"
R=$(as authenticated "$ATTACKER" "select public.create_onboarding_template_v1('$ORG_A','Evil','', '$ITEMS'::jsonb);" | tok)
check "attacker template refused" "not_authorized" "$R"
R=$(as authenticated "$W1" "select public.create_onboarding_template_v1('$ORG_A','Worker try','', '$ITEMS'::jsonb);" | tok)
check "worker template refused" "not_authorized" "$R"
R=$(as authenticated "$MGR" "select public.create_onboarding_template_v1('$ORG_A','standard ONBOARDING','', '$ITEMS'::jsonb);" | tok)
check "duplicate name refused" "already_exists" "$R"
R=$(as authenticated "$MGR" "select public.create_onboarding_template_v1('$ORG_A','Bad kinds','', '[{\"kind\":\"nonsense\",\"title\":\"x y\"}]'::jsonb);" | tok)
check "invalid kind refused" "invalid" "$R"
R=$(as authenticated "$OWNERB" "select public.create_onboarding_template_v1('$ORG_B','Foreign onboarding','', '[{\"kind\":\"custom\",\"title\":\"Foreign item\"}]'::jsonb);" | tok)
check "org-B owner creates own template" "created" "$R"

TPL_A=$(q "select id from public.onboarding_templates where organization_id='$ORG_A' limit 1;")
TPL_B=$(q "select id from public.onboarding_templates where organization_id='$ORG_B' limit 1;")

echo "-- 2. template RLS"
R=$(as authenticated "$MGR" "select count(*) from public.onboarding_templates;" | tok)
check "manager sees own org templates only" "1" "$R"
R=$(as authenticated "$W1" "select count(*) from public.onboarding_templates;" | tok)
check "worker sees no authoring templates" "0" "$R"
R=$(as authenticated "$ATTACKER" "select count(*) from public.onboarding_templates;" | tok)
check "attacker sees none" "0" "$R"

echo "-- 3. start onboarding run"
RUN1=$(as authenticated "$MGR" "select public.start_onboarding_run_v1('$EC1','$TPL_A');" | tok)
if is_uuid "$RUN1"; then check "manager starts run (uuid returned)" "ok" "ok"; else check "manager starts run (uuid returned)" "uuid" "$RUN1"; fi
R=$(as authenticated "$MGR" "select public.start_onboarding_run_v1('$EC1','$TPL_A');" | tok)
check "second start refused" "already_running" "$R"
R=$(as authenticated "$ATTACKER" "select public.start_onboarding_run_v1('$EC1','$TPL_A');" | tok)
check "attacker start merged not_found" "not_found" "$R"
R=$(as authenticated "$MGR" "select public.start_onboarding_run_v1('$EC_PERSONAL','$TPL_A');" | tok)
check "personal EC hidden from manager" "not_found" "$R"
R=$(as authenticated "$PLATFORM" "select public.start_onboarding_run_v1('$EC_PERSONAL','$TPL_A');" "true" | tok)
check "admin on personal EC: not_org_scoped" "not_org_scoped" "$R"
R=$(as authenticated "$MGR" "select public.start_onboarding_run_v1('$EC2','$TPL_B');" | tok)
check "wrong-org template refused" "template_not_found" "$R"
R=$(q "select lifecycle_stage from public.engagement_contexts where id='$EC1';")
check "EC1 stage flipped to onboarding" "onboarding" "$R"
R=$(q "select count(*) from public.engagement_lifecycle_events where engagement_context_id='$EC1' and action='onboarding_started';")
check "onboarding_started event written" "1" "$R"
R=$(q "select count(*) from public.onboarding_run_items where run_id='$RUN1';")
check "snapshot has 5 items" "5" "$R"

echo "-- 4. run RLS"
R=$(as authenticated "$W1" "select count(*) from public.onboarding_runs;" | tok)
check "worker sees own run" "1" "$R"
R=$(as authenticated "$W1" "select count(*) from public.onboarding_run_items;" | tok)
check "worker sees own run items" "5" "$R"
R=$(as authenticated "$W2" "select count(*) from public.onboarding_runs;" | tok)
check "other worker sees none" "0" "$R"
R=$(as authenticated "$ATTACKER" "select count(*) from public.onboarding_runs;" | tok)
check "attacker sees none" "0" "$R"

IT_TASK=$(q "select id from public.onboarding_run_items where run_id='$RUN1' and item_order=1;")
IT_ACK=$(q "select id from public.onboarding_run_items where run_id='$RUN1' and item_order=2;")
IT_CUSTOM=$(q "select id from public.onboarding_run_items where run_id='$RUN1' and item_order=3;")
IT_ASSET=$(q "select id from public.onboarding_run_items where run_id='$RUN1' and item_order=4;")
IT_TRAIN=$(q "select id from public.onboarding_run_items where run_id='$RUN1' and item_order=5;")

echo "-- 5. item confirmations + reference verification"
R=$(as authenticated "$W1" "select public.set_onboarding_item_status_v1('$IT_CUSTOM','done','did it');" | tok)
check "worker confirms own custom item" "updated" "$R"
R=$(as authenticated "$W1" "select public.set_onboarding_item_status_v1('$IT_TASK','done');" | tok)
check "worker cannot confirm task item" "not_authorized" "$R"
R=$(as authenticated "$MGR" "select public.set_onboarding_item_status_v1('$IT_TASK','done',null,'work_task','$TASK_OPEN');" | tok)
check "open task link refused" "link_invalid" "$R"
R=$(as authenticated "$MGR" "select public.set_onboarding_item_status_v1('$IT_TASK','done',null,'work_task','$TASK_DONE');" | tok)
check "done task link accepted" "updated" "$R"
R=$(as authenticated "$MGR" "select public.set_onboarding_item_status_v1('$IT_ASSET','done',null,'asset_assignment','$ASSIGN_A');" | tok)
check "wrong-worker asset link refused" "link_invalid" "$R"
R=$(as authenticated "$MGR" "select public.complete_onboarding_run_v1('$RUN1');" | tok)
check "complete blocked while required open" "items_open" "$R"
R=$(as authenticated "$MGR" "select public.set_onboarding_item_status_v1('$IT_ACK','done',null,'document_acknowledgement','$ACK_PENDING');" | tok)
check "pending ack link refused" "link_invalid" "$R"
R=$(as authenticated "$W1" "select public.set_onboarding_item_status_v1('$IT_ACK','done',null,'document_acknowledgement','$ACK_OK');" | tok)
check "acknowledged ack link accepted" "updated" "$R"

echo "-- 6. responsible-person path"
R=$(as authenticated "$ATTACKER" "select public.assign_onboarding_item_v1('$IT_TRAIN','$ATTACKER');" | tok)
check "attacker cannot assign" "not_found" "$R"
R=$(as authenticated "$MGR" "select public.assign_onboarding_item_v1('$IT_TRAIN','$ATTACKER');" | tok)
check "outside responsible refused" "invalid_responsible" "$R"
R=$(as authenticated "$MGR" "select public.assign_onboarding_item_v1('$IT_TRAIN','$W1');" | tok)
check "manager assigns worker as responsible" "updated" "$R"
R=$(as authenticated "$W1" "select public.set_onboarding_item_status_v1('$IT_TRAIN','done');" | tok)
check "responsible worker confirms" "updated" "$R"

echo "-- 7. completion flips stage with history"
R=$(as authenticated "$MGR" "select public.complete_onboarding_run_v1('$RUN1');" | tok)
check "run completes" "completed" "$R"
R=$(q "select lifecycle_stage from public.engagement_contexts where id='$EC1';")
check "EC1 back to active" "active" "$R"
R=$(q "select count(*) from public.engagement_lifecycle_events where engagement_context_id='$EC1' and action='onboarding_completed';")
check "onboarding_completed event written" "1" "$R"
R=$(as authenticated "$MGR" "select public.set_onboarding_item_status_v1('$IT_CUSTOM','pending');" | tok)
check "item edits refused after close" "run_closed" "$R"

echo "-- 8. immutability + revoked direct writes"
R=$(q "update public.engagement_lifecycle_events set note='tamper' where engagement_context_id='$EC1';")
echo "$R" | grep -qi 'append-only' && check "ledger UPDATE refused (even superuser)" "ok" "ok" || check "ledger UPDATE refused (even superuser)" "ok" "ALLOWED"
R=$(q "delete from public.engagement_lifecycle_events where engagement_context_id='$EC1';")
echo "$R" | grep -qi 'append-only' && check "ledger DELETE refused (even superuser)" "ok" "ok" || check "ledger DELETE refused (even superuser)" "ok" "ALLOWED"
R=$(as authenticated "$MGR" "insert into public.onboarding_runs (engagement_context_id, organization_id, template_name, started_by) values ('$EC1','$ORG_A','direct','$MGR');" | tok)
check "direct run INSERT revoked" "DENIED" "$R"
R=$(as authenticated "$MGR" "update public.engagement_contexts set lifecycle_stage='ended' where id='$EC1';" | tok)
check "direct EC lifecycle UPDATE revoked" "DENIED" "$R"
R=$(as anon "" "select count(*) from public.onboarding_runs;" | tok)
check "anon reads nothing" "DENIED" "$R"

echo "-- 9. probation / change_pending (stage + date/note only)"
R=$(as authenticated "$MGR" "select public.set_engagement_lifecycle_stage_v1('$EC1','probation');" | tok)
check "probation without date refused" "invalid" "$R"
R=$(as authenticated "$MGR" "select public.set_engagement_lifecycle_stage_v1('$EC1','probation','2026-11-30');" | tok)
check "probation set with date" "updated" "$R"
R=$(q "select lifecycle_stage || '/' || probation_until from public.engagement_contexts where id='$EC1';")
check "probation stamped" "probation/2026-11-30" "$R"
R=$(q "select count(*) from public.engagement_lifecycle_events where engagement_context_id='$EC1' and action='probation_set';")
check "probation_set event written" "1" "$R"
R=$(as authenticated "$MGR" "select public.set_engagement_lifecycle_stage_v1('$EC1','change_pending',null,'raise discussion');" | tok)
check "change_pending noted" "updated" "$R"
R=$(q "select count(*) from public.engagement_lifecycle_events where engagement_context_id='$EC1' and action='change_noted';")
check "change_noted event written" "1" "$R"
R=$(as authenticated "$MGR" "select public.set_engagement_lifecycle_stage_v1('$EC1','active');" | tok)
check "back to active" "updated" "$R"
R=$(as authenticated "$ATTACKER" "select public.set_engagement_lifecycle_stage_v1('$EC1','probation','2026-11-30');" | tok)
check "attacker stage change merged not_found" "not_found" "$R"

echo "-- 10. offboarding generated from asset reality"
RUN2=$(as authenticated "$MGR" "select public.start_offboarding_run_v1('$EC2');" | tok)
if is_uuid "$RUN2"; then check "manager starts offboarding (uuid)" "ok" "ok"; else check "manager starts offboarding (uuid)" "uuid" "$RUN2"; fi
R=$(q "select count(*) from public.offboarding_run_items where run_id='$RUN2' and kind='asset_return';")
check "ONE asset_return item (org-A scope only)" "1" "$R"
R=$(q "select count(*) from public.offboarding_run_items where run_id='$RUN2';")
check "generated checklist = 3 items" "3" "$R"
R=$(q "select lifecycle_stage from public.engagement_contexts where id='$EC2';")
check "EC2 stage offboarding" "offboarding" "$R"
R=$(as authenticated "$ATTACKER" "select public.start_offboarding_run_v1('$EC2');" | tok)
check "attacker offboarding merged not_found" "not_found" "$R"

OFF_ASSET=$(q "select id from public.offboarding_run_items where run_id='$RUN2' and kind='asset_return';")
OFF_ACCESS=$(q "select id from public.offboarding_run_items where run_id='$RUN2' and kind='access_removal';")
OFF_EVID=$(q "select id from public.offboarding_run_items where run_id='$RUN2' and kind='final_evidence';")

echo "-- 11. asset-return gating (reference + confirm)"
R=$(as authenticated "$MGR" "select public.set_offboarding_item_status_v1('$OFF_ASSET','done');" | tok)
check "done refused while asset open" "asset_not_returned" "$R"
R=$(as authenticated "$MGR" "select public.set_offboarding_item_status_v1('$OFF_ASSET','skipped');" | tok)
check "skip refused while asset open" "asset_not_returned" "$R"
q "update public.asset_assignments set status='returned', returned_at=now() where id='$ASSIGN_A';" >/dev/null
R=$(as authenticated "$MGR" "select public.set_offboarding_item_status_v1('$OFF_ASSET','done');" | tok)
check "done accepted once returned" "updated" "$R"
R=$(as authenticated "$MGR" "select public.set_offboarding_item_status_v1('$OFF_ACCESS','done','memberships revoked');" | tok)
check "access_removal confirmed" "updated" "$R"
R=$(as authenticated "$MGR" "select public.end_engagement_lifecycle_v1('$EC2','contract_end');" | tok)
check "end refused while run open" "offboarding_open" "$R"
R=$(as authenticated "$MGR" "select public.complete_offboarding_run_v1('$RUN2');" | tok)
check "complete blocked while required open" "items_open" "$R"
R=$(as authenticated "$MGR" "select public.set_offboarding_item_status_v1('$OFF_EVID','done');" | tok)
check "final_evidence confirmed" "updated" "$R"
R=$(as authenticated "$MGR" "select public.complete_offboarding_run_v1('$RUN2');" | tok)
check "offboarding run completes" "completed" "$R"

echo "-- 12. end wraps the CANONICAL path"
R=$(as authenticated "$MGR" "select public.end_engagement_lifecycle_v1('$EC2','nonsense');" | tok)
check "invalid reason refused" "invalid" "$R"
R=$(as authenticated "$MGR" "select public.end_engagement_lifecycle_v1('$EC2','contract_end','fixed-term ended');" | tok)
check "manager ends engagement" "ended" "$R"
R=$(q "select status || '/' || lifecycle_stage || '/' || ended_reason from public.engagement_contexts where id='$EC2';")
check "EC2 ended + stamped" "ended/ended/contract_end" "$R"
R=$(q "select count(*) from public.audit_logs where entity_id='$EC2' and action='end_org_membership';")
check "canonical audit row written" "1" "$R"
R=$(as authenticated "$MGR" "select public.end_engagement_lifecycle_v1('$EC2','contract_end');" | tok)
check "repeat end idempotent" "already_ended" "$R"
R=$(as authenticated "$OWNER" "select public.end_engagement_lifecycle_v1('$EC_OWN','retirement');" | tok)
check "last-owner protection intact" "last_owner" "$R"
R=$(as authenticated "$MGR" "select public.set_engagement_lifecycle_stage_v1('$EC2','probation','2026-12-31');" | tok)
check "stage change refused on ended EC" "not_active" "$R"
R=$(q "select count(*) from public.engagement_lifecycle_events where engagement_context_id='$EC2' and action='engagement_ended';")
check "engagement_ended event written" "1" "$R"

echo "-- 13. cancel paths"
RUN3=$(as authenticated "$MGR" "select public.start_onboarding_run_v1('$EC1','$TPL_A');" | tok)
if is_uuid "$RUN3"; then check "fresh onboarding run starts" "ok" "ok"; else check "fresh onboarding run starts" "uuid" "$RUN3"; fi
R=$(as authenticated "$MGR" "select public.cancel_onboarding_run_v1('$RUN3','template mismatch');" | tok)
check "onboarding cancel" "cancelled" "$R"
R=$(q "select lifecycle_stage from public.engagement_contexts where id='$EC1';")
check "EC1 back to active after cancel" "active" "$R"
RUN4=$(as authenticated "$MGR" "select public.start_offboarding_run_v1('$EC1');" | tok)
if is_uuid "$RUN4"; then check "offboarding run starts on EC1" "ok" "ok"; else check "offboarding run starts on EC1" "uuid" "$RUN4"; fi
R=$(as authenticated "$MGR" "select public.cancel_offboarding_run_v1('$RUN4','person stays');" | tok)
check "offboarding cancel (person stays)" "cancelled" "$R"
R=$(q "select lifecycle_stage from public.engagement_contexts where id='$EC1';")
check "EC1 active after offboarding cancel" "active" "$R"

echo "-- 14. rollback + clean re-apply"
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null 2>&1; then
  check "rollback applies cleanly" "ok" "ok"
else
  check "rollback applies cleanly" "ok" "FAILED"
fi
R=$(q "select count(*) from information_schema.columns where table_name='engagement_contexts' and column_name in ('lifecycle_stage','probation_until','ended_reason','ended_note');")
check "EC columns removed" "0" "$R"
R=$(q "select count(*) from information_schema.tables where table_name like 'onboarding_%' or table_name like 'offboarding_%' or table_name='engagement_lifecycle_events';")
check "lifecycle tables removed" "0" "$R"
R=$(q "select status from public.engagement_contexts where id='$EC2';")
check "ended membership STAYS ended after rollback" "ended" "$R"
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" >/dev/null 2>&1; then
  check "re-apply after rollback is clean" "ok" "ok"
else
  check "re-apply after rollback is clean" "ok" "FAILED"
fi
R=$(q "select count(*) from public.onboarding_runs;")
check "re-applied engine starts empty" "0" "$R"

echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
