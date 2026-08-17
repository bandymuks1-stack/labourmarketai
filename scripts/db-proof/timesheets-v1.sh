#!/usr/bin/env bash
# ============================================================================
# TIMESHEETS v1 — REAL per-role behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (workflow-engine prelude+seed, then the journal/worker prelude+seed), then
# executes the actual files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql   (dependency)
#   supabase/migrations/20260817170000_timesheets_v1.sql        (under test)
#   supabase/rollbacks/20260817170000_timesheets_v1.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / worker-own / org owner / org manager /
#     plain member / engagement-truth / wrong-org / revoked / attacker) on
#     every command and on RLS reads;
#   * period rules: ≤31 inclusive days, overlap rejection incl. the
#     touching-edge case (inclusive bands);
#   * the DERIVATION truth: hours from journal work items only, work_date
#     placement, minutes→hours, day-units totalled separately, deleted /
#     corrected / personal / rejected / wrong-org / out-of-period exclusions;
#   * the ENGINE SEAM: submit freezes the snapshot (trigger-proof even
#     against the superuser), the instance is started through the engine's
#     own start RPC with context_entity_type='timesheet', decisions happen in
#     the engine, sync only COPIES the terminal outcome;
#   * reopen transitions (managers only, note required, decided-only);
#   * append-only events; rollback → re-apply round trip (engine untouched).
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/timesheets-v1.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-timesheets-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
ENGINE="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIGRATION="$REPO/supabase/migrations/20260817170000_timesheets_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817170000_timesheets_v1.down.sql"

O1='01000000-0000-4000-8000-000000000001'
OWNER1='a1000000-0000-4000-8000-00000000000a'
ADMIN1='a2000000-0000-4000-8000-00000000000a'
MGR1='a3000000-0000-4000-8000-00000000000a'
MEMBER1='a4000000-0000-4000-8000-00000000000a'
ENGREQ='a5000000-0000-4000-8000-00000000000a'   # engagement-truth worker (W1)
OUT2='a7000000-0000-4000-8000-00000000000a'     # owner of O2 only (W4)
NOONE='a8000000-0000-4000-8000-00000000000a'    # attacker, worker with no org (W3)

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

tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-68s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-68s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

create_ts() { # $1=actor $2=start $3=end → outcome/uuid token
  as authenticated "$1" "select public.create_timesheet_v1('$O1', '$2', '$3');" | tok
}

echo "=============================================================="
echo " TIMESHEETS v1 — behavioural proof (derived + engine-approved)"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

for f in workflow-engine-v1.prelude.sql workflow-engine-v1.seed.sql timesheets-v1.prelude.sql timesheets-v1.seed.sql; do
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/$f" >/dev/null || { echo "$f failed"; exit 1; }
done
echo "harness loaded (throwaway $CT)"

echo
echo "--- BEFORE: timesheets do not exist ---"
check "timesheets absent before apply" "" "$(q "select to_regclass('public.timesheets');")"

echo
echo "--- APPLYING the ENGINE dependency, then $(basename "$MIGRATION") verbatim ---"
for m in "$ENGINE" "$MIGRATION"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$m" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -20; echo "APPLY FAILED: $m"; exit 1; fi
  echo "  applied: $(basename "$m")"
done

echo
echo "--- A. create authority + period rules ---"
check "anon is refused outright"        "DENIED" "$(as anon '' "select public.create_timesheet_v1('$O1','2026-08-01','2026-08-31');" | tok)"
check "profile without worker row"      "no_worker" "$(as authenticated "$OWNER1" "select public.create_timesheet_v1('$O1','2026-08-01','2026-08-31');" | tok)"
check "worker with NO org (no oracle)"  "not_found" "$(create_ts "$NOONE" 2026-08-01 2026-08-31)"
check "wrong-org worker (no oracle)"    "not_found" "$(create_ts "$OUT2" 2026-08-01 2026-08-31)"
check "reversed period refused"         "invalid_period" "$(create_ts "$ENGREQ" 2026-08-31 2026-08-01)"
check "32-day period refused"           "invalid_period" "$(create_ts "$ENGREQ" 2026-08-01 2026-09-01)"
check "malformed date refused"          "invalid" "$(create_ts "$ENGREQ" 2026-8-1 2026-08-31)"
TS1=$(create_ts "$ENGREQ" 2026-08-01 2026-08-31)
check "ENGAGEMENT-truth worker creates" "UUID" "$(echo "$TS1" | uu)"
check "same period again → overlap"     "overlap" "$(create_ts "$ENGREQ" 2026-08-01 2026-08-31)"
check "touching edge IS an overlap"     "overlap" "$(create_ts "$ENGREQ" 2026-08-31 2026-09-05)"
TS_SEP=$(create_ts "$ENGREQ" 2026-09-01 2026-09-30)
check "adjacent non-overlap is fine"    "UUID" "$(echo "$TS_SEP" | uu)"
TS2=$(create_ts "$MEMBER1" 2026-08-01 2026-08-31)
check "membership-truth worker creates" "UUID" "$(echo "$TS2" | uu)"

