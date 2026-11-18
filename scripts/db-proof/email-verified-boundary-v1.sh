#!/usr/bin/env bash
# ============================================================================
# email-verified-boundary-v1 -- REAL PostgreSQL proof (throwaway local PG16,
# no Docker, no Supabase). Schema/behaviour = the REAL migration + rollback
# executed verbatim, over the prelude (external bits + UNCHANGED live functions).
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58733 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58733 bash scripts/db-proof/email-verified-boundary-v1.sh
#
# Uses database `evb1` (dropped and rebuilt). Refuses non-local hosts.
#
# PHASES  BEFORE (live originals, reproduced via the rollback file): the
# takeover DEFECT is shown. AFTER (migration): every email-trusting path is
# fail-closed for an unverified (autoconfirmed) session and unchanged for
# verified / social / token-proved callers. Then idempotent re-apply, rollback,
# re-apply.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261003151000_email_verified_boundary_v1
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54310}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d evb1 -tA -q"

$ADMINP -c "drop database if exists evb1" -c "create database evb1" >/dev/null 2>&1 || { echo "cannot reach postgres on $PGPROOF_PORT (set PGPROOF_PORT)"; exit 2; }
ERR=$(mktemp)
run_file() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$ERR" || { echo "FAILED: $1"; cat "$ERR"; exit 1; }; }
run_file "$HERE/email-verified-boundary-v1.prelude.sql"

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }

# as <uid> <email> <amrkind: pwd|otp|oauth|none> <ts-sql> <sql...>   (role authenticated + PostgREST-style claims)
as() { local uid="$1" email="$2" kind="$3" ts="$4"; shift 4
  local claims
  case "$kind" in
    otp)   claims="jsonb_build_array(jsonb_build_object('method','otp','timestamp',($ts)))";;
    pwd)   claims="jsonb_build_array(jsonb_build_object('method','password','timestamp',($ts)))";;
    oauth) claims="jsonb_build_array(jsonb_build_object('method','oauth','timestamp',($ts)))";;
    *)     claims="null::jsonb";;
  esac
  printf '%s\n' "select set_config('request.jwt.claims', jsonb_build_object('sub','$uid','email','$email','amr',$claims)::text, false) \\gset
set role authenticated;
$*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
NOW="floor(extract(epoch from now()))::bigint"

# ---- identities --------------------------------------------------------------
LEG=10000000-0000-4000-8000-000000000001    # legacy confirmed (backfilled)         leg@x.com
SOCO=10000000-0000-4000-8000-000000000002   # google identity existing at cutover   soco@x.com
SOCN=10000000-0000-4000-8000-000000000003   # google, created AFTER cutover, first  socn@x.com
SOCL=10000000-0000-4000-8000-000000000004   # email identity first, google LINKED   socl@x.com
FBN=10000000-0000-4000-8000-000000000005    # facebook after cutover                fbn@x.com
NEW=10000000-0000-4000-8000-000000000006    # autoconfirmed after cutover (ATTACKER) new@x.com
NEW2=10000000-0000-4000-8000-000000000007   # autoconfirmed after cutover, will PROVE new2@x.com
ATK=10000000-0000-4000-8000-000000000008    # tries address-switch laundering       atk@x.com
OWN=10000000-0000-4000-8000-000000000009    # company/agency/org owner (legacy)     own@x.com
CO=20000000-0000-4000-8000-000000000001; AG=20000000-0000-4000-8000-000000000002; ORG=20000000-0000-4000-8000-000000000003
CLI=20000000-0000-4000-8000-000000000004   # a client company owned by NEW/LEG via ownership rows below

