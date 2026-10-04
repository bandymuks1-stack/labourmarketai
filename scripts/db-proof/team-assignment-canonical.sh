#!/usr/bin/env bash
# ============================================================================
# TEAM ASSIGNMENT CANONICAL v1 — REAL PostgreSQL proof (no Docker, no Supabase).
#
# Proves migration 20261003150600_team_assignment_canonical_v1 (and its
# rollback) on a THROWAWAY native PostgreSQL cluster. Real prior migrations
# build work_objects / work_tasks; the rest of the platform (auth.uid(), roles,
# organizations/projects/workers/engagement_contexts, helper predicates copied
# from production) is stubbed in work-tasks-stage-subtask.prelude.sql +
# team-assignment-canonical.prelude2.sql.
#
# Every probe runs under `set role authenticated|anon` with a real
# request.jwt.claim.sub, so RLS / EXECUTE grants genuinely decide.
#
# Usage (Windows git-bash; ports 54290-54389 are outside the Windows excluded range):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/team-assignment-canonical.sh
# Never point this at production or at a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
MIGRATION="$M/20261003150600_team_assignment_canonical_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20261003150600_team_assignment_canonical_v1.down.sql"
LFD="$(mktemp -d)"
for f in "$M"/*.sql; do tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
tr -d '\r' < "$ROLLBACK" > "$LFD/rollback.down.sql"
M="$LFD"; MIGRATION="$LFD/20261003150600_team_assignment_canonical_v1.sql"; ROLLBACK="$LFD/rollback.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-tasks-stage-subtask.prelude.sql" \
         "$HERE/team-assignment-canonical.prelude2.sql" \
         "$M/20260817150000_work_objects_v1.sql" \
         "$M/20260711210000_work_tasks_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASELINE FAILED: $f"; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-assignment-canonical.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }

MA=33333333-3333-3333-3333-333333333333   # manager of org A and owner of teams A / A2
MB=66666666-6666-6666-6666-666666666666   # manager of org B / team B
U1=11111111-1111-1111-1111-111111111111   # member of team A (and A2)
U2=22222222-2222-2222-2222-222222222222   # member of team A
OUT=44444444-4444-4444-4444-444444444444  # org-B employee, NOT in team A
ADM=55555555-5555-5555-5555-555555555555
LEFT=77777777-7777-7777-7777-777777777777 # was in team A, left 2026-09-01
LATE=88888888-8888-8888-8888-888888888888 # joined team A 2026-10-01
STRANGER=00000000-0000-0000-0000-0000000000ff
P1=99999999-0000-0000-0000-000000000001
P2=99999999-0000-0000-0000-000000000002
PB=99999999-0000-0000-0000-00000000000b
TA=7ea00000-0000-0000-0000-00000000000a
TB=7ea00000-0000-0000-0000-00000000000b
TA2=7ea00000-0000-0000-0000-0000000000a2
TEMPTY=7ea00000-0000-0000-0000-0000000000ee
ORGA=aaaaaaaa-0000-0000-0000-000000000001
K1=7a5c0000-0000-0000-0000-000000000001   # task on P1
KB=7a5c0000-0000-0000-0000-000000000002   # task on PB
OBJ=0b1e0000-0000-0000-0000-000000000001  # work object on P1

pass=0; fail=0
as() { local who="$1"; shift
  local pre="set role authenticated; set request.jwt.claim.sub='$who';"
  [ "$who" = "anon" ] && pre="set role anon;"
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
aid() { printf '%s' "$1" | sed -n 's/.*"assignment_id": *"\([0-9a-f-]*\)".*/\1/p'; }

$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>/tmp/_mig_err_$$ || { echo "PROOF 1 FAILED — migration did not apply:"; cat /tmp/_mig_err_$$; exit 1; }
rm -f /tmp/_mig_err_$$
echo "PROOF 1 — migration applies cleanly on a real PostgreSQL server: PASS"; pass=$((pass+1))
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  migration re-applies idempotently"; pass=$((pass+1)); else echo "  FAIL  migration is not re-runnable"; fail=$((fail+1)); fi