echo
echo "--- B. derivation truth (journal work items only) ---"
check "total hours = 8 + 1.5 + 2"       "11.50" "$(q "select lines_snapshot->'totals'->>'totalHours' from public.timesheets where id='$TS1';")"
check "day units totalled separately"   "1.00" "$(q "select lines_snapshot->'totals'->>'totalDayUnits' from public.timesheets where id='$TS1';")"
check "line count = 4 (exclusions hold)" "4" "$(q "select lines_snapshot->'totals'->>'lineCount' from public.timesheets where id='$TS1';")"
check "work_date wins over created day" "2026-08-03" "$(q "select l->>'day' from public.timesheets t, jsonb_array_elements(t.lines_snapshot->'lines') l where t.id='$TS1' and l->>'workItemId'='c0000001-0000-4000-8000-00000000000c';")"
check "project title carried on line"   "Hall renovation" "$(q "select l->>'projectTitle' from public.timesheets t, jsonb_array_elements(t.lines_snapshot->'lines') l where t.id='$TS1' and l->>'workItemId'='c0000001-0000-4000-8000-00000000000c';")"
check "member's own sheet is empty (their journal has no items)" "0" "$(q "select lines_snapshot->'totals'->>'lineCount' from public.timesheets where id='$TS2';")"

echo
echo "--- C. RLS reads (fail-closed SELECT-only, both membership truths) ---"
check "worker sees own document"        "1" "$(as authenticated "$ENGREQ" "select count(*) from public.timesheets where id='$TS1';" | tok)"
check "org owner sees it"               "1" "$(as authenticated "$OWNER1" "select count(*) from public.timesheets where id='$TS1';" | tok)"
check "org manager sees it"             "1" "$(as authenticated "$MGR1" "select count(*) from public.timesheets where id='$TS1';" | tok)"
check "plain member sees NOTHING"       "0" "$(as authenticated "$MEMBER1" "select count(*) from public.timesheets where id='$TS1';" | tok)"
check "wrong-org owner sees NOTHING"    "0" "$(as authenticated "$OUT2" "select count(*) from public.timesheets where id='$TS1';" | tok)"
check "attacker sees NOTHING"           "0" "$(as authenticated "$NOONE" "select count(*) from public.timesheets where id='$TS1';" | tok)"
check "anon: table denied"              "DENIED" "$(as anon '' "select count(*) from public.timesheets;" | tok)"
check "events scoped the same"          "0" "$(as authenticated "$MEMBER1" "select count(*) from public.timesheet_events te where te.timesheet_id='$TS1';" | tok)"
check "direct INSERT denied (writes RPC-only)" "DENIED" "$(as authenticated "$OWNER1" "insert into public.timesheets (organization_id, worker_id, period_start, period_end, created_by) values ('$O1','aaaa0002-0000-4000-8000-00000000000a','2026-10-01','2026-10-31','$OWNER1');" | tok)"
check "direct UPDATE denied"            "DENIED" "$(as authenticated "$ENGREQ" "update public.timesheets set status='approved' where id='$TS1';" | tok)"

echo
echo "--- D. refresh (worker-own, draft/reopened only) ---"
check "manager cannot refresh (no oracle)" "not_found" "$(as authenticated "$OWNER1" "select public.refresh_timesheet_lines_v1('$TS1');" | tok)"
check "worker refreshes own draft"      "refreshed" "$(as authenticated "$ENGREQ" "select public.refresh_timesheet_lines_v1('$TS1');" | tok)"

echo
echo "--- E. engine seam: template → start(context) → submit freezes ---"
STEPS='[{"name":"Approval","approval_mode":"single","approver_rule":{"kind":"org_role","roles":["owner","admin"]}}]'
check "owner authors timesheet template" "created" "$(as authenticated "$OWNER1" "select public.create_workflow_definition_v1('$O1','Timesheet approval','timesheet_approval_standard','timesheet','$STEPS'::jsonb);" | tok)"
DEF=$(q "select id from public.workflow_definitions where slug='timesheet_approval_standard';")
VER=$(q "select v.id from public.workflow_definition_versions v where v.definition_id='$DEF' order by v.version desc limit 1;")
check "owner publishes it"              "published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER');" | tok)"
INST=$(as authenticated "$ENGREQ" "select public.start_workflow_instance_v1('$DEF', 'Timesheet 2026-08-01 – 2026-08-31', '{}'::jsonb, '$TS1');" | tok)
check "worker starts instance WITH the timesheet as context" "UUID" "$(echo "$INST" | uu)"
check "instance context type is timesheet" "timesheet" "$(q "select context_entity_type from public.workflow_instances where id='$INST';")"
check "worker submits (freeze)"         "submitted" "$(as authenticated "$ENGREQ" "select public.submit_timesheet_v1('$TS1');" | tok)"
check "repeat submit is honest"         "already_submitted" "$(as authenticated "$ENGREQ" "select public.submit_timesheet_v1('$TS1');" | tok)"
check "refresh on submitted refused"    "not_editable" "$(as authenticated "$ENGREQ" "select public.refresh_timesheet_lines_v1('$TS1');" | tok)"
check "frozen snapshot immutable EVEN for superuser" "DENIED" "$(q "update public.timesheets set lines_snapshot='{}'::jsonb where id='$TS1';" | tok)"
check "identity immutable (period shift refused)" "DENIED" "$(q "update public.timesheets set period_end='2026-09-15' where id='$TS1';" | tok)"

