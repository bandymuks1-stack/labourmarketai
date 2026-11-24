#!/usr/bin/env bash
# ============================================================================
# TRAIN D — objects / tasks v2 / project responsible / notification v4:
# REAL database proof.
#
# Throwaway Postgres 15 container on its OWN name and port; the shared local
# Supabase stack is never touched. The four migrations and their paired
# rollbacks are executed VERBATIM from the repo — nothing here re-implements
# them.
#
# Proves, in order:
#   A. apply 20260817150000 (work_objects) — authority matrix:
#      anon / owner / manager / member / engaged worker / wrong-org / stranger
#   B. apply 20260817151000 (tasks v2) — assign-to-other eligibility,
#      history trigger, gated reopen, dependency cycle rejection, RLS
#   C. apply 20260817152000 — responsible authority + audit idempotency
#   D. apply 20260817153000 — v4 types admitted, bogus types refused
#   E. rollbacks REFUSE while real rows exist (the guards), then succeed on
#      a cleaned database, in reverse order 4→3→2→1
#   F. re-apply all four in order — clean, feature works again
#
# Never point this at production or at a shared stack.
# Usage:  bash scripts/db-proof/train-d-objects-tasks.sh
# ============================================================================
set -uo pipefail

CT=train-d-proof
IMAGE=postgres:15
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M1="$REPO/supabase/migrations/20260817150000_work_objects_v1.sql"
M2="$REPO/supabase/migrations/20260817151000_work_tasks_v2_collaboration.sql"
M3="$REPO/supabase/migrations/20260817152000_project_responsible_v1.sql"
M4="$REPO/supabase/migrations/20260817153000_notification_events_v4_task_types.sql"
R1="$REPO/supabase/rollbacks/20260817150000_work_objects_v1.down.sql"
R2="$REPO/supabase/rollbacks/20260817151000_work_tasks_v2_collaboration.down.sql"
R3="$REPO/supabase/rollbacks/20260817152000_project_responsible_v1.down.sql"
R4="$REPO/supabase/rollbacks/20260817153000_notification_events_v4_task_types.down.sql"

OWNER='11111111-1111-1111-1111-111111111111'
MANAGER='22222222-2222-2222-2222-222222222222'
MEMBER='33333333-3333-3333-3333-333333333333'
WORKERP='44444444-4444-4444-4444-444444444444'
STRANGER='55555555-5555-5555-5555-555555555555'
OTHER='66666666-6666-6666-6666-666666666666'
ORG1='a0000000-0000-4000-8000-000000000001'
ORG2='a0000000-0000-4000-8000-000000000002'
P1='b0000000-0000-4000-8000-000000000001'
P2='b0000000-0000-4000-8000-000000000002'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql [$4=is_admin]
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

UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