echo; echo "== PROOF 2 — manager assigns a team to a project as ONE row"
R=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1');")
has "manager: outcome created" '"outcome": *"created"' "$R"
A1=$(aid "$R")
check "ONE team_assignments row" "1" "$(q "select count(*) from public.team_assignments;")"
check "NO per-person fan-out rows (project_worker_assignments)" "0" "$(q "select count(*) from public.project_worker_assignments;")"
check "row is active and project-level (no object, no task)" "active|true" "$(q "select status||'|'||(work_object_id is null and task_id is null) from public.team_assignments where id='$A1';")"
R2=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1');")
has "idempotent: second call = already_assigned" 'already_assigned' "$R2"
check "idempotent: same assignment id" "$A1" "$(aid "$R2")"
check "idempotent: still ONE row" "1" "$(q "select count(*) from public.team_assignments;")"

echo; echo "== PROOF 3 — who sees it"
check "manager reads the row" "1" "$(as $MA "select count(*) from public.team_assignments;")"
check "member One reads the row" "1" "$(as $U1 "select count(*) from public.team_assignments;")"
check "member Two reads the row" "1" "$(as $U2 "select count(*) from public.team_assignments;")"
check "admin reads the row" "1" "$(as $ADM "select count(*) from public.team_assignments;")"
check "manager lists CURRENT members through the relation (not Left Early)" "Joined Late,Member One,Member Two" "$(as $MA "select string_agg(full_name, ',' order by full_name) from public.list_team_assignment_members_v1(array['$A1']::uuid[]);")"
check "member sees ONLY their own member row" "Member One" "$(as $U1 "select string_agg(full_name, ',') from public.list_team_assignment_members_v1(array['$A1']::uuid[]);")"
check "member rows carry the worker id (hours/journal stay per person)" "aaaa1111-0000-0000-0000-000000000001" "$(as $U1 "select worker_id from public.list_team_assignment_members_v1(array['$A1']::uuid[]);")"

echo; echo "== PROOF 4 — denied actors"
for who in "$OUT:org-B employee, not in team" "$MB:other-org manager" "$STRANGER:ordinary worker, no relation"; do
  id="${who%%:*}"; label="${who#*:}"
  check "$label: reads 0 rows" "0" "$(as $id "select count(*) from public.team_assignments;")"
  has   "$label: assign refused" 'Not authorized' "$(as $id "select public.assign_team_to_work_v1('$TA','$P1');")"
  has   "$label: end refused" 'Not authorized' "$(as $id "select public.end_team_assignment_v1('$A1');")"
  check "$label: member list empty" "0" "$(as $id "select count(*) from public.list_team_assignment_members_v1(array['$A1']::uuid[]);")"
done
has   "NULL uid: assign refused" 'Not authenticated' "$(as '' "select public.assign_team_to_work_v1('$TA','$P1');")"
has   "NULL uid: end refused" 'Not authenticated' "$(as '' "select public.end_team_assignment_v1('$A1');")"
check "NULL uid: reads 0 rows" "0" "$(as '' "select count(*) from public.team_assignments;")"
has   "anon: select denied" 'permission denied' "$(as anon "select count(*) from public.team_assignments;")"
has   "anon: assign denied" 'permission denied' "$(as anon "select public.assign_team_to_work_v1('$TA','$P1');")"
has   "anon: end denied" 'permission denied' "$(as anon "select public.end_team_assignment_v1('$A1');")"
has   "anon: resolver denied" 'permission denied' "$(as anon "select * from public.team_assignments_for_work_v1('$U1','$P1');")"
has   "manager cannot INSERT directly" 'permission denied' "$(as $MA "insert into public.team_assignments(team_org_id,project_id) values ('$TA','$P2');")"
has   "manager cannot UPDATE directly" 'permission denied' "$(as $MA "update public.team_assignments set status='ended';")"
has   "manager cannot DELETE directly" 'permission denied' "$(as $MA "delete from public.team_assignments;")"
has   "member cannot INSERT directly" 'permission denied' "$(as $U1 "insert into public.team_assignments(team_org_id,project_id) values ('$TA','$P2');")"
has   "team_member_at_v1 is not callable by authenticated" 'permission denied' "$(as $MA "select public.team_member_at_v1('$TA','$U1',now());")"
has   "manager A cannot put team B on A's project (no team authority)" 'Not authorized' "$(as $MA "select public.assign_team_to_work_v1('$TB','$P1');")"
has   "manager B cannot put team A on B's project (no team authority)" 'Not authorized' "$(as $MB "select public.assign_team_to_work_v1('$TA','$PB');")"
has   "manager A cannot put team A on org B's project (no project authority)" 'Not authorized' "$(as $MA "select public.assign_team_to_work_v1('$TA','$PB');")"
check "no row was created by any refused attempt" "1" "$(q "select count(*) from public.team_assignments;")"

