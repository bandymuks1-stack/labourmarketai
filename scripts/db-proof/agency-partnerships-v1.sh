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
# main's own agency functions, verbatim (the migration no longer replaces them): the lead's direct
# offer, its withdrawal, and the agency's own reads, which now also carry its FORWARDED candidates.
cut_fn() { awk -v fn="$2" 'index($0, "create or replace function public." fn "(")==1{p=1} p{print} p&&/^\$(function)?\$;/{exit}' "$REPO/supabase/migrations/$1" > "$TMP/$2.sql"
  [ -s "$TMP/$2.sql" ] || { echo "could not cut $2"; exit 1; }; run_file "$TMP/$2.sql"; }
cut_fn 20260928180000_agency_capability_one_rule_v1.sql submit_agency_candidate_offer_v1
cut_fn 20260723180000_agency_real_client_bridge_v1.sql withdraw_agency_candidate_offer_v1
cut_fn 20260901052300_agency_disclosure_revocation_v1.sql list_agency_offer_progress_v1
cut_fn 20260928190000_agency_delegated_demand_and_placement_v1.sql list_agency_placements_v1
for f in "submit_agency_candidate_offer_v1(uuid,uuid,text)" "withdraw_agency_candidate_offer_v1(uuid)" \
         "list_agency_offer_progress_v1()" "list_agency_placements_v1()"; do
  su "revoke all on function public.$f from public; grant execute on function public.$f to authenticated" >/dev/null
done

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

echo "== 4. THE PARTNER PROPOSES; THE LEAD REVIEWS (owner decision 2026-11-20) ====="
check "a worker not on the partner's roster is refused" "worker_not_on_roster" \
  "$(as $P - "select propose_partner_candidate_v1('$PS', '$WN');")"
check "the lead's own worker is not the partner's to propose" "worker_not_on_roster" \
  "$(as $P - "select propose_partner_candidate_v1('$PS', '$WL');")"
check "a third agency cannot propose on the pass" "not_owner" \
  "$(as $X - "select propose_partner_candidate_v1('$PS', '$WP1');")"
PR1=$(as $P - "select propose_partner_candidate_v1('$PS', '$WP1', 'QA-SYNTHETIC partner note');")
checkre "the partner proposes its worker" "^[0-9a-f-]{36}$" "$PR1"
check "proposing again re-affirms the same proposal" "$PR1" \
  "$(as $P - "select propose_partner_candidate_v1('$PS', '$WP1');")"
check "(a) before the lead forwards, no offer exists at all" "0" \
  "$(su "select count(*) from agency_candidate_offers where request_id='$REQ' and worker_id='$WP1'")"
check "(a) the client's candidate list shows nothing" "0" \
  "$(as $EMP - "select count(*) from list_agency_offered_candidates_for_request_v2('$REQ');")"
check "(a) the client cannot read the proposal, nor list it" "0/0" \
  "$(as $EMP - "select (select count(*) from agency_partner_candidate_proposals)||'/'||(select count(*) from list_partner_candidate_proposals_v1());")"
check "the lead reviews it: partner, worker, the partner's note" \
  "lead/QA-SYNTHETIC Partner agency/QA-SYNTHETIC W1/QA-SYNTHETIC partner note/proposed" \
  "$(as $L - "select side||'/'||counterpart_name||'/'||worker_name||'/'||note||'/'||status from list_partner_candidate_proposals_v1() where proposal_id='$PR1';")"
check "the partner follows it, naming the lead" "partner/QA-SYNTHETIC Lead agency/proposed" \
  "$(as $P - "select side||'/'||counterpart_name||'/'||status from list_partner_candidate_proposals_v1() where proposal_id='$PR1';")"
check "the proposals read has no client column" "0" \
  "$(su "select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname='list_partner_candidate_proposals_v1' and a like '%client%'")"
check "a third agency reads no proposal" "0/0" \
  "$(as $X - "select (select count(*) from agency_partner_candidate_proposals)||'/'||(select count(*) from list_partner_candidate_proposals_v1());")"