seed_legacy() {
  su "truncate auth.users, auth.identities, public.profiles, public.workers, public.companies, public.agencies, public.organizations, public.company_workers, public.agency_workers, public.company_worker_invitations, public.agency_worker_invitations, public.agency_client_connections, public.invitations, public.invitation_acceptances, public.engagement_contexts, public.company_memberships, public.audit_logs cascade;
   insert into auth.users (id,email,email_confirmed_at,created_at) values
     ('$LEG','leg@x.com', now()-interval '30 days', now()-interval '31 days'),
     ('$SOCO','soco@x.com', now()-interval '20 days', now()-interval '20 days'),
     ('$OWN','own@x.com', now()-interval '40 days', now()-interval '41 days');
   insert into auth.identities (user_id,provider,identity_data,created_at) values
     ('$LEG','email','{\"email\":\"leg@x.com\",\"email_verified\":false}', now()-interval '31 days'),
     ('$SOCO','google','{\"email\":\"soco@x.com\",\"email_verified\":true}', now()-interval '20 days'),
     ('$OWN','email','{\"email\":\"own@x.com\"}', now()-interval '41 days');
   insert into public.profiles (id,email,full_name,active_role) values
     ('$LEG','leg@x.com','Leg','worker'),('$SOCO','soco@x.com','Soco','worker'),('$OWN','own@x.com','Owner','company');
   insert into public.workers (profile_id) values ('$LEG'),('$SOCO');
   insert into public.companies (id,owner_profile_id,display_name) values ('$CO','$OWN','Co'),('$CLI','$LEG','LegClientCo');
   insert into public.agencies (id,profile_id,legal_name) values ('$AG','$OWN','Ag');
   insert into public.organizations (id,legacy_company_id,display_name) values ('$ORG','$CO','Org');
   insert into public.company_memberships (organization_id,profile_id,role,status) values ('$ORG','$OWN','owner','active');" >/dev/null
}
seed_post_cutover() {   # created AFTER the cutover instant (autoconfirm era)
  su "insert into auth.users (id,email,email_confirmed_at,created_at) values
     ('$SOCN','socn@x.com', now(), now()),
     ('$SOCL','socl@x.com', now(), now()),
     ('$FBN','fbn@x.com', now(), now()),
     ('$NEW','new@x.com', now(), now()),
     ('$NEW2','new2@x.com', now(), now()),
     ('$ATK','atk@x.com', now(), now());
   insert into auth.identities (user_id,provider,identity_data,created_at) values
     ('$SOCN','google','{\"email\":\"socn@x.com\",\"email_verified\":true}', now()),
     ('$SOCL','email','{\"email\":\"socl@x.com\"}', now()),
     ('$SOCL','google','{\"email\":\"socl@x.com\",\"email_verified\":true}', now()+interval '1 second'),
     ('$FBN','facebook','{\"email\":\"fbn@x.com\",\"email_verified\":true}', now()),
     ('$NEW','email','{\"email\":\"new@x.com\"}', now()),
     ('$NEW2','email','{\"email\":\"new2@x.com\"}', now()),
     ('$ATK','email','{\"email\":\"atk@x.com\"}', now());
   insert into public.profiles (id,email,full_name,active_role) values
     ('$SOCN','socn@x.com','n','worker'),('$SOCL','socl@x.com','l','worker'),('$FBN','fbn@x.com','f','worker'),
     ('$NEW','new@x.com','new','worker'),('$NEW2','new2@x.com','new2','worker'),('$ATK','atk@x.com','atk','worker');
   insert into public.workers (profile_id) values ('$SOCN'),('$SOCL'),('$FBN'),('$NEW'),('$NEW2'),('$ATK');
   insert into public.companies (id,owner_profile_id,display_name) values ('30000000-0000-4000-8000-000000000001','$NEW','NewCo'),('30000000-0000-4000-8000-000000000002','$NEW2','New2Co');" >/dev/null
}
NEWCO=30000000-0000-4000-8000-000000000001; NEW2CO=30000000-0000-4000-8000-000000000002