echo; echo "== PROOF 5 — scope: task / work object / validation"
has "task of ANOTHER project refused" 'task_not_assignable' "$(as $MA "select public.assign_team_to_work_v1('$TA','$P1',null,'$KB');")"
has "object + task together refused" 'one_scope_only' "$(as $MA "select public.assign_team_to_work_v1('$TA','$P1','$OBJ','$K1');")"
has "organization that is not a team refused" 'not_a_team' "$(as $ADM "select public.assign_team_to_work_v1('$ORGA','$P1');")"
has "team with no active members refused" 'team_has_no_members' "$(as $ADM "select public.assign_team_to_work_v1('$TEMPTY','$P1');")"
RT=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1',null,'$K1');"); AT=$(aid "$RT")
has "TASK-level team assignment created" 'created' "$RT"
RO=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1','$OBJ',null);"); AO=$(aid "$RO")
has "WORK-OBJECT-level team assignment created" 'created' "$RO"
check "three distinct active rows for the same team (project / task / object)" "3" "$(q "select count(*) from public.team_assignments where team_org_id='$TA' and ended_at is null;")"
check "task scope idempotent" "$AT" "$(aid "$(as $MA "select public.assign_team_to_work_v1('$TA','$P1',null,'$K1');")")"
check "still no per-person rows after task/object scopes" "0" "$(q "select count(*) from public.project_worker_assignments;")"
check "member sees all three rows" "3" "$(as $U1 "select count(*) from public.team_assignments;")"
su "update public.projects set status='completed' where id='$P2';" >/dev/null
has "completed project refused" 'project_completed' "$(as $MA "select public.assign_team_to_work_v1('$TA','$P2');")"

echo; echo "== PROOF 6 — credit goes to the people who were actually members then"
su "update public.team_assignments set assigned_at='2026-08-15' where id='$A1';" >/dev/null
at_() { as "$1" "select count(*) from public.team_assignments_for_work_v1('$2','$P1','$3');"; }
check "member One, now: attributed" "1" "$(at_ $U1 $U1 '2026-10-03T12:00:00Z')"
check "Left Early, 2026-08-20 (still a member): attributed" "1" "$(at_ $MA $LEFT '2026-08-20T12:00:00Z')"
check "Left Early, 2026-09-05 (after leaving): NOT credited" "0" "$(at_ $MA $LEFT '2026-09-05T12:00:00Z')"
check "Left Early, now: NOT credited" "0" "$(at_ $MA $LEFT '2026-10-03T12:00:00Z')"
check "Joined Late, 2026-09-05 (before joining): NOT credited" "0" "$(at_ $MA $LATE '2026-09-05T12:00:00Z')"
check "Joined Late, 2026-10-03 (member): attributed" "1" "$(at_ $MA $LATE '2026-10-03T12:00:00Z')"
check "before the assignment began (2026-08-01): NOT credited" "0" "$(at_ $MA $U1 '2026-08-01T12:00:00Z')"
check "outsider (not a member) never attributed" "0" "$(at_ $MA $OUT '2026-10-03T12:00:00Z')"
check "a stranger cannot probe someone else's attribution" "0" "$(at_ $OUT $U1 '2026-10-03T12:00:00Z')"
check "a peer member cannot probe a colleague's attribution" "0" "$(at_ $U2 $U1 '2026-10-03T12:00:00Z')"
check "ended membership with NO ended_at covers no past instant" "f" "$(q "select public.team_member_at_v1('$TB','$OUT','2026-06-01T00:00:00Z');")"
check "manager listing as of 2026-08-20 includes Left Early, excludes Joined Late" "Left Early,Member One,Member Two" "$(as $MA "select string_agg(full_name, ',' order by full_name) from public.list_team_assignment_members_v1(array['$A1']::uuid[],'2026-08-20T12:00:00Z');")"

