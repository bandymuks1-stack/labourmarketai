#!/usr/bin/env bash
# ============================================================================
# list_agency_offered_candidates_for_request_v2 -- connection/share gate proof.
# REAL PostgreSQL proof on a throwaway local PG16 (no Docker, no Supabase).
# (md5 comparisons ignore CR: a Windows checkout has CRLF files) Schema = the REAL migrations 20260723180000, 20260901052300, 20260903101000
# (+ prelude for external bits). BEFORE = live (ungated) v2; AFTER = migration.
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54310 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54310 bash scripts/db-proof/agency-offered-candidates-v2-gate.sh
# Uses database `agv2` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
NAME=20261003100000_list_agency_offered_candidates_v2_connection_gate_v1
MIG="$M/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54310}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d agv2 -tA -q"

$ADMINP -c "drop database if exists agv2" -c "create database agv2" >/dev/null 2>&1
for f in "$HERE/agency-offered-candidates-v2-gate.prelude.sql" "$M/20260723180000_agency_real_client_bridge_v1.sql" "$M/20260901052300_agency_disclosure_revocation_v1.sql" "$M/20260903101000_agency_candidate_offer_decision_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_ag_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_ag_err_$$; rm -f /tmp/_ag_err_$$; exit 1; }
done
rm -f /tmp/_ag_err_$$

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; none) pre="set role authenticated;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }

AGO=a0000000-0000-0000-0000-000000000001   # agency owner (agency A)
CLO=a0000000-0000-0000-0000-000000000002   # client owner = request owner
OTH=a0000000-0000-0000-0000-000000000003   # unrelated user (wrong client)
AGB=a0000000-0000-0000-0000-000000000004   # owner of a DIFFERENT agency (wrong agency)
AGC=b0000000-0000-0000-0000-00000000000a; CLC=b0000000-0000-0000-0000-00000000000c; AGBC=b0000000-0000-0000-0000-00000000000b
REQ=c0000000-0000-0000-0000-000000000001
CONN=d0000000-0000-0000-0000-000000000001; SHARE=d0000000-0000-0000-0000-000000000002
W1=e0000000-0000-0000-0000-000000000001; W2=e0000000-0000-0000-0000-000000000002; W3=e0000000-0000-0000-0000-000000000003; W4=e0000000-0000-0000-0000-000000000004

reset_state() {
  su "truncate public.agency_candidate_offers, public.agency_client_request_shares, public.agency_client_connections, public.customer_requests, public.companies, public.workers, public.profiles, public.audit_logs cascade;
   insert into public.profiles (id, active_role) values ('$AGO','company'),('$CLO','company'),('$OTH','company'),('$AGB','company');
   insert into public.companies (id, owner_profile_id, display_name) values ('$AGC','$AGO','Agency A'),('$CLC','$CLO','Client C'),('$AGBC','$AGB','Agency B');
   insert into public.workers (id) values ('$W1'),('$W2'),('$W3'),('$W4');
   insert into public.customer_requests (id, profile_id) values ('$REQ','$CLO');
   insert into public.agency_client_connections (id, agency_company_id, client_company_id, invited_email, status, invited_by, accepted_by, accepted_at)
     values ('$CONN','$AGC','$CLC','c@example.com','active','$AGO','$CLO',now());
   insert into public.agency_client_request_shares (id, connection_id, request_id, status, shared_by) values ('$SHARE','$CONN','$REQ','active','$CLO');
   insert into public.agency_candidate_offers (connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id, status, note, created_by, decided_at, decided_by) values
     ('$CONN','$SHARE','$AGC','$CLC','$REQ','$W1','offered','n1','$AGO',null,null),
     ('$CONN','$SHARE','$AGC','$CLC','$REQ','$W2','accepted','n2','$AGO',now(),'$CLO'),
     ('$CONN','$SHARE','$AGC','$CLC','$REQ','$W3','declined','n3','$AGO',now(),'$CLO'),
     ('$CONN','$SHARE','$AGC','$CLC','$REQ','$W4','withdrawn','n4','$AGO',null,null);
   insert into public.audit_logs (actor_id, action, entity, payload) values ('$AGO','offer_submitted','agency_candidate_offers','{}'),('$CLO','offer_decided','agency_candidate_offers','{}');" >/dev/null
}
v2() { as "$1" "select string_agg(offer_status, ',' order by offer_status) from public.list_agency_offered_candidates_for_request_v2('$REQ');" | head -1; }
v1() { as "$1" "select count(*) from public.list_agency_offered_candidates_for_request_v1('$REQ');" | head -1; }
hist() { q "select (select count(*) from public.agency_candidate_offers)||'/'||(select count(*) from public.agency_candidate_offers where status in ('accepted','declined'))||'/'||(select count(*) from public.audit_logs)||'/'||(select count(*) from public.agency_client_connections)||'/'||(select count(*) from public.agency_client_request_shares);"; }
fnsig() { q "select pg_get_function_result(p.oid)||'|'||p.prosecdef||'|'||p.provolatile::text||'|'||p.proconfig::text||'|'||l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.proname='list_agency_offered_candidates_for_request_v2';"; }
fnacl() { q "select coalesce(proacl::text,'-') from pg_proc where proname='list_agency_offered_candidates_for_request_v2';"; }
fnmd5() { q "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='$1';"; }

PHASE=BEFORE
# exp <label> <expect-BEFORE> <expect-AFTER> <actual>
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }
OPEN="accepted,declined,offered"   # what the legitimate client sees while live