reset_resources() {
  su "truncate public.company_worker_invitations, public.agency_worker_invitations, public.agency_client_connections, public.invitations, public.invitation_acceptances, public.company_workers, public.agency_workers, public.engagement_contexts, public.audit_logs;
   delete from public.company_memberships where role <> 'owner';
   insert into public.company_worker_invitations (company_id,invited_email,status) values ('$CO','new@x.com','pending'),('$CO','new2@x.com','pending'),('$CO','leg@x.com','pending'),('$CO','socn@x.com','pending'),('$CO','socl@x.com','pending'),('$CO','fbn@x.com','pending'),('$CO','soco@x.com','pending');
   insert into public.agency_worker_invitations (agency_id,invited_email,status) values ('$AG','new@x.com','pending'),('$AG','new2@x.com','pending'),('$AG','leg@x.com','pending');
   insert into public.agency_client_connections (id,agency_company_id,invited_email,status) values
     ('40000000-0000-4000-8000-000000000001','$CO','new@x.com','pending'),
     ('40000000-0000-4000-8000-000000000002','$CO','new2@x.com','pending'),
     ('40000000-0000-4000-8000-000000000003','$CO','leg@x.com','pending'),
     ('40000000-0000-4000-8000-000000000004','$CO','new@x.com','pending'),
     ('40000000-0000-4000-8000-000000000005','$CO','leg@x.com','pending');
   insert into public.invitations (id,invited_email,invitation_type,organization_id,status,token_hash,personal_message) values
     ('50000000-0000-4000-8000-000000000001','new@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-new','sha256'),'hex'),'hello'),
     ('50000000-0000-4000-8000-000000000002','new2@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-new2','sha256'),'hex'),'hello'),
     ('50000000-0000-4000-8000-000000000003','leg@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-leg','sha256'),'hex'),'hello'),
     ('50000000-0000-4000-8000-000000000004','new@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-new-v1','sha256'),'hex'),'hello'),
     ('50000000-0000-4000-8000-000000000005','new2@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-new2-v1','sha256'),'hex'),'hello'),
     ('50000000-0000-4000-8000-000000000006','leg@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-leg-v1','sha256'),'hex'),'hello');
   insert into public.invitations (id,invited_email,invitation_type,organization_id,status,token_hash,expires_at) values
     ('50000000-0000-4000-8000-0000000000e1','victim@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-expired','sha256'),'hex'), now()-interval '1 day'),
     ('50000000-0000-4000-8000-0000000000e2','victim@x.com','join_organization','$ORG','accepted',encode(extensions.digest('tok-used','sha256'),'hex'), now()+interval '1 day'),
     ('50000000-0000-4000-8000-0000000000e3','victim@x.com','join_organization','$ORG','pending',encode(extensions.digest('tok-good','sha256'),'hex'), now()+interval '1 day');" >/dev/null
}
ACCEPT_V2() { as "$1" "$2" "$3" "$NOW" "select public.accept_invitation_by_id_v2('$4') ->> 'outcome';" | tail -1; }
ACCEPT_V1() { as "$1" "$2" "$3" "$NOW" "select public.accept_invitation_by_id_v1('$4') ->> 'outcome';" | tail -1; }
TOKEN() { as "$1" "$2" "$3" "$NOW" "select public.accept_invitation_v2('$4') ->> 'outcome';" | tail -1; }
ACC_CO() { as "$1" "$2" "$3" "$NOW" "select public.accept_company_worker_invitation('$CO');" | tail -1; }
ACC_AG() { as "$1" "$2" "$3" "$NOW" "select public.accept_agency_worker_invitation('$AG');" | tail -1; }
ACC_CC() { as "$1" "$2" "$3" "$NOW" "select public.accept_agency_client_connection_v1('$4','$5');" | tail -1; }
DEC_CC() { as "$1" "$2" "$3" "$NOW" "select public.decline_agency_client_connection_v1('$4');" | tail -1; }
LIST_N() { as "$1" "$2" "$3" "$NOW" "select jsonb_array_length(public.list_invitations_for_me_v1() -> 'items');" | tail -1; }
LIST_FLAG() { as "$1" "$2" "$3" "$NOW" "select coalesce(public.list_invitations_for_me_v1() ->> 'email_unverified','-');" | tail -1; }
RLS_CO() { as "$1" "$2" "$3" "$NOW" "select count(*) from public.company_worker_invitations where lower(invited_email)=lower('$2');" | tail -1; }
RLS_AG() { as "$1" "$2" "$3" "$NOW" "select count(*) from public.agency_worker_invitations where lower(invited_email)=lower('$2');" | tail -1; }
RLS_CC() { as "$1" "$2" "$3" "$NOW" "select count(*) from public.agency_client_connections where lower(invited_email)=lower('$2');" | tail -1; }
MINVITE() { as "$OWN" own@x.com pwd "$NOW" "select public.membership_invite_v1('$ORG','$1','member');" | tail -1; }
st() { q "select status from public.$1 where $2;"; }

refused() { local out; out=$(cat); case "$out" in *"$1"*) echo refused;; *) echo ok;; esac; }
PHASE=BEFORE
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }

