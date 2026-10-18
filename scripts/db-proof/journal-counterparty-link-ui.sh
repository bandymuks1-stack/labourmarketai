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
M2="$REPO/supabase/migrations/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.sql"
M3="$REPO/supabase/migrations/20261003150555_batch_review_exceptions_employer_only_v1.sql"
D3="$REPO/supabase/rollbacks/20261003150555_batch_review_exceptions_employer_only_v1.down.sql"
OLD_REF=3090a1047   # the tree BEFORE the audit fixes C1/C2 (defects are demonstrated against it)
TMPD="$REPO/.tmp"; mkdir -p "$TMPD"
old_fn() { # <path-at-OLD_REF> <start-regex> <end-regex> : extract one function body from the pre-fix tree
  git -C "$REPO" show "$OLD_REF:$1" | sed -n "/$2/,/$3/p"
}
new_fn() { sed -n "/$2/,/$3/p" "$REPO/$1"; }
D2="$REPO/supabase/rollbacks/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.down.sql"

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
LV1="$(fn_hash work_counterparty_link_valid_v1)"; RG1="$(fn_hash register_work_counterparty_link_v1)"; RV1="$(fn_hash reviewable_journal_entry_ids)"
$PSQL -q -v ON_ERROR_STOP=1 -f "$M2" >/dev/null 2>"$HERE/.m2.err" && echo "  migration 2 applied cleanly (no team relation present)" || { cat "$HERE/.m2.err"; echo M2 FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-link-ui.seed2.sql" >/dev/null || { echo SEED2 FAILED; exit 1; }

echo; echo "--- 0. the stubs carry only REAL production columns (regression: detail/state read o.name / pr.name)"
check "organizations has no 'name' column in the proof schema" contains "0" "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='name'")"
check "projects has no 'name' column in the proof schema" contains "0" "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name='projects' and column_name='name'")"
check "the migration reads no non-existent column" absent "o.name" "$(cat "$M2")"
check "  ...(projects)" absent "pr.name" "$(cat "$M2")"

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
check "the employer review set no longer offers the client's submission (own queue instead)" absent "$TE1" "$(as_user $CREP "select id from public.reviewable_journal_entry_ids() id;")"
check "  ...the client queue does" contains "$TE1" "$(as_user $CREP "select entry_id from public.list_counterparty_review_queue_v1();")"
check "  ...and an EMPLOYER reviewer is still offered an employer entry" contains "e9000000-0000-0000-0000-000000000001" "$(as_user 22222222-2222-2222-2222-222222222222 "select id from public.reviewable_journal_entry_ids() id;")"
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
PH="select name from storage.objects where bucket_id='journal-entry-photos';"
check "client rep can open the SUBMITTED entry's photo file (own session, storage policy)" contains "paving.jpg" "$(as_user $CREP "$PH")"
check "  ...but not another file in the bucket" absent "other.jpg" "$(as_user $CREP "$PH")"
check "  ...the unrelated manager cannot" absent "paving.jpg" "$(as_user $DREP "$PH")"
check "  ...the plain employee of C cannot" absent "paving.jpg" "$(as_user $CREP2 "$PH")"
check "  ...an unrelated worker (outsider TW3) cannot" absent "paving.jpg" "$(as_user 7e333333-3333-3333-3333-333333333333 "$PH")"
check "  ...the subject still opens their own photo (existing owner policy)" contains "paving.jpg" "$(as_user $TM1 "$PH")"
check "  ...NULL uid sees nothing" absent "paving.jpg" "$(as_user '' "$PH")"
check "  ...anon cannot execute the predicate" contains "permission denied" "$(as_role '' anon "select public.counterparty_can_read_photo_v1('x');")"
check "detail names the project by its REAL title column" contains "Fence project" "$D"
check "state names the party by display_name" contains "Client C Ltd" "$S"
check "detail denied for NULL uid" absent "Team member laid" "$(as_user '' "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
check "detail denied for anon" contains "permission denied" "$(as_role '' anon "select public.counterparty_review_entry_detail_v1('$TE1'::uuid);")"
check "detail of an UNSUBMITTED entry is denied even for the right rep" absent "Installed fence section 2" "$(as_user $CREP "select public.counterparty_review_entry_detail_v1('f1000000-0000-0000-0000-000000000002'::uuid)::text;")"
check "client rep requests a correction" contains "changes_requested" "$(as_user $CREP "$(REVIEW $TE1 changes_requested)")"
check "  ...latest decision visible with note" contains "changes_requested" "$(as_user $TM1 "select public.entry_review_states_v1(array['$TE1']::uuid[])->'$TE1'->'latest'->>'decision';")"

