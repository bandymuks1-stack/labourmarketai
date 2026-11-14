#!/usr/bin/env bash
# ============================================================================
# agency-placement-terms-v1 — REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# The REAL migration, its rollback and the live respond_agency_candidate_offer_v1 run verbatim over
# the prelude's stand-ins. SYNTHETIC companies and people only; nothing here touches any real database.
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58741 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/agency-placement-terms-v1.sh
#
# Uses database `apt1` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261114120000_agency_placement_terms_v1
MIG="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
V1SRC="$REPO/supabase/migrations/20261008090000_chain_proof_unshare_withdraws_offers_v1.sql"
HOST=${PGPROOF_HOST:-127.0.0.1}; PORT=${PGPROOF_PORT:-58741}
case "$HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
ADMINP="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d apt1 -tA -q"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

$ADMINP -c "drop database if exists apt1" -c "create database apt1" >/dev/null 2>&1 \
  || { echo "cannot reach postgres on $PORT"; exit 2; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then printf '  PASS  %-74s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-74s\n        expected=%s\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
checkre() { if echo "$3" | grep -qE "$2"; then printf '  PASS  %-74s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-74s\n        wanted /%s/\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
run_file() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$TMP/e" || { echo "FAILED: $1"; cat "$TMP/e"; exit 1; }; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
as() { local uid="$1"; shift
  printf "set local role authenticated;\nset local app.uid='%s';\n%s\n" "$uid" "$*" \
  | { echo "begin;"; cat; echo "commit;"; } | $PSQL -v ON_ERROR_STOP=0 -f - 2>&1 \
  | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|$)' | head -1; }
out() { sed -n 's/.*"outcome" *: *"\([a-z_]*\)".*/\1/p' <<< "$1" | head -1; }

AG=a0000000-0000-4000-8000-00000000000a     # owner of the agency under test
AG2=a0000000-0000-4000-8000-00000000000b    # owner of ANOTHER agency
EMP=e0000000-0000-4000-8000-00000000000e    # employer receiving the offer
EMP2=e0000000-0000-4000-8000-00000000000f   # an unrelated employer
W1=c0000000-0000-4000-8000-000000000001     # new worker, no agency
W2=c0000000-0000-4000-8000-000000000002     # worker the OTHER agency represents
W3=c0000000-0000-4000-8000-000000000003     # worker who left this agency's roster earlier
ADM=0a000000-0000-4000-8000-00000000000a    # an admin
WK1=d0000000-0000-4000-8000-000000000001; WK2=d0000000-0000-4000-8000-000000000002
WK3=d0000000-0000-4000-8000-000000000003
AGC=10000000-0000-4000-8000-00000000000a; AGC2=10000000-0000-4000-8000-00000000000b
EC=10000000-0000-4000-8000-00000000000e;  EC2=10000000-0000-4000-8000-00000000000f
REQ=20000000-0000-4000-8000-000000000001; SH=20000000-0000-4000-8000-000000000002
O1=30000000-0000-4000-8000-000000000001   # this agency offers W1
O2=30000000-0000-4000-8000-000000000002   # the other agency (no term) offers W2
O3=30000000-0000-4000-8000-000000000003   # this agency offers W3 — declined

run_file "$HERE/agency-placement-terms-v1.prelude.sql"
awk '/^create or replace function public.respond_agency_candidate_offer_v1/{p=1} p{print} p&&/^\$function\$;/{exit}' "$V1SRC" > "$TMP/v1.sql"
[ -s "$TMP/v1.sql" ] || { echo "could not cut respond_agency_candidate_offer_v1"; exit 1; }
run_file "$TMP/v1.sql"
su "grant execute on function public.respond_agency_candidate_offer_v1(uuid,text,text) to authenticated" >/dev/null

$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into profiles (id, full_name, is_admin) values
 ('$AG','QA-SYNTHETIC Agency owner',false),('$AG2','QA-SYNTHETIC Other agency owner',false),
 ('$EMP','QA-SYNTHETIC Employer',false),('$EMP2','QA-SYNTHETIC Other employer',false),
 ('$W1','QA-SYNTHETIC New worker',false),('$W2','QA-SYNTHETIC Represented worker',false),
 ('$W3','QA-SYNTHETIC Former candidate',false),('$ADM','QA-SYNTHETIC Admin',true);
insert into workers (id, profile_id) values ('$WK1','$W1'),('$WK2','$W2'),('$WK3','$W3');
insert into companies (id, profile_id, legal_name, company_type) values
 ('$AGC','$AG','QA-SYNTHETIC Agency','staffing_agency'),
 ('$AGC2','$AG2','QA-SYNTHETIC Other agency','staffing_agency'),
 ('$EC','$EMP','QA-SYNTHETIC Employer company','employer'),
 ('$EC2','$EMP2','QA-SYNTHETIC Other employer company','employer');
insert into company_workers (company_id, worker_id, status) values
 ('$AGC2','$WK2','active'), ('$AGC','$WK3','removed');
insert into customer_requests (id, title) values ('$REQ','QA-SYNTHETIC need');
insert into agency_client_request_shares (id, status) values ('$SH','active');
SQL

run_file "$MIG"
COND="QA-SYNTHETIC condition: applies to companies that keep their work journal"

echo "== 1. THE AGENCY STATES ITS TERM ==============================================="
check "an employer company is not an agency" "not_found" \
  "$(out "$(as $EMP "select set_agency_placement_term_v1('$AGC', 100, 'EUR', '$COND', 'en');")")"
check "the employer cannot set it for its own non-agency company either" "not_agency" \
  "$(out "$(as $EMP "select set_agency_placement_term_v1('$EC', 100, 'EUR', '$COND', 'en');")")"
check "another agency's owner cannot set this agency's term" "not_found" \
  "$(out "$(as $AG2 "select set_agency_placement_term_v1('$AGC', 100, 'EUR', '$COND', 'en');")")"
check "a malformed currency is refused" "invalid" \
  "$(out "$(as $AG "select set_agency_placement_term_v1('$AGC', 100, 'eur1', '$COND', 'en');")")"
check "a non-https terms link is refused" "invalid" \
  "$(out "$(as $AG "select set_agency_placement_term_v1('$AGC', 100, 'EUR', '$COND', 'en', 'http://x.test');")")"
check "the agency's owner sets a term" "set" \
  "$(out "$(as $AG "select set_agency_placement_term_v1('$AGC', 100, 'EUR', '$COND', 'en');")")"
OLD=$(su "select id from agency_placement_terms where company_id='$AGC' and retired_at is null")
check "a new term retires the previous one" "set" \
  "$(out "$(as $AG "select set_agency_placement_term_v1('$AGC', 120.5, 'eur', '$COND', 'en', 'https://terms.example/qa');")")"
check "one current, one retired, nothing deleted" "1/2" \
  "$(su "select count(*) filter (where retired_at is null) || '/' || count(*) from agency_placement_terms where company_id='$AGC'")"
CUR=$(su "select id from agency_placement_terms where company_id='$AGC' and retired_at is null")
check "the amount is kept to two decimals and the currency upper-case" "120.50 EUR" \
  "$(su "select fee_amount || ' ' || currency from agency_placement_terms where id='$CUR'")"
check "nobody can write the table directly" "DENIED" \
  "$(as $AG "insert into agency_placement_terms (company_id, fee_amount, currency, condition_text, condition_language) values ('$AGC', 1, 'EUR', 'x', 'en');" | grep -q 'permission denied' && echo DENIED || echo ALLOWED)"

echo; echo "== 2. WHO READS IT =============================================================="
check "an employer reads the agency's CURRENT term" "1" \
  "$(as $EMP "select count(*) from agency_placement_terms where company_id='$AGC';")"
check "an employer does not read a retired term it never accepted" "0" \
  "$(as $EMP "select count(*) from agency_placement_terms where id='$OLD';")"
check "the agency reads its own history" "2" \
  "$(as $AG "select count(*) from agency_placement_terms where company_id='$AGC';")"
check "an anonymous caller reads nothing" "DENIED" \
  "$(r=$($PSQL -c "set role anon; select count(*) from public.agency_placement_terms;" 2>&1 || true); case "$r" in *"permission denied"*) echo DENIED;; *) echo ALLOWED;; esac)"

echo; echo "== 3. THE SUGGESTION TO WORKERS ================================================"
su "insert into platform_suggested_agencies (company_id, consent_text_version, created_by) values ('$AGC', 'qa.v1', '$ADM')" >/dev/null
check "a worker with no agency is offered the suggestion" "1" \
  "$(as $W1 "select count(*) from list_agency_suggestions_for_me_v1();")"
check "it names the agency by its own record" "QA-SYNTHETIC Agency" \
  "$(as $W1 "select agency_name from list_agency_suggestions_for_me_v1();")"
check "a worker another agency represents is NOT offered it" "0" \
  "$(as $W2 "select count(*) from list_agency_suggestions_for_me_v1();")"
check "a worker who left this agency is NOT offered it again" "0" \
  "$(as $W3 "select count(*) from list_agency_suggestions_for_me_v1();")"
check "an employer (no worker profile) is not offered it" "0" \
  "$(as $EMP "select count(*) from list_agency_suggestions_for_me_v1();")"
check "a worker cannot read the admin list itself" "0" \
  "$(as $W1 "select count(*) from platform_suggested_agencies;")"
check "nor add an agency to it" "DENIED" \
  "$(as $AG "insert into platform_suggested_agencies (company_id, consent_text_version) values ('$AGC2', 'x');" | grep -q 'permission denied' && echo DENIED || echo ALLOWED)"
check "an admin reads the list" "1" \
  "$(as $ADM "select count(*) from platform_suggested_agencies;")"

echo; echo "== 4. THE WORKER'S OWN CHOICE ==================================================="
check "consent to a different text version is refused" "consent_text_changed" \
  "$(out "$(as $W1 "select join_suggested_agency_v1('$AGC', 'qa.v0');")")"
check "nothing was written by the refusal" "0" \
  "$(su "select count(*) from company_workers where worker_id='$WK1'")"
check "the worker joins" "joined" \
  "$(out "$(as $W1 "select join_suggested_agency_v1('$AGC', 'qa.v1');")")"
check "they are on the agency's EXISTING roster, active" "active" \
  "$(su "select status from company_workers where company_id='$AGC' and worker_id='$WK1'")"
check "the consent version is on the audit trail" "qa.v1" \
  "$(su "select payload->>'consent_text_version' from audit_logs where action='suggested_agency_joined' and actor_id='$W1'")"
check "joining twice is refused" "already_known" \
  "$(out "$(as $W1 "select join_suggested_agency_v1('$AGC', 'qa.v1');")")"
check "a represented worker cannot be moved to this agency" "represented_elsewhere" \
  "$(out "$(as $W2 "select join_suggested_agency_v1('$AGC', 'qa.v1');")")"
check "and their existing agency link is untouched" "active/0" \
  "$(su "select (select status from company_workers where company_id='$AGC2' and worker_id='$WK2') || '/' || (select count(*) from company_workers where company_id='$AGC' and worker_id='$WK2')")"
check "a worker who left is not re-added by this road" "already_known" \
  "$(out "$(as $W3 "select join_suggested_agency_v1('$AGC', 'qa.v1');")")"
check "an agency not on the list cannot be joined this way" "not_available" \
  "$(out "$(as $W1 "select join_suggested_agency_v1('$AGC2', 'qa.v1');")")"
check "the list row switched off ends the suggestion" "0" \
  "$(su "update platform_suggested_agencies set active=false; select 0" >/dev/null; as $W1 "select count(*) from list_agency_suggestions_for_me_v1();")"
su "update platform_suggested_agencies set active=true" >/dev/null

echo; echo "== 5. THE EMPLOYER'S DECISION =================================================="
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into agency_candidate_offers (id, request_share_id, agency_company_id, client_company_id, request_id, worker_id) values
 ('$O1','$SH','$AGC','$EC','$REQ','$WK1'),
 ('$O2','$SH','$AGC2','$EC','$REQ','$WK2'),
 ('$O3','$SH','$AGC','$EC','$REQ','$WK3');
SQL
checkre "accepting without naming the term is refused" "placement_term_not_accepted" \
  "$(as $EMP "select respond_agency_candidate_offer_v2('$O1', 'accepted', null, null);")"
checkre "accepting with a retired term is refused" "placement_term_not_accepted" \
  "$(as $EMP "select respond_agency_candidate_offer_v2('$O1', 'accepted', null, '$OLD');")"
check "the refused offer is still open, nothing recorded" "offered/-" \
  "$(su "select status || '/' || coalesce(accepted_placement_term_id::text,'-') from agency_candidate_offers where id='$O1'")"
checkre "another employer cannot decide it" "not_owner" \
  "$(as $EMP2 "select respond_agency_candidate_offer_v2('$O1', 'accepted', null, '$CUR');")"
checkre "accepting with the current term proposes the booking" "^[0-9a-f-]{36}$" \
  "$(as $EMP "select respond_agency_candidate_offer_v2('$O1', 'accepted', null, '$CUR');")"
check "the accepted term is recorded on the decision" "accepted/$CUR/true" \
  "$(su "select status || '/' || accepted_placement_term_id || '/' || (placement_term_accepted_at is not null) from agency_candidate_offers where id='$O1'")"
check "and on the audit trail" "1" \
  "$(su "select count(*) from audit_logs where action='agency_placement_term_accepted' and entity_id='$O1'")"
check "a declined offer records no term" "declined/-" \
  "$(as $EMP "select respond_agency_candidate_offer_v2('$O3', 'declined', null, null);" >/dev/null; su "select status || '/' || coalesce(accepted_placement_term_id::text,'-') from agency_candidate_offers where id='$O3'")"
checkre "an agency with NO term: accepted as before, without any term" "^[0-9a-f-]{36}$" \
  "$(as $EMP "select respond_agency_candidate_offer_v2('$O2', 'accepted', null, null);")"
check "and nothing is recorded for it" "accepted/-" \
  "$(su "select status || '/' || coalesce(accepted_placement_term_id::text,'-') from agency_candidate_offers where id='$O2'")"
check "acceptances recorded: exactly the one accepted offer of the agency with a term" "1" \
  "$(su "select count(*) from agency_candidate_offers where accepted_placement_term_id is not null")"
as $AG "select set_agency_placement_term_v1('$AGC', 130, 'EUR', '$COND', 'en');" >/dev/null
check "after a new term, the employer still reads the term it accepted" "1" \
  "$(as $EMP "select count(*) from agency_placement_terms where id='$CUR';")"
check "another employer does not read that retired term" "0" \
  "$(as $EMP2 "select count(*) from agency_placement_terms where id='$CUR';")"
check "the agency can retire its term" "retired" \
  "$(out "$(as $AG "select retire_agency_placement_term_v1('$AGC');")")"

echo; echo "== 6. ROLLBACK and RE-APPLY ===================================================="
r=$($PSQL -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1 | tr -d '\r' | grep -i 'ROLLBACK REFUSED' | head -1)
checkre "the rollback refuses while terms and acceptances exist" "ROLLBACK REFUSED: 3 placement term" "$r"
check "and nothing was dropped" "1" "$(su "select count(*) from pg_tables where tablename='agency_placement_terms'")"
su "update agency_candidate_offers set accepted_placement_term_id=null, placement_term_accepted_at=null" >/dev/null
su "delete from agency_placement_terms" >/dev/null
su "delete from platform_suggested_agencies" >/dev/null
run_file "$DOWN"
check "with nothing recorded the rollback is clean" "0" \
  "$(su "select (select count(*) from pg_tables where tablename in ('agency_placement_terms','platform_suggested_agencies')) + (select count(*) from pg_proc where proname in ('set_agency_placement_term_v1','retire_agency_placement_term_v1','respond_agency_candidate_offer_v2','list_agency_suggestions_for_me_v1','join_suggested_agency_v1')) + (select count(*) from information_schema.columns where table_name='agency_candidate_offers' and column_name like '%placement_term%')")"
check "the roster rows and offers are still there" "3/3" \
  "$(su "select (select count(*) from company_workers) || '/' || (select count(*) from agency_candidate_offers)")"
run_file "$MIG"
check "re-apply restores the five functions" "5" \
  "$(su "select count(*) from pg_proc where proname in ('set_agency_placement_term_v1','retire_agency_placement_term_v1','respond_agency_candidate_offer_v2','list_agency_suggestions_for_me_v1','join_suggested_agency_v1')")"

echo; echo "=============================================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
