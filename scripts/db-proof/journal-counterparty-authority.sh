#!/usr/bin/env bash
# ============================================================================
# Counterparty-derived confirmation authority (EVID-2 redesign, slice 1):
# RUNTIME proof on a scratch PostgreSQL 16.
#
# The prelude is the PRODUCTION state (functions, CHECK, trigger, RLS policies,
# grants, ACLs read from the live catalog on 2026-10-03; the five prior
# function bodies were re-hashed against production on 2026-10-04). It is
# applied FIRST, the defect is demonstrated, then the migration is applied
# VERBATIM and every probe runs as `authenticated` / `anon` (never as the
# superuser) so RLS, grants and the function bodies genuinely decide.
#
# Usage (scratch cluster, no Docker):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54395 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54395 bash scripts/db-proof/journal-counterparty-authority.sh
# Throwaway only. Never point this at production or a shared local stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-54395}"
DB="cpauth1"
ADMIN="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB"
MIG="$REPO/supabase/migrations/20261003150500_journal_counterparty_review_authority_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261003150500_journal_counterparty_review_authority_v1.down.sql"

WORKER=11111111-1111-1111-1111-111111111111
MGR=22222222-2222-2222-2222-222222222222
OWNERW=33333333-3333-3333-3333-333333333333
MGR2=44444444-4444-4444-4444-444444444444
OUT=55555555-5555-5555-5555-555555555555
ADMINW=66666666-6666-6666-6666-666666666666
STRANGER=77777777-7777-7777-7777-777777777777
FREE=f1111111-1111-1111-1111-111111111111
FREE2=f2222222-2222-2222-2222-222222222222
CREP=c1111111-1111-1111-1111-111111111111
CREP2=c2222222-2222-2222-2222-222222222222
DREP=d1111111-1111-1111-1111-111111111111
E_W=e1000000-0000-0000-0000-000000000001
E_O1=e3000000-0000-0000-0000-000000000001
E_O2=e3000000-0000-0000-0000-000000000002
E_O3=e3000000-0000-0000-0000-000000000003
E_OHIST=e3000000-0000-0000-0000-000000000004
E_A=e6000000-0000-0000-0000-000000000001
E_NP=e9000000-0000-0000-0000-000000000001
SK_WELD=5c111111-0000-0000-0000-000000000001
SK_PLASTER=5c222222-0000-0000-0000-000000000002
SK_TILE=5c333333-0000-0000-0000-000000000003
FW=aaaaf000-0000-0000-0000-000000000f01
PC=90000000-0000-0000-0000-00000000000c
PF=90000000-0000-0000-0000-00000000000f
PA=90000000-0000-0000-0000-0000000000a0
FE1=f1000000-0000-0000-0000-000000000001
FE2=f1000000-0000-0000-0000-000000000002
FE3=f1000000-0000-0000-0000-000000000003
FE4=f1000000-0000-0000-0000-000000000004
FE5=f1000000-0000-0000-0000-000000000005
FE6=f1000000-0000-0000-0000-000000000006
FE7=f1000000-0000-0000-0000-000000000007
ORG_C=c0000000-0000-0000-0000-0000000000c0