echo; echo "--- C2. PHOTO ACCESS: only the authorized representative of the SUBMITTED entry"
ORG_D=d0000000-0000-0000-0000-0000000000d0
PD=90000000-0000-0000-0000-0000000000d1
TE2=7e100000-0000-0000-0000-000000000002
TM1B=7e444444-4444-4444-4444-444444444444
$PSQL -q -c "insert into public.profiles (id, active_role) values ('$TM1B','company');
 insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug, created_at, started_at) values ('ec7e0044-0000-0000-0000-000000000044','$TM1B','7e000000-0000-0000-0000-0000000000f0','active','manager', now() - interval '30 days', current_date - 30);
 insert into public.projects (id, organization_id, title) values ('$PD','$ORG_D','D project');
 insert into public.project_worker_assignments (project_id, worker_id, status) values ('$PD','$TW1','active');
 insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id) values ('$TE2','$TW1','ec7e0011-0000-0000-0000-000000000011','Second entry on the D project.','ht2','$PD');
 insert into public.journal_entry_photos (entry_id, profile_id, file_name, storage_path) values ('$TE2','$TM1','d-site.jpg','$TM1/d-site.jpg');
 insert into storage.objects (bucket_id, name) values ('journal-entry-photos','$TM1/d-site.jpg');" >/dev/null
check "D's representative registers from the SAME worker's assignment on D's own project" contains "registered" "$(as_user $DREP "$(REG $PD $TW1)")"
check "the worker submits the D-project entry to D (and only that one)" contains "submitted" "$(as_user $TM1 "$(SUB $TE2)")"
check "D's representative opens D's submitted photo" contains "d-site.jpg" "$(as_user $DREP "$PH")"
check "  ...but NOT the photo of the entry submitted to C (another entry's link)" absent "paving.jpg" "$(as_user $DREP "$PH")"
check "C's representative opens C's photo but NOT D's" absent "d-site.jpg" "$(as_user $CREP "$PH")"
check "C's representative still opens C's photo" contains "paving.jpg" "$(as_user $CREP "$PH")"
check "the subject's second login (manager of the subject's own org) opens neither" absent "jpg" "$(as_user $TM1B "$PH")"
check "an EMPLOYER manager of an unrelated org (MGR) opens neither" absent "jpg" "$(as_user 22222222-2222-2222-2222-222222222222 "$PH")"
check "an UNSUBMITTED entry's photo is closed to the would-be representative" absent "unsub.jpg" "$(as_user $CREP "$PH")"
$PSQL -q -c "insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id) values ('7e100000-0000-0000-0000-000000000003','$TW1','ec7e0011-0000-0000-0000-000000000011','Not submitted.','ht3','$PC');
 insert into public.journal_entry_photos (entry_id, profile_id, file_name, storage_path) values ('7e100000-0000-0000-0000-000000000003','$TM1','unsub.jpg','$TM1/unsub.jpg');
 insert into storage.objects (bucket_id, name) values ('journal-entry-photos','$TM1/unsub.jpg');" >/dev/null
check "  ...(re-check after seeding the unsubmitted photo) the representative cannot open it" absent "unsub.jpg" "$(as_user $CREP "$PH")"
check "  ...while the subject still can (owner policy)" contains "unsub.jpg" "$(as_user $TM1 "$PH")"
check "NULL uid sees no photo" absent "jpg" "$(as_user '' "$PH")"
check "anon cannot even evaluate the predicate" contains "permission denied" "$(as_role '' anon "select public.counterparty_can_read_photo_v1('$TM1/paving.jpg');")"

echo; echo "--- D. team assignment ENDS -> authority stops (derived, not cached)"
$PSQL -q -c "update public.team_assignments set status='ended', ended_at=now() where team_org_id='$TEAM' and project_id='$PC'" >/dev/null
check "ended team assignment: client rep can no longer decide the team member's entry" contains "not_authorized" "$(as_user $CREP "$(REVIEW $TE1 approved)")"
check "ended team assignment: detail returns nothing" absent "Team member laid" "$(as_user $CREP "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
check "ended team assignment: the team member is no longer a candidate" absent "$TW1" "$(as_user $CREP "$(CAND $PC)")"
$PSQL -q -c "insert into public.team_assignments (team_org_id, project_id) values ('$TEAM','$PC')" >/dev/null
check "team assignment re-created -> authority returns" contains "approved" "$(as_user $CREP "$(REVIEW $TE1 approved)")"

