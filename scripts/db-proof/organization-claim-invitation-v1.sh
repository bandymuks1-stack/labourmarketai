#!/usr/bin/env bash
# ============================================================================
# organization-claim-invitation-v1 -- REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# The REAL migration and rollback run verbatim over the prelude's stand-ins. Synthetic data only.
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58741 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/organization-claim-invitation-v1.sh
#
# Uses database `oci1` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261110190000_organization_claim_invitation_v1
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58741}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d oci1 -tA -q"

$ADMINP -c "drop database if exists oci1" -c "create database oci1" >/dev/null 2>&1 || { echo "cannot reach postgres on $PGPROOF_PORT"; exit 2; }
ERR=$(mktemp)
run_file() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$ERR" || { echo "FAILED: $1"; cat "$ERR"; exit 1; }; }
run_file "$HERE/organization-claim-invitation-v1.prelude.sql"

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
# as <uid> <email> <sql>: role authenticated with PostgREST-style claims. Prints the result or the error message.
as() { local uid="$1" email="$2"; shift 2
  printf '%s\n' "select set_config('request.jwt.claims', jsonb_build_object('sub','$uid','email','$email')::text, false) \\gset
set role authenticated;
$*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | grep -v '^$' | tr '
' ' '; }
outcome() { sed -n 's/.*"outcome": *"\([a-z_]*\)".*/\1/p' <<< "$1"; }
tok() { printf 'tok-%s' "$1"; }
hash() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

OPA=a0000000-0000-4000-8000-00000000000a   # operator A (sends invitations)        opa@ops.example
OPB=b0000000-0000-4000-8000-00000000000b   # operator B (decides)                  opb@ops.example
OPC=c0000000-0000-4000-8000-00000000000c   # operator C (also a claimant)          opc@ops.example
REP=d0000000-0000-4000-8000-00000000000d   # the company representative            rep@company.example
OTH=e0000000-0000-4000-8000-00000000000e   # another user, proven address           oth@other.example
UNV=f0000000-0000-4000-8000-00000000000f   # user whose address is NOT proven      unv@company.example
R2=10000000-0000-4000-8000-000000000002; R3=10000000-0000-4000-8000-000000000003
O1=20000000-0000-4000-8000-000000000001    # QA-SYNTHETIC Alpha UAB (invited path)
O2=20000000-0000-4000-8000-000000000002    # QA-SYNTHETIC Beta SRL (expiry)
O3=20000000-0000-4000-8000-000000000003    # QA-SYNTHETIC Gamma (operator C's own request)
O4=20000000-0000-4000-8000-000000000004    # QA-SYNTHETIC Delta (race)
O5=20000000-0000-4000-8000-000000000005    # QA-SYNTHETIC Epsilon (already claimed)

seed() {
  $PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"$ERR" <<SQL || { cat "$ERR"; exit 1; }
insert into profiles (id, email) values ('$OPA','opa@ops.example'),('$OPB','opb@ops.example'),('$OPC','opc@ops.example'),
  ('$REP','rep@company.example'),('$OTH','oth@other.example'),('$UNV','unv@company.example'),('$R2','r2@x.example'),('$R3','r3@x.example');
insert into platform_capability_grants values ('$OPA','marketplace_company_ingest'),('$OPB','marketplace_company_ingest'),('$OPC','marketplace_company_ingest');
insert into proven_emails values ('$OPA','opa@ops.example'),('$OPB','opb@ops.example'),('$OPC','opc@ops.example'),
  ('$REP','rep@company.example'),('$OTH','oth@other.example'),('$R2','r2@x.example'),('$R3','r3@x.example');
insert into organizations (id, display_name, country, claim_state) values
  ('$O1','QA-SYNTHETIC Alpha UAB','LT','discovered'),('$O2','QA-SYNTHETIC Beta SRL','IT','discovered'),
  ('$O3','QA-SYNTHETIC Gamma','LT','discovered'),('$O4','QA-SYNTHETIC Delta','LT','discovered');
insert into organizations (id, display_name, country, claim_state, owner_profile_id) values ('$O5','QA-SYNTHETIC Epsilon','LT','claimed','$OTH');
SQL
}

echo "== apply"
run_file "$MIG"
seed

echo "== invitation"
r=$(as $REP rep@company.example "select create_claim_invitation_v1('$O1','rep@company.example','$(hash $(tok o1))','lt')")
check "a non-operator cannot send a claim invitation" "1" "$(grep -c 'Not authorized' <<< "$r")"
r=$(as $OPA opa@ops.example "select create_claim_invitation_v1('$O5','rep@company.example','$(hash $(tok o5))','lt')")
check "an owned company cannot be invited" "not_claimable" "$(outcome "$r")"
r=$(as $OPA opa@ops.example "select create_claim_invitation_v1('$O1','Rep@Company.example','$(hash $(tok o1))','lt')")
check "operator A invites the representative" "invited" "$(outcome "$r")"
check "the company is now invited" "invited" "$(q "select claim_state from organizations where id='$O1'")"
r=$(as $OPA opa@ops.example "select create_claim_invitation_v1('$O1','rep@company.example','$(hash $(tok o1b))','lt')")
check "a second pending invitation is refused" "already_invited" "$(outcome "$r")"
check "a generic accept door cannot accept a claim invitation" "1" \
  "$($PSQL -c "update invitations set status='accepted' where invitation_type='claim_organization'" 2>&1 | grep -c claim_invitation_wrong_door)"

echo "== representative"
r=$(as $REP rep@company.example "select accept_claim_invitation_v1('tok-wrong','Director',true)")
check "an invalid token is refused" "not_found" "$(outcome "$r")"
r=$(as $OTH oth@other.example "select accept_claim_invitation_v1('$(tok o1)','Director',true)")
check "another address is refused" "email_mismatch" "$(outcome "$r")"
r=$(as $UNV rep@company.example "select accept_claim_invitation_v1('$(tok o1)','Director',true)")
check "an address without mailbox proof is refused" "email_not_verified" "$(outcome "$r")"
r=$(as $REP rep@company.example "select get_claim_invitation_preview_v1('$(tok o1)')")
check "the preview names the company and never the address" "0" "$(grep -c 'rep@company' <<< "$r")"
check "the preview says the address matches and is proven" "ok" "$(outcome "$r")"
r=$(as $REP rep@company.example "select accept_claim_invitation_v1('$(tok o1)','Director',false)")
check "the authority statement is required" "authority_not_confirmed" "$(outcome "$r")"
r=$(as $REP rep@company.example "select accept_claim_invitation_v1('$(tok o1)','x',true)")
check "a role is required" "invalid_role" "$(outcome "$r")"
r=$(as $REP rep@company.example "select accept_claim_invitation_v1('$(tok o1)','Director',true)")
check "the representative accepts" "claim_requested" "$(outcome "$r")"
check "the company is claim_requested, still with no owner" "claim_requested|" "$(q "select claim_state||'|'||coalesce(owner_profile_id::text,'') from organizations where id='$O1'")"
r=$(as $REP rep@company.example "select accept_claim_invitation_v1('$(tok o1)','Director',true)")
check "the invitation cannot be used twice" "already_used" "$(outcome "$r")"

r=$(as $OPA opa@ops.example "select create_claim_invitation_v1('$O2','opa@ops.example','$(hash $(tok o2s))','lt')")
r=$(as $OPA opa@ops.example "select accept_claim_invitation_v1('$(tok o2s)','Operator',true)")
check "the inviting operator cannot claim through their own invitation" "inviter_cannot_claim" "$(outcome "$r")"
$PSQL -c "update invitations set status='revoked', revoked_at=now() where token_hash='$(hash $(tok o2s))'" >/dev/null
r=$(as $OPA opa@ops.example "select create_claim_invitation_v1('$O2','rep@company.example','$(hash $(tok o2))','it')")
$PSQL -c "update invitations set expires_at = now() - interval '1 minute' where token_hash='$(hash $(tok o2))'" >/dev/null
r=$(as $REP rep@company.example "select accept_claim_invitation_v1('$(tok o2)','Director',true)")
check "an expired invitation is refused" "expired" "$(outcome "$r")"

echo "== the closed doors and escalation"
check "request_organization_claim_v1 is closed to signed-in users" "1" "$(as $OTH oth@other.example "select request_organization_claim_v1('$O3','operator_manual_review','x')" | grep -c 'permission denied')"
check "decide_organization_claim_v1 is closed to signed-in users" "1" "$(as $OPB opb@ops.example "select decide_organization_claim_v1(gen_random_uuid(),'verify','x',null)" | grep -c 'permission denied')"
check "the link cannot be called by a client" "1" "$(as $OPB opb@ops.example "select link_verified_organization_claim_v1(gen_random_uuid(),'$OPB')" | grep -c 'permission denied')"
C1=$(q "select id from organization_claims where organization_id='$O1'")
check "the representative cannot decide" "1" "$(as $REP rep@company.example "select decide_organization_claim_v2('$C1','verify','x',null)" | grep -c 'Not authorized')"
check "operator A, who sent the invitation, cannot decide" "1" "$(as $OPA opa@ops.example "select decide_organization_claim_v2('$C1','verify','register extract','A')" | grep -c 'sent the invitation')"

echo "== request without an invitation"
r=$(as $UNV unv@company.example "select submit_organization_verification_request_v1('$O3','Director','https://register.example/1',true)")
check "a request needs mailbox proof" "email_not_verified" "$(outcome "$r")"
K0=$(q "insert into organization_claims (organization_id, claimant_profile_id, state, verification_method, verification_evidence_ref) values ('$O3','$OPC','requested','operator_manual_review','seed: filed before the rule') returning id")
r=$(as $OPC opc@ops.example "select submit_organization_verification_request_v1('$O2','Owner','https://register.example/3',true)")
check "an operator cannot file a request" "operator_cannot_claim" "$(outcome "$r")"
r=$(as $R2 r2@x.example "select submit_organization_verification_request_v1('$O3','Owner','https://register.example/3',true)")
check "a verified user can ask" "request_submitted" "$(outcome "$r")"
check "the request changes nothing on the company" "discovered|" "$(q "select claim_state||'|'||coalesce(owner_profile_id::text,'') from organizations where id='$O3'")"
C3="$K0"
check "operator C cannot decide their own request" "1" "$(as $OPC opc@ops.example "select decide_organization_claim_v2('$C3','verify','x',null)" | grep -c 'own claim')"
r=$(as $OPB opb@ops.example "select decide_organization_claim_v2('$C3','verify','register QA-3',null)")
check "another operator cannot make operator C an owner" "operator_claimant" "$(outcome "$r")"
check "the company stays without an owner" "discovered|" "$(q "select claim_state||'|'||coalesce(owner_profile_id::text,'') from organizations where id='$O3'")"
check "the link itself refuses an operator claimant" "operator_claimant" "$(q "update organization_claims set state='representative_verified', decided_by='$OPB', decided_at=now() where id='$C3'; select link_verified_organization_claim_v1('$C3','$OPB')" | tail -1)"
$PSQL -c "update organization_claims set state='requested', decided_by=null, decided_at=null where id='$C3'" >/dev/null
for o in "$O2" "$O4" "$O3"; do as $OTH oth@other.example "select submit_organization_verification_request_v1('$o','Director','https://register.example/r',true)" >/dev/null; done
r=$(as $OTH oth@other.example "select submit_organization_verification_request_v1('$O1','Director','https://register.example/r',true)")
check "requests are limited per person" "too_many_requests" "$(outcome "$r")"

echo "== the decision and the link"
check "a NULL decision is refused" "1" "$(as $OPB opb@ops.example "select decide_organization_claim_v2('$C1',null,'register extract',null)" | grep -c 'verify or reject')"
check "verification needs evidence" "1" "$(as $OPB opb@ops.example "select decide_organization_claim_v2('$C1','verify','',null)" | grep -c 'documented evidence')"
r=$(as $OPB opb@ops.example "select decide_organization_claim_v2('$C1','verify','register extract QA-1','checked')")
check "operator B verifies and links" "linked" "$(outcome "$r")"
check "the representative owns the company" "claimed|$REP" "$(q "select claim_state||'|'||owner_profile_id from organizations where id='$O1'")"
check "the owner membership exists" "owner|active" "$(q "select role||'|'||status from company_memberships where organization_id='$O1' and profile_id='$REP'")"
check "the owner engagement exists" "1" "$(q "select count(*) from engagement_contexts where organization_id='$O1' and profile_id='$REP' and relationship_slug='owner'")"
check "the link binds one operational company to the claimed organization" "1" "$(q "select count(*) from companies c join organizations o on o.legacy_company_id = c.id where o.id='$O1' and c.profile_id='$REP'")"
check "the link creates no second organization" "5" "$(q "select count(*) from organizations")"
check "no operator holds a membership" "0" "$(q "select count(*) from company_memberships where organization_id='$O1' and profile_id in ('$OPA','$OPB')")"
check "the audit has invited, requested, verified, linked" "4" "$(q "select count(distinct action) from audit_logs where entity_id='$O1'")"
r=$(as $OPB opb@ops.example "select decide_organization_claim_v2('$C1','verify','again',null)")
check "a second decision is refused" "not_pending" "$(outcome "$r")"
check "a replayed link changes nothing" "already_linked" "$(q "select link_verified_organization_claim_v1('$C1','$OPB')")"
r=$(as $REP rep@company.example "select create_claim_invitation_v1('$O3','rep@company.example','$(hash $(tok o3x))','lt')")
check "the new owner gains no operator power" "1" "$(grep -c 'Not authorized' <<< "$r")"
r=$(as $OTH oth@other.example "select submit_organization_verification_request_v1('$O1','Director','https://register.example/r',true)")
check "an owned company takes no new request" "not_claimable" "$(outcome "$r")"
K5=$(q "insert into organization_claims (organization_id, claimant_profile_id, state, verification_method, verification_evidence_ref) values ('$O5','$R2','requested','operator_manual_review','seed') returning id")
r=$(as $OPB opb@ops.example "select decide_organization_claim_v2('$K5','verify','x',null)")
check "an owned company cannot be linked again" "already_claimed" "$(outcome "$r")"

echo "== an invitation after a request; a decider with a competing claim"
O6=20000000-0000-4000-8000-000000000006
$PSQL -c "insert into organizations (id, display_name, country, claim_state) values ('$O6','QA-SYNTHETIC Zeta','LT','discovered')" >/dev/null
r=$(as $R3 r3@x.example "select submit_organization_verification_request_v1('$O6','Director','https://register.example/6',true)")
check "the representative first sends a request" "request_submitted" "$(outcome "$r")"
as $OPA opa@ops.example "select create_claim_invitation_v1('$O6','r3@x.example','$(hash $(tok o6))','lt')" >/dev/null
r=$(as $R3 r3@x.example "select accept_claim_invitation_v1('$(tok o6)','Director',true)")
check "the later invitation is still accepted" "claim_requested" "$(outcome "$r")"
check "the earlier request gave way to the invited claim" "withdrawn" "$(q "select state from organization_claims where organization_id='$O6' and invitation_id is null")"
KB=$(q "insert into organization_claims (organization_id, claimant_profile_id, state, verification_method, verification_evidence_ref) values ('$O6','$OPB','requested','operator_manual_review','seed: filed before the rule') returning id")
K6=$(q "select id from organization_claims where organization_id='$O6' and invitation_id is not null")
r=$(as $OPB opb@ops.example "select decide_organization_claim_v2('$K6','verify','register QA-6',null)")
check "a decider with a competing claim can still verify another claim" "linked" "$(outcome "$r")"
check "the decider's own competing claim is withdrawn, not self-decided" "withdrawn|" "$(q "select state||'|'||coalesce(decided_by::text,'') from organization_claims where id='$KB'")"

echo "== race: two operators verify two requests for one company at once"
as $R2 r2@x.example "select submit_organization_verification_request_v1('$O4','Director','https://register.example/4a',true)" >/dev/null
as $R3 r3@x.example "select submit_organization_verification_request_v1('$O4','Director','https://register.example/4b',true)" >/dev/null
K2=$(q "select id from organization_claims where organization_id='$O4' and claimant_profile_id='$R2'")
K3=$(q "select id from organization_claims where organization_id='$O4' and claimant_profile_id='$R3'")
as $OPB opb@ops.example "select decide_organization_claim_v2('$K2','verify','register QA-4a',null)" > "$ERR.r2" &
as $OPC opc@ops.example "select decide_organization_claim_v2('$K3','verify','register QA-4b',null)" > "$ERR.r3" &
wait
check "exactly one race winner is linked" "1" "$(cat "$ERR.r2" "$ERR.r3" | grep -c '"linked"')"
check "the company has exactly one owner membership" "1" "$(q "select count(*) from company_memberships where organization_id='$O4' and role='owner'")"
check "every other open request on it is closed" "0" "$(q "select count(*) from organization_claims where organization_id='$O4' and state='requested'")"

echo "== rollback"
ROWS=$(q "select count(*) from organization_claims")
check "with claim rows the rollback pauses" "1" "$($PSQL -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1 | grep -c 'company takeover paused')"
check "paused: no data is lost" "$ROWS" "$(q "select count(*) from organization_claims")"
check "paused: the new doors are closed" "1" "$(as $OPA opa@ops.example "select create_claim_invitation_v1('$O3','x@y.example','$(hash $(tok p1))','lt')" | grep -c 'permission denied')"
check "paused: the old claim door stays closed" "1" "$(as $OTH oth@other.example "select request_organization_claim_v1('$O3','operator_manual_review','x')" | grep -c 'permission denied')"
check "paused: the old decide door stays closed" "1" "$(as $OPB opb@ops.example "select decide_organization_claim_v1(gen_random_uuid(),'verify','x',null)" | grep -c 'permission denied')"
$PSQL -c "truncate audit_logs, company_memberships, engagement_contexts, organization_claims, invitations cascade" >/dev/null
run_file "$DOWN"
check "rollback restores the old type list" "0" "$(q "select count(*) from pg_constraint where conname='invitations_invitation_type_check' and pg_get_constraintdef(oid) like '%claim_organization%'")"
check "a clean rollback keeps the old claim door closed" "1" "$(as $OTH oth@other.example "select request_organization_claim_v1('$O3','operator_manual_review','x')" | grep -c 'permission denied')"
check "a clean rollback restores the mirror (a new company mirrors to an organization)" "1" "$(q "insert into companies (profile_id, display_name) values ('$OTH','QA-SYNTHETIC Mirror'); select count(*) from organizations where display_name='QA-SYNTHETIC Mirror'" | tail -1)"
run_file "$MIG"; run_file "$MIG"
check "re-apply twice is idempotent" "1" "$(q "select count(*) from pg_trigger where tgname='claim_invitation_accept_guard'")"

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
