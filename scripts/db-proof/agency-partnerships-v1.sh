#!/usr/bin/env bash
# ============================================================================
# agency-partnerships-v1 — REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# Loads, verbatim from the repository: 20261114235900_agency_placement_terms_v1, the live
# respond_agency_candidate_offer_v1, 20261118100000_agency_partnerships_commissions_v1 and its
# rollback, over the two preludes' stand-ins. SYNTHETIC companies and people only.
#
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/agency-partnerships-v1.sh
#
# Uses database `apc1` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TERMS="$REPO/supabase/migrations/20261114235900_agency_placement_terms_v1.sql"
NAME=20261118100000_agency_partnerships_commissions_v1
MIG="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
V1SRC="$REPO/supabase/migrations/20261008090000_chain_proof_unshare_withdraws_offers_v1.sql"
HOST=${PGPROOF_HOST:-127.0.0.1}; PORT=${PGPROOF_PORT:-58741}
case "$HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
ADMINP="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d apc1 -tA -q"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

$ADMINP -c "drop database if exists apc1" -c "create database apc1" >/dev/null 2>&1 \
  || { echo "cannot reach postgres on $PORT"; exit 2; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then printf '  PASS  %-78s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-78s\n        expected=%s\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
checkre() { if echo "$3" | grep -qE "$2"; then printf '  PASS  %-78s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-78s\n        wanted /%s/\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
run_file() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$TMP/e" || { echo "FAILED: $1"; cat "$TMP/e"; exit 1; }; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
# as <uid> <email|-> <sql>: one statement as an authenticated caller with that e-mail claim.
as() { local uid="$1" email="$2"; shift 2; [ "$email" = "-" ] && email=""
  printf "set local role authenticated;\nset local app.uid='%s';\nset local app.email='%s';\n%s\n" "$uid" "$email" "$*" \
  | { echo "begin;"; cat; echo "commit;"; } | $PSQL -v ON_ERROR_STOP=0 -f - 2>&1 \
  | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //; s/^ERROR: *//' | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|$)' | head -1; }
# as_unverified <uid> <email> <sql>: the same caller, but with the e-mail NOT proven (R2 P2-2).
as_unverified() { local uid="$1" email="$2"; shift 2
  printf "set local role authenticated;\nset local app.uid='%s';\nset local app.email='%s';\nset local app.email_verified='false';\n%s\n" "$uid" "$email" "$*" \
  | { echo "begin;"; cat; echo "commit;"; } | $PSQL -v ON_ERROR_STOP=0 -f - 2>&1 \
  | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //; s/^ERROR: *//' | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|$)' | head -1; }

L=a0000000-0000-4000-8000-00000000000a     # owner of the LEAD agency
P=a0000000-0000-4000-8000-00000000000b     # owner of the PARTNER agency (invited as partner@example.test)
X=a0000000-0000-4000-8000-00000000000c     # owner of a THIRD agency
EMP=e0000000-0000-4000-8000-00000000000e   # the client
ADM=0a000000-0000-4000-8000-00000000000a
LC=10000000-0000-4000-8000-00000000000a; PC=10000000-0000-4000-8000-00000000000b
XC=10000000-0000-4000-8000-00000000000c; EC=10000000-0000-4000-8000-00000000000e
WP1=d0000000-0000-4000-8000-000000000001   # on the partner's roster
WP2=d0000000-0000-4000-8000-000000000002   # on the partner's roster
WL=d0000000-0000-4000-8000-000000000003    # on the lead's roster
WN=d0000000-0000-4000-8000-000000000004    # on nobody's roster
CONN=20000000-0000-4000-8000-0000000000c1; CONNX=20000000-0000-4000-8000-0000000000c2
REQ=20000000-0000-4000-8000-000000000001; SH=20000000-0000-4000-8000-000000000002
REQX=20000000-0000-4000-8000-000000000003; SHX=20000000-0000-4000-8000-000000000004
PE=partner@example.test

run_file "$HERE/agency-placement-terms-v1.prelude.sql"
awk '/^create or replace function public.respond_agency_candidate_offer_v1/{p=1} p{print} p&&/^\$function\$;/{exit}' "$V1SRC" > "$TMP/v1.sql"
[ -s "$TMP/v1.sql" ] || { echo "could not cut respond_agency_candidate_offer_v1"; exit 1; }
run_file "$TMP/v1.sql"
# as main leaves it (20260928210000 :84-85): not public, not anon, signed-in callers only
su "revoke all on function public.respond_agency_candidate_offer_v1(uuid,text,text) from public" >/dev/null
su "grant execute on function public.respond_agency_candidate_offer_v1(uuid,text,text) to authenticated" >/dev/null
run_file "$TERMS"
run_file "$HERE/agency-partnerships-v1.prelude.sql"

$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into profiles (id, full_name, is_admin) values
 ('$L','QA-SYNTHETIC Lead owner',false),('$P','QA-SYNTHETIC Partner owner',false),
 ('$X','QA-SYNTHETIC Third agency owner',false),('$EMP','QA-SYNTHETIC Client',false),
 ('$ADM','QA-SYNTHETIC Admin',true),
 ('f0000000-0000-4000-8000-000000000001','QA-SYNTHETIC W1',false),('f0000000-0000-4000-8000-000000000002','QA-SYNTHETIC W2',false),
 ('f0000000-0000-4000-8000-000000000003','QA-SYNTHETIC W3',false),('f0000000-0000-4000-8000-000000000004','QA-SYNTHETIC W4',false);
insert into workers (id, profile_id) values
 ('$WP1','f0000000-0000-4000-8000-000000000001'),('$WP2','f0000000-0000-4000-8000-000000000002'),
 ('$WL','f0000000-0000-4000-8000-000000000003'),('$WN','f0000000-0000-4000-8000-000000000004');
insert into companies (id, profile_id, legal_name, company_type) values
 ('$LC','$L','QA-SYNTHETIC Lead agency','staffing_agency'),
 ('$PC','$P','QA-SYNTHETIC Partner agency','staffing_agency'),
 ('$XC','$X','QA-SYNTHETIC Third agency','staffing_agency'),
 ('$EC','$EMP','QA-SYNTHETIC Client company','employer');
insert into company_workers (company_id, worker_id, status) values
 ('$PC','$WP1','active'),('$PC','$WP2','active'),('$LC','$WL','active');
insert into customer_requests (id, title, country) values
 ('$REQ','QA-SYNTHETIC need','LT'),('$REQX','QA-SYNTHETIC other need','LT');
insert into agency_client_connections (id, agency_company_id, client_company_id, status) values
 ('$CONN','$LC','$EC','active'),('$CONNX','$XC','$EC','active');
update agency_client_request_shares set connection_id = null where false;
insert into agency_client_request_shares (id, status, connection_id, request_id) values
 ('$SH','active','$CONN','$REQ'),('$SHX','active','$CONNX','$REQX');
SQL

# The client's candidate list as main has it (20261003100000), to prove what the client sees.
V2LIST="$REPO/supabase/migrations/20261003100000_list_agency_offered_candidates_v2_connection_gate_v1.sql"
awk '/^create or replace function public.list_agency_offered_candidates_for_request_v2/{p=1} p{print} p&&/^\$\$;/{exit}' "$V2LIST" > "$TMP/v2list.sql"
[ -s "$TMP/v2list.sql" ] || { echo "could not cut list_agency_offered_candidates_for_request_v2"; exit 1; }
run_file "$TMP/v2list.sql"
su "grant execute on function public.list_agency_offered_candidates_for_request_v2(uuid) to authenticated" >/dev/null
su "update customer_requests set profile_id = '$EMP' where id in ('$REQ','$REQX')" >/dev/null

run_file "$MIG"
COND="QA-SYNTHETIC condition: due only on an actual placement"

echo "== 1. THE LEAD INVITES A PARTNER AGENCY ========================================="
check "another agency's owner cannot invite for the lead" "not_owner" \
  "$(as $P - "select invite_agency_partner_v1('$LC', '$PE', 20);")"
check "an employer company cannot invite" "not_agency" \
  "$(as $EMP - "select invite_agency_partner_v1('$EC', '$PE', 20);")"
check "a share of 0 % is refused" "invalid_share" "$(as $L - "select invite_agency_partner_v1('$LC', '$PE', 0);")"
check "a share of 100 % is refused" "invalid_share" "$(as $L - "select invite_agency_partner_v1('$LC', '$PE', 100);")"
check "a share finer than 0.01 % is refused" "invalid_share" "$(as $L - "select invite_agency_partner_v1('$LC', '$PE', 12.345);")"
check "a malformed e-mail is refused" "invalid_email" "$(as $L - "select invite_agency_partner_v1('$LC', 'not-an-email', 20);")"
PID=$(as $L - "select invite_agency_partner_v1('$LC', '$PE', 20);")
checkre "the lead invites the partner at a 20 % share" "^[0-9a-f-]{36}$" "$PID"
check "a second open invitation to the same address is refused" "already_invited" \
  "$(as $L - "select invite_agency_partner_v1('$LC', '$PE', 25);")"
check "the invitation is pending, with no partner company yet" "pending/-/20.00" \
  "$(su "select status||'/'||coalesce(partner_company_id::text,'-')||'/'||partner_share_percent from agency_partnerships where id='$PID'")"
check "the audit trail records the invitation" "1" \
  "$(su "select count(*) from audit_logs where action='agency_partnership_invited' and entity_id='$PID'")"

echo "== 2. THE INVITED AGENCY ACCEPTS, FOR AN AGENCY IT GOVERNS ======================"
check "a caller with another e-mail learns nothing" "invitation_not_found" \
  "$(as $X x@example.test "select accept_agency_partnership_v1('$PID', '$XC');")"
check "R2 P2-2: an UNVERIFIED session with the invited address cannot accept" "invitation_not_found" \
  "$(as_unverified $P $PE "select accept_agency_partnership_v1('$PID', '$PC');")"
check "R2 P2-2: nor decline" "invitation_not_found" \
  "$(as_unverified $P $PE "select decline_agency_partnership_v1('$PID');")"
check "R2 P2-2: nor see the invitation in its list" "0" \
  "$(as_unverified $P $PE "select count(*) from list_agency_partnerships_v1();")"
check "R2 P2-2: the refused attempts changed nothing" "pending" "$(su "select status from agency_partnerships where id='$PID'")"
check "the addressee cannot accept for an agency they do not govern" "not_owner" \
  "$(as $P $PE "select accept_agency_partnership_v1('$PID', '$XC');")"
check "the addressee sees the invitation in their list" "invited/QA-SYNTHETIC Lead agency/-" \
  "$(as $P $PE "select side||'/'||lead_name||'/'||coalesce(invited_email,'-') from list_agency_partnerships_v1();")"
check "the addressee accepts for its own agency" "$PID" "$(as $P $PE "select accept_agency_partnership_v1('$PID', '$PC');")"
check "the partnership is active with the partner company named" "active/$PC" \
  "$(su "select status||'/'||partner_company_id from agency_partnerships where id='$PID'")"
check "the partner reads its side" "partner/20.00" \
  "$(as $P - "select side||'/'||partner_share_percent from list_agency_partnerships_v1();")"
check "the lead reads its side and the invited address" "lead/QA-SYNTHETIC Partner agency/$PE" \
  "$(as $L - "select side||'/'||partner_name||'/'||invited_email from list_agency_partnerships_v1();")"
check "a third agency reads no partnership row" "0" "$(as $X - "select count(*) from agency_partnerships;")"
check "the client reads no partnership row" "0" "$(as $EMP - "select count(*) from agency_partnerships;")"
checkre "nobody writes the table directly" "permission denied" \
  "$(as $L - "insert into agency_partnerships (lead_company_id, invited_email, partner_share_percent) values ('$LC','a@b.cc',10);")"
PID2=$(as $L - "select invite_agency_partner_v1('$LC', 'other@example.test', 30);")
check "a second invitee declines" "declined" \
  "$(as $X other@example.test "select decline_agency_partnership_v1('$PID2');" >/dev/null; su "select status from agency_partnerships where id='$PID2'")"

echo "== 3. THE LEAD PASSES ITS CLIENT'S NEED TO THE PARTNER =========================="
check "the partner cannot pass a need" "partnership_not_active" \
  "$(as $P - "select share_request_with_partner_v1('$PID', '$SH');")"
check "the lead cannot pass a need shared with ANOTHER agency" "share_not_active" \
  "$(as $L - "select share_request_with_partner_v1('$PID', '$SHX');")"
PS=$(as $L - "select share_request_with_partner_v1('$PID', '$SH');")
checkre "the lead passes its client's need" "^[0-9a-f-]{36}$" "$PS"
check "passing it again returns the same pass" "$PS" "$(as $L - "select share_request_with_partner_v1('$PID', '$SH');")"
check "the partner reads the need: lead, title, country, share" "QA-SYNTHETIC Lead agency/QA-SYNTHETIC need/LT/20.00" \
  "$(as $P - "select lead_name||'/'||title||'/'||country||'/'||partner_share_percent from list_partner_shared_requests_v1();")"
check "the partner's read has no client column" "0" \
  "$(su "select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname='list_partner_shared_requests_v1' and a like '%client%'")"
check "a third agency reads no passed need" "0" "$(as $X - "select count(*) from list_partner_shared_requests_v1();")"

echo "== 4. THE PARTNER OFFERS ITS OWN ROSTER WORKER =================================="
check "a worker not on the partner's roster is refused" "worker_not_on_roster" \
  "$(as $P - "select submit_partner_candidate_offer_v1('$PS', '$WN');")"
check "the lead's own worker is not the partner's to offer" "worker_not_on_roster" \
  "$(as $P - "select submit_partner_candidate_offer_v1('$PS', '$WL');")"
check "a third agency cannot offer on the pass" "not_owner" \
  "$(as $X - "select submit_partner_candidate_offer_v1('$PS', '$WP1');")"
OP=$(as $P - "select submit_partner_candidate_offer_v1('$PS', '$WP1', 'QA-SYNTHETIC note');")
checkre "the partner offers its worker" "^[0-9a-f-]{36}$" "$OP"
check "the offer is on the CLIENT's share and connection, under the LEAD (the client's agency of record), through the pass" \
  "$LC/$EC/$CONN/$SH/$PS/offered" \
  "$(su "select agency_company_id||'/'||client_company_id||'/'||connection_id||'/'||request_share_id||'/'||partner_share_id||'/'||status from agency_candidate_offers where id='$OP'")"
check "the lead sees the partner's offer, by status" "QA-SYNTHETIC Partner agency/offered" \
  "$(as $L - "select partner_name||'/'||status from list_partner_offers_for_lead_v1();")"
check "the lead's read carries no worker column" "0" \
  "$(su "select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname='list_partner_offers_for_lead_v1' and a like '%worker%'")"
check "the partner cannot list the lead's partner offers" "0" "$(as $P - "select count(*) from list_partner_offers_for_lead_v1();")"
check "R2 P2-3: the partner cannot read its partner-offer row directly (no client_company_id)" "0" \
  "$(as $P - "select count(*) from agency_candidate_offers where id='$OP';")"
check "R2 P2-3: nor any row naming the lead's client" "0" \
  "$(as $P - "select count(*) from agency_candidate_offers where client_company_id='$EC';")"
check "R2 P2-3: the client still reads the offer made to it" "1" \
  "$(as $EMP - "select count(*) from agency_candidate_offers where id='$OP';")"
check "R2 P2-3: the policy narrows only the agency arm" "1" \
  "$(su "select count(*) from pg_policies where policyname='agency_candidate_offers_select' and qual like '%partner_share_id IS NULL%'")"

echo "== 4b. OWNER PRINCIPLE: THE CLIENT SEES ONLY ITS OWN (LEAD) AGENCY ============="
check "decision 0033: the whole chain is kept for internal audit (source, submitter, presenter)" \
  "source:$PC/submitter:$PC/presenter_to_client:$LC/$PID/$PS/not_recorded/$P" \
  "$(su "select string_agg((e->>'role')||':'||(e->>'company_id'), '/' order by i)||'/'||(payload->>'partnership_id')||'/'||(payload->>'partner_share_id')||'/'||(payload->>'agency_verification')||'/'||actor_id from audit_logs, jsonb_array_elements(payload->'chain') with ordinality as c(e, i) where action='agency_partner_candidate_offered' and entity_id='$OP' group by payload, actor_id")"
check "(a) the audit chain is not readable by the client or either agency" "0/0/0" \
  "$(as $EMP - "select count(*) from audit_logs;")/$(as $L - "select count(*) from audit_logs;")/$(as $P - "select count(*) from audit_logs;")"
check "(a) the client's candidate list names the LEAD on the partner's candidate" "QA-SYNTHETIC Lead agency" \
  "$(as $EMP - "select agency_name from list_agency_offered_candidates_for_request_v2('$REQ') where offer_id='$OP';")"
check "(a) no granted column of the client's row holds the partner's company or staff id" "0" \
  "$(as $EMP - "select count(*) from (select row_to_json(t)::text j from (select id, connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id, status, note, created_at, withdrawn_at, updated_at, booking_id, decision_note, decided_by, decided_at, accepted_placement_term_id, placement_term_accepted_at from agency_candidate_offers where id='$OP') t) x where j like '%$PC%' or j like '%$P%';")"
checkre "(a) the client cannot read who created the offer" "permission denied" \
  "$(as $EMP - "select created_by from agency_candidate_offers where id='$OP';")"
checkre "(a) nor who withdrew an offer" "permission denied" \
  "$(as $EMP - "select withdrawn_by from agency_candidate_offers where id='$OP';")"
checkre "(a) nor the partner step an offer came through" "permission denied" \
  "$(as $EMP - "select partner_share_id from agency_candidate_offers where id='$OP';")"
check "(a) the client reads no partnership and no passed need" "0/0" \
  "$(as $EMP - "select (select count(*) from agency_partnerships)||'/'||(select count(*) from agency_partner_request_shares);")"
check "(a) nor any partnership read, commission or partner-offer list" "0/0/0" \
  "$(as $EMP - "select (select count(*) from list_agency_partnerships_v1())||'/'||(select count(*) from list_agency_commissions_v1())||'/'||(select count(*) from list_partner_offers_for_lead_v1());")"
check "(b) the partner follows its own offer, without a client column" "1/offered" \
  "$(as $P - "select count(*)||'/'||min(offer_status) from list_agency_offer_progress_v1() where offer_id='$OP';")"
check "(b) the partner's progress reads have no client column" "0" \
  "$(su "select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname in ('list_agency_offer_progress_v1','list_agency_placements_v1') and a like '%client%' and a <> 'client_decided_at'")"
check "(b) the lead does not follow the partner's offer as its own (no worker identity)" "0" \
  "$(as $L - "select count(*) from list_agency_offer_progress_v1() where offer_id='$OP';")"
check "(b) the lead cannot withdraw the partner's offer" "f" \
  "$(as $L - "select withdraw_agency_candidate_offer_v1('$OP');")"
# (c) the direct flow, unchanged: the lead offers its own roster worker on its own client's need.
ODIR=$(as $L - "select submit_agency_candidate_offer_v1('$SH', '$WL', 'QA-SYNTHETIC direct');")
checkre "(c) the lead's direct offer is accepted as before" "^[0-9a-f-]{36}$" "$ODIR"
check "(c) a direct offer: agency = the lead, no partner step" "$LC/true" \
  "$(su "select agency_company_id||'/'||(partner_share_id is null) from agency_candidate_offers where id='$ODIR'")"
check "(c) offering it again re-affirms the same offer" "$ODIR" \
  "$(as $L - "select submit_agency_candidate_offer_v1('$SH', '$WL');")"
check "(c) the client sees it under the lead, the lead follows it" "QA-SYNTHETIC Lead agency/1" \
  "$(as $EMP - "select agency_name from list_agency_offered_candidates_for_request_v2('$REQ') where offer_id='$ODIR';")/$(as $L - "select count(*) from list_agency_offer_progress_v1() where offer_id='$ODIR';")"
check "(c) the lead reads its direct row directly, as before" "1" \
  "$(as $L - "select count(*) from agency_candidate_offers where id='$ODIR';")"
# A worker on BOTH rosters: neither side may take over the other's open offer of them on this need.
su "insert into company_workers (company_id, worker_id, status) values ('$LC','$WP1','active'),('$PC','$WL','active')" >/dev/null
check "a direct offer never takes over the partner's open offer of the same worker" "already_offered" \
  "$(as $L - "select submit_agency_candidate_offer_v1('$SH', '$WP1');")"
check "a partner offer never takes over the lead's open direct offer" "already_offered" \
  "$(as $P - "select submit_partner_candidate_offer_v1('$PS', '$WL');")"
check "both offers kept their owner" "$PS/true" \
  "$(su "select (select partner_share_id from agency_candidate_offers where id='$OP')||'/'||(select partner_share_id is null from agency_candidate_offers where id='$ODIR')")"
su "delete from company_workers where (company_id, worker_id) in (('$LC','$WP1'),('$PC','$WL'))" >/dev/null
check "(c) the lead withdraws its direct offer, as before" "t/withdrawn" \
  "$(as $L - "select withdraw_agency_candidate_offer_v1('$ODIR');")/$(su "select status from agency_candidate_offers where id='$ODIR'")"

echo "== 5. THE CLIENT ACCEPTS ON THE LEAD'S TERM ====================================="
as $L - "select set_agency_placement_term_v1('$LC', 1000, 'EUR', '$COND', 'en');" >/dev/null
as $P - "select set_agency_placement_term_v1('$PC', 500, 'EUR', '$COND', 'en');" >/dev/null
LT=$(su "select id from agency_placement_terms where company_id='$LC' and retired_at is null")
PT=$(su "select id from agency_placement_terms where company_id='$PC' and retired_at is null")
check "naming the PARTNER's own term is refused: the agreement is with the lead" "placement_term_not_accepted" \
  "$(as $EMP - "select respond_agency_candidate_offer_v2('$OP', 'accepted', null, '$PT');")"
check "naming no term is refused" "placement_term_not_accepted" \
  "$(as $EMP - "select respond_agency_candidate_offer_v2('$OP', 'accepted', null, null);")"
checkre "accepting with the LEAD's term proposes the booking" "^[0-9a-f-]{36}$" \
  "$(as $EMP - "select respond_agency_candidate_offer_v2('$OP', 'accepted', null, '$LT');")"
check "the lead's term is recorded on the partner's offer" "accepted/$LT" \
  "$(su "select status||'/'||accepted_placement_term_id from agency_candidate_offers where id='$OP'")"
check "the audit trail names whose term it was and the pass" "$LC/$PS" \
  "$(su "select payload->>'term_company_id'||'/'||(payload->>'partner_share_id') from audit_logs where action='agency_placement_term_accepted' and entity_id='$OP'")"

echo "== 6. COMMISSIONS: DUE ONLY ON A PLACEMENT, SPLIT BY THE AGREED SHARE ==========="
check "before the worker accepts: the lead's part is pending, 80 %, no amount" "lead/QA-SYNTHETIC Partner agency/1000.00/80.00/-/pending" \
  "$(as $L - "select role||'/'||counterpart_name||'/'||fee_amount||'/'||share_percent||'/'||coalesce(amount::text,'-')||'/'||placement_status from list_agency_commissions_v1();")"
check "before the worker accepts: the partner's part is pending, 20 %" "partner/QA-SYNTHETIC Lead agency/20.00/-/pending" \
  "$(as $P - "select role||'/'||counterpart_name||'/'||share_percent||'/'||coalesce(amount::text,'-')||'/'||placement_status from list_agency_commissions_v1();")"
BK=$(su "select booking_id from agency_candidate_offers where id='$OP'")
su "update booking_requests set status='accepted' where id='$BK'" >/dev/null
su "insert into company_worker_engagements (source_booking_id) values ('$BK')" >/dev/null
check "after the placement: the lead's part is due, 800.00 EUR" "placed/800.00/EUR" \
  "$(as $L - "select placement_status||'/'||amount||'/'||currency from list_agency_commissions_v1();")"
check "after the placement: the partner's part is due, 200.00 EUR" "placed/200.00/EUR" \
  "$(as $P - "select placement_status||'/'||amount||'/'||currency from list_agency_commissions_v1();")"
CL=$(as $L - "select (amount*100)::int from list_agency_commissions_v1();")
CP=$(as $P - "select (amount*100)::int from list_agency_commissions_v1();")
check "the two parts add up to the lead's term" "100000" "$(( CL + CP ))"
check "the client reads no commission row" "0" "$(as $EMP - "select count(*) from list_agency_commissions_v1();")"
check "a third agency reads no commission row" "0" "$(as $X - "select count(*) from list_agency_commissions_v1();")"
OD=30000000-0000-4000-8000-0000000000d1
su "insert into agency_candidate_offers (id, connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id) values ('$OD','$CONN','$SH','$LC','$EC','$REQ','$WL')" >/dev/null
as $EMP - "select respond_agency_candidate_offer_v2('$OD', 'accepted', null, '$LT');" >/dev/null
BKD=$(su "select booking_id from agency_candidate_offers where id='$OD'")
check "the lead's own candidate: direct, 100 %, pending until placed" "direct/100/pending" \
  "$(as $L - "select role||'/'||share_percent||'/'||placement_status from list_agency_commissions_v1() where offer_id='$OD';")"
su "update booking_requests set status='declined' where id='$BKD'" >/dev/null
check "a declined booking is not placed and carries no amount" "not_placed/-" \
  "$(as $L - "select placement_status||'/'||coalesce(amount::text,'-') from list_agency_commissions_v1() where offer_id='$OD';")"

echo "== 7. TERM HISTORY: THE PARTNER KEEPS READING THE TERM IT WAS PLACED UNDER ======"
as $L - "select set_agency_placement_term_v1('$LC', 1200, 'EUR', '$COND', 'en');" >/dev/null
check "the lead's old term is retired" "1" "$(su "select count(*) from agency_placement_terms where id='$LT' and retired_at is not null")"
check "the partner still reads the retired term accepted on its offer" "1" \
  "$(as $P - "select count(*) from agency_placement_terms where id='$LT';")"
check "a third agency does not read the retired term" "0" \
  "$(as $X - "select count(*) from agency_placement_terms where id='$LT';")"
check "the commission keeps the term it was accepted under" "800.00" \
  "$(as $L - "select amount from list_agency_commissions_v1() where offer_id='$OP';")"

echo "== 8. TAKING A NEED BACK, AND ENDING THE PARTNERSHIP ============================"
OP2=$(as $P - "select submit_partner_candidate_offer_v1('$PS', '$WP2');")
check "the partner cannot take the need back; only the lead can" "partner_share_not_found" \
  "$(as $P - "select unshare_request_with_partner_v1('$PS');")"
as $L - "select unshare_request_with_partner_v1('$PS');" >/dev/null
check "taking it back withdraws the open offer and revokes the pass" "withdrawn/revoked" \
  "$(su "select o.status||'/'||s.status from agency_candidate_offers o, agency_partner_request_shares s where o.id='$OP2' and s.id='$PS'")"
check "the accepted offer and its placement stay" "accepted" "$(su "select status from agency_candidate_offers where id='$OP'")"
check "an offer on a revoked pass is refused" "share_not_active" \
  "$(as $P - "select submit_partner_candidate_offer_v1('$PS', '$WP2');")"
PS2=$(as $L - "select share_request_with_partner_v1('$PID', '$SH');")
OP3=$(as $P - "select submit_partner_candidate_offer_v1('$PS2', '$WP2');")
su "update agency_partnerships set status='ended' where id='$PID'" >/dev/null
check "a partner offer cannot be accepted once the partnership is not active" "partnership_not_active" \
  "$(as $EMP - "select respond_agency_candidate_offer_v2('$OP3', 'accepted', null, (select id from agency_placement_terms where company_id='$LC' and retired_at is null));")"
su "update agency_partnerships set status='active' where id='$PID'" >/dev/null
check "a third agency cannot end the partnership" "partnership_not_found" \
  "$(as $X - "select end_agency_partnership_v1('$PID');")"
check "the partner ends the partnership" "$PID" "$(as $P - "select end_agency_partnership_v1('$PID');")"
check "ending revokes the pass and withdraws the open offer" "ended/revoked/withdrawn" \
  "$(su "select p.status||'/'||s.status||'/'||o.status from agency_partnerships p, agency_partner_request_shares s, agency_candidate_offers o where p.id='$PID' and s.id='$PS2' and o.id='$OP3'")"
check "the placed offer is history and stays accepted" "accepted" "$(su "select status from agency_candidate_offers where id='$OP'")"
check "an ended partnership cannot pass a need" "partnership_not_active" \
  "$(as $L - "select share_request_with_partner_v1('$PID', '$SH');")"
check "an ended partnership cannot be ended again" "partnership_not_open" \
  "$(as $L - "select end_agency_partnership_v1('$PID');")"
check "the partner no longer reads the need" "0" "$(as $P - "select count(*) from list_partner_shared_requests_v1();")"
check "the commission rows remain readable to both after the end" "1/1" \
  "$(echo "$(as $L - "select count(*) from list_agency_commissions_v1() where offer_id='$OP';")/$(as $P - "select count(*) from list_agency_commissions_v1();")")"

echo "== 9. GRANTS ======================================================================"
for f in "invite_agency_partner_v1(uuid,text,numeric)" "accept_agency_partnership_v1(uuid,uuid)" \
         "decline_agency_partnership_v1(uuid)" "end_agency_partnership_v1(uuid)" \
         "share_request_with_partner_v1(uuid,uuid)" "unshare_request_with_partner_v1(uuid)" \
         "submit_partner_candidate_offer_v1(uuid,uuid,text)" "respond_agency_candidate_offer_v2(uuid,text,text,uuid)" \
         "list_agency_partnerships_v1()" "list_partner_shared_requests_v1()" \
         "list_partner_offers_for_lead_v1()" "list_agency_commissions_v1()"; do
  check "anon cannot execute $f" "f/t" \
    "$(su "select has_function_privilege('anon','public.$f','execute')||'/'||has_function_privilege('authenticated','public.$f','execute')" | sed 's/true/t/g; s/false/f/g')"
done

check "R2 P2-1: a signed-in caller can no longer call v1 directly" "f" \
  "$(su "select has_function_privilege('authenticated','public.respond_agency_candidate_offer_v1(uuid,text,text)','execute')" | sed 's/true/t/g; s/false/f/g')"
checkre "R2 P2-1: a direct v1 call on the term-carrying partner offer is refused" "permission denied" \
  "$(as $EMP - "select respond_agency_candidate_offer_v1('$OP', 'declined', null);")"

echo "== 10. ROLLBACK =================================================================="
checkre "the rollback refuses while partnerships exist" "ROLLBACK REFUSED" \
  "$($PSQL -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1 | tr -d '\r' | grep -m1 'REFUSED')"
check "a refused rollback changed nothing" "2" "$(su "select count(*) from agency_partnerships")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from company_worker_engagements; update agency_candidate_offers set partner_share_id = null;
delete from agency_partner_request_shares; delete from agency_partnerships;
SQL
run_file "$DOWN"
check "the rollback drops both tables and the column" "0/0/0" \
  "$(su "select (to_regclass('public.agency_partnerships') is not null)::int||'/'||(to_regclass('public.agency_partner_request_shares') is not null)::int||'/'||count(*) from information_schema.columns where table_name='agency_candidate_offers' and column_name='partner_share_id'")"
check "the rollback restores 20261114235900's v2 (no partner rule)" "0" \
  "$(su "select count(*) from pg_proc where proname='respond_agency_candidate_offer_v2' and prosrc like '%partner_share%'")"
check "the restored v2 is still executable by signed-in callers only" "f/t" \
  "$(su "select has_function_privilege('anon','public.respond_agency_candidate_offer_v2(uuid,text,text,uuid)','execute')||'/'||has_function_privilege('authenticated','public.respond_agency_candidate_offer_v2(uuid,text,text,uuid)','execute')" | sed 's/true/t/g; s/false/f/g')"
check "the rollback restores the term policy without the offering-agency arm" "0" \
  "$(su "select count(*) from pg_policies where policyname='agency_placement_terms_select' and qual like '%agency_company_id%'")"
check "the rollback gives signed-in callers v1 back, as on main" "t" \
  "$(su "select has_function_privilege('authenticated','public.respond_agency_candidate_offer_v1(uuid,text,text)','execute')" | sed 's/true/t/g; s/false/f/g')"
check "the rollback restores the full read grant" "t" \
  "$(su "select has_column_privilege('authenticated','public.agency_candidate_offers','created_by','select')" | sed 's/true/t/g; s/false/f/g')"
check "the rollback restores main's four function bodies" "0" \
  "$(su "select count(*) from pg_proc where proname in ('list_agency_offer_progress_v1','list_agency_placements_v1','withdraw_agency_candidate_offer_v1','submit_agency_candidate_offer_v1') and (prosrc like '%agency_offer_owner_v1%' or prosrc like '%already_offered%')")"
check "the rollback restores main's offer read policy" "0" \
  "$(su "select count(*) from pg_policies where policyname='agency_candidate_offers_select' and qual like '%partner_share_id%'")"
check "the rollback leaves no new function behind" "0" \
  "$(su "select count(*) from pg_proc where proname in ('invite_agency_partner_v1','list_agency_commissions_v1','submit_partner_candidate_offer_v1')")"
run_file "$MIG"
check "the migration re-applies after the rollback" "1" "$(su "select (to_regclass('public.agency_partnerships') is not null)::int")"

echo "=============================================================================="
echo " RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