echo; echo "--- C2. ONE queue row per correction chain (audit C2)"
TE1B=7e100000-0000-0000-0000-0000000000b1
$PSQL -q -c "insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, correction_of) values ('$TE1B','$TW1','ec7e0011-0000-0000-0000-000000000011','Team member paving, corrected area.','ht1b','$PC','$TE1')" >/dev/null
check "the corrected version is submitted explicitly" contains "submitted" "$(as_user $TM1 "$(SUB $TE1B)")"
QF=public.list_counterparty_review_queue_v1
old_fn "supabase/migrations/20261003150500_journal_counterparty_review_authority_v1.sql" "create or replace function public.list_counterparty_review_queue_v1" '^end \$\$;' > "$TMPD/q_old.sql"
new_fn "supabase/migrations/20261003150500_journal_counterparty_review_authority_v1.sql" "create or replace function public.list_counterparty_review_queue_v1" '^end \$\$;' > "$TMPD/q_new.sql"
$PSQL -q -v ON_ERROR_STOP=1 -f "$TMPD/q_old.sql" >/dev/null 2>&1
check "DEFECT (pre-fix projection): the chain shows the ORIGINAL ..." contains "$TE1" "$(as_user $CREP "select entry_id from $QF();")"
check "  ...AND the correction (the same work twice)" contains "$TE1B" "$(as_user $CREP "select entry_id from $QF();")"
$PSQL -q -v ON_ERROR_STOP=1 -f "$TMPD/q_new.sql" >/dev/null 2>&1
check "FIXED: the queue shows the LATEST version of the chain ..." contains "$TE1B" "$(as_user $CREP "select entry_id from $QF();")"
check "  ...and not the earlier version" absent "$TE1|" "$(as_user $CREP "select entry_id||'|' from $QF();")"
check "  ...the earlier version's history is still in the detail of the latest" contains "paving" "$(as_user $CREP "select public.counterparty_review_entry_detail_v1('$TE1B'::uuid)::text;")"

echo; echo "--- D1. REVOKED link closes the photo and the detail at once"
LNK="$(q "select id from public.work_counterparty_links where worker_id='$TW1' and project_id='$PC' and revoked_at is null limit 1")"
check "before revocation the representative still opens the photo" contains "paving.jpg" "$(as_user $CREP "$PH")"
check "the representative revokes the link" contains "revoked" "$(as_user $CREP "select public.revoke_work_counterparty_link_v1('$LNK'::uuid);")"
check "  ...the ex-link representative can no longer open the photo" absent "paving.jpg" "$(as_user $CREP "$PH")"
check "  ...nor read the entry detail" absent "Team member laid" "$(as_user $CREP "select public.counterparty_review_entry_detail_v1('$TE1'::uuid)::text;")"
check "  ...the subject still opens their own photo" contains "paving.jpg" "$(as_user $TM1 "$PH")"