suite() {
  reset_resources; su "delete from public.company_memberships where role<>'owner';" >/dev/null
  echo "--- by-id accept v2 / v1 (email-asserted door)"
  exp "v2: UNVERIFIED autoconfirmed NEW claims invitation addressed to new@x.com" "accepted" "email_unverified" "$(ACCEPT_V2 $NEW new@x.com pwd 50000000-0000-4000-8000-000000000001)"
  exp "v2: invitation untouched after an unverified attempt (AFTER)" "accepted" "pending" "$(st invitations "id='50000000-0000-4000-8000-000000000001'")"
  exp "v1: UNVERIFIED NEW claims" "accepted" "email_unverified" "$(ACCEPT_V1 $NEW new@x.com pwd 50000000-0000-4000-8000-000000000004)"
  exp "v2: verified LEGACY owner of leg@x.com ALLOWED" "accepted" "accepted" "$(ACCEPT_V2 $LEG leg@x.com pwd 50000000-0000-4000-8000-000000000003)"
  exp "v1: verified LEGACY owner ALLOWED" "accepted" "accepted" "$(ACCEPT_V1 $LEG leg@x.com pwd 50000000-0000-4000-8000-000000000006)"
  exp "v2: verified user with a DIFFERENT email gets not_found (no probe)" "not_found" "not_found" "$(ACCEPT_V2 $LEG leg@x.com pwd 50000000-0000-4000-8000-000000000002)"
  exp "v2: NULL-email JWT session denied (no accept)" "not_found" "email_unverified" "$(ACCEPT_V2 $NEW '' pwd 50000000-0000-4000-8000-000000000002)"
  echo "--- token door (possession-proved) is unaffected by verification"
  exp "token: UNVERIFIED NEW with a VALID token is ALLOWED" "accepted" "accepted" "$(TOKEN $NEW new@x.com pwd tok-good)"
  exp "token: EXPIRED token DENIED" "expired" "expired" "$(TOKEN $NEW new@x.com pwd tok-expired)"
  exp "token: USED token DENIED" "already_accepted" "already_accepted" "$(TOKEN $NEW new@x.com pwd tok-used)"
  exp "token: INVALID token DENIED" "not_found" "not_found" "$(TOKEN $NEW new@x.com pwd tok-nope)"
  echo "--- company / agency roster invitations"
  exp "company: UNVERIFIED NEW claims new@x.com roster invitation" "linked" "email_unverified" "$(ACC_CO $NEW new@x.com pwd)"
  exp "company: no roster row for unverified NEW (AFTER)" "1" "0" "$(q "select count(*) from public.company_workers cw join public.workers w on w.id=cw.worker_id where w.profile_id='$NEW';")"
  exp "company: verified LEGACY ALLOWED" "linked" "linked" "$(ACC_CO $LEG leg@x.com pwd)"
  exp "company: social (google at cutover) ALLOWED" "linked" "linked" "$(ACC_CO $SOCO soco@x.com oauth)"
  exp "company: social NEW google-first ALLOWED" "linked" "linked" "$(ACC_CO $SOCN socn@x.com oauth)"
  exp "company: google LINKED onto a password identity (pre-hijack shape) DENIED" "linked" "email_unverified" "$(ACC_CO $SOCL socl@x.com oauth)"
  exp "company: facebook after cutover (no provider guarantee) DENIED" "linked" "email_unverified" "$(ACC_CO $FBN fbn@x.com oauth)"
  exp "agency: UNVERIFIED NEW claims" "linked" "email_unverified" "$(ACC_AG $NEW new@x.com pwd)"
  exp "agency: verified LEGACY ALLOWED" "linked" "linked" "$(ACC_AG $LEG leg@x.com pwd)"
  echo "--- agency client connection accept / decline"
  exp "connection accept: UNVERIFIED NEW (owns a client company) DENIED" "accepted" "email_unverified" "$(ACC_CC $NEW new@x.com pwd 40000000-0000-4000-8000-000000000001 $NEWCO)"
  exp "connection stays pending after the unverified attempt (AFTER)" "active" "pending" "$(st agency_client_connections "id='40000000-0000-4000-8000-000000000001'")"
  exp "connection decline: UNVERIFIED NEW cannot decline someone else's pending" "declined" "email_unverified" "$(DEC_CC $NEW new@x.com pwd 40000000-0000-4000-8000-000000000004)"
  exp "connection: verified LEGACY owner of client company ALLOWED" "accepted" "accepted" "$(ACC_CC $LEG leg@x.com pwd 40000000-0000-4000-8000-000000000003 $CLI)"
  exp "connection decline: verified owner ALLOWED on own address" "declined" "declined" "$(DEC_CC $LEG leg@x.com pwd 40000000-0000-4000-8000-000000000005)"
  echo "--- enumeration (list_invitations_for_me_v1) + RLS select branches"
  reset_resources
  exp "list: UNVERIFIED NEW sees invitations addressed to new@x.com" "2" "0" "$(LIST_N $NEW new@x.com pwd)"
  exp "list: UNVERIFIED NEW is told why (flag) so the UI can offer the proof" "-" "true" "$(LIST_FLAG $NEW new@x.com pwd)"
  exp "list: verified LEGACY sees own" "2" "2" "$(LIST_N $LEG leg@x.com pwd)"
  exp "list: verified (google-first) sees own" "0" "0" "$(LIST_N $SOCN socn@x.com oauth)"
  exp "RLS company_worker_invitations: UNVERIFIED NEW reads own-email row" "1" "0" "$(RLS_CO $NEW new@x.com pwd)"
  exp "RLS company_worker_invitations: verified LEGACY reads own-email row" "1" "1" "$(RLS_CO $LEG leg@x.com pwd)"
  exp "RLS agency_worker_invitations: UNVERIFIED NEW" "1" "0" "$(RLS_AG $NEW new@x.com pwd)"
  exp "RLS agency_worker_invitations: verified LEGACY" "1" "1" "$(RLS_AG $LEG leg@x.com pwd)"
  exp "RLS agency_client_connections: UNVERIFIED NEW" "2" "0" "$(RLS_CC $NEW new@x.com pwd)"
  exp "RLS agency_client_connections: verified LEGACY" "2" "2" "$(RLS_CC $LEG leg@x.com pwd)"
  exp "RLS: company OWNER still sees every row (owner branch unchanged)" "7" "7" "$(as $OWN own@x.com pwd "$NOW" "select count(*) from public.company_worker_invitations;" | tail -1)"
  echo "--- inviter-side resolution (membership_invite_v1 + resolver functions)"
  exp "membership_invite: inviting an UNVERIFIED registrant (new@x.com) resolves nobody" "invited" "no_such_user" "$(MINVITE new@x.com)"
  exp "membership_invite: verified LEGACY resolves" "invited" "invited" "$(MINVITE leg@x.com)"
  exp "membership_invite: google-first NEW resolves" "invited" "invited" "$(MINVITE socn@x.com)"
  exp "assign_training resolver: unverified -> unresolved" "$NEW" "invalid_assignee" "$(as $OWN own@x.com pwd "$NOW" "select public.assign_training_v1('p','new@x.com');" | tail -1)"
  exp "assign_training resolver: verified -> resolved" "$LEG" "$LEG" "$(as $OWN own@x.com pwd "$NOW" "select public.assign_training_v1('p','leg@x.com');" | tail -1)"
  exp "management decision (create) resolver: unverified -> unresolved" "$NEW" "invalid_responsible" "$(as $OWN own@x.com pwd "$NOW" "select public.create_management_decision_v1('o','t','a','new@x.com');" | tail -1)"
  exp "management decision (update) resolver: unverified -> unresolved" "$NEW" "invalid_responsible" "$(as $OWN own@x.com pwd "$NOW" "select public.update_management_decision_v1('d',null,null,'new@x.com');" | tail -1)"
  exp "performance review resolver: unverified subject+reviewer unresolved" "$NEW/$NEW" "invalid_subject/none" "$(as $OWN own@x.com pwd "$NOW" "select public.create_performance_review_v1('c','new@x.com','new@x.com');" | tail -1)"
  exp "delegate resolver: unverified -> unresolved" "$NEW" "invalid_delegate" "$(as $OWN own@x.com pwd "$NOW" "select public.delegate_workflow_step_v1('i','new@x.com');" | tail -1)"
  echo "--- money-adjacent: LMC paths no longer key on auth.users.email_confirmed_at"
  exp "lmc_admin_grant: unverified recipient refused" "ok" "refused" "$(as $OWN own@x.com pwd "$NOW" "select case when (select public.lmc_admin_grant_v1('new@x.com',1,'r','c',now()+interval '1 day','k')) is not null then 'ok' end;" | refused lmc_recipient_not_found_or_unverified)"
  exp "lmc_admin_grant: verified recipient ok" "ok" "ok" "$(as $OWN own@x.com pwd "$NOW" "select case when (select public.lmc_admin_grant_v1('leg@x.com',1,'r','c',now()+interval '1 day','k')) is not null then 'ok' end;" | refused lmc_recipient)"
  exp "lmc_grant_promotional: unverified refused" "ok" "refused" "$(su "select public.lmc_grant_promotional_v1('promotional_signup','$NEW','c','k');" | refused lmc_recipient_not_verified)"
  exp "lmc_grant_promotional: verified ok" "ok" "ok" "$(su "select public.lmc_grant_promotional_v1('promotional_signup','$LEG','c','k');" | refused lmc_recipient_not_verified)"
}

