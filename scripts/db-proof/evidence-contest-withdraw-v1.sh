#!/usr/bin/env bash
# ============================================================================
# EVID contest -> withdraw -> re-contest: RUNTIME proof of the authority model.
#
# Reuses the production-faithful harness of the RED #4 proof
# (subject-contest-and-clash-receipt.prelude/seed.sql), applies the LIVE
# migration 20260915180000 first (so the starting point is what production
# holds), then applies 20261003110000_subject_contest_withdraw_v1.sql VERBATIM
# and measures every case as the non-owner role `authenticated` / `anon`.
#
# Usage (scratch Postgres 16, no Docker):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54377 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54377 bash scripts/db-proof/evidence-contest-withdraw-v1.sh
# Throwaway only. Never point this at production or a shared local stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-54377}"
DB="evwd"
ADMIN="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB"
LIVE="$REPO/supabase/migrations/20260915180000_subject_contest_and_clash_receipt.sql"
MIG="$REPO/supabase/migrations/20261003110000_subject_contest_withdraw_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261003110000_subject_contest_withdraw_v1.down.sql"

SUBJECT='11111111-1111-1111-1111-111111111111'
OUTSIDER='22222222-2222-2222-2222-222222222222'
ORGMGR='33333333-3333-3333-3333-333333333333'
UNLINKED='44444444-4444-4444-4444-444444444444'
ORG='a0000000-0000-4000-8000-00000000000a'
REC1='e0000000-0000-4000-8000-000000000001'
REC2='e0000000-0000-4000-8000-000000000002'