echo; echo "--- D2. batch_review_exceptions counts EMPLOYER approvals only (migration 3)"
MGRU=22222222-2222-2222-2222-222222222222
ENP=e9000000-0000-0000-0000-000000000001   # carries the three client acceptances
ENP2=e9000000-0000-0000-0000-000000000002  # same worker, still awaiting employer review
$PSQL -q -c "insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self) values ('$ENP2','aaaa0000-0000-0000-0000-000000000009','ecec1111-0000-0000-0000-000000000001','Agency-managed worker, second entry.','h9b')" >/dev/null
check "the second entry is in the employer review set (precondition)" contains "$ENP2" "$(as_user $MGRU "select id from public.reviewable_journal_entry_ids() id;")"
$PSQL -q -v ON_ERROR_STOP=1 -f "$D3" >/dev/null 2>&1   # the rollback script carries the production body
$PSQL -q -c "alter table public.journal_entry_confirmations disable trigger user" >/dev/null
for i in 1 2 3; do $PSQL -q -c "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$ENP','$CREP','ecc10000-0000-0000-0000-000000000001','manager','{\"action\":\"client_accept\",\"decision\":\"approved\",\"authority\":{\"basis\":\"counterparty\"}}')" >/dev/null; done
$PSQL -q -c "alter table public.journal_entry_confirmations enable trigger user" >/dev/null
echo; echo "--- C1. a CLIENT decision must not remove the employer's pending item (audit C1)"
ENP3=e9000000-0000-0000-0000-000000000003
$PSQL -q -c "insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self) values ('$ENP3','aaaa0000-0000-0000-0000-000000000009','ecec1111-0000-0000-0000-000000000001','Agency-managed worker, third entry.','h9c')" >/dev/null
check "precondition: the entry is in the employer's pending set" contains "$ENP3" "$(as_user $MGRU "select id from public.reviewable_journal_entry_ids() id;")"
$PSQL -q -c "alter table public.journal_entry_confirmations disable trigger user" >/dev/null
$PSQL -q -c "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$ENP3','$CREP','ecc10000-0000-0000-0000-000000000001','manager','{\"action\":\"client_accept\",\"decision\":\"approved\",\"authority\":{\"basis\":\"counterparty\"}}')" >/dev/null
$PSQL -q -c "alter table public.journal_entry_confirmations enable trigger user" >/dev/null
check "FIXED (current 150550): the client acceptance does NOT remove the employer's pending item" contains "$ENP3" "$(as_user $MGRU "select id from public.reviewable_journal_entry_ids() id;")"
old_fn "supabase/migrations/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.sql" "CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids" '^end \$function\$;' > "$TMPD/r_old.sql"
new_fn "supabase/migrations/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.sql" "CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids" '^end \$function\$;' > "$TMPD/r_new.sql"
$PSQL -q -v ON_ERROR_STOP=1 -f "$TMPD/r_old.sql" >/dev/null 2>&1
check "DEFECT (pre-fix body): the same client acceptance silently removed the employer's item" absent "$ENP3" "$(as_user $MGRU "select id from public.reviewable_journal_entry_ids() id;")"
$PSQL -q -v ON_ERROR_STOP=1 -f "$TMPD/r_new.sql" >/dev/null 2>&1
check "fix restored: employer's pending item is back" contains "$ENP3" "$(as_user $MGRU "select id from public.reviewable_journal_entry_ids() id;")"
check "an EMPLOYER decision still closes it (the rule itself is intact)" contains "approved" "$(as_user $MGRU "select public.review_journal_entry('$ENP3'::uuid,'approved','ok');")"
check "  ...and then it is no longer pending" absent "$ENP3" "$(as_user $MGRU "select id from public.reviewable_journal_entry_ids() id;")"

check "BEFORE migration 3 the defect is real: three client acceptances hide the few-confirmations flag" absent "worker_first_entries" "$(as_user $MGRU "select exception_slug from public.batch_review_exceptions(array['$ENP2']::uuid[]);")"
$PSQL -q -v ON_ERROR_STOP=1 -f "$M3" >/dev/null 2>&1 && echo "  migration 3 applied"
check "AFTER migration 3 the flag is back (client rows are not employer approvals)" contains "worker_first_entries" "$(as_user $MGRU "select exception_slug from public.batch_review_exceptions(array['$ENP2']::uuid[]);")"
check "migration 3 keeps the ACL (anon cannot execute)" contains "permission denied" "$(as_role '' anon "select * from public.batch_review_exceptions(array['$ENP2']::uuid[]);")"

echo; echo "--- E. rollback of migration 2 restores the migration-1 bodies"
$PSQL -q -v ON_ERROR_STOP=1 -f "$D2" >/dev/null 2>"$HERE/.d2.err" && echo "  rollback applied" || { cat "$HERE/.d2.err"; echo ROLLBACK FAILED; }
check "link_valid body restored byte for byte" contains "$LV1" "$(fn_hash work_counterparty_link_valid_v1)"
check "register body restored byte for byte" contains "$RG1" "$(fn_hash register_work_counterparty_link_v1)"
check "reviewable_journal_entry_ids body restored byte for byte" contains "$RV1" "$(fn_hash reviewable_journal_entry_ids)"
check "storage policy and predicate are gone after rollback" contains "0" "$(q "select count(*) from pg_policies where schemaname='storage' and policyname='journal-entry-photos counterparty select'")"
check "the four new functions are gone" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('work_relationship_active_v1','list_counterparty_link_candidates_v1','counterparty_review_entry_detail_v1','entry_review_states_v1','counterparty_can_read_photo_v1')")"

echo; echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
rm -f "$HERE/.m2.err" "$HERE/.d2.err"
[ "$fail" -eq 0 ]