echo "=============================================================="; echo " STEP 1 -- BEFORE: live originals (rollback file) over autoconfirm-era data"; echo "=============================================================="
seed_legacy
run_file "$DOWN"   # installs the verbatim live originals (also proves the rollback is safe on a DB without the migration)
seed_post_cutover  # attacker-era rows: autoconfirmed, unverified in substance
PHASE=BEFORE; suite

echo "=============================================================="; echo " STEP 2 -- APPLY migration verbatim"; echo "=============================================================="
# cutover = apply time: legacy rows exist before, post-cutover rows must be created AFTER it
seed_legacy
run_file "$MIG"
seed_post_cutover
PHASE=AFTER; suite

echo "--- backfill facts"
check "legacy confirmed -> verified (leg@x.com)" "1" "$(q "select count(*) from public.email_verifications_v1 where profile_id='$LEG' and email='leg@x.com';")"
check "legacy social identity -> verified (soco@x.com)" "1" "$(q "select count(*) from public.email_verifications_v1 where profile_id='$SOCO';")"
check "post-cutover autoconfirmed users are NOT backfilled" "0" "$(q "select count(*) from public.email_verifications_v1 where profile_id in ('$NEW','$NEW2','$ATK','$SOCN','$SOCL','$FBN');")"
BEFORE_N=$(q "select count(*) from public.email_verifications_v1;")
check "backfill is idempotent (returns 0 new rows on re-run)" "0" "$(q "select public.backfill_verified_emails_v1();")"
check "re-running backfill AFTER the flip never verifies an autoconfirmed signup" "0" "$(q "select count(*) from public.email_verifications_v1 where profile_id='$NEW';")"
check "row count stable across re-run" "$BEFORE_N" "$(q "select count(*) from public.email_verifications_v1;")"
check "google-first post-cutover derives verified (no row needed)" "t" "$(q "select public.email_is_verified_v1('$SOCN','socn@x.com');")"
check "google LINKED onto password identity NOT verified" "f" "$(q "select public.email_is_verified_v1('$SOCL','socl@x.com');")"
check "facebook after cutover NOT verified" "f" "$(q "select public.email_is_verified_v1('$FBN','fbn@x.com');")"
check "NULL / blank inputs are false" "false|false|false" "$(q "select coalesce(public.email_is_verified_v1(null,'a@b.c')::text,'null')||'|'||public.email_is_verified_v1('$LEG',null)::text||'|'||public.email_is_verified_v1('$LEG','  ')::text;")"