check "the proposal is audited with its chain (source, submitter, reviewer); a re-affirm is audited too" "source:$PC/submitter:$PC/reviewer:$LC/$P" \
  "$(su "select string_agg((e->>'role')||':'||(e->>'company_id'), '/' order by i)||'/'||actor_id from (select * from audit_logs where action='agency_partner_candidate_proposed' and entity_id='$PR1' order by id limit 1) a, jsonb_array_elements(a.payload->'chain') with ordinality as c(e, i) group by a.payload, a.actor_id")"
check "the partner cannot forward its own proposal" "not_owner" \
  "$(as $P - "select forward_partner_candidate_v1('$PR1', null);")"
check "a third agency cannot forward it" "not_owner" \
  "$(as $X - "select forward_partner_candidate_v1('$PR1', null);")"

echo "== 4a. (c) THE LEAD RETURNS A PROPOSAL; THE PARTNER WITHDRAWS ONE ============"
PR2=$(as $P - "select propose_partner_candidate_v1('$PS', '$WP2', 'QA-SYNTHETIC second');")
check "the partner cannot return a proposal; only the lead can" "not_owner" \
  "$(as $P - "select return_partner_candidate_v1('$PR2', null);")"
check "(c) the lead returns it, saying why" "$PR2" \
  "$(as $L - "select return_partner_candidate_v1('$PR2', 'QA-SYNTHETIC reason');")"
check "(c) the partner sees it returned, and why; no offer was made" "returned/QA-SYNTHETIC reason/0" \
  "$(as $P - "select status||'/'||return_reason from list_partner_candidate_proposals_v1() where proposal_id='$PR2';")/$(su "select count(*) from agency_candidate_offers where worker_id='$WP2'")"
check "(c) a returned proposal cannot be forwarded" "proposal_not_open" \
  "$(as $L - "select forward_partner_candidate_v1('$PR2', null);")"
check "(c) the client never saw it" "0" \
  "$(as $EMP - "select count(*) from list_agency_offered_candidates_for_request_v2('$REQ');")"
check "(c) the return is audited" "1" \
  "$(su "select count(*) from audit_logs where action='agency_partner_candidate_returned' and entity_id='$PR2'")"
PR3=$(as $P - "select propose_partner_candidate_v1('$PS', '$WP2');")
check "a returned worker can be proposed again (a new proposal)" "t" "$(su "select '$PR3' <> '$PR2'")"
check "the lead cannot withdraw the partner's proposal" "not_owner" \
  "$(as $L - "select withdraw_partner_candidate_v1('$PR3');")"
check "the partner withdraws its own proposal" "$PR3/withdrawn" \
  "$(as $P - "select withdraw_partner_candidate_v1('$PR3');")/$(su "select status from agency_partner_candidate_proposals where id='$PR3'")"
check "a withdrawn proposal cannot be forwarded" "proposal_not_open" \
  "$(as $L - "select forward_partner_candidate_v1('$PR3', null);")"

echo "== 4b. (b) THE LEAD FORWARDS: THE CLIENT SEES ITS OWN AGENCY'S CANDIDATE ======"
check "a forwarded note over 500 characters is refused" "invalid_note" \
  "$(as $L - "select forward_partner_candidate_v1('$PR1', repeat('x', 501));")"
OP=$(as $L - "select forward_partner_candidate_v1('$PR1', 'QA-SYNTHETIC lead note');")
checkre "(b) the lead forwards the partner's candidate to its client" "^[0-9a-f-]{36}$" "$OP"
check "(b) the offer is the LEAD's, by the lead's user, on the client's share and connection, through the pass" \
  "$LC/$EC/$CONN/$SH/$PS/offered/$L" \
  "$(su "select agency_company_id||'/'||client_company_id||'/'||connection_id||'/'||request_share_id||'/'||partner_share_id||'/'||status||'/'||created_by from agency_candidate_offers where id='$OP'")"
