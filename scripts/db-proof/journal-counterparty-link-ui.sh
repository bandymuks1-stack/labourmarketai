#!/usr/bin/env bash
# ============================================================================
# Counterparty link UI doors (EVID-2 slice 2): RUNTIME proof on scratch PG.
# Layered on journal-counterparty-authority.{prelude,seed}.sql + migration
# 20261003150500, then 20261003150550 (person AND team assignments, candidate
# list, entry detail, subject review state) and its rollback.
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58735 bash scripts/db-proof/journal-counterparty-link-ui.sh
# Throwaway only. Never point this at production or a shared local stack.
# ============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-58735}"
DB="cplink1"
ADMIN="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB"
M1="$REPO/supabase/migrations/20261003150500_journal_counterparty_review_authority_v1.sql"
M2="$REPO/supabase/migrations/20261003150550_counterparty_link_team_and_review_read_doors_v1.sql"
D2="$REPO/supabase/rollbacks/20261003150550_counterparty_link_team_and_review_read_doors_v1.down.sql"

FW=aaaaf000-0000-0000-0000-000000000f01
FREE=f1111111-1111-1111-1111-111111111111
FREE2=f2222222-2222-2222-2222-222222222222
CREP=c1111111-1111-1111-1111-111111111111
CREP2=c2222222-2222-2222-2222-222222222222
DREP=d1111111-1111-1111-1111-111111111111
PC=90000000-0000-0000-0000-00000000000c
PF=90000000-0000-0000-0000-00000000000f
TEAM=7e000000-0000-0000-0000-0000000000e0
TM1=7e111111-1111-1111-1111-111111111111
TW1=aaaa7e11-0000-0000-0000-000000000001
TW2=aaaa7e22-0000-0000-0000-000000000002
TW3=aaaa7e33-0000-0000-0000-000000000003
TE1=7e100000-0000-0000-0000-000000000001
FE1=f1000000-0000-0000-0000-000000000001

pass=0; fail=0
q() { $PSQL -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }
as_role() {
  $PSQL -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
\\set VERBOSITY terse
begin;
set local role $2;
select set_config('request.jwt.claim.sub', '$1', true);
$3
commit;
SQL
}
as_user() { as_role "$1" authenticated "$2"; }
check() {
  local hay="${4,,}" needle="${3,,}" found=no
  [[ "$hay" == *"$needle"* ]] && found=yes
  if { [ "$2" = contains ] && [ "$found" = yes ]; } || { [ "$2" = absent ] && [ "$found" = no ]; }; then
    printf '  PASS  %s\n' "$1"; pass=$((pass+1))
  else
    printf '  FAIL  %s\n        expected %s "%s"\n        got: %s\n' "$1" "$2" "$3" "${4//$'\n'/ | }"; fail=$((fail+1))
  fi
}
REVIEW() { echo "select public.review_journal_entry('$1'::uuid,'$2','note');"; }
REG()    { echo "select public.register_work_counterparty_link_v1('$1'::uuid,'$2'::uuid,'${3:-client}');"; }
SUB()    { echo "select public.submit_journal_entry_for_review_v1('$1'::uuid);"; }
CAND()   { echo "select worker_id||'|'||relationship_kind||'|'||coalesce(link_id::text,'none') from public.list_counterparty_link_candidates_v1('$1'::uuid);"; }
fn_hash() { q "select md5(regexp_replace(prosrc,'\s+','','g')) from pg_proc where pronamespace='public'::regnamespace and proname='$1'"; }