echo "--- anon / null / direct-table denials"
check "ANON cannot execute session_email_verified_v1" "1" "$(printf 'set role anon; select public.session_email_verified_v1();' | $PSQL -f - 2>&1 | grep -c 'permission denied')"
check "ANON cannot execute confirm_my_email_v1" "1" "$(printf 'set role anon; select public.confirm_my_email_v1();' | $PSQL -f - 2>&1 | grep -c 'permission denied')"
check "authenticated WITHOUT a sub: session_email_verified_v1 is false (not an error)" "f" "$(printf "set role authenticated; select set_config('request.jwt.claims','{}',false) \\\\gset\nselect public.session_email_verified_v1();" | $PSQL -f - 2>&1 | tail -1)"
check "authenticated WITHOUT a sub: list_invitations_for_me_v1 raises Not authenticated" "1" "$(printf "set role authenticated; select set_config('request.jwt.claims','{}',false) \\\\gset\nselect public.list_invitations_for_me_v1();" | $PSQL -f - 2>&1 | grep -c 'Not authenticated')"
check "authenticated cannot read email_verifications_v1 directly" "1" "$(as $LEG leg@x.com pwd "$NOW" "select count(*) from public.email_verifications_v1;" | grep -c 'permission denied')"
check "authenticated cannot INSERT a verification (self-grant)" "1" "$(as $NEW new@x.com pwd "$NOW" "insert into public.email_verifications_v1 (profile_id,email,method) values ('$NEW','new@x.com','mailbox_proof');" | grep -c 'permission denied')"
check "authenticated cannot call the internal predicate with an arbitrary uid" "1" "$(as $NEW new@x.com pwd "$NOW" "select public.email_is_verified_v1('$LEG','leg@x.com');" | grep -c 'permission denied')"
check "authenticated cannot call the inviter resolver directly" "1" "$(as $NEW new@x.com pwd "$NOW" "select public.profile_id_by_verified_email_v1('leg@x.com');" | grep -c 'permission denied')"
check "authenticated cannot run the backfill" "1" "$(as $NEW new@x.com pwd "$NOW" "select public.backfill_verified_emails_v1();" | grep -c 'permission denied')"