# production normalised-body hashes (md5 of prosrc, comments + whitespace stripped), read 2026-10-04
declare -A PROD_H=(
  [apply_learning_auto_confirmation]=6d2055c0f1fdc0a266f7c5e6d306c994
  [confirm_entry_and_verify_skills]=5fb732b6af4114a38a8f4d972118b0c4
  [journal_entry_confirmations_guard]=62cda164da5548c7c592b6c121f75b0c
  [review_journal_entry]=6170a75faffae6b7988b313f1301d49b
  [reviewable_journal_entry_ids]=7bcc77f869adbf073bf34435b0ba4120 )

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
check() { # label kind needle actual
  local hay="${4,,}" needle="${3,,}" found=no
  [[ "$hay" == *"$needle"* ]] && found=yes
  if { [ "$2" = contains ] && [ "$found" = yes ]; } || { [ "$2" = absent ] && [ "$found" = no ]; }; then
    printf '  PASS  %s\n' "$1"; pass=$((pass+1))
  else
    printf '  FAIL  %s\n        expected %s "%s"\n        got: %s\n' "$1" "$2" "$3" "${4//$'\n'/ | }"; fail=$((fail+1))
  fi
}
REVIEW() { echo "select public.review_journal_entry('$1'::uuid,'$2','note');"; }
CONF()   { echo "select public.confirm_entry_and_verify_skills('$1'::uuid, array['$2']::uuid[], null);"; }
REG()    { echo "select public.register_work_counterparty_link_v1('$1'::uuid,'$2'::uuid,'${3:-client}');"; }
SUB()    { echo "select public.submit_journal_entry_for_review_v1('$1'::uuid);"; }
nconf()  { q "select count(*) from public.journal_entry_confirmations where entry_id='$1'"; }
ncp()    { q "select count(*) from public.journal_entry_confirmations where entry_id='$1' and confirmation_scope #>> '{authority,basis}'='counterparty'"; }
nsub()   { q "select count(*) from public.journal_entry_review_submissions where entry_id='$1'"; }
hash_of() { q "select proname||'='||md5(regexp_replace(regexp_replace(prosrc,'--[^\n]*','','g'),'\s+','','g')) from pg_proc where pronamespace='public'::regnamespace and proname in ('journal_entry_confirmations_guard','review_journal_entry','confirm_entry_and_verify_skills','apply_learning_auto_confirmation','reviewable_journal_entry_ids') order by 1"; }
acl_of()  { q "select string_agg(proname||':'||coalesce(proacl::text,'null')||':'||prosecdef||':'||provolatile||':'||coalesce(proconfig::text,''), ' ; ' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('journal_entry_confirmations_guard','review_journal_entry','confirm_entry_and_verify_skills','apply_learning_auto_confirmation','reviewable_journal_entry_ids')"; }
fresh_db() { # name
  $ADMIN -c "drop database if exists $1" -c "create database $1" >/dev/null
  PSQL="psql -h $HOST -p $PORT -U postgres -d $1"
  $PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-authority.prelude.sql" >/dev/null || { echo PRELUDE FAILED; exit 1; }
  $PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-counterparty-authority.seed.sql"    >/dev/null || { echo SEED FAILED; exit 1; }
}

echo "=============================================================="
echo " Counterparty-derived confirmation authority - runtime proof"
echo " migration: $(basename "$MIG")"
echo "=============================================================="
fresh_db "$DB"

echo; echo "--- 0. prelude fidelity: prior function bodies == production hashes"
H0="$(hash_of)"
for f in "${!PROD_H[@]}"; do check "prelude $f matches production body hash" contains "$f=${PROD_H[$f]}" "$H0"; done

echo; echo "--- 1. BEFORE the migration the defect is real (and there is no counterparty concept)"
check "owner approves OWN entry" contains "approved" "$(as_user $OWNERW "$(REVIEW $E_O1 approved)")"
check "owner flips OWN skill to verified" contains "verified:1" "$(as_user $OWNERW "$(CONF $E_O2 $SK_PLASTER)")"
check "no counterparty tables exist yet" contains "0" "$(q "select count(*) from pg_class where relname in ('work_counterparty_links','journal_entry_review_submissions')")"
SNAP_IDS="$(q "select string_agg(quote_literal(id::text), ',' order by id) from public.journal_entry_confirmations")"
SNAP_CONF="$(q "select md5(string_agg(t::text, '|' order by id)) from public.journal_entry_confirmations t where t.id in ($SNAP_IDS)")"
SNAP_SK="$(q "select md5(string_agg(t::text, '|' order by worker_id, skill_id)) from public.worker_skills t")"
ACL0="$(acl_of)"