check "(b) the client sees it as its own agency's candidate, with the LEAD's note only" "QA-SYNTHETIC Lead agency/QA-SYNTHETIC lead note" \
  "$(as $EMP - "select agency_name||'/'||note from list_agency_offered_candidates_for_request_v2('$REQ') where offer_id='$OP';")"
check "(b) the partner's own note reached no offer" "0" \
  "$(su "select count(*) from agency_candidate_offers where note like '%partner note%'")"
check "(b) the proposal is forwarded and follows the offer" "forwarded/$OP/offered" \
  "$(as $P - "select status||'/'||offer_id||'/'||offer_status from list_partner_candidate_proposals_v1() where proposal_id='$PR1';")"
check "(b) forwarding it again is refused" "proposal_not_open" \
  "$(as $L - "select forward_partner_candidate_v1('$PR1', null);")"
check "decision 0033: the forward is audited with the whole chain, by the lead" \
  "source:$PC/submitter:$PC/reviewer:$LC/presenter_to_client:$LC/$PID/$PS/not_recorded/true/$PR1/$L" \
  "$(su "select string_agg((e->>'role')||':'||(e->>'company_id'), '/' order by i)||'/'||(payload->>'partnership_id')||'/'||(payload->>'partner_share_id')||'/'||(payload->>'agency_verification')||'/'||(payload->>'lead_note_forwarded')||'/'||(payload->>'proposal_id')||'/'||actor_id from audit_logs, jsonb_array_elements(payload->'chain') with ordinality as c(e, i) where action='agency_partner_candidate_forwarded' and entity_id='$OP' group by payload, actor_id")"
check "(a) the audit trail is not readable by the client or either agency" "0/0/0" \
  "$(as $EMP - "select count(*) from audit_logs;")/$(as $L - "select count(*) from audit_logs;")/$(as $P - "select count(*) from audit_logs;")"
check "(a) no readable column of the client's row holds the partner's company or staff id" "0" \
  "$(as $EMP - "select count(*) from (select row_to_json(t)::text j from (select id, connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id, status, note, created_at, withdrawn_at, updated_at, booking_id, decision_note, decided_by, decided_at, accepted_placement_term_id, placement_term_accepted_at from agency_candidate_offers where id='$OP') t) x where j like '%$PC%' or j like '%$P%';")"
checkre "(a) the client cannot read who created the offer" "permission denied" \
  "$(as $EMP - "select created_by from agency_candidate_offers where id='$OP';")"
checkre "(a) nor who withdrew an offer" "permission denied" \
  "$(as $EMP - "select withdrawn_by from agency_candidate_offers where id='$OP';")"
checkre "(a) nor that it came through a partner" "permission denied" \
  "$(as $EMP - "select partner_share_id from agency_candidate_offers where id='$OP';")"
check "(a) the client reads no partnership and no passed need" "0/0" \
  "$(as $EMP - "select (select count(*) from agency_partnerships)||'/'||(select count(*) from agency_partner_request_shares);")"
check "(a) nor any partnership read or commission" "0/0" \
  "$(as $EMP - "select (select count(*) from list_agency_partnerships_v1())||'/'||(select count(*) from list_agency_commissions_v1());")"
check "partner: no direct read of the offer row, nor of any row naming the client" "0/0" \
  "$(as $P - "select (select count(*) from agency_candidate_offers where id='$OP')||'/'||(select count(*) from agency_candidate_offers where client_company_id='$EC');")"
check "the lead follows the forwarded candidate as its own, and reads its row" "1/1" \
  "$(as $L - "select (select count(*) from list_agency_offer_progress_v1() where offer_id='$OP')||'/'||(select count(*) from agency_candidate_offers where id='$OP');")"