echo "--- profile email binding is unchanged AND no longer authority"
check "unverified NEW cannot set profiles.email to ANOTHER address (42501)" "1" "$(as $NEW new@x.com pwd "$NOW" "update public.profiles set email='victim@x.com' where id='$NEW';" | grep -c 'bound to the authenticated identity')"
check "NEW may set profiles.email to its OWN JWT address" "new@x.com" "$(as $NEW new@x.com pwd "$NOW" "update public.profiles set email='new@x.com' where id='$NEW' returning email;" | tail -1)"
su "update public.profiles set email='leg@x.com' where id='$ATK';" >/dev/null   # (service path / signup trigger can write; duplicates then exist)
check "duplicate profile email (attacker copy) does NOT hijack resolution: verified owner still resolves" "$LEG" "$(q "select public.profile_id_by_verified_email_v1('leg@x.com');")"
su "update public.profiles set email='atk@x.com' where id='$ATK';" >/dev/null

echo "--- progressive proof (request -> mailed one-time session -> confirm)"
RQ() { as "$1" "$2" pwd "$NOW" "select public.request_email_verification_v1() ->> 'outcome';" | tail -1; }
CF() { as "$1" "$2" "$3" "$4" "select public.confirm_my_email_v1() ->> 'outcome';" | tail -1; }
check "confirm with NO request -> no_request" "no_request" "$(CF $NEW2 new2@x.com otp "$NOW")"
check "request records the pending proof" "requested" "$(RQ $NEW2 new2@x.com)"
check "password session cannot confirm -> no_proof" "no_proof" "$(CF $NEW2 new2@x.com pwd "$NOW")"
check "oauth session cannot confirm -> no_proof" "no_proof" "$(CF $NEW2 new2@x.com oauth "$NOW")"
check "no amr at all -> no_proof" "no_proof" "$(CF $NEW2 new2@x.com none "$NOW")"
check "otp proof OLDER than the request -> no_proof" "no_proof" "$(CF $NEW2 new2@x.com otp "(select floor(extract(epoch from requested_at))::bigint - 30 from public.email_verification_requests_v1 where profile_id='$NEW2')")"
check "JWT email differing from the live address -> email_changed" "email_changed" "$(CF $NEW2 other@x.com otp "$NOW")"
check "still UNVERIFIED before a real proof" "f" "$(q "select public.email_is_verified_v1('$NEW2','new2@x.com');")"
check "fresh one-time session after the request -> verified" "verified" "$(CF $NEW2 new2@x.com otp "$NOW")"
check "now VERIFIED (mailbox_proof row)" "mailbox_proof" "$(q "select method from public.email_verifications_v1 where profile_id='$NEW2';")"
check "second confirm is a no-op" "already_verified" "$(CF $NEW2 new2@x.com otp "$NOW")"
check "audit row written (method only, no address)" "1" "$(q "select count(*) from public.audit_logs where actor_id='$NEW2' and action='email_verified' and payload ? 'method' and not payload ? 'email';")"
reset_resources
check "PROVEN NEW2 may now claim the invitation addressed to new2@x.com (by id v2)" "accepted" "$(ACCEPT_V2 $NEW2 new2@x.com pwd 50000000-0000-4000-8000-000000000002)"
check "PROVEN NEW2 company roster claim ALLOWED" "linked" "$(ACC_CO $NEW2 new2@x.com pwd)"
check "PROVEN NEW2 sees own listing" "1" "$(LIST_N $NEW2 new2@x.com pwd)"
echo "--- laundering: prove address A, then switch the account to victim V"
RQ $ATK atk@x.com >/dev/null
su "update auth.users set email='victim2@x.com' where id='$ATK';" >/dev/null     # autoconfirm applies an email change at once
check "proof for A does not transfer to V (live address changed) -> email_changed" "email_changed" "$(CF $ATK victim2@x.com otp "$NOW")"
RQ_V=$(as $ATK victim2@x.com pwd "$NOW" "select public.request_email_verification_v1() ->> 'outcome';" | tail -1)
check "re-request for V" "requested" "$RQ_V"
check "the OLD otp session (older than the V request) cannot verify V -> no_proof" "no_proof" "$(CF $ATK victim2@x.com otp "(select floor(extract(epoch from requested_at))::bigint - 60 from public.email_verification_requests_v1 where profile_id='$ATK')")"
check "ATK is still unverified for V" "f" "$(q "select public.email_is_verified_v1('$ATK','victim2@x.com');")"
check "verification is bound to the ADDRESS: a verified user who changes email loses it" "f" "$(su "update auth.users set email='leg-new@x.com' where id='$LEG';" >/dev/null; q "select public.email_is_verified_v1('$LEG','leg-new@x.com');")"
su "update auth.users set email='leg@x.com' where id='$LEG';" >/dev/null