echo; echo "== PROOF 7 — replace, end, history"
RR=$(as $MA "select public.assign_team_to_work_v1('$TA2','$P1',null,null,'$A1');")
has "replace: outcome created-with-replacement" 'replaced' "$RR"
AR=$(aid "$RR")
check "old row ended with reason replaced and pointing at the new row" "ended|replaced|$AR" "$(q "select status||'|'||end_reason||'|'||replaced_by_id from public.team_assignments where id='$A1';")"
check "exactly one ACTIVE project-level row now" "1" "$(q "select count(*) from public.team_assignments where project_id='$P1' and work_object_id is null and task_id is null and ended_at is null;")"
has "replacing a row that is not active refused" 'replace_target_not_active' "$(as $MA "select public.assign_team_to_work_v1('$TA2','$P1',null,'$K1','$A1');")"
check "end: outcome ended" "ended" "$(as $MA "select public.end_team_assignment_v1('$AT','crew moved');")"
check "end: idempotent" "already_ended" "$(as $MA "select public.end_team_assignment_v1('$AT');")"
check "end keeps the row (append-friendly) with a reason" "ended|crew moved" "$(q "select status||'|'||end_reason from public.team_assignments where id='$AT';")"
su "insert into public.engagement_contexts(profile_id,organization_id,status,relationship_slug) values ('$MB','$ORGA','active','manager');" >/dev/null
check "a manager of the PROJECT's org (not the team's) can end it" "ended" "$(as $MB "select public.end_team_assignment_v1('$AO');")"
as $MA "select public.assign_team_to_work_v1('$TA','$P1',null,'$K1');" >/dev/null
check "re-assign after end creates a NEW row (history kept: 2 rows for the task)" "2" "$(q "select count(*) from public.team_assignments where task_id='$K1';")"
check "audit rows written (assign / replace / end)" "t" "$(q "select count(*) filter (where action='team_assigned_v1')>0 and count(*) filter (where action='team_assignment_replaced_v1')=1 and count(*) filter (where action='team_assignment_ended_v1')>=2 from public.audit_logs;")"
check "still ZERO per-person assignment rows after the whole lifecycle" "0" "$(q "select count(*) from public.project_worker_assignments;")"

echo; echo "== PROOF 8 — rollback refuses with history, then removes exactly the additions"
out="$($PSQL -f "$ROLLBACK" 2>&1 | tr -d '\r')"
has "rollback REFUSES while rows exist" 'rollback refused' "$out"
check "table still present after refusal" "1" "$(q "select count(*) from pg_class where relname='team_assignments';")"
su "delete from public.team_assignments;" >/dev/null
out="$($PSQL -v ON_ERROR_STOP=1 -f "$ROLLBACK" 2>&1 | tr -d '\r')"; rc=$?
check "rollback succeeds with zero rows" "0" "$rc"
check "tables/indexes, five functions, policy all gone" "0|0|0" "$(q "select (select count(*) from pg_class where relname like 'team_assignments%')||'|'||(select count(*) from pg_proc where proname in ('team_member_at_v1','assign_team_to_work_v1','end_team_assignment_v1','list_team_assignment_members_v1','team_assignments_for_work_v1'))||'|'||(select count(*) from pg_policy where polname='team_assignments_select_v1');")"
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  forward migration re-applies after rollback (round trip)"; pass=$((pass+1)); else echo "  FAIL  re-apply after rollback"; fail=$((fail+1)); fi

echo; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
