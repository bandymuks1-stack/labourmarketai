#!/usr/bin/env bash
# ============================================================================
# EVID-2 self-review block: RUNTIME proof on a scratch PostgreSQL 16.
#
# The prelude is the PRODUCTION state (functions, CHECK, trigger, RLS policies,
# grants, ACLs read from the live catalog on 2026-10-03). It is applied FIRST,
# the defect is demonstrated, then the migration is applied VERBATIM and every
# probe runs as `authenticated` / `anon` (never as the superuser) so RLS and
# the function bodies genuinely decide.
#
# Usage (scratch cluster, no Docker):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54391 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54391 bash scripts/db-proof/journal-self-review-block.sh
# Throwaway only. Never point this at production or a shared local stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-54391}"
DB="evid2proof"
ADMIN="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB"
MIG="$REPO/supabase/migrations/20261003150000_journal_confirmation_self_review_block_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261003150000_journal_confirmation_self_review_block_v1.down.sql"

WORKER=11111111-1111-1111-1111-111111111111
MGR=22222222-2222-2222-2222-222222222222
OWNERW=33333333-3333-3333-3333-333333333333
MGR2=44444444-4444-4444-4444-444444444444
OUT=55555555-5555-5555-5555-555555555555
ADMINW=66666666-6666-6666-6666-666666666666
STRANGER=77777777-7777-7777-7777-777777777777
ORG=aaaaaaaa-0000-0000-0000-00000000000a
E_W=e1000000-0000-0000-0000-000000000001
E_O1=e3000000-0000-0000-0000-000000000001
E_O2=e3000000-0000-0000-0000-000000000002
E_O3=e3000000-0000-0000-0000-000000000003
E_OHIST=e3000000-0000-0000-0000-000000000004
E_OAUTO=e3000000-0000-0000-0000-000000000005
E_A=e6000000-0000-0000-0000-000000000001
E_NP=e9000000-0000-0000-0000-000000000001
SK_WELD=5c111111-0000-0000-0000-000000000001
SK_PLASTER=5c222222-0000-0000-0000-000000000002
SK_TILE=5c333333-0000-0000-0000-000000000003

# production normalised-body hashes (md5 of prosrc, comments + whitespace stripped), read 2026-10-03
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
state()  { q "select count(*) from public.journal_entry_confirmations where entry_id='$1'"; }
hash_of() { q "select proname||'='||md5(regexp_replace(regexp_replace(prosrc,'--[^\n]*','','g'),'\s+','','g')) from pg_proc where pronamespace='public'::regnamespace and proname in ('journal_entry_confirmations_guard','review_journal_entry','confirm_entry_and_verify_skills','apply_learning_auto_confirmation','reviewable_journal_entry_ids') order by 1"; }
acl_of()  { q "select string_agg(proname||':'||coalesce(proacl::text,'null')||':'||prosecdef||':'||provolatile||':'||coalesce(proconfig::text,''), ' ; ' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('journal_entry_confirmations_guard','review_journal_entry','confirm_entry_and_verify_skills','apply_learning_auto_confirmation','reviewable_journal_entry_ids')"; }

echo "=============================================================="
echo " EVID-2 self-review block - runtime proof"
echo " migration: $(basename "$MIG")"
echo "=============================================================="
$ADMIN -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-self-review-block.prelude.sql" >/dev/null || { echo PRELUDE FAILED; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/journal-self-review-block.seed.sql"    >/dev/null || { echo SEED FAILED; exit 1; }

echo; echo "--- 0. prelude fidelity: prior function bodies == production hashes"
H0="$(hash_of)"
for f in "${!PROD_H[@]}"; do check "prelude $f matches production body hash" contains "$f=${PROD_H[$f]}" "$H0"; done

echo; echo "--- 1. BEFORE the migration the defect is real"
check "owner approves OWN entry (review_journal_entry)" contains "approved" "$(as_user $OWNERW "$(REVIEW $E_O1 approved)")"
check "owner flips OWN skill to verified (confirm_entry_and_verify_skills)" contains "verified:1" "$(as_user $OWNERW "$(CONF $E_O2 $SK_PLASTER)")"
check "  ...verified_by is the subject themself" contains "t" "$(q "select verified_by=(select profile_id from public.workers where id=worker_id) from public.worker_skills where skill_id='$SK_PLASTER' and worker_id='aaaa3333-0000-0000-0000-000000000003'")"

# snapshot of history + skill state (after the legacy self-writes above)
SNAP_IDS="$(q "select string_agg(quote_literal(id::text), ',' order by id) from public.journal_entry_confirmations")"
SNAP_CONF="$(q "select md5(string_agg(t::text, '|' order by id)) from public.journal_entry_confirmations t where t.id in ($SNAP_IDS)")"
SNAP_ROWS="$(q "select count(*) from public.journal_entry_confirmations")"
SNAP_SK="$(q "select md5(string_agg(t::text, '|' order by worker_id, skill_id)) from public.worker_skills t")"
ACL0="$(acl_of)"