echo "== 4c. (d) THE DIRECT AGENCY FLOW, UNCHANGED ===================================="
ODIR=$(as $L - "select submit_agency_candidate_offer_v1('$SH', '$WL', 'QA-SYNTHETIC direct');")
checkre "(d) the lead's direct offer is made as before" "^[0-9a-f-]{36}$" "$ODIR"
check "(d) a direct offer: agency = the lead, no partner step" "$LC/true" \
  "$(su "select agency_company_id||'/'||(partner_share_id is null) from agency_candidate_offers where id='$ODIR'")"
check "(d) offering it again re-affirms the same offer" "$ODIR" \
  "$(as $L - "select submit_agency_candidate_offer_v1('$SH', '$WL');")"
check "(d) the client sees it under the lead, the lead follows it" "QA-SYNTHETIC Lead agency/1" \
  "$(as $EMP - "select agency_name from list_agency_offered_candidates_for_request_v2('$REQ') where offer_id='$ODIR';")/$(as $L - "select count(*) from list_agency_offer_progress_v1() where offer_id='$ODIR';")"
# A worker on BOTH rosters: the lead already offered them directly, so a partner's proposal of the
# same worker on the same need cannot become a second offer.
su "insert into company_workers (company_id, worker_id, status) values ('$PC','$WL','active')" >/dev/null
PRW=$(as $P - "select propose_partner_candidate_v1('$PS', '$WL');")
check "(d) a forward never makes a second offer of a worker the lead already offered" "already_offered" \
  "$(as $L - "select forward_partner_candidate_v1('$PRW', null);")"
check "(d) the refused forward changed nothing" "proposed/true" \
  "$(su "select (select status from agency_partner_candidate_proposals where id='$PRW')||'/'||(select partner_share_id is null from agency_candidate_offers where id='$ODIR')")"
as $L - "select return_partner_candidate_v1('$PRW', null);" >/dev/null
su "delete from company_workers where company_id='$PC' and worker_id='$WL'" >/dev/null
check "(d) the lead withdraws its direct offer, as before" "t/withdrawn" \
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
PRO=$(as $P - "select propose_partner_candidate_v1('$PS', '$WP2');")
OP2=$(as $L - "select forward_partner_candidate_v1('$PRO', null);")
PRX=$(as $P - "select propose_partner_candidate_v1('$PS', '$WP1');")
check "the partner cannot take the need back; only the lead can" "partner_share_not_found" \
  "$(as $P - "select unshare_request_with_partner_v1('$PS');")"
as $L - "select unshare_request_with_partner_v1('$PS');" >/dev/null
check "taking it back withdraws the open offer and revokes the pass" "withdrawn/revoked" \
  "$(su "select o.status||'/'||s.status from agency_candidate_offers o, agency_partner_request_shares s where o.id='$OP2' and s.id='$PS'")"
check "R2 P3-b: passing the need is audited once (a repeated pass logs nothing)" "1/$PID/$LC/$PC/$SH/$EC/$REQ" \
  "$(su "select count(*)||'/'||min(payload->>'partnership_id')||'/'||min(payload->>'lead_company_id')||'/'||min(payload->>'partner_company_id')||'/'||min(payload->>'client_share_id')||'/'||min(payload->>'client_company_id')||'/'||min(payload->>'request_id') from audit_logs where action='agency_partner_need_passed' and entity_id='$PS'")"
check "R2 P3-b: taking it back is audited, by the lead, with the offers it withdrew" "1/$L/$PID/1" \
  "$(su "select count(*)||'/'||min(actor_id::text)||'/'||min(payload->>'partnership_id')||'/'||min(payload->>'withdrawn_offers') from audit_logs where action='agency_partner_need_revoked' and entity_id='$PS'")"
check "taking it back also closes the open proposal on it" "withdrawn" \
  "$(su "select status from agency_partner_candidate_proposals where id='$PRX'")"
check "the accepted offer and its placement stay" "accepted" "$(su "select status from agency_candidate_offers where id='$OP'")"
check "an offer on a revoked pass is refused" "share_not_active" \
  "$(as $P - "select propose_partner_candidate_v1('$PS', '$WP2');")"