echo "=============================================================="
echo " Counterparty link UI doors - runtime proof (person + team)"
echo "=============================================================="
$ADMIN -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-authority.prelude.sql" >/dev/null || { echo PRELUDE FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-authority.seed.sql" >/dev/null || { echo SEED FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-link-ui.prelude2.sql" >/dev/null || { echo PRELUDE2 FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$M1" >/dev/null 2>&1 || { echo M1 FAILED; exit 1; }
LV1="$(fn_hash work_counterparty_link_valid_v1)"; RG1="$(fn_hash register_work_counterparty_link_v1)"
$PSQL -q -v ON_ERROR_STOP=1 -f "$M2" >/dev/null 2>"$HERE/.m2.err" && echo "  migration 2 applied cleanly (no team relation present)" || { cat "$HERE/.m2.err"; echo M2 FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-link-ui.seed2.sql" >/dev/null || { echo SEED2 FAILED; exit 1; }

echo; echo "--- A. person assignment (no team relation exists on this database)"
check "migration applies without the team lane: link_valid body changed" absent "$LV1" "$(fn_hash work_counterparty_link_valid_v1)"
check "team-only worker is refused while no team relation exists" contains "no_work_relationship" "$(as_user $CREP "$(REG $PC $TW1)")"
check "candidates for the client rep: the person-assigned worker, kind person, no link yet" contains "$FW|person|none" "$(as_user $CREP "$(CAND $PC)")"
check "NOT a non-assigned worker" absent "$TW1" "$(as_user $CREP "$(CAND $PC)")"
check "denied: the SUBJECT sees no candidates" absent "$FW" "$(as_user $FREE "$(CAND $PC)")"
check "denied: the subject's shell second login (manages F and C) is not offered the subject" absent "$FW" "$(as_user $FREE2 "$(CAND $PC)")"
check "denied: unrelated org manager sees none" absent "$FW" "$(as_user $DREP "$(CAND $PC)")"
check "denied: plain employee of C sees none" absent "$FW" "$(as_user $CREP2 "$(CAND $PC)")"
check "denied: NULL uid sees none" absent "$FW" "$(as_user '' "$(CAND $PC)")"
check "denied: anon cannot execute the candidate list" contains "permission denied" "$(as_role '' anon "$(CAND $PC)")"
check "client rep registers from the PERSON assignment" contains "registered" "$(as_user $CREP "$(REG $PC $FW)")"
check "  ...audit payload records relationship_kind person" contains "person" "$(q "select payload->>'relationship_kind' from public.audit_logs where action='register_work_counterparty_link' order by created_at desc limit 1")"
check "candidates now show the active link" absent "$FW|person|none" "$(as_user $CREP "$(CAND $PC)")"

echo; echo "--- B. TEAM assignment (lane relation present)"
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-link-ui.team-stub.sql" >/dev/null || { echo TEAMSTUB FAILED; exit 1; }
check "team member is refused while the team has NO assignment on the project" contains "no_work_relationship" "$(as_user $CREP "$(REG $PC $TW1)")"
$PSQL -q -c "insert into public.team_assignments (team_org_id, project_id) values ('$TEAM','$PC')" >/dev/null
check "candidates now include the TEAM member as kind team (resolved through ONE team assignment)" contains "$TW1|team|none" "$(as_user $CREP "$(CAND $PC)")"
check "  ...an ex-member (membership ended before now) is NOT a candidate" absent "$TW2" "$(as_user $CREP "$(CAND $PC)")"
check "  ...a worker outside the team is NOT a candidate" absent "$TW3" "$(as_user $CREP "$(CAND $PC)")"
check "  ...no per-person assignment row was fanned out" contains "1" "$(q "select count(*) from public.project_worker_assignments where project_id='$PC'")"
check "denied: ex-member cannot be registered" contains "no_work_relationship" "$(as_user $CREP "$(REG $PC $TW2)")"
check "denied: outsider cannot be registered" contains "no_work_relationship" "$(as_user $CREP "$(REG $PC $TW3)")"
check "denied: unrelated manager registering a team member" contains "not_authorized" "$(as_user $DREP "$(REG $PC $TW1)")"
check "denied: the team member cannot register own counterparty" contains "not_authorized" "$(as_user $TM1 "$(REG $PC $TW1)")"
check "denied: NULL uid" contains "not authenticated" "$(as_user '' "$(REG $PC $TW1)")"
check "denied: anon" contains "permission denied" "$(as_role '' anon "$(REG $PC $TW1)")"
check "client rep registers from the TEAM assignment" contains "registered" "$(as_user $CREP "$(REG $PC $TW1)")"
check "  ...audit payload records relationship_kind team" contains "team" "$(q "select payload->>'relationship_kind' from public.audit_logs where action='register_work_counterparty_link' order by created_at desc limit 1")"

echo; echo "--- C. subject side: states + explicit submit"
S="$(as_user $TM1 "select public.entry_review_states_v1(array['$TE1']::uuid[])::text;")"
check "subject sees the legitimate counterparty candidate (party name + role)" contains "Client C Ltd" "$S"
check "  ...role client" contains "client" "$S"
check "  ...not submitted yet" contains '"submission": null' "$(as_user $TM1 "select jsonb_pretty(public.entry_review_states_v1(array['$TE1']::uuid[])->'$TE1');")"
check "another user gets nothing for this entry" absent "$TE1" "$(as_user $CREP "select public.entry_review_states_v1(array['$TE1']::uuid[])::text;")"
check "NULL uid gets nothing" absent "$TE1" "$(as_user '' "select public.entry_review_states_v1(array['$TE1']::uuid[])::text;")"
check "anon cannot execute states" contains "permission denied" "$(as_role '' anon "select public.entry_review_states_v1(array['$TE1']::uuid[]);")"
check "the team member submits explicitly" contains "submitted" "$(as_user $TM1 "$(SUB $TE1)")"
D="$(as_user $CREP "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
check "client rep reads the entry detail: work text" contains "Team member laid 40 m2" "$D"
check "  ...labelled metric" contains "area_done" "$D"
check "  ...photo metadata" contains "paving.jpg" "$D"
check "  ...subject display name" contains "Team Member" "$D"
for who in "$CREP2:plain employee of C" "$DREP:unrelated manager" "$TM1:the subject itself"; do
  u="${who%%:*}"; lbl="${who#*:}"
  check "detail denied for $lbl" absent "Team member laid" "$(as_user $u "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
done
as_user $FREE "$(SUB $FE1)" >/dev/null
check "detail denied for the subject's shell second login (manages F and C) on the subject's entry" absent "Installed fence" "$(as_user $FREE2 "select public.counterparty_review_entry_detail_v1('$FE1'::uuid)::text;")"
check "detail denied for NULL uid" absent "Team member laid" "$(as_user '' "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
check "detail denied for anon" contains "permission denied" "$(as_role '' anon "select public.counterparty_review_entry_detail_v1('$TE1'::uuid);")"
check "detail of an UNSUBMITTED entry is denied even for the right rep" absent "Installed fence section 2" "$(as_user $CREP "select public.counterparty_review_entry_detail_v1('f1000000-0000-0000-0000-000000000002'::uuid)::text;")"
check "client rep requests a correction" contains "changes_requested" "$(as_user $CREP "$(REVIEW $TE1 changes_requested)")"
check "  ...latest decision visible with note" contains "changes_requested" "$(as_user $TM1 "select public.entry_review_states_v1(array['$TE1']::uuid[])->'$TE1'->'latest'->>'decision';")"

echo; echo "--- D. team assignment ENDS -> authority stops (derived, not cached)"
$PSQL -q -c "update public.team_assignments set status='ended', ended_at=now() where team_org_id='$TEAM' and project_id='$PC'" >/dev/null
check "ended team assignment: client rep can no longer decide the team member's entry" contains "not_authorized" "$(as_user $CREP "$(REVIEW $TE1 approved)")"
check "ended team assignment: detail returns nothing" absent "Team member laid" "$(as_user $CREP "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
check "ended team assignment: the team member is no longer a candidate" absent "$TW1" "$(as_user $CREP "$(CAND $PC)")"
$PSQL -q -c "insert into public.team_assignments (team_org_id, project_id) values ('$TEAM','$PC')" >/dev/null
check "team assignment re-created -> authority returns" contains "approved" "$(as_user $CREP "$(REVIEW $TE1 approved)")"

echo; echo "--- E. rollback of migration 2 restores the migration-1 bodies"
$PSQL -q -v ON_ERROR_STOP=1 -f "$D2" >/dev/null 2>"$HERE/.d2.err" && echo "  rollback applied" || { cat "$HERE/.d2.err"; echo ROLLBACK FAILED; }
check "link_valid body restored byte for byte" contains "$LV1" "$(fn_hash work_counterparty_link_valid_v1)"
check "register body restored byte for byte" contains "$RG1" "$(fn_hash register_work_counterparty_link_v1)"
check "the four new functions are gone" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('work_relationship_active_v1','list_counterparty_link_candidates_v1','counterparty_review_entry_detail_v1','entry_review_states_v1')")"

echo; echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
rm -f "$HERE/.m2.err" "$HERE/.d2.err"
[ "$fail" -eq 0 ]