echo "=============================================================="; echo " STEP 3 -- migration re-apply is idempotent"; echo "=============================================================="
MD5A=$(q "select md5(string_agg(proname||prosrc, '|' order by proname)) from pg_proc where pronamespace='public'::regnamespace and proname in ('assign_training_v1','membership_invite_v1','lmc_admin_grant_v1','session_email_verified_v1','accept_invitation_by_id_v2');")
run_file "$MIG"
MD5B=$(q "select md5(string_agg(proname||prosrc, '|' order by proname)) from pg_proc where pronamespace='public'::regnamespace and proname in ('assign_training_v1','membership_invite_v1','lmc_admin_grant_v1','session_email_verified_v1','accept_invitation_by_id_v2');")
check "re-apply leaves the patched functions byte-identical" "$MD5A" "$MD5B"
check "re-apply: verified-owner claim still ALLOWED" "linked" "$(reset_resources; ACC_CO $LEG leg@x.com pwd)"
check "re-apply: unverified claim still DENIED" "email_unverified" "$(ACC_CO $NEW new@x.com pwd)"

echo "=============================================================="; echo " STEP 4 -- ROLLBACK verbatim, then re-apply"; echo "=============================================================="
run_file "$DOWN"
check "rollback: verified surface functions gone" "0" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('session_email_verified_v1','confirm_my_email_v1','email_is_verified_v1','profile_id_by_verified_email_v1');")"
check "rollback: mailbox_proof evidence preserved (table kept)" "1" "$(q "select count(*) from public.email_verifications_v1 where method='mailbox_proof';")"
check "rollback: original claim behaviour restored (defect reproduced)" "linked" "$(reset_resources; ACC_CO $NEW new@x.com pwd)"
check "rollback: policies restored (unverified reads own-email row again)" "1" "$(RLS_CO $NEW new@x.com pwd)"
run_file "$MIG"
check "re-apply after rollback: unverified DENIED again" "email_unverified" "$(reset_resources; ACC_CO $NEW new@x.com pwd)"
check "re-apply after rollback: kept mailbox_proof evidence still counts" "t" "$(q "select public.email_is_verified_v1('$NEW2','new2@x.com');")"

rm -f "$ERR"
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