echo; echo "--- 2. apply the migration VERBATIM"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>"$HERE/.mig.err" && echo "  applied cleanly" || { cat "$HERE/.mig.err"; echo MIGRATION FAILED; exit 1; }
H1="$(hash_of)"
check "the three replaced functions changed" absent "journal_entry_confirmations_guard=${PROD_H[journal_entry_confirmations_guard]}" "$H1"
check "confirm_entry_and_verify_skills body UNCHANGED (employer-only, byte for byte)" contains "confirm_entry_and_verify_skills=${PROD_H[confirm_entry_and_verify_skills]}" "$H1"
check "apply_learning_auto_confirmation body UNCHANGED" contains "apply_learning_auto_confirmation=${PROD_H[apply_learning_auto_confirmation]}" "$H1"
check "ACLs/secdef/volatility/search_path of the five functions unchanged" contains "$ACL0" "$(acl_of)"
check "exactly one trigger on journal_entry_confirmations (the guard)" contains "1" "$(q "select count(*) from pg_trigger where tgrelid='public.journal_entry_confirmations'::regclass and not tgisinternal")"
check "RLS enabled on both new tables" contains "2" "$(q "select count(*) from pg_class where relname in ('work_counterparty_links','journal_entry_review_submissions') and relrowsecurity")"
check "authenticated has NO insert/update/delete on the new tables" contains "0" "$(q "select count(*) from information_schema.role_table_grants where grantee in ('authenticated','anon','public') and table_name in ('work_counterparty_links','journal_entry_review_submissions') and privilege_type in ('INSERT','UPDATE','DELETE')")"
check "authenticated cannot EXECUTE the resolver (no oracle)" contains "permission denied" "$(as_user $FREE "select public.journal_entry_review_authority_v1('$FE1'::uuid,'$CREP'::uuid);")"
check "authenticated cannot EXECUTE profile_manages_organization_v1" contains "permission denied" "$(as_user $FREE "select public.profile_manages_organization_v1('$CREP'::uuid,'$ORG_C'::uuid);")"