echo; echo "--- 2. apply the migration VERBATIM"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>"$HERE/.mig.err" && echo "  applied cleanly" || { cat "$HERE/.mig.err"; echo MIGRATION FAILED; exit 1; }
H1="$(hash_of)"
check "functions actually changed" absent "$H0" "$H1"
check "ACLs/secdef/volatility/search_path unchanged" contains "$ACL0" "$(acl_of)"
check "exactly one guard trigger still present" contains "1" "$(q "select count(*) from pg_trigger where tgrelid='public.journal_entry_confirmations'::regclass and not tgisinternal")"

echo; echo "--- 3. self-review DENIED (every decision, every path, every authority)"
for d in approved rejected changes_requested; do
  check "owner reviews OWN entry as $d -> self_review_not_allowed" contains "self_review_not_allowed" "$(as_user $OWNERW "$(REVIEW $E_O3 $d)")"
done
check "no confirmation row was written for E_O3" contains "0" "$(state $E_O3)"
check "owner verify-own-skill via confirm_entry_and_verify_skills denied" contains "self_review_not_allowed" "$(as_user $OWNERW "$(CONF $E_O3 $SK_TILE)")"
check "  ...skill stays unverified" contains "f" "$(q "select verified from public.worker_skills where skill_id='$SK_TILE' and worker_id='aaaa3333-0000-0000-0000-000000000003'")"
check "platform admin who is also the author cannot review OWN entry" contains "self_review_not_allowed" "$(as_user $ADMINW "$(REVIEW $E_A approved)")"
check "auto-confirm of OWN entry denied (apply_learning_auto_confirmation)" contains "self_review_not_allowed" "$(as_user $OWNERW "select public.apply_learning_auto_confirmation('a1000000-0000-0000-0000-000000000001'::uuid);")"
check "  ...queue item still pending, nothing verified" contains "pending|f" "$(q "select (select status from public.learning_review_queue where id='a1000000-0000-0000-0000-000000000001')||'|'||(select verified from public.worker_skills where skill_id='$SK_TILE' and worker_id='aaaa3333-0000-0000-0000-000000000003')")"
check "DIRECT INSERT (RLS policy path) of a self-confirmation is refused by the guard" contains "self_review_not_allowed" "$(as_user $OWNERW "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_O3','$OWNERW','ecec3333-0000-0000-0000-000000000003','owner','{\"action\":\"confirm\"}');")"
check "  ...still 0 rows" contains "0" "$(state $E_O3)"

echo; echo "--- 4. other authorized party ALLOWED, identity + authority preserved"
check "manager MGR approves the worker's entry E_W (already has history; second decision)" contains "approved" "$(as_user $MGR "$(REVIEW $E_W approved)")"
check "MGR2 (a different manager) approves the OWNER-worker's entry" contains "approved" "$(as_user $MGR2 "$(REVIEW $E_O3 approved)")"
check "  ...row carries confirmer id MGR2, role manager, engagement ecec4444" contains "$MGR2|manager|ecec4444-0000-0000-0000-000000000004" "$(q "select confirmer_id||'|'||confirmer_role||'|'||confirmer_engagement_context_id from public.journal_entry_confirmations where entry_id='$E_O3'")"
check "MGR2 verifies the owner-worker's skill through the owner-worker's entry" contains "verified:1" "$(as_user $MGR2 "$(CONF $E_O2 $SK_TILE)")"
check "  ...verified_by = MGR2 (not the subject), source manager_confirmed" contains "$MGR2|manager_confirmed" "$(q "select verified_by||'|'||source from public.worker_skills where skill_id='$SK_TILE' and worker_id='aaaa3333-0000-0000-0000-000000000003'")"
check "auto-confirm of the owner's entry by ANOTHER manager (MGR2) works" contains "auto_confirmed:" "$(as_user $MGR2 "select public.apply_learning_auto_confirmation('a1000000-0000-0000-0000-000000000001'::uuid);")"
check "entry by a worker with NO profile is confirmable (NULL-safe, not treated as self)" contains "approved" "$(as_user $MGR "$(REVIEW $E_NP approved)")"