PS2=$(as $L - "select share_request_with_partner_v1('$PID', '$SH');")
PRO3=$(as $P - "select propose_partner_candidate_v1('$PS2', '$WP2');")
OP3=$(as $L - "select forward_partner_candidate_v1('$PRO3', null);")
PRY=$(as $P - "select propose_partner_candidate_v1('$PS2', '$WP1');")
su "update agency_partnerships set status='ended' where id='$PID'" >/dev/null
check "a partner offer cannot be accepted once the partnership is not active" "partnership_not_active" \
  "$(as $EMP - "select respond_agency_candidate_offer_v2('$OP3', 'accepted', null, (select id from agency_placement_terms where company_id='$LC' and retired_at is null));")"
su "update agency_partnerships set status='active' where id='$PID'" >/dev/null
check "a third agency cannot end the partnership" "partnership_not_found" \
  "$(as $X - "select end_agency_partnership_v1('$PID');")"
check "the partner ends the partnership" "$PID" "$(as $P - "select end_agency_partnership_v1('$PID');")"
check "ending revokes the pass and withdraws the open offer" "ended/revoked/withdrawn" \
  "$(su "select p.status||'/'||s.status||'/'||o.status from agency_partnerships p, agency_partner_request_shares s, agency_candidate_offers o where p.id='$PID' and s.id='$PS2' and o.id='$OP3'")"
check "R2 P3-b: the end's audit row names the passes it took back" "$P/[\"$PS2\"]" \
  "$(su "select actor_id||'/'||(payload->'revoked_partner_share_ids')::text from audit_logs where action='agency_partnership_ended' and entity_id='$PID'")"
check "ending also closes the open proposal" "withdrawn" \
  "$(su "select status from agency_partner_candidate_proposals where id='$PRY'")"
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
         "propose_partner_candidate_v1(uuid,uuid,text)" "forward_partner_candidate_v1(uuid,text)" \
         "return_partner_candidate_v1(uuid,text)" "withdraw_partner_candidate_v1(uuid)" \
         "respond_agency_candidate_offer_v2(uuid,text,text,uuid)" \
         "list_agency_partnerships_v1()" "list_partner_shared_requests_v1()" \
         "list_partner_candidate_proposals_v1()" "list_agency_commissions_v1()"; do
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
delete from agency_partner_candidate_proposals; delete from agency_partner_request_shares; delete from agency_partnerships;
SQL
run_file "$DOWN"
check "the rollback drops the three tables and the column" "0/0/0/0" \
  "$(su "select (to_regclass('public.agency_partnerships') is not null)::int||'/'||(to_regclass('public.agency_partner_request_shares') is not null)::int||'/'||(to_regclass('public.agency_partner_candidate_proposals') is not null)::int||'/'||count(*) from information_schema.columns where table_name='agency_candidate_offers' and column_name='partner_share_id'")"
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
check "main's own agency functions and offer read policy were never touched" "0/0" \
  "$(su "select (select count(*) from pg_proc where proname in ('list_agency_offer_progress_v1','list_agency_placements_v1','withdraw_agency_candidate_offer_v1','submit_agency_candidate_offer_v1') and (prosrc like '%agency_offer_owner_v1%' or prosrc like '%already_offered%'))||'/'||(select count(*) from pg_policies where policyname='agency_candidate_offers_select' and qual like '%partner_share_id%')")"
check "the rollback leaves no new function behind" "0" \
  "$(su "select count(*) from pg_proc where proname in ('invite_agency_partner_v1','list_agency_commissions_v1','propose_partner_candidate_v1','forward_partner_candidate_v1','list_partner_candidate_proposals_v1','agency_offer_owner_v1')")"
run_file "$MIG"
check "the migration re-applies after the rollback" "1" "$(su "select (to_regclass('public.agency_partnerships') is not null)::int")"

echo "=============================================================================="
echo " RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