echo; echo "--- 3. EMPLOYER review still works (employee flow, via manages_organization)"
check "employer MGR approves the employee's entry E_W" contains "approved" "$(as_user $MGR "$(REVIEW $E_W approved)")"
check "  ...row is an EMPLOYER confirmation with native provenance" contains "employer|NATIVE_PLATFORM_EMPLOYER_CONFIRMATION|$MGR|" "$(q "select (confirmation_scope #>> '{authority,basis}')||'|'||(confirmation_scope #>> '{provenance,origin}')||'|'||(confirmation_scope #>> '{provenance,recorded_by}')||'|'||coalesce(confirmation_scope #>> '{provenance,imported_by}','') from public.journal_entry_confirmations where entry_id='$E_W' and confirmer_id='$MGR' order by created_at desc limit 1")"
check "  ...employer rows keep the legacy action vocabulary (confirm)" contains "confirm" "$(q "select confirmation_scope ->> 'action' from public.journal_entry_confirmations where entry_id='$E_W' and confirmer_id='$MGR' order by created_at desc limit 1")"
check "employer MGR verifies the employee's skill (confirm_entry_and_verify_skills)" contains "verified:1" "$(as_user $MGR "$(CONF $E_W $SK_WELD)")"
check "  ...verified_by = MGR, source manager_confirmed" contains "$MGR|manager_confirmed" "$(q "select verified_by||'|'||source from public.worker_skills where skill_id='$SK_WELD' and worker_id='aaaa1111-0000-0000-0000-000000000001'")"
check "employer MGR2 auto-confirm path (apply_learning_auto_confirmation) works" contains "auto_confirmed:" "$(as_user $MGR2 "select public.apply_learning_auto_confirmation('a1000000-0000-0000-0000-000000000002'::uuid);")"
check "employer approves entry of a worker with NO profile (NULL-safe)" contains "approved" "$(as_user $MGR "$(REVIEW $E_NP approved)")"
check "employer rejected / changes_requested still work" contains "changes_requested" "$(as_user $MGR2 "$(REVIEW $E_NP changes_requested)")"
check "employer queue: MGR2 is offered an unreviewed employee entry? (E_W already decided -> not offered)" absent "$E_W" "$(as_user $MGR2 "select id from public.reviewable_journal_entry_ids() id;")"

echo; echo "--- 4. SUBJECT cannot impersonate the counterparty (own org / own second login)"
check "owner reviews OWN entry (every decision) -> self_review_not_allowed" contains "self_review_not_allowed" "$(as_user $OWNERW "$(REVIEW $E_O3 approved)")$(as_user $OWNERW "$(REVIEW $E_O3 rejected)")"
check "platform admin who is also the author cannot review OWN entry" contains "self_review_not_allowed" "$(as_user $ADMINW "$(REVIEW $E_A approved)")"
check "DIRECT INSERT (RLS passes, owner manages the org) by the subject is refused by the guard" contains "self_review_not_allowed" "$(as_user $OWNERW "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_O3','$OWNERW','ecec3333-0000-0000-0000-000000000003','owner','{\"action\":\"confirm\",\"decision\":\"approved\"}');")"
check "ANOTHER MANAGER OF THE SUBJECT'S OWN ORG (MGR2 co-manages org A with the owner-worker) is NOT a counterparty" contains "review_authority_not_established" "$(as_user $MGR2 "$(REVIEW $E_O3 approved)")"
check "  ...direct INSERT by that co-manager is refused too" contains "review_authority_not_established" "$(as_user $MGR2 "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_O3','$MGR2','ecec4444-0000-0000-0000-000000000004','manager','{\"action\":\"confirm\",\"decision\":\"approved\"}');")"
check "  ...and skill verification through the same door is refused (trigger is the choke point)" contains "review_authority_not_established" "$(as_user $MGR2 "$(CONF $E_O2 $SK_TILE)")"
check "  ...nothing verified for the tile skill" contains "f" "$(q "select verified from public.worker_skills where skill_id='$SK_TILE' and worker_id='aaaa3333-0000-0000-0000-000000000003'")"
check "  ...auto-confirm of the co-managed owner entry is refused" contains "review_authority_not_established" "$(as_user $MGR2 "select public.apply_learning_auto_confirmation('a1000000-0000-0000-0000-000000000001'::uuid);")"
check "no confirmation row exists for E_O3 after the attempts" contains "0" "$(nconf $E_O3)"
check "wrong-org manager -> not_authorized" contains "not_authorized" "$(as_user $OUT "$(REVIEW $E_W approved)")"
check "wrong-org direct INSERT denied (the guard fires before the RLS check)" contains "review_authority_not_established" "$(as_user $OUT "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_W','$OUT','ecec5555-0000-0000-0000-000000000005','manager','{\"decision\":\"approved\"}');")"
check "outsider with no engagement -> not_authorized" contains "not_authorized" "$(as_user $STRANGER "$(REVIEW $E_W approved)")"
check "the plain worker cannot confirm own entry (no authority) -> not_authorized" contains "not_authorized" "$(as_user $WORKER "$(REVIEW $E_W approved)")"
check "anon cannot execute review_journal_entry" contains "permission denied" "$(as_role '' anon "$(REVIEW $E_W approved)")"
check "authenticated with NULL uid -> Not authenticated" contains "not authenticated" "$(as_user '' "$(REVIEW $E_W approved)")"
check "authenticated NULL uid cannot insert a confirmation (RLS)" contains "row-level security" "$(as_user '' "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_W','$MGR','ecec2222-0000-0000-0000-000000000002','manager','{}');")"

echo; echo "--- 5. registering the counterparty: done BY the party, from a real fact"
check "the SUBJECT cannot register their own counterparty" contains "not_authorized" "$(as_user $FREE "$(REG $PC $FW)")"
check "the subject's 2nd login that ALSO manages C (a shell) -> counterparty_not_independent" contains "counterparty_not_independent" "$(as_user $FREE2 "$(REG $PC $FW)")"
check "manager of the SUBJECT'S OWN org posing as client on the own-org project -> subject_is_member_of_counterparty" contains "subject_is_member_of_counterparty" "$(as_user $FREE2 "$(REG $PF $FW)")"
check "non-manager employee of C cannot register" contains "not_authorized" "$(as_user $CREP2 "$(REG $PC $FW)")"
check "manager of an UNRELATED org D cannot register" contains "not_authorized" "$(as_user $DREP "$(REG $PC $FW)")"
check "no active assignment on that project -> no_work_relationship" contains "no_work_relationship" "$(as_user $MGR "$(REG $PA $FW)")"
check "invalid role refused" contains "invalid_party_role" "$(as_user $CREP "$(REG $PC $FW owner)")"
check "anon cannot register" contains "permission denied" "$(as_role '' anon "$(REG $PC $FW)")"
check "NULL uid cannot register" contains "not authenticated" "$(as_user '' "$(REG $PC $FW)")"
check "nothing was manufactured by the refused attempts" contains "0" "$(q "select count(*) from public.work_counterparty_links")"
check "the legitimate client representative CREP registers the counterparty" contains "registered" "$(as_user $CREP "$(REG $PC $FW)")"
check "  ...idempotent: second call -> already_registered" contains "already_registered" "$(as_user $CREP "$(REG $PC $FW)")"
check "  ...exactly one link, established_by CREP, party = C, basis project_assignment" contains "1|$CREP|$ORG_C|project_assignment" "$(q "select count(*)||'|'||min(established_by::text)||'|'||min(counterparty_organization_id::text)||'|'||min(basis) from public.work_counterparty_links")"
LINK="$(q "select id from public.work_counterparty_links limit 1")"
check "append-only: authenticated cannot UPDATE a link" contains "permission denied" "$(as_user $CREP "update public.work_counterparty_links set party_role='end_client' where id='$LINK';")"
check "append-only: authenticated cannot DELETE a link" contains "permission denied" "$(as_user $CREP "delete from public.work_counterparty_links where id='$LINK';")"
check "append-only: even the table owner cannot rewrite a link column" contains "append_only" "$(q "update public.work_counterparty_links set party_role='end_client' where id='$LINK'")"
check "append-only: even the table owner cannot delete a link" contains "append_only" "$(q "delete from public.work_counterparty_links where id='$LINK'")"
check "the subject can read the link about their own work" contains "$LINK" "$(as_user $FREE "select id from public.work_counterparty_links;")"
check "an unrelated manager (DREP) cannot read the link" absent "$LINK" "$(as_user $DREP "select id from public.work_counterparty_links;")"

echo; echo "--- 6. explicit SUBMIT FOR REVIEW (creating an entry never submits)"
check "creating entries submitted nothing" contains "0" "$(q "select count(*) from public.journal_entry_review_submissions")"
check "CREP cannot review an UNSUBMITTED entry" contains "not_authorized" "$(as_user $CREP "$(REVIEW $FE1 approved)")"
check "the counterparty queue is empty before submission" absent "$FE1" "$(as_user $CREP "select entry_id from public.list_counterparty_review_queue_v1();")"
check "only the subject can submit (CREP) -> not_authorized" contains "not_authorized" "$(as_user $CREP "$(SUB $FE1)")"
check "the subject's 2nd login cannot submit for the subject" contains "not_authorized" "$(as_user $FREE2 "$(SUB $FE1)")"
check "entry without a project cannot be submitted" contains "entry_has_no_project" "$(as_user $FREE "$(SUB $FE4)")"
check "entry on the OWN-org project: no counterparty registered" contains "no_counterparty_registered" "$(as_user $FREE "$(SUB $FE7)")"
check "the subject submits FE1" contains "submitted" "$(as_user $FREE "$(SUB $FE1)")"
check "  ...idempotent: re-submit -> already_submitted, still ONE row" contains "already_submitted|1" "$(as_user $FREE "$(SUB $FE1)" | grep -o already_submitted | head -1)|$(nsub $FE1)"
check "  ...submission records the resolved link and the technical actor" contains "$LINK|$FREE" "$(q "select link_id||'|'||submitted_by from public.journal_entry_review_submissions where entry_id='$FE1'")"
check "append-only: authenticated cannot UPDATE a submission" contains "permission denied" "$(as_user $FREE "update public.journal_entry_review_submissions set submitted_by='$CREP' where entry_id='$FE1';")"
check "append-only: owner cannot DELETE a submission" contains "append_only" "$(q "delete from public.journal_entry_review_submissions where entry_id='$FE1'")"

echo; echo "--- 7. the legitimate counterparty reviews; impersonators and outsiders cannot"
check "CREP sees the submitted entry in the counterparty queue" contains "$FE1" "$(as_user $CREP "select entry_id from public.list_counterparty_review_queue_v1();")"
check "  ...with the work text (explicit submission is the grant)" contains "Installed fence section 1" "$(as_user $CREP "select original_text from public.list_counterparty_review_queue_v1();")"
check "CREP is offered FE1 in reviewable_journal_entry_ids" contains "$FE1" "$(as_user $CREP "select id from public.reviewable_journal_entry_ids() id;")"
for who in "$CREP2:non-manager employee of C" "$DREP:manager of unrelated org D" "$FREE2:subject's second login (manager of F and C)" "$FREE:the subject"; do
  u="${who%%:*}"; lbl="${who#*:}"
  check "queue is empty for $lbl" absent "$FE1" "$(as_user $u "select entry_id from public.list_counterparty_review_queue_v1();")"
  out="$(as_user $u "$(REVIEW $FE1 approved)")"
  check "$lbl cannot accept FE1 (no approval)" absent "approved" "$(echo "$out" | grep -v -i 'BEGIN\|COMMIT\|set_config\|^[a-f0-9]\{4\}')"
done
check "FREE2 (shell) review of FE1 got a clean refusal status" contains "review_not_enabled" "$(as_user $FREE2 "$(REVIEW $FE1 approved)")"
check "no confirmation row exists yet" contains "0" "$(nconf $FE1)"
check "DIRECT INSERT by CREP is denied (no counterparty basis claimed -> authority_basis_mismatch; RLS would also refuse)" contains "authority_basis_mismatch" "$(as_user $CREP "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$FE1','$CREP','ecc10000-0000-0000-0000-000000000001','manager','{\"decision\":\"approved\"}');")"
check "DIRECT INSERT by the subject's org manager FREE2 (RLS passes) is refused by the guard" contains "review_authority_not_established" "$(as_user $FREE2 "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$FE1','$FREE2','ecf20000-0000-0000-0000-000000000002','manager','{\"decision\":\"approved\",\"authority\":{\"basis\":\"counterparty\"}}');")"
check "counterparty cannot verify skills (employer-only function) -> not_authorized" contains "not_authorized" "$(as_user $CREP "$(CONF $FE1 $SK_WELD)")"
check "CREP ACCEPTS FE1" contains "approved" "$(as_user $CREP "$(REVIEW $FE1 approved)")"
check "  ...row: action client_accept (NOT confirm), basis counterparty, party org C, link + submission recorded" contains "client_accept|counterparty|$ORG_C|$LINK" "$(q "select (confirmation_scope->>'action')||'|'||(confirmation_scope#>>'{authority,basis}')||'|'||(confirmation_scope#>>'{authority,party_organization_id}')||'|'||(confirmation_scope#>>'{authority,link_id}') from public.journal_entry_confirmations where entry_id='$FE1'")"
check "  ...provenance: client origin, recorded_by = confirmed_by = CREP, importer null, imported_at null, subject FREE" contains "NATIVE_PLATFORM_CLIENT_CONFIRMATION|$CREP|$CREP||||$FREE" "$(q "select (confirmation_scope#>>'{provenance,origin}')||'|'||(confirmation_scope#>>'{provenance,recorded_by}')||'|'||(confirmation_scope#>>'{provenance,confirmed_by_profile_id}')||'|'||coalesce(confirmation_scope#>>'{provenance,imported_by}','')||'|'||coalesce(confirmation_scope#>>'{provenance,imported_at}','')||'|'||coalesce(confirmation_scope#>>'{provenance,effective_event_time}','')||'|'||(confirmation_scope#>>'{provenance,subject_profile_id}') from public.journal_entry_confirmations where entry_id='$FE1'")"
check "  ...a client acceptance is not counted by anything that reads action = 'confirm'" contains "0" "$(q "select count(*) from public.journal_entry_confirmations where entry_id='$FE1' and confirmation_scope->>'action'='confirm'")"
check "  ...idempotent: repeating ACCEPT adds no row" contains "1" "$(as_user $CREP "$(REVIEW $FE1 approved)" >/dev/null; ncp $FE1)"
check "  ...ACCEPT is final: a later dispute -> already_accepted" contains "already_accepted" "$(as_user $CREP "$(REVIEW $FE1 rejected)")"
check "  ...and no row was added" contains "1" "$(ncp $FE1)"
check "  ...after acceptance the entry leaves the counterparty queue" absent "$FE1" "$(as_user $CREP "select id from public.reviewable_journal_entry_ids() id;")"
check "the subject can read the acceptance about their own work" contains "client_accept" "$(as_user $FREE "select confirmation_scope->>'action' from public.journal_entry_confirmations where entry_id='$FE1';")"
check "an unsubmitted entry FE2 is never reviewable by CREP" contains "not_authorized" "$(as_user $CREP "$(REVIEW $FE2 approved)")"

echo; echo "--- 8. correction / dispute / withdrawal / resubmission lifecycle (history immutable)"
check "FE3 submitted" contains "submitted" "$(as_user $FREE "$(SUB $FE3)")"
check "CREP REQUESTS CORRECTION on FE3" contains "changes_requested" "$(as_user $CREP "$(REVIEW $FE3 changes_requested)")"
check "  ...row action client_request_correction" contains "client_request_correction" "$(q "select confirmation_scope->>'action' from public.journal_entry_confirmations where entry_id='$FE3'")"
FE3B=f1000000-0000-0000-0000-0000000000b3
FE3_SNAP="$(q "select md5(string_agg(t::text,'|' order by id)) from public.journal_entry_confirmations t where entry_id='$FE3'")"
# canonical correction (journal_atomic_supersede): NEW entry, correction_of -> old, old.superseded_by -> new
$PSQL -q -c "insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, correction_of) values ('$FE3B','$FW','ecf10000-0000-0000-0000-000000000001','Fence section 3, corrected wording.','hf3b','$PC','$FE3'); update public.journal_entries set superseded_by='$FE3B' where id='$FE3';" >/dev/null
check "the superseded (old) entry can no longer be decided" contains "entry_superseded" "$(as_user $CREP "$(REVIEW $FE3 approved)")"
check "the corrected entry is NOT submitted implicitly" contains "0" "$(nsub $FE3B)"
check "RESUBMIT: the corrected entry is submitted explicitly" contains "submitted" "$(as_user $FREE "$(SUB $FE3B)")"
check "  ...submission records resubmission_of_entry_id = the original" contains "$FE3" "$(q "select resubmission_of_entry_id from public.journal_entry_review_submissions where entry_id='$FE3B'")"
check "CREP DISPUTES the corrected entry" contains "rejected" "$(as_user $CREP "$(REVIEW $FE3B rejected)")"
check "  ...row action client_dispute" contains "client_dispute" "$(q "select string_agg(confirmation_scope->>'action',',') from public.journal_entry_confirmations where entry_id='$FE3B'")"
check "  ...repeating DISPUTE is idempotent (still one row)" contains "1" "$(as_user $CREP "$(REVIEW $FE3B rejected)" >/dev/null; ncp $FE3B)"
check "dispute WITHDRAWAL/RESOLUTION: the authorized party later ACCEPTS" contains "approved" "$(as_user $CREP "$(REVIEW $FE3B approved)")"
check "  ...history preserved: dispute row AND acceptance row both exist, in order" contains "client_dispute,client_accept" "$(q "select string_agg(confirmation_scope->>'action',',' order by created_at, id) from public.journal_entry_confirmations where entry_id='$FE3B'")"
check "  ...final: further dispute refused" contains "already_accepted" "$(as_user $CREP "$(REVIEW $FE3B rejected)")"
check "the earlier correction-request history on the OLD entry is byte-identical" contains "$FE3_SNAP" "$(q "select md5(string_agg(t::text,'|' order by id)) from public.journal_entry_confirmations t where entry_id='$FE3'")"
check "the old entry text was never overwritten" contains "first wording" "$(q "select original_text from public.journal_entries where id='$FE3'")"

echo; echo "--- 9. authority is re-derived at every use (revocation, ended assignment, wrong party)"
check "FE5 submitted while the link is live" contains "submitted" "$(as_user $FREE "$(SUB $FE5)")"
check "a non-party (DREP) cannot revoke the link" contains "not_authorized" "$(as_user $DREP "select public.revoke_work_counterparty_link_v1('$LINK'::uuid);")"
check "the subject cannot revoke the link" contains "not_authorized" "$(as_user $FREE "select public.revoke_work_counterparty_link_v1('$LINK'::uuid);")"
check "the counterparty's rep revokes the link" contains "revoked" "$(as_user $CREP "select public.revoke_work_counterparty_link_v1('$LINK'::uuid);")"
check "  ...revoking twice is idempotent" contains "already_revoked" "$(as_user $CREP "select public.revoke_work_counterparty_link_v1('$LINK'::uuid);")"
check "  ...revocation is the ONLY write the append-only link allows (revoked_at set, role unchanged)" contains "client|t" "$(q "select party_role||'|'||(revoked_at is not null) from public.work_counterparty_links where id='$LINK'")"
check "after revocation CREP can no longer decide the already-submitted FE5" contains "not_authorized" "$(as_user $CREP "$(REVIEW $FE5 approved)")"
check "after revocation a new submission finds no valid counterparty" contains "no_counterparty_registered" "$(as_user $FREE "$(SUB $FE6)")"
check "the prior acceptance (FE1) is untouched by the revocation" contains "1" "$(ncp $FE1)"
check "re-registering after revocation creates a NEW link row (history kept)" contains "registered" "$(as_user $CREP "$(REG $PC $FW)")"
check "  ...two link rows now exist, one revoked" contains "2|1" "$(q "select count(*)||'|'||count(*) filter (where revoked_at is not null) from public.work_counterparty_links")"
check "FE6 submitted against the new link" contains "submitted" "$(as_user $FREE "$(SUB $FE6)")"
$PSQL -q -c "update public.project_worker_assignments set status='ended', ended_at=now() where project_id='$PC' and worker_id='$FW'" >/dev/null
check "when the project assignment ENDS the link stops conferring authority" contains "not_authorized" "$(as_user $CREP "$(REVIEW $FE6 approved)")"
$PSQL -q -c "update public.project_worker_assignments set status='active', ended_at=null where project_id='$PC' and worker_id='$FW'" >/dev/null
check "assignment restored -> authority returns (derived, not cached)" contains "approved" "$(as_user $CREP "$(REVIEW $FE6 approved)")"

echo; echo "--- 10. provenance: a historical confirmation is never a platform action"
check "a RECONSTRUCTED_HISTORICAL origin is refused at the choke point (even for the table owner)" contains "historical_confirmation_not_a_platform_action" "$(q "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$FE2','$CREP','ecc10000-0000-0000-0000-000000000001','manager','{\"decision\":\"approved\",\"provenance\":{\"origin\":\"RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION\"}}')")"
check "a row cannot claim the employer basis while resolving as counterparty (authority_basis_mismatch)" contains "authority_basis_mismatch" "$(q "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$FE6','$CREP','ecc10000-0000-0000-0000-000000000001','manager','{\"decision\":\"approved\",\"authority\":{\"basis\":\"employer\"}}')" | sed 's/review_authority_not_established/&/')"
check "the importer is never recorded as confirmer: every native row has imported_by null" contains "0" "$(q "select count(*) from public.journal_entry_confirmations where confirmation_scope#>>'{provenance,imported_by}' is not null")"

echo; echo "--- 11. history preserved (snapshot taken BEFORE the migration)"
check "no pre-existing confirmation row was rewritten (md5 over the pre-migration ids)" contains "$SNAP_CONF" "$(q "select md5(string_agg(t::text, '|' order by id)) from public.journal_entry_confirmations t where t.id in ($SNAP_IDS)")"
check "the pre-existing historical self-confirmation (E_OHIST) is still present" contains "$OWNERW" "$(q "select confirmer_id from public.journal_entry_confirmations where entry_id='$E_OHIST'")"
check "the legacy self-verified worker_skills row (plaster) is untouched" contains "$OWNERW" "$(q "select verified_by from public.worker_skills where skill_id='$SK_PLASTER' and worker_id='aaaa3333-0000-0000-0000-000000000003'")"
check "the subject's own historical-self-confirmed entry is NOT offered to the subject (E_OHIST)" absent "$E_OHIST" "$(as_user $OWNERW "select id from public.reviewable_journal_entry_ids() id;")"

echo; echo "--- 12. rollback: refused while legal proof exists; exact restore on a clean database"
out="$($PSQL -q -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1)"
check "rollback REFUSES to drop tables that hold counterparty proof" contains "rollback_refused" "$out"
check "  ...schema left intact" contains "2" "$(q "select count(*) from pg_class where relname in ('work_counterparty_links','journal_entry_review_submissions')")"
fresh_db "cpauth2"
HB="$(hash_of)"; ACLB="$(acl_of)"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 && echo "  (clean db) applied" || echo "  APPLY FAILED"
$PSQL -q -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 && echo "  (clean db) rollback applied" || echo "  ROLLBACK FAILED"
H2="$(hash_of)"
for f in "${!PROD_H[@]}"; do check "after rollback $f == production hash" contains "$f=${PROD_H[$f]}" "$H2"; done
check "ACLs identical after rollback" contains "$ACLB" "$(acl_of)"
check "all new objects are gone" contains "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('profile_manages_organization_v1','journal_entry_review_authority_v1','register_work_counterparty_link_v1','submit_journal_entry_for_review_v1','list_counterparty_review_queue_v1','revoke_work_counterparty_link_v1','work_counterparty_link_valid_v1','profiles_share_organization_v1','profiles_co_manage_organization_v1','profile_is_member_of_organization_v1','work_counterparty_append_only_v1')")"
check "  ...and both tables" contains "0" "$(q "select count(*) from pg_class where relname in ('work_counterparty_links','journal_entry_review_submissions')")"
check "after rollback the previous behaviour is back (defect reproduces => real revert)" contains "approved" "$(as_user $OWNERW "$(REVIEW $E_A approved)")"

echo; echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
rm -f "$HERE/.mig.err"
[ "$fail" -eq 0 ]