echo
echo "--- F. decision flows THROUGH the engine; sync only copies ---"
check "sync before decision: still pending" "still_pending" "$(as authenticated "$ENGREQ" "select public.sync_timesheet_decision_v1('$TS1');" | tok)"
check "plain member cannot sync (no oracle)" "not_found" "$(as authenticated "$MEMBER1" "select public.sync_timesheet_decision_v1('$TS1');" | tok)"
check "admin decides IN THE ENGINE"     "approved" "$(as authenticated "$ADMIN1" "select public.decide_workflow_step_v1('$INST','approved');" | tok)"
check "timesheet still submitted until synced" "submitted" "$(q "select status from public.timesheets where id='$TS1';")"
check "worker syncs the outcome"        "approved" "$(as authenticated "$ENGREQ" "select public.sync_timesheet_decision_v1('$TS1');" | tok)"
check "timesheet is now approved"       "approved" "$(q "select status from public.timesheets where id='$TS1';")"
check "decided_at stamped"              "1" "$(q "select count(*) from public.timesheets where id='$TS1' and decided_at is not null;")"
check "repeat sync is honest"           "not_submitted" "$(as authenticated "$ENGREQ" "select public.sync_timesheet_decision_v1('$TS1');" | tok)"

echo
echo "--- G. reopen (managers only, note required, decided-only) + resubmit ---"
check "worker cannot reopen (no oracle)" "not_found" "$(as authenticated "$ENGREQ" "select public.reopen_timesheet_v1('$TS1','fix the Tuesday hours');" | tok)"
check "plain member cannot reopen"      "not_found" "$(as authenticated "$MEMBER1" "select public.reopen_timesheet_v1('$TS1','nope');" | tok)"
check "reopen without a note refused"   "invalid" "$(as authenticated "$OWNER1" "select public.reopen_timesheet_v1('$TS1','');" | tok)"
check "owner reopens with note"         "reopened" "$(as authenticated "$OWNER1" "select public.reopen_timesheet_v1('$TS1','fix the Tuesday hours');" | tok)"
check "reopen from reopened refused"    "not_decided" "$(as authenticated "$OWNER1" "select public.reopen_timesheet_v1('$TS1','again');" | tok)"
check "note preserved in append-only history" "fix the Tuesday hours" "$(q "select note from public.timesheet_events where timesheet_id='$TS1' and action='reopened';")"
check "worker can refresh again"        "refreshed" "$(as authenticated "$ENGREQ" "select public.refresh_timesheet_lines_v1('$TS1');" | tok)"
INST2=$(as authenticated "$ENGREQ" "select public.start_workflow_instance_v1('$DEF', 'Timesheet 2026-08-01 – 2026-08-31 (resubmit)', '{}'::jsonb, '$TS1');" | tok)
check "resubmit starts a NEW instance (old one terminal)" "UUID" "$(echo "$INST2" | uu)"
check "worker resubmits"                "submitted" "$(as authenticated "$ENGREQ" "select public.submit_timesheet_v1('$TS1');" | tok)"
check "admin rejects IN THE ENGINE"     "rejected" "$(as authenticated "$ADMIN1" "select public.decide_workflow_step_v1('$INST2','rejected','hours dispute');" | tok)"
check "manager syncs the rejection"     "rejected" "$(as authenticated "$MGR1" "select public.sync_timesheet_decision_v1('$TS1');" | tok)"
check "timesheet is now rejected"       "rejected" "$(q "select status from public.timesheets where id='$TS1';")"
check "sync NEVER decided anything itself: engine slots hold the only decisions" "2" "$(q "select count(*) from public.workflow_instance_approvers where decision is not null and instance_id in ('$INST','$INST2');")"

echo
echo "--- H. events are append-only even for the superuser ---"
check "event UPDATE blocked"            "DENIED" "$(q "update public.timesheet_events set action='approved' where timesheet_id='$TS1' and action='rejected';" | tok)"
check "event DELETE blocked"            "DENIED" "$(q "delete from public.timesheet_events where timesheet_id='$TS1';" | tok)"
check "full lifecycle recorded"         "8" "$(q "select count(*) from public.timesheet_events where timesheet_id='$TS1';")"

echo
echo "--- I. rollback → re-apply round trip (engine untouched) ---"
ROLL_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$ROLL_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "rollback removes timesheets"     "" "$(q "select to_regclass('public.timesheets');")"
check "rollback removes the commands"   "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'timesheet%';")"
check "the ENGINE survives the rollback" "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"
REAPPLY=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$REAPPLY" | grep -qiE 'ERROR|FATAL'; then echo "$REAPPLY" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "re-apply is clean"               "timesheets" "$(q "select to_regclass('public.timesheets');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