echo; echo "--- 5. wrong org / outsider / anon / NULL denied"
check "manager of ANOTHER org -> not_authorized" contains "not_authorized" "$(as_user $OUT "$(REVIEW $E_W approved)")"
check "wrong-org direct INSERT blocked by RLS" contains "row-level security" "$(as_user $OUT "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_W','$OUT','ecec5555-0000-0000-0000-000000000005','manager','{}');")"
check "outsider with no engagement -> not_authorized" contains "not_authorized" "$(as_user $STRANGER "$(REVIEW $E_W approved)")"
check "the plain worker cannot confirm their own entry (no authority) -> not_authorized" contains "not_authorized" "$(as_user $WORKER "$(REVIEW $E_W approved)")"
check "anon cannot execute review_journal_entry" contains "permission denied" "$(as_role '' anon "$(REVIEW $E_W approved)")"
check "authenticated with NULL uid -> Not authenticated" contains "not authenticated" "$(as_user '' "$(REVIEW $E_W approved)")"
check "authenticated with NULL uid cannot insert a confirmation (RLS)" contains "row-level security" "$(as_user '' "insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values ('$E_W','$MGR','ecec2222-0000-0000-0000-000000000002','manager','{}');")"

echo; echo "--- 6. queue: the author is not offered their own entries; others are"
check "OWNERW's reviewable set excludes own entries" absent "$E_O1" "$(as_user $OWNERW "select id from public.reviewable_journal_entry_ids() id;")"
check "OWNERW's reviewable set still includes a colleague's entry (E_A)" contains "$E_A" "$(as_user $OWNERW "select id from public.reviewable_journal_entry_ids() id;")"
check "MGR2 is offered E_O1 whose ONLY confirmation is a historical self-approval" contains "$E_O1" "$(as_user $MGR2 "select id from public.reviewable_journal_entry_ids() id;")"
check "MGR2 is offered E_OHIST (historical self-confirmation only)" contains "$E_OHIST" "$(as_user $MGR2 "select id from public.reviewable_journal_entry_ids() id;")"
check "MGR2 is NOT offered E_W (already independently confirmed by MGR)" absent "$E_W" "$(as_user $MGR2 "select id from public.reviewable_journal_entry_ids() id;")"
check "OWNERW is not offered E_OHIST either (own entry)" absent "$E_OHIST" "$(as_user $OWNERW "select id from public.reviewable_journal_entry_ids() id;")"

echo; echo "--- 7. self-declared work is still submittable"
check "owner-worker can still INSERT their own journal entry" contains "INSERT 0 1" "$(as_user $OWNERW "insert into public.journal_entries (worker_id, engagement_context_id, original_text, hash_self) values ('aaaa3333-0000-0000-0000-000000000003','ecec3333-0000-0000-0000-000000000003','new self-declared','hnew');")"
check "  ...and it simply has no confirmation (self-declared, unconfirmed)" contains "0" "$(q "select count(*) from public.journal_entry_confirmations c join public.journal_entries j on j.id=c.entry_id where j.original_text='new self-declared'")"

echo; echo "--- 8. history preserved (the snapshot taken BEFORE the migration; later rows are additive)"
check "pre-existing self-confirmation row (E_OHIST) still present and unchanged" contains "c0000000-0000-0000-0000-000000000002|$OWNERW|owner|confirm" "$(q "select id||'|'||confirmer_id||'|'||confirmer_role||'|'||(confirmation_scope->>'action') from public.journal_entry_confirmations where entry_id='$E_OHIST'")"
check "the legacy self-approval written before the migration (E_O1) still present" contains "$OWNERW" "$(q "select confirmer_id from public.journal_entry_confirmations where entry_id='$E_O1'")"
check "no pre-existing confirmation row was rewritten (md5 over the pre-migration ids)" contains "$SNAP_CONF" "$(q "select md5(string_agg(t::text, '|' order by id)) from public.journal_entry_confirmations t where t.id in ($SNAP_IDS)")"
check "legacy self-verified skill (SK_PLASTER) untouched: verified_by still the subject" contains "t" "$(q "select verified_by=(select profile_id from public.workers where id=worker_id) from public.worker_skills where skill_id='$SK_PLASTER' and worker_id='aaaa3333-0000-0000-0000-000000000003'")"

echo; echo "--- 9. idempotent"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 && echo "  re-applied cleanly" || echo "  RE-APPLY FAILED"
check "second apply leaves identical bodies" contains "$H1" "$(hash_of)"
check "second apply leaves identical ACLs" contains "$ACL0" "$(acl_of)"

echo; echo "--- 10. rollback restores the production bodies exactly (hash-compared)"
$PSQL -q -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 && echo "  rollback applied" || echo "  ROLLBACK FAILED"
H2="$(hash_of)"
for f in "${!PROD_H[@]}"; do check "after rollback $f == production hash" contains "$f=${PROD_H[$f]}" "$H2"; done
check "ACLs identical after rollback" contains "$ACL0" "$(acl_of)"
check "after rollback the defect is back (proves the rollback is a real revert)" contains "approved" "$(as_user $OWNERW "$(REVIEW $E_A approved)")"
$PSQL -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 && echo "  roll-forward again clean"
check "after roll-forward the block is back" contains "self_review_not_allowed" "$(as_user $ADMINW "$(REVIEW $E_A rejected)")"

echo; echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
rm -f "$HERE/.mig.err"
[ "$fail" -eq 0 ]