suite() {
  echo "--- ACTIVE connection + ACTIVE share"
  reset_state
  exp "current client reads accepted+declined+offered (withdrawn hidden)" "$OPEN" "$OPEN" "$(v2 $CLO)"
  exp "WRONG client (unrelated user) denied" "" "" "$(v2 $OTH)"
  exp "WRONG agency (other agency owner) denied" "" "" "$(v2 $AGB)"
  exp "the OFFERING agency owner is not the demand owner: denied" "" "" "$(v2 $AGO)"
  exp "NULL auth.uid() (authenticated, no sub) denied" "" "" "$(v2 none)"
  exp "ANON cannot execute (permission denied)" "1" "1" "$(as anon "select count(*) from public.list_agency_offered_candidates_for_request_v2('$REQ');" | grep -c 'permission denied')"
  echo "--- REVOKED connection (connection.status=revoked, share + offers untouched)"
  reset_state; su "update public.agency_client_connections set status='revoked', revoked_at=now() where id='$CONN';" >/dev/null
  exp "client denied after connection revoked (the defect)" "$OPEN" "" "$(v2 $CLO)"
  exp "v1 (already gated) denies" "0" "0" "$(v1 $CLO)"
  exp "WRONG client still denied" "" "" "$(v2 $OTH)"
  echo "--- connection pending / declined are not active either"
  for st in pending declined; do
    reset_state; su "update public.agency_client_connections set status='$st' where id='$CONN';" >/dev/null
    exp "client denied when connection is $st" "$OPEN" "" "$(v2 $CLO)"
  done
  echo "--- UNSHARED (share.status=revoked, connection still active)"
  reset_state; su "update public.agency_client_request_shares set status='revoked', revoked_at=now() where id='$SHARE';" >/dev/null
  exp "client denied after the request is unshared (the defect)" "$OPEN" "" "$(v2 $CLO)"
  exp "v1 (already gated) denies" "0" "0" "$(v1 $CLO)"
  echo "--- real revoke RPC path (client revokes the connection)"
  reset_state; as $CLO "select public.revoke_agency_client_connection_v1('$CONN');" >/dev/null
  exp "after revoke RPC: v2 shows nothing (offered withdrawn by the RPC; decided hidden by the gate)" "accepted,declined" "" "$(v2 $CLO)"
  echo "--- history intact"
  exp "offers/decided/audit/connections/shares rows preserved by revoke" "4/2/2/1/1" "4/2/2/1/1" "$(hist)"
  echo "--- re-activation restores read (access follows CURRENT authority)"
  su "update public.agency_client_connections set status='active', revoked_at=null where id='$CONN'; update public.agency_client_request_shares set status='active', revoked_at=null where id='$SHARE';" >/dev/null
  exp "client reads accepted+declined again once connection+share are active (W1 stays withdrawn)" "accepted,declined" "accepted,declined" "$(v2 $CLO)"
}

echo "=============================================================="; echo " STEP 1 -- pre-image"; echo "=============================================================="
V2SRC_BEFORE="$(fnmd5 list_agency_offered_candidates_for_request_v2)"
SIG_BEFORE="$(fnsig)"; ACL_BEFORE="$(fnacl)"
V1MD5="$(fnmd5 list_agency_offered_candidates_for_request_v1)"
check "v2 pre-image has NO connection/share gate" "0" "$(q "select count(*) from pg_proc where proname='list_agency_offered_candidates_for_request_v2' and prosrc ~ 'agency_client_connections|request_share_id';")"
check "v1 carries the gate (reference semantics)" "1" "$(q "select count(*) from pg_proc where proname='list_agency_offered_candidates_for_request_v1' and prosrc like '%c.status = ''active''%' and prosrc like '%s.status = ''active''%';")"
echo "    sig/security/volatility/config/lang: $SIG_BEFORE"; echo "    acl: $ACL_BEFORE"

echo ""; echo "=============================================================="; echo " STEP 2 -- BEFORE (live v2): the exposure"; echo "=============================================================="
PHASE=BEFORE; suite

echo ""; echo "=============================================================="; echo " STEP 3 -- apply the migration"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "MIGRATION FAILED"; exit 1; }
check "migration applies cleanly" ok ok
check "return type / SECURITY DEFINER / STABLE / search_path / language unchanged" "$SIG_BEFORE" "$(fnsig)"
check "ACL unchanged (authenticated only, no anon/public)" "$ACL_BEFORE" "$(fnacl)"
check "v1 untouched" "$V1MD5" "$(fnmd5 list_agency_offered_candidates_for_request_v1)"
check "exactly one v2 overload" "1" "$(q "select count(*) from pg_proc where proname='list_agency_offered_candidates_for_request_v2';")"

echo ""; echo "=============================================================="; echo " STEP 4 -- AFTER"; echo "=============================================================="
PHASE=AFTER; suite
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; check "re-applying is idempotent" "1" "$(q "select count(*) from pg_proc where proname='list_agency_offered_candidates_for_request_v2';")"

echo ""; echo "=============================================================="; echo " STEP 5 -- rollback restores the pre-image"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 || { echo "ROLLBACK FAILED"; exit 1; }
check "rollback restores v2 body (md5 prosrc) identically" "$V2SRC_BEFORE" "$(fnmd5 list_agency_offered_candidates_for_request_v2)"
check "rollback restores ACL" "$ACL_BEFORE" "$(fnacl)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; check "forward migration re-applies after rollback" "1" "$(q "select count(*) from pg_proc where proname='list_agency_offered_candidates_for_request_v2' and prosrc like '%request_share_id%';")"

echo ""; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
