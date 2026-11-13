#!/usr/bin/env bash
# ============================================================================
# roster-history-claim-v1 — REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# The REAL migration, its rollback and the live respond_to_roster_link_v1 run verbatim over the
# prelude's stand-ins. SYNTHETIC people only; nothing here touches any real database.
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58741 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/roster-history-claim-v1.sh
#
# Uses database `rhc1` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261113100000_roster_history_claim_v1
MIG="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
SUBJ="$REPO/supabase/migrations/20261005100000_roster_link_subject_answer_v1.sql"
HOST=${PGPROOF_HOST:-127.0.0.1}; PORT=${PGPROOF_PORT:-58741}
case "$HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
ADMINP="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d rhc1 -tA -q"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

$ADMINP -c "drop database if exists rhc1" -c "create database rhc1" >/dev/null 2>&1 \
  || { echo "cannot reach postgres on $PORT"; exit 2; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then printf '  PASS  %-72s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-72s\n        expected=%s\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
checkre() { if echo "$3" | grep -qE "$2"; then printf '  PASS  %-72s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-72s\n        wanted /%s/\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
run_file() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$TMP/e" || { echo "FAILED: $1"; cat "$TMP/e"; exit 1; }; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
# as <uid> <email> <sql> — role authenticated with PostgREST-style claims.
as() { local uid="$1" email="$2"; shift 2
  printf "set local role authenticated;\nset local app.uid='%s';\nset local app.email='%s';\n%s\n" "$uid" "$email" "$*" \
  | { echo "begin;"; cat; echo "commit;"; } | $PSQL -v ON_ERROR_STOP=0 -f - 2>&1 \
  | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|$)' | head -1; }
out() { sed -n 's/.*"outcome" *: *"\([a-z_]*\)".*/\1/p' <<< "$1" | head -1; }
tokhash() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

MGRA=a0000000-0000-4000-8000-00000000000a   # manager of the former employer
MGR2=a0000000-0000-4000-8000-00000000000b   # second manager of the same organization
EX=e0000000-0000-4000-8000-00000000000e     # the FORMER worker, signs in with another address
OTH=0f000000-0000-4000-8000-00000000000f    # a bystander who is forwarded the link
UNV=0c000000-0000-4000-8000-00000000000c    # a person whose address is not proven
CUR=0d000000-0000-4000-8000-00000000000d    # a CURRENT employee of the same organization
MGRB=b0000000-0000-4000-8000-00000000000b   # manager of another organization
WB=b0000000-0000-4000-8000-00000000000c     # another organization's worker
WEX=10000000-0000-4000-8000-000000000001; WOTH=10000000-0000-4000-8000-000000000002
WCUR=10000000-0000-4000-8000-000000000003; WWB=10000000-0000-4000-8000-000000000004
ORGA=20000000-0000-4000-8000-00000000000a; ORGB=20000000-0000-4000-8000-00000000000b
PEX=30000000-0000-4000-8000-000000000001    # roster row: the former worker (unlinked)
PCUR=30000000-0000-4000-8000-000000000002   # roster row: the current employee (already linked)
PWB=30000000-0000-4000-8000-000000000003    # roster row: the other organization's worker

seed() {
  $PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"$TMP/e" <<SQL || { cat "$TMP/e"; exit 1; }
insert into profiles (id, full_name, email) values
 ('$MGRA','QA-SYNTHETIC Manager A','mgra@qa.example'),('$MGR2','QA-SYNTHETIC Manager A2','mgra2@qa.example'),
 ('$EX','QA-SYNTHETIC Former Worker','new-address@qa.example'),('$OTH','QA-SYNTHETIC Bystander','oth@qa.example'),
 ('$UNV','QA-SYNTHETIC Unproven','unv@qa.example'),('$CUR','QA-SYNTHETIC Current Employee','cur@qa.example'),
 ('$MGRB','QA-SYNTHETIC Manager B','mgrb@qa.example'),('$WB','QA-SYNTHETIC Worker B','wb@qa.example');
insert into proven_emails values ('$MGRA','mgra@qa.example'),('$MGR2','mgra2@qa.example'),
 ('$EX','new-address@qa.example'),('$OTH','oth@qa.example'),('$CUR','cur@qa.example'),
 ('$MGRB','mgrb@qa.example'),('$WB','wb@qa.example');
insert into workers (id, profile_id, display_name) values
 ('$WEX','$EX','QA-SYNTHETIC Former Worker'),('$WOTH','$OTH','QA-SYNTHETIC Bystander'),
 ('$WCUR','$CUR','QA-SYNTHETIC Current Employee'),('$WWB','$WB','QA-SYNTHETIC Worker B');
insert into organizations (id, display_name, legal_name) values
 ('$ORGA','QA-SYNTHETIC Former Employer','QA-SYNTHETIC Former Employer UAB'),
 ('$ORGB','QA-SYNTHETIC Other Company','QA-SYNTHETIC Other Company UAB');
insert into company_memberships values ('$MGRA','$ORGA','active','manager'),('$MGR2','$ORGA','active','manager'),
 ('$MGRB','$ORGB','active','manager');
insert into engagement_contexts (profile_id, organization_id, status, relationship_slug) values
 ('$CUR','$ORGA','active','employee');
-- the former worker's roster row and the history the organization supplied for it
insert into organization_people (id, organization_id, display_name, normalized_name, relationship_kind, created_by)
 values ('$PEX','$ORGA','QA-SYNTHETIC Former Worker','qa synthetic former worker','former_employee','$MGRA');
insert into organization_evidence_records (organization_id, organization_person_id, evidence_state, supplied_by_organization_id, imported_by_profile_id, hours, period_start, period_end)
 values ('$ORGA','$PEX','ORGANIZATION_REPORTED','$ORGA','$MGRA',1680,'2019-03-01','2021-06-30');
insert into organization_evidence_records (organization_id, organization_person_id, evidence_state, supplied_by_organization_id, imported_by_profile_id, hours, activity_date)
 values ('$ORGA','$PEX','ORGANIZATION_REPORTED','$ORGA','$MGRA',8,'2020-05-14'),
        ('$ORGA','$PEX','LEGACY_IMPORTED','$ORGA','$MGRA',8,'2020-05-15');
-- a CURRENT employee, already linked the ordinary way: must be untouched throughout
insert into organization_people (id, organization_id, display_name, normalized_name, relationship_kind, created_by,
  link_state, link_method, linked_profile_id, linked_worker_id, linked_by, linked_at)
 values ('$PCUR','$ORGA','QA-SYNTHETIC Current Employee','qa synthetic current employee','employee','$MGRA',
  'linked','worker_confirmed','$CUR','$WCUR','$CUR',now());
-- another organization's person and records: nobody here may ever read them
insert into organization_people (id, organization_id, display_name, normalized_name, relationship_kind, created_by,
  link_state, link_method, linked_profile_id, linked_worker_id, linked_by, linked_at)
 values ('$PWB','$ORGB','QA-SYNTHETIC Worker B','qa synthetic worker b','employee','$MGRB',
  'linked','worker_confirmed','$WB','$WWB','$WB',now());
insert into organization_evidence_records (organization_id, organization_person_id, evidence_state, supplied_by_organization_id, imported_by_profile_id, hours, activity_date)
 values ('$ORGB','$PWB','ORGANIZATION_REPORTED','$ORGB','$MGRB',8,'2024-01-10');
SQL
}

# A fingerprint of the organization's history for the former worker: count, states,
# suppliers, hours and dates. The whole point of criterion 8 is that it never changes.
FP="select count(*)||'|'||coalesce(string_agg(evidence_state||':'||hours||':'||coalesce(activity_date::text,period_start::text||'..'||period_end::text)||':'||supplied_by_organization_id::text, ',' order by id),'-') from organization_evidence_records where organization_person_id='$PEX'"
ROSTER="select display_name||'|'||relationship_kind||'|'||link_state||'|'||coalesce(link_method,'-') from organization_people where id='$PEX'"
state() { su "select link_state||'/'||coalesce(link_method,'-')||'/'||coalesce(linked_profile_id::text,'-') from organization_people where id='$PEX'"; }
ex_reads() { as $EX new-address@qa.example "select count(*) from organization_evidence_records where organization_person_id='$PEX';"; }

echo "== apply (real migration, verbatim) =========================================="
run_file "$HERE/roster-history-claim-v1.prelude.sql"
run_file "$SUBJ"     # the live subject-answer RPC, unchanged by this work
run_file "$MIG"
seed
FP0="$(su "$FP")"; ROSTER0="$(su "$ROSTER")"; EC0="$(su "select count(*) from engagement_contexts")"
echo "  history fingerprint before: $FP0"

echo; echo "== 1. OFFER (only an authorised representative) =============================="
T1=$(tokhash 'qa-token-one'); T2=$(tokhash 'qa-token-two'); TEXP=$(tokhash 'qa-token-expired')
check "a stranger cannot create a claim for that roster row" "not_found" \
  "$(out "$(as $OTH oth@qa.example "select create_roster_history_claim_v1('$PEX','$T1');")")"
check "another organization's manager cannot either (same answer, no oracle)" "not_found" \
  "$(out "$(as $MGRB mgrb@qa.example "select create_roster_history_claim_v1('$PEX','$T1');")")"
check "the former worker cannot create one for their own row" "not_found" \
  "$(out "$(as $EX new-address@qa.example "select create_roster_history_claim_v1('$PEX','$T1');")")"
check "a manager of the organization creates it" "created" \
  "$(out "$(as $MGRA mgra@qa.example "select create_roster_history_claim_v1('$PEX','$T1');")")"
check "a malformed digest is refused" "invalid" \
  "$(out "$(as $MGRA mgra@qa.example "select create_roster_history_claim_v1('$PEX','not-a-digest');")")"
check "an already-linked row cannot be claimed again" "already_linked" \
  "$(out "$(as $MGRA mgra@qa.example "select create_roster_history_claim_v1('$PCUR','$T2');")")"
check "a second offer replaces the first (one live claim per row)" "1" \
  "$(su "select count(*) from organization_person_history_claims where organization_person_id='$PEX' and status='open'")"
check "nothing is linked by creating a claim" "unlinked/-/-" "$(state)"
check "the digest column is not readable by a signed-in user" "DENIED" \
  "$(as $MGRA mgra@qa.example "select token_hash from organization_person_history_claims limit 1;" | grep -q 'permission denied' && echo DENIED || echo READABLE)"

echo; echo "== 2. PREVIEW (a forwarded link tells a stranger nothing) ====================="
check "a bystander holding the link sees only the organization's name" "QA-SYNTHETIC Former Employer" \
  "$(as $OTH oth@qa.example "select get_roster_history_claim_preview_v1('qa-token-one')->>'organization_name';")"
check "the preview never carries the roster person's name" "0" \
  "$(as $OTH oth@qa.example "select (get_roster_history_claim_preview_v1('qa-token-one')::text ilike '%Former Worker%')::int;")"
check "an unknown token is simply unavailable" "unavailable" \
  "$(out "$(as $OTH oth@qa.example "select get_roster_history_claim_preview_v1('guessed-token');")")"

echo; echo "== 3. REDEEM (identity, single use, replay) ==================================="
check "an unproven address cannot redeem" "email_not_verified" \
  "$(out "$(as $UNV unv@qa.example "select redeem_roster_history_claim_v1('qa-token-one');")")"
check "the manager who made the link cannot redeem it" "creator_cannot_redeem" \
  "$(out "$(as $MGRA mgra@qa.example "select redeem_roster_history_claim_v1('qa-token-one');")")"
check "the former worker redeems with a DIFFERENT address" "redeemed" \
  "$(out "$(as $EX new-address@qa.example "select redeem_roster_history_claim_v1('qa-token-one');")")"
check "the same person cannot redeem it twice (replay)" "unavailable" \
  "$(out "$(as $EX new-address@qa.example "select redeem_roster_history_claim_v1('qa-token-one');")")"
check "a second account cannot redeem the spent link" "unavailable" \
  "$(out "$(as $OTH oth@qa.example "select redeem_roster_history_claim_v1('qa-token-one');")")"
check "redeeming links nothing" "unlinked/-/-" "$(state)"
check "and shows the redeemer no record" "0" "$(ex_reads)"
su "insert into organization_person_history_claims (organization_id, organization_person_id, token_hash, created_by, expires_at)
    values ('$ORGA','$PCUR','$TEXP','$MGRA', now() - interval '1 day')" >/dev/null
check "an expired link is unavailable" "unavailable" \
  "$(out "$(as $OTH oth@qa.example "select redeem_roster_history_claim_v1('qa-token-expired');")")"

echo; echo "== 4. CHECK and APPROVE (the organization sees who came) ======================"
CLAIM=$(su "select id from organization_person_history_claims where organization_person_id='$PEX' and status='redeemed'")
check "a manager sees the redeemer's name and address" "QA-SYNTHETIC Former Worker|new-address@qa.example" \
  "$(as $MGRA mgra@qa.example "select redeemer_name||'|'||redeemer_email from list_roster_history_claims_v1('$ORGA') where claim_id='$CLAIM';")"
check "another organization's manager is told nothing" "0" \
  "$(as $MGRB mgrb@qa.example "select count(*) from list_roster_history_claims_v1('$ORGA');")"
check "a stranger cannot decide" "not_found" \
  "$(out "$(as $OTH oth@qa.example "select decide_roster_history_claim_v1('$CLAIM','approve');")")"
check "the redeemer cannot approve their own claim" "not_found" \
  "$(out "$(as $EX new-address@qa.example "select decide_roster_history_claim_v1('$CLAIM','approve');")")"
check "a second manager of the organization approves" "approved" \
  "$(out "$(as $MGR2 mgra2@qa.example "select decide_roster_history_claim_v1('$CLAIM','approve','former colleague, checked');")")"
check "approval reaches the EXISTING offer state, for that person" "link_proposed/manager_offer/$EX" "$(state)"
check "approval alone shows the person NOTHING" "0" "$(ex_reads)"
check "a manager still cannot force the link to confirmed" "DENIED" \
  "$(as $MGRA mgra@qa.example "update organization_people set link_state='linked', link_method='worker_confirmed' where id='$PEX';" \
     | grep -q "subject" && echo DENIED || echo ALLOWED)"

echo; echo "== 5. CONFIRM (the person's own act, through the existing door) ==============="
check "a bystander cannot confirm somebody else's offer" "0" \
  "$(as $OTH oth@qa.example "update organization_people set link_state='linked', link_method='worker_confirmed' where id='$PEX'; select count(*) from organization_people where id='$PEX' and link_state='linked';")"
check "the person confirms" "1" \
  "$(as $EX new-address@qa.example "update organization_people set link_state='linked', link_method='worker_confirmed' where id='$PEX'; select count(*) from organization_people where id='$PEX' and link_state='linked';")"
check "now the organization's records are readable to them" "3" "$(ex_reads)"
check "the link names the person as the confirmer" "$EX" \
  "$(su "select linked_by from organization_people where id='$PEX'")"

echo; echo "== 6. ISOLATION ==============================================================="
check "the former worker cannot read another person's roster row" "0" \
  "$(as $EX new-address@qa.example "select count(*) from organization_people where id='$PWB';")"
check "nor that person's records" "0" \
  "$(as $EX new-address@qa.example "select count(*) from organization_evidence_records where organization_person_id='$PWB';")"
check "nor the current employee's roster row" "0" \
  "$(as $EX new-address@qa.example "select count(*) from organization_people where id='$PCUR';")"
check "another organization's worker reads none of this history" "0" \
  "$(as $WB wb@qa.example "select count(*) from organization_evidence_records where organization_person_id='$PEX';")"
check "a bystander reads none of it" "0" \
  "$(as $OTH oth@qa.example "select count(*) from organization_evidence_records where organization_person_id='$PEX';")"

echo; echo "== 7. NO WORK RELATIONSHIP, NOTHING REWRITTEN ================================"
check "no engagement row was created anywhere" "$EC0" "$(su "select count(*) from engagement_contexts")"
check "the person holds no relationship with the organization" "0" \
  "$(su "select count(*) from engagement_contexts where profile_id='$EX' and organization_id='$ORGA'")"
check "the history is byte-for-byte what it was" "$FP0" "$(su "$FP")"
check "the roster row's own facts are unchanged" "$ROSTER0" "$(su "$ROSTER" | sed 's/|linked|worker_confirmed/|unlinked|-/')"
check "the current employee's link is untouched" "linked|worker_confirmed|$CUR" \
  "$(su "select link_state||'|'||link_method||'|'||linked_profile_id from organization_people where id='$PCUR'")"

echo; echo "== 8. REVERSAL ================================================================"
check "the person withdraws through the existing door" "unlinked" \
  "$(as $EX new-address@qa.example "select respond_to_roster_link_v1('$PEX','withdraw');")"
check "the records are unreadable to them again" "0" "$(ex_reads)"
check "and the history still exists, unchanged" "$FP0" "$(su "$FP")"
# linked again for the organization-side reversal
as $MGR2 mgra2@qa.example "select create_roster_history_claim_v1('$PEX','$T2');" >/dev/null
as $EX new-address@qa.example "select redeem_roster_history_claim_v1('qa-token-two');" >/dev/null
C2=$(su "select id from organization_person_history_claims where organization_person_id='$PEX' and status='redeemed'")
as $MGRA mgra@qa.example "select decide_roster_history_claim_v1('$C2','approve');" >/dev/null
as $EX new-address@qa.example "update organization_people set link_state='linked', link_method='worker_confirmed' where id='$PEX';" >/dev/null
check "linked again for the second reversal" "3" "$(ex_reads)"
check "the organization must give a reason" "reason_required" \
  "$(out "$(as $MGRA mgra@qa.example "select unlink_roster_person_v1('$PEX', '  ');")")"
check "a stranger cannot unlink" "not_found" \
  "$(out "$(as $OTH oth@qa.example "select unlink_roster_person_v1('$PEX','mine now');")")"
check "the organization reverses a wrong link" "unlinked" \
  "$(out "$(as $MGRA mgra@qa.example "select unlink_roster_person_v1('$PEX','linked to the wrong person');")")"
check "the records are unreadable to that profile again" "0" "$(ex_reads)"
check "the history survived both reversals" "$FP0" "$(su "$FP")"
check "every act left an audit row (2x created, redeemed, approved; withdraw; unlinked)" "8" \
  "$(su "select count(*) from audit_logs where action like 'roster_%'")"
check "no claim row was deleted" "3" "$(su "select count(*) from organization_person_history_claims")"

echo; echo "== 9. ROLLBACK and RE-APPLY ==================================================="
r=$($PSQL -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1 | tr -d '\r' | grep -i 'ROLLBACK REFUSED' | head -1)
checkre "the rollback refuses while claims exist" "ROLLBACK REFUSED: 3 history claim" "$r"
check "and nothing was dropped" "1" "$(su "select count(*) from pg_tables where tablename='organization_person_history_claims'")"
su "delete from organization_person_history_claims" >/dev/null
run_file "$DOWN"
check "with no claims the rollback is clean" "0" \
  "$(su "select (select count(*) from pg_tables where tablename='organization_person_history_claims') + (select count(*) from pg_proc where proname like '%roster_history_claim%' or proname='unlink_roster_person_v1')")"
check "the roster row and its history are still there" "$FP0" "$(su "$FP")"
run_file "$MIG"
check "re-apply restores the functions" "7" \
  "$(su "select count(*) from pg_proc where proname like '%roster_history_claim%' or proname='unlink_roster_person_v1'")"

echo; echo "=============================================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
