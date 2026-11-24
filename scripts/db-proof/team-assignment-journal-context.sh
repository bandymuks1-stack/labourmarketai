#!/usr/bin/env bash
# ============================================================================
# TEAM ASSIGNMENT -> JOURNAL / WORK CONTEXT — REAL PostgreSQL proof.
#
# Proves migration 20261003150700_brigade_journal_context_v1 (and its
# rollback) on a THROWAWAY native PostgreSQL cluster, on top of
# 20261003150600_brigade_work_assignment_v1. The prior bodies of the five
# replaced functions + two policies are installed from the rollback file, whose
# md5 fingerprints are compared with the LIVE production fingerprints.
#
# Sibling of team-assignment-canonical.sh (same prelude + seed, plus
# team-assignment-journal-context.seed.sql).
#
# Usage (Windows git-bash; pick a free port, the default fails on this machine):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58734 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58734 bash scripts/db-proof/team-assignment-journal-context.sh
# Never point this at production or at a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
LFD="$(mktemp -d)"
for f in "$M"/*.sql; do tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
tr -d '\r' < "$REPO/supabase/rollbacks/20261003150700_brigade_journal_context_v1.down.sql" > "$LFD/rollback2.down.sql"
tr -d '\r' < "$REPO/supabase/rollbacks/20261003150600_brigade_work_assignment_v1.down.sql" > "$LFD/rollback1.down.sql"
M="$LFD"
MIG1="$M/20261003150600_brigade_work_assignment_v1.sql"
MIG2="$M/20261003150700_brigade_journal_context_v1.sql"
RB1="$M/rollback1.down.sql"
RB2="$M/rollback2.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-58734}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-tasks-stage-subtask.prelude.sql" \
         "$HERE/team-assignment-canonical.prelude2.sql" \
         "$M/20260817150000_work_objects_v1.sql" \
         "$M/20260711210000_work_tasks_v1.sql" \
         "$M/20260718140000_project_operations_stages.sql" \
         "$M/20260817151000_work_tasks_v2_collaboration.sql" \
         "$M/20260819190000_journal_task_evidence_link_v1.sql" \
         "$M/20261002141500_work_task_authz_null_safe_v1.sql" \
         "$M/20261002150000_work_tasks_stage_and_subtask_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_base_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_base_err_$$; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-assignment-canonical.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-assignment-journal-context.seed.sql" >/dev/null || { echo "seed2 FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$MIG1" >/dev/null 2>&1 || { echo "MIGRATION 1 FAILED"; exit 1; }
# The prior bodies: the rollback file restores the live production bodies. On a database
# that does not have the new functions yet it simply installs them over the repo's older
# lineage; its "drop function if exists" lines are harmless.
$PSQL -v ON_ERROR_STOP=1 -f "$RB2" >/dev/null 2>/tmp/_rb_err_$$ || { echo "BASELINE (live bodies) FAILED"; cat /tmp/_rb_err_$$; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -c "create or replace function public.create_journal_entry_full(p_worker_id uuid, p_engagement_context_id uuid, p_entry_type_slug text, p_profession_id uuid, p_original_text text, p_original_language character, p_hash_prev text, p_hash_self text, p_visibility_scope text, p_metrics jsonb) returns uuid language sql set search_path to 'public' as \$f\$ select public.create_journal_entry_full(p_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id, p_original_text, p_original_language, p_hash_prev, p_hash_self, p_visibility_scope, p_metrics, null::uuid, false) \$f\$;" >/dev/null
# Production ACL of these functions is {postgres, authenticated} (anon: no execute; read-only
# SELECT 2026-10-04). The scratch baseline mimics it so the ACL comparison below is meaningful.
$PSQL -v ON_ERROR_STOP=1 -c "
revoke all on function public.create_journal_entry_full(uuid,uuid,text,uuid,text,character,text,text,text,jsonb) from public, anon;
revoke all on function public.create_journal_entry_full(uuid,uuid,text,uuid,text,character,text,text,text,jsonb,uuid,boolean) from public, anon;
revoke all on function public.is_assigned_to_project(uuid) from public, anon;
revoke all on function public.link_journal_entry_to_task_v1(text,text) from public, anon;
revoke all on function public.send_work_instruction_to_project(text,text,text,text) from public, anon;
grant execute on function public.create_journal_entry_full(uuid,uuid,text,uuid,text,character,text,text,text,jsonb) to authenticated;
grant execute on function public.create_journal_entry_full(uuid,uuid,text,uuid,text,character,text,text,text,jsonb,uuid,boolean) to authenticated;
grant execute on function public.is_assigned_to_project(uuid) to authenticated;
grant execute on function public.link_journal_entry_to_task_v1(text,text) to authenticated;
grant execute on function public.send_work_instruction_to_project(text,text,text,text) to authenticated;" >/dev/null || { echo "ACL baseline FAILED"; exit 1; }

MA=33333333-3333-3333-3333-333333333333
MB=66666666-6666-6666-6666-666666666666
U1=11111111-1111-1111-1111-111111111111
U2=22222222-2222-2222-2222-222222222222
OUT=44444444-4444-4444-4444-444444444444
ADM=55555555-5555-5555-5555-555555555555
LEFT=77777777-7777-7777-7777-777777777777
LATE=88888888-8888-8888-8888-888888888888
PERS=99999999-9999-9999-9999-999999999999   # PERSON-assigned worker (roster), no team
WU1=aaaa1111-0000-0000-0000-000000000001
WU2=aaaa2222-0000-0000-0000-000000000002
WOUT=aaaa4444-0000-0000-0000-000000000004
WLEFT=aaaa7777-0000-0000-0000-000000000007
WLATE=aaaa8888-0000-0000-0000-000000000008
WPERS=aaaa9999-0000-0000-0000-000000000009
P1=99999999-0000-0000-0000-000000000001
P2=99999999-0000-0000-0000-000000000002
PB=99999999-0000-0000-0000-00000000000b
TA=7ea00000-0000-0000-0000-00000000000a
TA2=7ea00000-0000-0000-0000-0000000000a2
K1=7a5c0000-0000-0000-0000-000000000001   # task on P1 (no object)
K2=7a5c0000-0000-0000-0000-000000000003   # task on P1 inside work object OBJ
OBJ=0b1e0000-0000-0000-0000-000000000001
ORGA=aaaaaaaa-0000-0000-0000-000000000001
ORGB=bbbbbbbb-0000-0000-0000-000000000002
# engagement contexts (see seed2): U1 has ctxA (employee of org A), ctxT (employee of team A), ctxX (org B)
ctx() { $PSQL -c "select id from public.engagement_contexts where profile_id='$1' and organization_id='$2' and relationship_slug='employee' limit 1;" | head -1; }
CU1A=$(ctx $U1 $ORGA); CU1T=$(ctx $U1 $TA); CU1X=$(ctx $U1 $ORGB)
CU2T=$(ctx $U2 $TA); CU2A=$(ctx $U2 $ORGA)
COUT=$(ctx $OUT $ORGB); CLEFT=$(ctx $LEFT $TA); CLEFTA=$(ctx $LEFT $ORGA); CLATE=$(ctx $LATE $TA)
CPERS=$(ctx $PERS $ORGA)

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
# new journal entry through the REAL RPC: who, worker, ctx, project|null, explicit(true|false)
mk() { local pj="null::uuid"; [ "$4" != "null" ] && pj="'$4'::uuid"; as "$1" "select public.create_journal_entry_full('$2','$3','freeform',null,'text','lt','h','h$RANDOM','closed','[]'::jsonb,$pj,$5);"; }
projof() { q "select coalesce(project_id::text,'none') from public.journal_entries where id='$1';"; }
fp() { $PSQL -c "select p.oid::regprocedure::text||' '||md5(pg_get_functiondef(p.oid))||' '||coalesce(p.proacl::text,'-')
  from pg_proc p where p.pronamespace='public'::regnamespace
  and p.proname in ('create_journal_entry_full','link_journal_entry_to_task_v1','is_assigned_to_project','send_work_instruction_to_project') order by 1;" | tr -d '\r'; }
pol() { $PSQL -c "select polname||' '||md5(pg_get_expr(polqual, polrelid)) from pg_policy where polname in ('wt_select','project_stages_select') order by 1;" | tr -d '\r'; }

# Production md5 of the same four functions (read-only SELECT on 2026-10-04).
PROD_FP="create_journal_entry_full(uuid,uuid,text,uuid,text,character,text,text,text,jsonb,uuid,boolean) a4066d8ac6cb055f43699ab7088601da
is_assigned_to_project(uuid) 3548a5d11f9d053cc38044202660f805
link_journal_entry_to_task_v1(text,text) bfc14f8da769b15b5c1d7de65c37ab6b
send_work_instruction_to_project(text,text,text,text) 0f79f46ede3be435bd17dfa8b237f732"
FP0="$(fp)"; POL0="$(pol)"
PROD_SEEN="$(printf '%s\n' "$FP0" | awk '{print $1" "$2}' | grep -v "jsonb) " )"
check "PROOF 0 — baseline bodies equal the LIVE production md5s" "$PROD_FP" "$PROD_SEEN"

$PSQL -v ON_ERROR_STOP=1 -f "$MIG2" >/dev/null 2>/tmp/_mig_err_$$ || { echo "PROOF 1 FAILED — migration 2 did not apply:"; cat /tmp/_mig_err_$$; exit 1; }
echo "PROOF 1 — migration 2 applies cleanly on top of migration 1: PASS"; pass=$((pass+1))
if $PSQL -v ON_ERROR_STOP=1 -f "$MIG2" >/dev/null 2>&1; then echo "  PASS  migration 2 re-applies idempotently"; pass=$((pass+1)); else echo "  FAIL  migration 2 is not re-runnable"; fail=$((fail+1)); fi
check "ACLs unchanged by CREATE OR REPLACE (4 fns)" "$(printf '%s\n' "$FP0" | awk '{print $1" "$3}')" "$(fp | awk '{print $1" "$3}')"

echo; echo "== PROOF 2 — before any team assignment nothing changes"
R=$(mk $U1 $WU1 $CU1T $P1 true); has "member of an UNASSIGNED team: explicit P1 refused" 'project_not_assignable' "$R"
R=$(mk $U1 $WU1 $CU1T null false); E0=$(printf '%s' "$R" | head -1)
check "member, no assignment, auto-link: entry has NO project" "none" "$(projof $E0)"
check "is_assigned_to_project: false for a team member before assignment" "f" "$(as $U1 "select public.is_assigned_to_project('$P1');")"

echo; echo "== PROOF 3 — person-assigned worker flow is UNCHANGED"
R=$(mk $PERS $WPERS $CPERS $P1 true); EP=$(printf '%s' "$R" | head -1)
check "person on the roster: explicit P1 still works" "$P1" "$(projof $EP)"
R=$(mk $PERS $WPERS $CPERS null false); EPA=$(printf '%s' "$R" | head -1)
check "person on the roster: auto-link still picks the one project" "$P1" "$(projof $EPA)"
check "person on the roster: is_assigned_to_project true" "t" "$(as $PERS "select public.is_assigned_to_project('$P1');")"
check "person on the roster, other project: still refused" "project_not_assignable" "$(mk $PERS $WPERS $CPERS $P2 true | grep -o project_not_assignable | head -1)"

echo; echo "== PROOF 4 — team assigned (PROJECT scope): members work in the context"
RA=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1');"); A1=$(aid "$RA")
R=$(mk $U1 $WU1 $CU1T $P1 true); E1=$(printf '%s' "$R" | head -1)
check "member One, ctx = team org: explicit P1 entry created, project=P1" "$P1" "$(projof $E1)"
check "AUTHOR is the person (worker_id = member), never the team" "$WU1" "$(q "select worker_id from public.journal_entries where id='$E1';")"
R=$(mk $U1 $WU1 $CU1A $P1 true); E1b=$(printf '%s' "$R" | head -1)
check "member One, ctx = project org: explicit P1 entry created" "$P1" "$(projof $E1b)"
R=$(mk $U1 $WU1 $CU1T null false); E1c=$(printf '%s' "$R" | head -1)
check "member One: auto-link (no choice) attributes the team's project" "$P1" "$(projof $E1c)"
R=$(mk $U2 $WU2 $CU2T $P1 true); E2=$(printf '%s' "$R" | head -1)
check "member Two creates their own entry (author = Two)" "$WU2" "$(q "select worker_id from public.journal_entries where id='$E2';")"
has "member One, ctx = UNRELATED org B: refused (context must be project org or team org)" 'project_not_assignable' "$(mk $U1 $WU1 $CU1X $P1 true)"
has "member One: team's project but OTHER project P2 refused" 'project_not_assignable' "$(mk $U1 $WU1 $CU1T $P2 true)"
has "org-B outsider: refused" 'project_not_assignable' "$(mk $OUT $WOUT $COUT $P1 true)"
has "outsider cannot attribute using a MEMBER's worker id" 'project_not_assignable|row-level security' "$(mk $OUT $WU1 $CU1T $P1 true)"
has "other-org manager cannot either" 'project_not_assignable|row-level security' "$(mk $MB $WU1 $CU1T $P1 true)"
has "NULL uid: refused" 'project_not_assignable|row-level security' "$(mk '' $WU1 $CU1T $P1 true)"
has "anon: denied" 'permission denied' "$(mk anon $WU1 $CU1T $P1 true)"
check "no entry was written by any refused attempt" "0" "$(q "select count(*) from public.journal_entries where worker_id in ('$WOUT') ;")"
check "NO project_worker_assignments row was created by the team assignment (only the 1 roster person)" "1" "$(q "select count(*) from public.project_worker_assignments;")"
check "is_assigned_to_project: member true" "t" "$(as $U1 "select public.is_assigned_to_project('$P1');")"
check "is_assigned_to_project: other project false" "f" "$(as $U1 "select public.is_assigned_to_project('$P2');")"
check "is_assigned_to_project: outsider false" "f" "$(as $OUT "select public.is_assigned_to_project('$P1');")"
check "is_assigned_to_project: NULL uid false (no error)" "f" "$(as '' "select public.is_assigned_to_project('$P1');")"
check "project_stages visible to a member (via is_assigned_to_project)" "1" "$(as $U1 "select count(*) from public.project_stages where project_id='$P1';")"
check "project_stages hidden from an outsider" "0" "$(as $OUT "select count(*) from public.project_stages where project_id='$P1';")"
check "my_team_work_contexts_v1: member sees the project + team name" "$P1|Brigade A" "$(as $U1 "select project_id||'|'||team_name from public.my_team_work_contexts_v1() where task_id is null and work_object_id is null;")"
check "my_team_work_contexts_v1: outsider sees nothing" "0" "$(as $OUT "select count(*) from public.my_team_work_contexts_v1();")"
check "my_team_work_contexts_v1: Left Early sees nothing" "0" "$(as $LEFT "select count(*) from public.my_team_work_contexts_v1();")"
has "my_team_work_contexts_v1: anon denied" 'permission denied' "$(as anon "select * from public.my_team_work_contexts_v1();")"
check "my_team_work_contexts_v1: NULL uid empty" "0" "$(as '' "select count(*) from public.my_team_work_contexts_v1();")"
has "team_work_context_v1: anon denied" 'permission denied' "$(as anon "select public.team_work_context_v1('$U1','$P1');")"

echo; echo "== PROOF 5 — left before / joined after are not credited"
has "Left Early (left 2026-09-01): refused now" 'project_not_assignable' "$(mk $LEFT $WLEFT $CLEFT $P1 true)"
has "Left Early via the project-org context: refused too" 'project_not_assignable|row-level' "$(mk $LEFT $WLEFT ${CLEFTA:-$CLEFT} $P1 true)"
at_() { as $MA "select public.team_work_context_v1('$1','$P1',null,null,'$2'::timestamptz);"; }
su "update public.team_assignments set assigned_at='2026-08-15' where id='$A1';" >/dev/null
check "helper, Left Early on 2026-08-20 (was a member): credited" "t" "$(at_ $LEFT 2026-08-20T12:00:00Z)"
check "helper, Left Early on 2026-09-05 (after leaving): NOT credited" "f" "$(at_ $LEFT 2026-09-05T12:00:00Z)"
check "helper, Joined Late on 2026-09-05 (before joining): NOT credited" "f" "$(at_ $LATE 2026-09-05T12:00:00Z)"
check "helper, Joined Late now: credited" "t" "$(at_ $LATE 2026-10-04T12:00:00Z)"
check "helper, before the assignment began: NOT credited" "f" "$(at_ $U1 2026-08-01T12:00:00Z)"
check "helper: a peer cannot probe a colleague (no oracle)" "f" "$(as $U2 "select public.team_work_context_v1('$U1','$P1');")"

echo; echo "== PROOF 5b — current members of a team BEFORE any assignment (assistant draft clash verdict)"
check "team manager lists the CURRENT members (Left Early excluded)" "Joined Late,Member One,Member Two" "$(as $MA "select string_agg(full_name, ',' order by full_name) from public.list_team_members_now_v1('$TA');")"
check "members carry their worker id (the calendar check is per person)" "aaaa1111-0000-0000-0000-000000000001" "$(as $MA "select worker_id from public.list_team_members_now_v1('$TA') where profile_id='$U1';")"
check "a plain member (not a manager) gets nothing" "0" "$(as $U1 "select count(*) from public.list_team_members_now_v1('$TA');")"
check "an outsider and an other-org manager get nothing" "00" "$(as $OUT "select count(*) from public.list_team_members_now_v1('$TA');")$(as $MB "select count(*) from public.list_team_members_now_v1('$TA');")"
has "anon: denied" 'permission denied' "$(as anon "select * from public.list_team_members_now_v1('$TA');")"
has "NULL uid: refused" 'Not authenticated' "$(as '' "select * from public.list_team_members_now_v1('$TA');")"

echo; echo "== PROOF 6 — scope: task / work object / project"
su "update public.team_assignments set assigned_at='2026-08-15' where id='$A1';" >/dev/null
check "PROJECT-scope team: member does NOT see task K1 (not an assignee of every task)" "0" "$(as $U1 "select count(*) from public.work_tasks where id='$K1';")"
check "PROJECT-scope team: link entry to K1 refused (not_found, no oracle)" "not_found" "$(as $U1 "select public.link_journal_entry_to_task_v1('$E1','$K1');")"
RT=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1',null,'$K1');"); AT=$(aid "$RT")
check "TASK-scope team: member sees K1" "1" "$(as $U1 "select count(*) from public.work_tasks where id='$K1';")"
check "TASK-scope team: member does NOT see the other task K2" "0" "$(as $U1 "select count(*) from public.work_tasks where id='$K2';")"
check "TASK-scope team: outsider sees 0" "0" "$(as $OUT "select count(*) from public.work_tasks where id='$K1';")"
check "TASK-scope team: link the member's project entry to K1" "ok" "$(as $U1 "select public.link_journal_entry_to_task_v1('$E1','$K1');")"
check "TASK-scope team: idempotent re-link" "already_linked" "$(as $U1 "select public.link_journal_entry_to_task_v1('$E1','$K1');")"
check "TASK-scope team: entry WITHOUT a project (team-org ctx) links via the team context" "ok" "$(as $U1 "select public.link_journal_entry_to_task_v1('$E0','$K1');")"
check "TASK-scope team: link to K2 (not the team's task) refused" "not_found" "$(as $U1 "select public.link_journal_entry_to_task_v1('$E1','$K2');")"
check "TASK-scope team: outsider cannot link a member's entry" "not_found" "$(as $OUT "select public.link_journal_entry_to_task_v1('$E1','$K1');")"
check "TASK-scope team: member Two (also in the team) links own entry" "ok" "$(as $U2 "select public.link_journal_entry_to_task_v1('$E2','$K1');")"
check "the individual attribution on the link is the PERSON (linked_by = member)" "$U1" "$(q "select linked_by from public.journal_entry_tasks where entry_id='$E1' and task_id='$K1' and unlinked_at is null;")"
RO=$(as $MA "select public.assign_team_to_work_v1('$TA','$P1','$OBJ',null);"); AO=$(aid "$RO")
check "WORK-OBJECT-scope team: member sees the task inside the object (K2)" "1" "$(as $U1 "select count(*) from public.work_tasks where id='$K2';")"
check "WORK-OBJECT-scope team: link to K2 ok" "ok" "$(as $U1 "select public.link_journal_entry_to_task_v1('$E1','$K2');")"
check "still ONE roster row only after all scopes (no fan-out)" "1" "$(q "select count(*) from public.project_worker_assignments;")"

echo; echo "== PROOF 7 — work instruction door"
has "manager instructs a TEAM member on the project" '^[0-9a-f-]{36}$' "$(as $MA "select public.send_work_instruction_to_project('$U1','Start at 7','lt','$P1');")"
has "manager instructing a non-member refused" 'Not authorized' "$(as $MA "select public.send_work_instruction_to_project('$OUT','x','lt','$P1');")"
has "manager instructing Left Early refused" 'Not authorized' "$(as $MA "select public.send_work_instruction_to_project('$LEFT','x','lt','$P1');")"
has "a member cannot instruct (not a manager)" 'Not authorized' "$(as $U1 "select public.send_work_instruction_to_project('$U2','x','lt','$P1');")"

echo; echo "== PROOF 8 — two teams on the same project do not double-count; replacement withdraws"
as $MA "select public.assign_team_to_work_v1('$TA2','$P1');" >/dev/null
R=$(mk $U1 $WU1 $CU1T null false); E8=$(printf '%s' "$R" | head -1)
check "member of TWO assigned teams: auto-link still ONE distinct project" "$P1" "$(projof $E8)"
N0=$(q "select count(*) from public.journal_entries;"); H0=$(q "select md5(string_agg(id||coalesce(project_id::text,'-')||worker_id||original_text, ',' order by id)) from public.journal_entries;")
RR=$(as $MA "select public.assign_team_to_work_v1('$TA2','$P1',null,null,'$A1');")
as $MA "select public.end_team_assignment_v1('$AT','done');" >/dev/null
as $MA "select public.end_team_assignment_v1('$AO','done');" >/dev/null
check "after replacing TA by TA2 (project scope): member One (in TA2 too) still works" "$P1" "$(projof "$(mk $U1 $WU1 $CU1A $P1 true | head -1)")"
has "member Two (NOT in TA2): new entry refused after the replacement" 'project_not_assignable' "$(mk $U2 $WU2 $CU2T $P1 true)"
check "member Two: is_assigned_to_project now false" "f" "$(as $U2 "select public.is_assigned_to_project('$P1');")"
check "member Two: no longer sees the project in my_team_work_contexts_v1" "0" "$(as $U2 "select count(*) from public.my_team_work_contexts_v1();")"
check "member Two: the ended task assignment no longer shows K1" "0" "$(as $U2 "select count(*) from public.work_tasks where id='$K1';")"
check "member Two's PAST entry is intact (project, author)" "$P1|$WU2" "$(q "select project_id||'|'||worker_id from public.journal_entries where id='$E2';")"
check "member Two's PAST evidence link is intact" "1" "$(q "select count(*) from public.journal_entry_tasks where entry_id='$E2' and task_id='$K1' and unlinked_at is null;")"
check "helper still resolves a PAST instant inside the ended assignment (history readable)" "t" "$(as $MA "select public.team_work_context_v1('$U2','$P1',null,null,'2026-09-10T12:00:00Z');")"
as $MA "select public.end_team_assignment_v1('$(aid "$RR")','finished');" >/dev/null
has "after ALL team assignments ended: member One refused" 'project_not_assignable' "$(mk $U1 $WU1 $CU1T $P1 true)"
check "ended: is_assigned_to_project false for One" "f" "$(as $U1 "select public.is_assigned_to_project('$P1');")"
check "ended: no stage visibility" "0" "$(as $U1 "select count(*) from public.project_stages where project_id='$P1';")"
H1=$(q "select md5(string_agg(id||coalesce(project_id::text,'-')||worker_id||original_text, ',' order by id)) from public.journal_entries;")
check "ended/replaced assignments rewrote NO past journal entry (hash over the 8 old entries' project/author/text)" "$H0" "$(q "select md5(string_agg(id||coalesce(project_id::text,'-')||worker_id||original_text, ',' order by id)) from public.journal_entries where id in (select id from public.journal_entries where created_at <= (select max(created_at) from public.journal_entries where id='$E8') );")"
check "journal entry count only grew by the entries created in this block" "t" "$(q "select count(*) >= $N0 from public.journal_entries;")"

echo; echo "== PROOF 9 — completed project withdraws the context"
as $MA "select public.assign_team_to_work_v1('$TA','$P2');" >/dev/null
check "P2 team context active before completion" "t" "$(as $U1 "select public.is_assigned_to_project('$P2');")"
su "update public.projects set status='completed' where id='$P2';" >/dev/null
check "P2 completed: is_assigned_to_project false" "f" "$(as $U1 "select public.is_assigned_to_project('$P2');")"
has "P2 completed: new explicit entry refused" 'project_not_assignable' "$(mk $U1 $WU1 $CU1A $P2 true)"

echo; echo "== PROOF 10 — rollback restores the exact prior bodies, ACLs and policies"
out="$($PSQL -v ON_ERROR_STOP=1 -f "$RB2" 2>&1 | tr -d '\r')"; rc=$?
check "rollback 2 succeeds" "0" "$rc"
check "four function bodies + ACLs identical to the pre-migration fingerprints" "$FP0" "$(fp)"
check "both policies identical to the pre-migration policies" "$POL0" "$(pol)"
check "the two added functions are gone" "0" "$(q "select count(*) from pg_proc where proname in ('team_work_context_v1','my_team_work_contexts_v1');")"
check "past journal rows untouched by the rollback" "t" "$(q "select count(*) >= $N0 from public.journal_entries;")"
as $MA "select public.assign_team_to_work_v1('$TA','$P1');" >/dev/null
has "after rollback a team member is refused again (person-only behaviour restored)" 'project_not_assignable' "$(mk $U1 $WU1 $CU1T $P1 true)"
if $PSQL -v ON_ERROR_STOP=1 -f "$MIG2" >/dev/null 2>&1; then echo "  PASS  forward migration re-applies after rollback (round trip)"; pass=$((pass+1)); else echo "  FAIL  re-apply after rollback"; fail=$((fail+1)); fi
R=$(mk $U1 $WU1 $CU1T $P1 true); check "after the round trip the team member works again" "$P1" "$(projof "$(printf '%s' "$R" | head -1)")"

echo; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