# A rollback file run that must REFUSE: DENIED when any ERROR appears
# (psql -f prefixes errors with "psql:<stdin>:N:"), OK otherwise. Runs in a
# single transaction (-1) so a refusal leaves nothing half-applied.
refuse() { local out; out=$(docker exec -i "$CT" psql -U postgres -1 -v ON_ERROR_STOP=1 -f - < "$1" 2>&1)
           if echo "$out" | grep -qiE '(^|: )ERROR'; then echo "DENIED"; else echo "OK"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
check_uuid() { if echo "$2" | grep -qE "$UUID_RE"; then printf '  PASS  %-66s (uuid)\n' "$1"; pass=$((pass+1));
               else printf '  FAIL  %-66s expected=uuid actual=%s\n' "$1" "$2"; fail=$((fail+1)); fi; }

apply() { # $1 = file, $2 = label
  local out; out=$(docker exec -i "$CT" psql -U postgres -q -1 -v ON_ERROR_STOP=1 -f - < "$1" 2>&1)
  if echo "$out" | grep -qiE '(ERROR|FATAL)'; then echo "$out" | head -15; echo "$2 FAILED"; exit 1; fi
}

echo "=============================================================="
echo " TRAIN D — objects / tasks v2 / responsible / notification v4"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -1 -v ON_ERROR_STOP=1 -f - < "$HERE/train-d-objects-tasks.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -1 -v ON_ERROR_STOP=1 -f - < "$HERE/train-d-objects-tasks.seed.sql" >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- A. work_objects (20260817150000) ---"
apply "$M1" "M1"

obj() { as authenticated "$1" "select public.create_work_object_v1('$2','$3',null,'LT',null,'Vilnius',null,null,null);" | tok; }
check "anon cannot create"        "DENIED"      "$(as anon "" "select public.create_work_object_v1('$ORG1','Site A',null,'LT',null,null,null,null,null);" | tok)"
check "member create refused"     "not_allowed" "$(obj "$MEMBER"   "$ORG1" "Site A")"
check "stranger create refused"   "not_allowed" "$(obj "$STRANGER" "$ORG1" "Site A")"
check "wrong-org owner refused"   "not_allowed" "$(obj "$OTHER"    "$ORG1" "Site A")"
check "owner creates"             "created"     "$(obj "$OWNER"    "$ORG1" "Site A")"
check "manager creates"           "created"     "$(obj "$MANAGER"  "$ORG1" "Site B")"
check "bad country invalid"       "invalid"     "$(as authenticated "$OWNER" "select public.create_work_object_v1('$ORG1','Site C',null,'Lithuania',null,null,null,null,null);" | tok)"
check "half coordinate invalid"   "invalid"     "$(as authenticated "$OWNER" "select public.create_work_object_v1('$ORG1','Site C',null,'LT',null,null,null,54.7,null);" | tok)"
check "cross-org project invalid" "invalid"     "$(as authenticated "$OWNER" "select public.create_work_object_v1('$ORG1','Site C','$P2','LT',null,null,null,null,null);" | tok)"

OBJ_A=$(q "select id from public.work_objects where name='Site A' limit 1;")
check "member reads org objects"   "2" "$(as authenticated "$MEMBER"   "select count(*) from public.work_objects;" | tok)"
check "engaged worker reads too"   "2" "$(as authenticated "$WORKERP"  "select count(*) from public.work_objects;" | tok)"
check "stranger reads nothing"     "0" "$(as authenticated "$STRANGER" "select count(*) from public.work_objects;" | tok)"
check "anon select denied"         "DENIED" "$(as anon "" "select count(*) from public.work_objects;" | tok)"
check "direct insert revoked"      "DENIED" "$(as authenticated "$OWNER" "insert into public.work_objects (organization_id, name, created_by) values ('$ORG1','X','$OWNER');" | tok)"

check "member update refused"      "not_allowed" "$(as authenticated "$MEMBER" "select public.update_work_object_v1('$OBJ_A','Site A2',null,'LT',null,null,null,null,null);" | tok)"
check "stranger update = not_found" "not_found"  "$(as authenticated "$STRANGER" "select public.update_work_object_v1('$OBJ_A','Site A2',null,'LT',null,null,null,null,null);" | tok)"
check "manager updates"            "updated"     "$(as authenticated "$MANAGER" "select public.update_work_object_v1('$OBJ_A','Site A2','$P1','LT',null,'Kaunas','Main st 5',54.9,23.9);" | tok)"
check "manager archives"           "updated"     "$(as authenticated "$MANAGER" "select public.set_work_object_status_v1('$OBJ_A','archived');" | tok)"
check "manager restores"           "updated"     "$(as authenticated "$MANAGER" "select public.set_work_object_status_v1('$OBJ_A','active');" | tok)"
check "responsible: stranger target invalid" "invalid_target" "$(as authenticated "$MANAGER" "select public.set_work_object_responsible_v1('$OBJ_A','$STRANGER');" | tok)"
check "responsible: member target ok"        "updated"        "$(as authenticated "$MANAGER" "select public.set_work_object_responsible_v1('$OBJ_A','$MEMBER');" | tok)"
check "responsible: engaged worker ok"       "updated"        "$(as authenticated "$MANAGER" "select public.set_work_object_responsible_v1('$OBJ_A','$WORKERP');" | tok)"

echo
echo "--- B. work_tasks v2 collaboration (20260817151000) ---"
apply "$M2" "M2"

T1=$(as authenticated "$OWNER" "select public.create_work_task_v2('Task one',null,'normal','','$P1','$OBJ_A','$MEMBER');" | tok)
check_uuid "owner creates project task assigned to member" "$T1"
check "created event logged"       "1" "$(q "select count(*) from public.work_task_events where task_id='$T1' and action='created';")"
check "assignee sees the task"     "1" "$(as authenticated "$MEMBER" "select count(*) from public.work_tasks where id='$T1';" | tok)"
check "stranger sees nothing"      "0" "$(as authenticated "$STRANGER" "select count(*) from public.work_tasks where id='$T1';" | tok)"
check "assign-to-stranger refused" "invalid_assignee" "$(as authenticated "$OWNER" "select public.create_work_task_v2('Task x',null,'normal','','$P1','','$STRANGER');" | tok)"
check "member cannot create on P1" "not_allowed" "$(as authenticated "$MEMBER" "select public.create_work_task_v2('Task y',null,'normal','','$P1','','');" | tok)"
check "archived-or-foreign object refused" "invalid_object" "$(as authenticated "$OTHER" "select public.create_work_task_v2('Task z',null,'normal','','$P2','$OBJ_A','');" | tok)"

T2=$(as authenticated "$WORKERP" "select public.create_work_task_v2('My personal task',null,'low','','','','$WORKERP');" | tok)
check_uuid "worker creates personal self-assigned task" "$T2"
check "personal assign-to-other refused" "invalid_assignee" "$(as authenticated "$WORKERP" "select public.assign_work_task_v1('$T2','$MEMBER');" | tok)"

check "manager reassigns to engaged worker" "updated" "$(as authenticated "$MANAGER" "select public.assign_work_task_v1('$T1','$WORKERP');" | tok)"
check "assigned event logged"      "1" "$(q "select count(*) from public.work_task_events where task_id='$T1' and action='assigned' and after_state->>'assignee_profile_id'='$WORKERP';")"
check "assignee cannot reassign"   "not_allowed" "$(as authenticated "$WORKERP" "select public.assign_work_task_v1('$T1','$WORKERP');" | tok)"

check "status v2: start"           "updated" "$(as authenticated "$MANAGER" "select public.set_work_task_status_v2('$T1','in_progress');" | tok)"
check "status v2: complete"        "updated" "$(as authenticated "$MANAGER" "select public.set_work_task_status_v2('$T1','done');" | tok)"
check "status v2: done is terminal here" "invalid_transition" "$(as authenticated "$MANAGER" "select public.set_work_task_status_v2('$T1','todo');" | tok)"
check "reopen by assignee refused" "not_allowed" "$(as authenticated "$WORKERP" "select public.reopen_work_task_v1('$T1');" | tok)"
check "reopen by manager"          "updated" "$(as authenticated "$MANAGER" "select public.reopen_work_task_v1('$T1');" | tok)"
check "reopened -> in_progress"    "in_progress" "$(q "select status from public.work_tasks where id='$T1';")"
check "reopened event logged"      "1" "$(q "select count(*) from public.work_task_events where task_id='$T1' and action='reopened';")"

T3=$(as authenticated "$OWNER" "select public.create_work_task_v2('Task three',null,'normal','','$P1','','');" | tok)
T4=$(as authenticated "$OWNER" "select public.create_work_task_v2('Task four',null,'normal','','$P1','','');" | tok)
T5=$(as authenticated "$OTHER" "select public.create_work_task_v2('Other org task',null,'normal','','$P2','','');" | tok)
check "dep: T1 blocks T3"          "created" "$(as authenticated "$MANAGER" "select public.add_work_task_dependency_v1('$T1','$T3');" | tok)"
check "dep: direct cycle refused"  "cycle"   "$(as authenticated "$MANAGER" "select public.add_work_task_dependency_v1('$T3','$T1');" | tok)"
check "dep: T3 blocks T4"          "created" "$(as authenticated "$MANAGER" "select public.add_work_task_dependency_v1('$T3','$T4');" | tok)"
check "dep: transitive cycle refused" "cycle" "$(as authenticated "$MANAGER" "select public.add_work_task_dependency_v1('$T4','$T1');" | tok)"
check "dep: self edge invalid"     "invalid" "$(as authenticated "$MANAGER" "select public.add_work_task_dependency_v1('$T3','$T3');" | tok)"
check "dep: cross-org refused (admin sees both)" "invalid" "$(as authenticated "$OWNER" "select public.add_work_task_dependency_v1('$T5','$T3');" true | tok)"
check "dep: stranger gets not_found" "not_found" "$(as authenticated "$STRANGER" "select public.add_work_task_dependency_v1('$T1','$T3');" | tok)"
check "dep events on blocked task" "1" "$(q "select count(*) from public.work_task_events where task_id='$T3' and action='dependency_added';")"
check "dep: remove"                "updated" "$(as authenticated "$MANAGER" "select public.remove_work_task_dependency_v1('$T3','$T4');" | tok)"
check "dep removal event logged"   "1" "$(q "select count(*) from public.work_task_events where task_id='$T4' and action='dependency_removed';")"

check "events RLS: stranger sees none"  "0" "$(as authenticated "$STRANGER" "select count(*) from public.work_task_events where task_id='$T1';" | tok)"
check "events RLS: assignee sees rows"  "t" "$(as authenticated "$WORKERP" "select count(*) > 0 from public.work_task_events where task_id='$T1';" | tok)"
check "events: direct insert revoked"   "DENIED" "$(as authenticated "$MANAGER" "insert into public.work_task_events (task_id, action) values ('$T1','created');" | tok)"
check "events: direct update revoked"   "DENIED" "$(as authenticated "$MANAGER" "update public.work_task_events set action='reopened' where task_id='$T1';" | tok)"
check "deps: direct insert revoked"     "DENIED" "$(as authenticated "$MANAGER" "insert into public.task_dependencies (blocker_task_id, blocked_task_id, created_by) values ('$T1','$T4','$MANAGER');" | tok)"

echo
echo "--- C. project responsible (20260817152000) ---"
apply "$M3" "M3"
check "manager names member responsible" "updated" "$(as authenticated "$MANAGER" "select public.set_project_responsible_v1('$P1','$MEMBER');" | tok)"
check "audit row written"          "1" "$(q "select count(*) from public.audit_logs where action='set_project_responsible' and entity_id='$P1';")"
check "same target = idempotent"   "updated" "$(as authenticated "$MANAGER" "select public.set_project_responsible_v1('$P1','$MEMBER');" | tok)"
check "no duplicate audit row"     "1" "$(q "select count(*) from public.audit_logs where action='set_project_responsible' and entity_id='$P1';")"
check "stranger gets not_found"    "not_found" "$(as authenticated "$STRANGER" "select public.set_project_responsible_v1('$P1','$MEMBER');" | tok)"
check "assigned worker refused"    "not_allowed" "$(as authenticated "$WORKERP" "select public.set_project_responsible_v1('$P1','$MEMBER');" | tok)"
check "stranger target invalid"    "invalid_target" "$(as authenticated "$MANAGER" "select public.set_project_responsible_v1('$P1','$STRANGER');" | tok)"

echo
echo "--- D. notification v4 types (20260817153000) ---"
apply "$M4" "M4"
check "v4 type admitted" "INSERT 0 1" "$(q "insert into public.notification_events (recipient_profile_id, event_type, entity_type, entity_id, dedupe_key) values ('$MEMBER','work_task_assigned','work_task','$T1','work_task_assigned:$T1');")"
check "bogus type refused" "DENIED" "$(q "insert into public.notification_events (recipient_profile_id, event_type, entity_type, entity_id, dedupe_key) values ('$MEMBER','made_up','work_task','$T1','x:y');" | tok)"

echo
echo "--- E. rollbacks refuse on real data, succeed when clean (4→3→2→1) ---"
check "R4 refuses while v4 rows exist (constraint re-add fails)" "DENIED" "$(refuse "$R4")"
q "delete from public.notification_events where event_type='work_task_assigned';" >/dev/null
apply "$R4" "R4"
check "R4 clean: v4 type refused again" "DENIED" "$(q "insert into public.notification_events (recipient_profile_id, event_type, entity_type, entity_id, dedupe_key) values ('$MEMBER','work_task_assigned','work_task','$T1','a:b');" | tok)"

check "R3 refuses while a responsible is named" "DENIED" "$(refuse "$R3")"
as authenticated "$MANAGER" "select public.set_project_responsible_v1('$P1','');" >/dev/null
apply "$R3" "R3"
check "R3 clean: column gone" "0" "$(q "select count(*) from information_schema.columns where table_name='projects' and column_name='responsible_profile_id';")"

check "R2 refuses while history/edges exist" "DENIED" "$(refuse "$R2")"
q "update public.work_tasks set object_id = null; delete from public.task_dependencies; delete from public.work_task_events;" >/dev/null
apply "$R2" "R2"
check "R2 clean: object_id column gone" "0" "$(q "select count(*) from information_schema.columns where table_name='work_tasks' and column_name='object_id';")"
check "R2 clean: v2 create gone" "DENIED" "$(as authenticated "$OWNER" "select public.create_work_task_v2('T',null,'normal','','','','');" | tok)"

check "R1 refuses while objects exist" "DENIED" "$(refuse "$R1")"
q "delete from public.work_objects;" >/dev/null
apply "$R1" "R1"
check "R1 clean: table gone" "0" "$(q "select count(*) from information_schema.tables where table_name='work_objects';")"

echo
echo "--- F. re-apply all four in order — clean ---"
apply "$M1" "M1 re-apply"
apply "$M2" "M2 re-apply"
apply "$M3" "M3 re-apply"
apply "$M4" "M4 re-apply"
check "re-apply: owner creates object again" "created" "$(obj "$OWNER" "$ORG1" "Site fresh")"
T6=$(as authenticated "$OWNER" "select public.create_work_task_v2('Fresh task',null,'normal','','$P1','','$MEMBER');" | tok)
check_uuid "re-apply: assign-to-other works again" "$T6"
check "re-apply: responsible works again" "updated" "$(as authenticated "$MANAGER" "select public.set_project_responsible_v1('$P1','$MEMBER');" | tok)"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