pass=0; fail=0
q() { $PSQL -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# as_user <uid|''> <role> <sql>  -> output (terse errors)
as_role() {
  $PSQL -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
\\set VERBOSITY terse
begin;
set local role $2;
set local app.uid = '$1';
$3
commit;
SQL
}
as_user() { as_role "$1" authenticated "$2"; }

check() { # label kind needle actual
  local hay="${4,,}" needle="${3,,}" found=no
  [[ "$hay" == *"$needle"* ]] && found=yes
  if { [ "$2" = contains ] && [ "$found" = yes ]; } ||
     { [ "$2" = absent ]  && [ "$found" = no ]; }; then
    printf '  PASS  %s\n' "$1"; pass=$((pass+1))
  else
    printf '  FAIL  %s\n        expected %s "%s"\n        got: %s\n' "$1" "$2" "$3" "${4//$'\n'/ | }"
    fail=$((fail+1))
  fi
}

WD="select public.withdraw_organization_evidence_dispute_v1('$REC1'::uuid, null);"
DISPUTE="insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) values ('$ORG','$REC1','disputed', auth.uid(), 'contest');"

echo "=============================================================="
echo " EVID contest / withdraw / re-contest runtime proof"
echo " migration: $(basename "$MIG")"
echo "=============================================================="

$ADMIN -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/subject-contest-and-clash-receipt.prelude.sql" >/dev/null || { echo PRELUDE FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/subject-contest-and-clash-receipt.seed.sql"    >/dev/null || { echo SEED FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$LIVE" >/dev/null 2>&1 || { echo "LIVE MIGRATION FAILED"; exit 1; }
echo "  harness + live 20260915180000 applied"

echo; echo "== BEFORE (what production holds today) ======================="
out=$(q "select count(*) from pg_proc where proname='withdraw_organization_evidence_dispute_v1';")
check "B1 withdraw function does not exist yet" contains "0" "$out"
out=$(as_user "$SUBJECT" "$DISPUTE")
check "B2 subject can contest (live policy)" absent "ERROR" "$out"
out=$(as_user "$SUBJECT" "$DISPUTE")
check "B3 second contest refused by the one-per-actor index" contains "duplicate key" "$out"
out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORG','$REC1','dispute_withdrawn', auth.uid());")
check "B4 a withdrawal cannot be written before the migration" contains "violates" "$out"

echo; echo "-- applying the migration VERBATIM ------------------------------"
mig=$($PSQL -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "MIGRATION FAILED:"; echo "$mig"; exit 1; }
echo "  applied"

echo; echo "== SCHEMA ====================================================="
out=$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='organization_evidence_events_event_type_check';")
check "S1 event set gains dispute_withdrawn" contains "dispute_withdrawn" "$out"
check "S1b ...and keeps disputed" contains "'disputed'" "$out"
check "S1c ...and keeps corrected" contains "'corrected'" "$out"
out=$(q "select count(*) from pg_indexes where indexname='organization_evidence_events_one_dispute_per_actor';")
check "S2 one-contest-ever index replaced" contains "0" "$out"
out=$(q "select count(*) from pg_trigger where tgname='organization_evidence_events_dispute_state_guard' and not tgisinternal;")
check "S3 state-guard trigger exists" contains "1" "$out"
out=$(q "select count(*) from pg_policies where tablename='organization_evidence_events' and policyname='organization_evidence_events_subject_dispute';")
check "S4 subject-dispute policy untouched" contains "1" "$out"
out=$(q "select string_agg(distinct cmd,',') from pg_policies where tablename in ('organization_evidence_events','organization_evidence_records');")
check "S5 no UPDATE policy anywhere" absent "UPDATE" "$out"
check "S5b no DELETE policy anywhere" absent "DELETE" "$out"
out=$(q "select prosecdef::text || ' ' || coalesce(array_to_string(proconfig,','),'') from pg_proc where proname='withdraw_organization_evidence_dispute_v1';")
check "S6 SECURITY DEFINER with pinned search_path" contains "true search_path=public" "$out"
out=$(q "select has_function_privilege('anon','public.withdraw_organization_evidence_dispute_v1(uuid,text)','execute')::text;")
check "S7 anon has no EXECUTE" contains "false" "$out"
out=$(q "select has_function_privilege('authenticated','public.withdraw_organization_evidence_dispute_v1(uuid,text)','execute')::text;")
check "S7b authenticated has EXECUTE" contains "true" "$out"
out=$(q "select (select count(*) from information_schema.routine_privileges where routine_name='withdraw_organization_evidence_dispute_v1' and grantee='PUBLIC');")
check "S7c PUBLIC has no EXECUTE" contains "0" "$out"
out=$(q "select has_function_privilege('authenticated','public.organization_evidence_dispute_state_guard()','execute')::text;")
check "S8 trigger function not callable by authenticated" contains "false" "$out"

echo; echo "== NEGATIVE PERMISSIONS (withdraw) ============================"
out=$(as_user "$SUBJECT" "$WD")
check "N0 the existing contest from BEFORE stands; first withdraw works" contains '"withdrawn": true' "$out"
# put the standing contest back for the negative cases
as_user "$SUBJECT" "$DISPUTE" >/dev/null

out=$(as_user "$OUTSIDER" "$WD")
check "N1 unrelated person refused (42501)" contains "only the subject" "$out"
out=$(as_user "$ORGMGR" "$WD")
check "N2 organisation manager refused" contains "only the subject" "$out"
out=$(as_role "" authenticated "$WD")
check "N3 NULL auth.uid() refused" contains "authentication required" "$out"
out=$(as_role "$SUBJECT" anon "$WD")
check "N4 anon role: permission denied" contains "permission denied" "$out"
out=$(as_user "$SUBJECT" "select public.withdraw_organization_evidence_dispute_v1('$REC2'::uuid, null);")
check "N5 subject of record A cannot withdraw on record B (other record)" contains "only the subject" "$out"
out=$(as_user "$UNLINKED" "select public.withdraw_organization_evidence_dispute_v1('$REC2'::uuid, null);")
check "N6 person on the roster but NOT linked is refused" contains "only the subject" "$out"
out=$(as_user "$SUBJECT" "select public.withdraw_organization_evidence_dispute_v1('ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid, null);")
check "N7 unknown record gives the SAME refusal (no existence oracle)" contains "only the subject" "$out"
out=$(as_user "$SUBJECT" "select public.withdraw_organization_evidence_dispute_v1('$REC1'::uuid, repeat('x',1001));")
check "N8 note over 1000 chars refused" contains "1000 characters" "$out"
out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORG','$REC1','dispute_withdrawn', auth.uid());")
check "N9 subject cannot write a withdrawal by direct insert (RLS)" contains "row-level security" "$out"
out=$(as_user "$SUBJECT" "update public.organization_evidence_events set note='edited' where record_id='$REC1';")
check "N10 events are not updatable by the subject" contains "permission denied" "$out"
out=$(as_user "$SUBJECT" "delete from public.organization_evidence_events where record_id='$REC1';")
check "N11 events are not deletable by the subject" contains "permission denied" "$out"
out=$(q "select count(*) from public.organization_evidence_events where record_id='$REC1' and event_type='disputed' and actor_profile_id='$SUBJECT';")
check "N12 negative cases appended nothing (1 standing contest)" contains "2" "$out"

echo; echo "== WITHDRAW / IDEMPOTENCY / HISTORY ==========================="
# state now: disputed(B2) , dispute_withdrawn(N0), disputed(re-contest) -> standing
out=$(as_user "$SUBJECT" "$WD")
check "W1 subject withdraws a standing contest" contains '"withdrawn": true' "$out"
out=$(q "select count(*) from public.organization_evidence_events where record_id='$REC1' and event_type='disputed' and actor_profile_id='$SUBJECT';")
check "W2 HISTORY: both earlier 'disputed' rows still exist" contains "2" "$out"
out=$(q "select count(*) from public.organization_evidence_events where record_id='$REC1' and event_type='dispute_withdrawn' and actor_profile_id='$SUBJECT' and actor_role is null and actor_organization_id is null;")
check "W3 two withdrawals recorded, person-attributed" contains "2" "$out"
out=$(as_user "$SUBJECT" "$WD")
check "W4 withdrawing again is an idempotent no-op" contains '"idempotent": true' "$out"
out=$(q "select count(*) from public.organization_evidence_events where record_id='$REC1' and event_type='dispute_withdrawn';")
check "W5 the no-op appended NO row" contains "2" "$out"
out=$(as_user "$SUBJECT" "$DISPUTE")
check "W6 RE-CONTEST after withdrawal is allowed" absent "ERROR" "$out"
out=$(as_user "$SUBJECT" "$DISPUTE")
check "W7 a second STANDING contest is still refused (23505)" contains "already stands" "$out"
out=$(q "select event_type from public.organization_evidence_events where record_id='$REC1' and actor_profile_id='$SUBJECT' and event_type in ('disputed','dispute_withdrawn') order by created_at desc, (event_type='dispute_withdrawn') desc limit 1;")
check "W8 derived current state = standing (latest is disputed)" contains "disputed" "$out"
out=$(q "select original_text from public.organization_evidence_records where id='$REC1';")
check "W9 the employer's record is untouched" contains "Poured foundation slab" "$out"
out=$(q "select count(*) from public.organization_evidence_records;")
check "W10 no record added or removed" contains "2" "$out"

echo; echo "== PER-ACTOR PAIRING (manager vs subject) ====================="
# subject's contest stands; the manager raises their own via the attest door.
out=$(as_user "$ORGMGR" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) values ('$ORG','$REC1','disputed', auth.uid(), 'manager contest');")
check "A1 manager may contest through their own door" absent "ERROR" "$out"
out=$(as_user "$SUBJECT" "$WD")
check "A2 subject withdraws ONLY their own contest" contains '"withdrawn": true' "$out"
out=$(q "select count(*) from (select distinct on (actor_profile_id) actor_profile_id, event_type from public.organization_evidence_events where record_id='$REC1' and event_type in ('disputed','dispute_withdrawn') order by actor_profile_id, created_at desc, (event_type='dispute_withdrawn') desc) l where event_type='disputed';")
check "A3 the manager's contest STILL stands (1 standing actor)" contains "1" "$out"
out=$(as_user "$SUBJECT" "$WD")
check "A4 subject has nothing left of their own: no-op, manager's untouched" contains '"idempotent": true' "$out"
out=$(as_user "$OUTSIDER" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORG','$REC1','dispute_withdrawn', auth.uid());")
check "A5 outsider cannot write a withdrawal by direct insert (refused; trigger runs before RLS WITH CHECK)" contains "ERROR" "$out"
out=$(as_user "$ORGMGR" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORG','$REC2','dispute_withdrawn', auth.uid());")
check "A6 withdrawal with no standing contest of the same actor refused by the guard (23514)" contains "no standing contest" "$out"
out=$(as_user "$ORGMGR" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORG','$REC1','dispute_withdrawn', auth.uid());")
check "A7 manager withdraws their OWN contest" absent "ERROR" "$out"

echo; echo "== CONCURRENCY ================================================"
as_user "$SUBJECT" "$DISPUTE" >/dev/null
for i in 1 2 3 4 5 6; do ( as_user "$SUBJECT" "$WD" >/dev/null ) & done; wait
out=$(q "select count(*) from public.organization_evidence_events where record_id='$REC1' and actor_profile_id='$SUBJECT' and event_type='dispute_withdrawn';")
# before this block the subject had 3 withdrawals (N0, W1, A2); exactly ONE more.
check "C1 six concurrent withdrawals append exactly one row" contains "4" "$out"
as_user "$SUBJECT" "$DISPUTE" >/dev/null
for i in 1 2 3 4 5 6; do ( as_user "$SUBJECT" "$DISPUTE" >/dev/null ) & done; wait
out=$(q "select count(*) from public.organization_evidence_events where record_id='$REC1' and actor_profile_id='$SUBJECT' and event_type='disputed';")
# disputes so far: B2, restore, W6, C-setup, post-withdraw setup = 5; the concurrent six add none
check "C2 concurrent contests never stack two standing rows" contains "5" "$out"

echo; echo "== ROLLBACK ==================================================="
out=$($PSQL -tA -v ON_ERROR_STOP=0 -f "$DOWN" 2>&1)
check "R1 rollback REFUSES while withdrawal history exists" contains "cannot roll back" "$out"
out=$(q "select count(*) from pg_proc where proname='withdraw_organization_evidence_dispute_v1';")
check "R2 refusal changed nothing (function still present)" contains "1" "$out"
# scratch-only: strip the history the way an owner decision would, then roll back
q "delete from public.organization_evidence_events where event_type = 'dispute_withdrawn';" >/dev/null
q "delete from public.organization_evidence_events where event_type = 'disputed' and actor_profile_id in ('$SUBJECT','$ORGMGR') and id not in (select distinct on (record_id, actor_profile_id) id from public.organization_evidence_events where event_type='disputed' order by record_id, actor_profile_id, created_at);" >/dev/null
out=$($PSQL -tA -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1)
check "R3 rollback applies once the history question is settled" absent "ERROR" "$out"
out=$(q "select count(*) from pg_indexes where indexname='organization_evidence_events_one_dispute_per_actor';")
check "R4 one-dispute index restored" contains "1" "$out"
out=$(q "select count(*) from pg_proc where proname in ('withdraw_organization_evidence_dispute_v1','organization_evidence_dispute_state_guard');")
check "R5 both functions gone" contains "0" "$out"
out=$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='organization_evidence_events_event_type_check';")
check "R6 event set restored" absent "dispute_withdrawn" "$out"
mig=$($PSQL -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) && r=ok || r=fail
check "R7 migration re-applies cleanly after rollback" contains "ok" "$r"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
