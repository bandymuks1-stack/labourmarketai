#!/usr/bin/env bash
# ============================================================================
# staff_invitation_email_binding_v1 -- REAL PostgreSQL proof on a throwaway
# local PG16 (no Docker, no Supabase stack). Refuses non-local hosts.
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58733 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58733 bash scripts/db-proof/staff-invitation-email-binding-v1.sh
#
# Uses database `sieb` (dropped and rebuilt).
# BEFORE = the LIVE production bodies (the rollback file IS those bodies).
# AFTER  = the migration. Then: rollback, re-apply, and COMPOSITION with PR
# #2152 (verified-email boundary): its by-id functions + predicates are applied
# from an extract, in both orders.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261003151100_staff_invitation_email_binding_v1
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58733}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d sieb -tA -q"

$ADMINP -c "drop database if exists sieb" -c "create database sieb" >/dev/null 2>&1
for f in "$HERE/staff-invitation-email-binding-v1.prelude.sql" "$DOWN"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_sieb_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_sieb_err_$$; rm -f /tmp/_sieb_err_$$; exit 1; }
done
rm -f /tmp/_sieb_err_$$
# Grants as in production: authenticated only on the RPC doors; apply_v2 internal.
$PSQL -c "revoke all on all functions in schema public from public, anon, authenticated;
 grant execute on function public.accept_invitation_v1(text), public.accept_invitation_v2(text),
   public.accept_invitation_by_id_v2(uuid), public.decline_invitation_v1(text), public.decline_invitation_v2(text),
   public.get_invitation_preview_v1(text), public.get_invitation_preview_v2(text) to authenticated;
 grant usage on schema extensions to authenticated;" >/dev/null

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
# as <uid|none> <jwt-email|-|none> <sql>
as() { local uid="$1" email="$2"; shift 2
  local claims="{}"
  if [ "$uid" != none ]; then
    if [ "$email" = "-" ]; then claims="{\"sub\":\"$uid\"}"; else claims="{\"sub\":\"$uid\",\"email\":\"$email\"}"; fi
  fi
  printf '%s\n' "set role authenticated; set request.jwt.claims = '$claims'; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
anon() { printf '%s\n' "set role anon; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
outc() { echo "$1" | head -1 | sed -E 's/.*"outcome": ?"([a-z_]+)".*/\1/'; }

INV=a0000000-0000-0000-0000-000000000001   # the real invitee
STR=a0000000-0000-0000-0000-000000000002   # stranger holding a forwarded link
INVITER=a0000000-0000-0000-0000-000000000003
ORG=b0000000-0000-0000-0000-000000000001
PRJ=b0000000-0000-0000-0000-000000000002
REQ=b0000000-0000-0000-0000-000000000003
IEM=invitee@example.com; SEM=stranger@example.com

reset_state() {
  su "truncate public.invitation_acceptances, public.invitations, public.engagement_contexts, public.project_worker_assignments,
        public.demand_interest_signals, public.audit_logs, public.workers, public.profiles, public.organizations, public.projects,
        public.customer_requests cascade;
      insert into public.profiles (id, email, full_name) values ('$INV','$IEM','Real Invitee'),('$STR','$SEM','Stranger'),('$INVITER','boss@example.com','Boss');
      insert into public.organizations (id, display_name) values ('$ORG','Acme Build');
      insert into public.projects (id, title) values ('$PRJ','Site 1');
      insert into public.customer_requests (id, role_or_work_type, country, organization_id) values ('$REQ','Tiler','LT','$ORG');
      insert into public.workers (profile_id) values ('$INV'),('$STR');" >/dev/null
}
# mk <tag> <type> <invited_email|NULL> [status] [max_uses] [expires]
mk() { local tag="$1" typ="$2" em="$3" st="${4:-pending}" mx="${5:-1}" ex="${6:-now() + interval '7 days'}"
  local emv="null"; [ "$em" != NULL ] && emv="'$em'"
  su "insert into public.invitations (token_hash, invitation_type, status, invited_email, invited_name, personal_message, organization_id, project_id,
        target_request_id, inviter_profile_id, proposed_role, max_uses, expires_at)
      values (encode(extensions.digest('tok-$tag','sha256'),'hex'), '$typ', '$st', $emv, 'Secret Name', 'secret note',
        '$ORG', case when '$typ'='join_project' then '$PRJ'::uuid end, case when '$typ'='invite_to_demand' then '$REQ'::uuid end,
        '$INVITER', 'Tiler', $mx, $ex);" >/dev/null; }
inv_state() { q "select status||'/'||use_count||'/'||coalesce(accepted_by_profile_id::text,'-') from public.invitations where token_hash=encode(extensions.digest('tok-$1','sha256'),'hex');"; }
side() { q "select (select count(*) from public.engagement_contexts)||'/'||(select count(*) from public.project_worker_assignments)||'/'||(select count(*) from public.demand_interest_signals)||'/'||(select count(*) from public.invitation_acceptances)||'/'||(select count(*) from public.audit_logs);"; }
fnmd5() { q "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='$1';"; }
FNS="accept_invitation_apply_v2 accept_invitation_v1 decline_invitation_v1 decline_invitation_v2 get_invitation_preview_v1 get_invitation_preview_v2"
snap() { for f in $FNS accept_invitation_v2 accept_invitation_by_id_v2; do echo "$f=$(fnmd5 $f)"; done; }
sigs() { q "select string_agg(p.proname||'|'||pg_get_function_result(p.oid)||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'-')||'|'||coalesce(p.proacl::text,'-'), ';' order by p.proname) from pg_proc p where p.proname in ('accept_invitation_apply_v2','accept_invitation_v1','decline_invitation_v1','decline_invitation_v2','get_invitation_preview_v1','get_invitation_preview_v2');"; }

PHASE=BEFORE
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }

suite() {
  echo "--- the defect: stranger with a forwarded ADDRESSED link"
  reset_state; mk fwd join_as_employee "$IEM"
  R="$(as $STR $SEM "select public.accept_invitation_v2('tok-fwd');")"
  exp "stranger accept (v2) of an addressed join_as_employee link" "accepted" "email_mismatch" "$(outc "$R")"
  exp "invitation after the stranger's attempt" "accepted/1/$STR" "pending/0/-" "$(inv_state fwd)"
  exp "engagement/assignment/interest/ledger/audit rows after stranger" "1/0/0/1/1" "0/0/0/0/0" "$(side)"

  echo "--- EVERY staff-type door x stranger (v2 token, v1 token): refused, nothing created, invitation untouched"
  for typ in join_organization join_team join_as_employee collaborate_partner join_project invite_to_demand join_platform; do
    reset_state; mk "t_$typ" "$typ" "$IEM"
    R="$(as $STR $SEM "select public.accept_invitation_v2('tok-t_$typ');")"
    exp "v2 stranger / $typ" "$([ $typ = join_platform ] && echo accepted || echo accepted)" "email_mismatch" "$(outc "$R")"
    reset_state; mk "t_$typ" "$typ" "$IEM"
    R="$(as $STR $SEM "select public.accept_invitation_v1('tok-t_$typ');")"
    exp "v1 stranger / $typ" "accepted" "email_mismatch" "$(outc "$R")"
    exp "  $typ untouched + no rows (after v1)" "x" "pending/0/-|0/0/0/0/0" "$([ "$PHASE" = BEFORE ] && echo x || echo "$(inv_state t_$typ)|$(side)")"
    reset_state; mk "t_$typ" "$typ" "$IEM"
    R="$(as $INV $IEM "select public.accept_invitation_v2('tok-t_$typ');")"
    exp "v2 REAL invitee / $typ" "accepted" "accepted" "$(outc "$R")"
  done

  echo "--- matching e-mail (case + whitespace insensitive, both sides)"
  reset_state; mk m1 join_as_employee "$IEM"
  R="$(as $INV "  Invitee@EXAMPLE.com " "select public.accept_invitation_v2('tok-m1');")"
  exp "jwt ' Invitee@EXAMPLE.com ' vs stored invitee@example.com" "accepted" "accepted" "$(outc "$R")"
  exp "engagement created for the invitee" "1" "1" "$(q "select count(*) from public.engagement_contexts where profile_id='$INV' and relationship_slug='employee';")"
  reset_state; mk m2 join_organization "Invitee@Example.COM"
  R="$(as $INV "invitee@example.com" "select public.accept_invitation_v2('tok-m2');")"
  exp "stored mixed-case vs lower jwt" "accepted" "accepted" "$(outc "$R")"
  reset_state; mk m3 join_team " invitee@example.com "
  R="$(as $INV "invitee@example.com" "select public.accept_invitation_v1('tok-m3');")"
  exp "stored with surrounding spaces (v1)" "accepted" "accepted" "$(outc "$R")"

  echo "--- stranger first, then the real invitee still can (link NOT consumed)"
  reset_state; mk keep join_as_employee "$IEM"
  as $STR $SEM "select public.accept_invitation_v2('tok-keep');" >/dev/null
  R="$(as $INV $IEM "select public.accept_invitation_v2('tok-keep');")"
  exp "real invitee accepts after the stranger tried" "already_accepted" "accepted" "$(outc "$R")"
  echo "--- second login of the same stranger"
  reset_state; mk again join_as_employee "$IEM"
  R1="$(as $STR $SEM "select public.accept_invitation_v2('tok-again');")"
  R2="$(as $STR $SEM "select public.accept_invitation_v2('tok-again');")"
  exp "stranger, 1st try" "accepted" "email_mismatch" "$(outc "$R1")"
  exp "stranger, 2nd try (same session shape)" "already_accepted" "email_mismatch" "$(outc "$R2")"
  exp "stranger with NO email claim at all" "already_accepted" "email_mismatch" "$(outc "$(as $STR - "select public.accept_invitation_v2('tok-again');")")"

  echo "--- shareable / campaign link (no invited_email) keeps working for anyone"
  reset_state; mk share join_as_employee NULL pending 3
  exp "stranger accepts shareable (no email on invitation)" "accepted" "accepted" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-share');")")"
  exp "second person accepts the same shareable link" "accepted" "accepted" "$(outc "$(as $INV $IEM "select public.accept_invitation_v2('tok-share');")")"
  exp "shareable use_count" "pending/2/-" "pending/2/-" "$(inv_state share)"
  exp "shareable accepted by a session with NO email claim" "accepted" "accepted" "$(outc "$(as $STR - "select public.accept_invitation_v1('tok-share');")")"
  reset_state; mk blank join_as_employee ""
  exp "blank-string invited_email treated as no address" "accepted" "accepted" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-blank');")")"

  echo "--- dead tokens never gain life; stranger cannot stamp state"
  reset_state; mk exp join_as_employee "$IEM" pending 1 "now() - interval '1 day'"
  exp "stranger on EXPIRED addressed link" "expired" "email_mismatch" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-exp');")")"
  exp "  expired link left as it was (not stamped by the stranger)" "expired/0/-" "pending/0/-" "$(inv_state exp)"
  exp "real invitee on expired link" "expired" "expired" "$(outc "$(as $INV $IEM "select public.accept_invitation_v2('tok-exp');")")"
  for st in revoked declined accepted; do
    reset_state; mk "d_$st" join_as_employee "$IEM" "$st"
    exp "invitee on $st link" "$([ $st = accepted ] && echo already_accepted || echo $st)" "$([ $st = accepted ] && echo already_accepted || echo $st)" "$(outc "$(as $INV $IEM "select public.accept_invitation_v2('tok-d_$st');")")"
    exp "stranger on $st addressed link" "$([ $st = accepted ] && echo already_accepted || echo $st)" "email_mismatch" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-d_$st');")")"
  done
  exp "garbage token (v2)" "not_found" "not_found" "$(outc "$(as $INV $IEM "select public.accept_invitation_v2('nope');")")"
  exp "garbage token (v1)" "not_found" "not_found" "$(outc "$(as $INV $IEM "select public.accept_invitation_v1('nope');")")"
  exp "NULL token" "not_found" "not_found" "$(outc "$(as $INV $IEM "select public.accept_invitation_v2(null);")")"

  echo "--- no identity"
  reset_state; mk anon1 join_as_employee "$IEM"
  exp "authenticated role, no sub (uid NULL) -> Not authenticated" "1" "1" "$(as none - "select public.accept_invitation_v2('tok-anon1');" | grep -c 'Not authenticated')"
  exp "ANON role cannot execute accept_invitation_v2" "1" "1" "$(anon "select public.accept_invitation_v2('tok-anon1');" | grep -c 'permission denied')"
  exp "ANON role cannot execute the preview" "1" "1" "$(anon "select public.get_invitation_preview_v2('tok-anon1');" | grep -c 'permission denied')"
  exp "ANON role cannot execute decline" "1" "1" "$(anon "select public.decline_invitation_v2('tok-anon1');" | grep -c 'permission denied')"
  exp "authenticated cannot call apply_v2 directly (internal)" "1" "1" "$(as $STR $SEM "select public.accept_invitation_apply_v2((select id from public.invitations limit 1), '$STR');" | grep -c 'permission denied')"
  exp "uid NULL decline -> Not authenticated" "1" "1" "$(as none - "select public.decline_invitation_v2('tok-anon1');" | grep -c 'Not authenticated')"
  exp "invitation untouched by all of the above" "pending/0/-" "pending/0/-" "$(inv_state anon1)"

  echo "--- by-id door (already e-mail-bound) + apply_v2 re-check"
  reset_state; mk byid join_as_employee "$IEM"
  BID="$(q "select id from public.invitations limit 1;")"
  exp "by_id_v2 stranger" "not_found" "not_found" "$(outc "$(as $STR $SEM "select public.accept_invitation_by_id_v2('$BID');")")"
  exp "by_id_v2 real invitee" "accepted" "accepted" "$(outc "$(as $INV $IEM "select public.accept_invitation_by_id_v2('$BID');")")"

  echo "--- decline: a stranger must not be able to consume the link"
  reset_state; mk dec join_as_employee "$IEM"
  exp "stranger decline (v2)" "declined" "email_mismatch" "$(outc "$(as $STR $SEM "select public.decline_invitation_v2('tok-dec');")")"
  exp "  invitation after stranger decline" "declined/0/-" "pending/0/-" "$(inv_state dec)"
  reset_state; mk dec join_as_employee "$IEM"
  exp "stranger decline (v1, text result)" "declined" "email_mismatch" "$(as $STR $SEM "select public.decline_invitation_v1('tok-dec');" | head -1)"
  exp "  invitation after stranger decline (v1)" "declined/0/-" "pending/0/-" "$(inv_state dec)"
  exp "real invitee declines (v2)" "declined" "declined" "$(outc "$(as $INV $IEM "select public.decline_invitation_v2('tok-dec');")")"
  reset_state; mk dec2 join_as_employee NULL pending 5
  exp "stranger declines a SHAREABLE link (own answer only)" "declined" "declined" "$(outc "$(as $STR $SEM "select public.decline_invitation_v2('tok-dec2');")")"

  echo "--- previews: a stranger gets a masked hint, not the address / name / note"
  reset_state; mk pv join_as_employee "$IEM"
  P2="$(as $STR $SEM "select public.get_invitation_preview_v2('tok-pv');")"
  P1="$(as $STR $SEM "select public.get_invitation_preview_v1('tok-pv');")"
  exp "v2 stranger preview outcome" "ok" "email_mismatch" "$(outc "$P2")"
  exp "v1 stranger preview outcome" "ok" "email_mismatch" "$(outc "$P1")"
  exp "v2 stranger preview carries the masked hint" "0" "1" "$(echo "$P2" | grep -c 'i\*\*\*@example.com')"
  exp "v2 stranger preview does NOT contain the full address / name / note" "1" "0" "$(echo "$P2$P1" | grep -c 'invitee@example.com\|Secret Name\|secret note')"
  exp "v1 stranger preview carries the masked hint" "0" "1" "$(echo "$P1" | grep -c 'i\*\*\*@example.com')"
  exp "preview left the invitation untouched" "pending/0/-" "pending/0/-" "$(inv_state pv)"
  PI="$(as $INV $IEM "select public.get_invitation_preview_v2('tok-pv');")"
  exp "invitee preview outcome" "ok" "ok" "$(outc "$PI")"
  exp "invitee preview shows the full invitation" "1" "1" "$(echo "$PI" | grep -c 'Secret Name')"
  reset_state; mk pvs join_as_employee NULL pending 4
  exp "shareable preview for a stranger" "ok" "ok" "$(outc "$(as $STR $SEM "select public.get_invitation_preview_v2('tok-pvs');")")"
  exp "preview garbage token" "not_found" "not_found" "$(outc "$(as $STR $SEM "select public.get_invitation_preview_v2('x');")")"
  exp "mask helper (internal) matches the TS maskEmail" "c***@example.com|a***@b.co|" "c***@example.com|a***@b.co|" "$([ "$PHASE" = BEFORE ] && echo 'c***@example.com|a***@b.co|' || q "select public.invitation_mask_email_v1('  Client@Example.com ')||'|'||public.invitation_mask_email_v1('a@b.co')||'|'||coalesce(public.invitation_mask_email_v1('no-at'),'')||coalesce(public.invitation_mask_email_v1('@x.com'),'')||coalesce(public.invitation_mask_email_v1('a@'),'');")"
}

echo "=============================================================="; echo " STEP 1 -- pre-image (live bodies)"; echo "=============================================================="
SNAP_BEFORE="$(snap)"; SIG_BEFORE="$(sigs)"
check "pre-image has NO e-mail check" "0" "$(q "select count(*) from pg_proc where proname in ('accept_invitation_apply_v2','accept_invitation_v1') and prosrc like '%email_mismatch%';")"

echo ""; echo "=============================================================="; echo " STEP 2 -- BEFORE (live): the exposure"; echo "=============================================================="
PHASE=BEFORE; suite

echo ""; echo "=============================================================="; echo " STEP 3 -- apply the migration"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>/tmp/_sieb_mig_$$ || { echo "MIGRATION FAILED"; cat /tmp/_sieb_mig_$$; exit 1; }
rm -f /tmp/_sieb_mig_$$
check "migration applies cleanly" ok ok
check "signature/result/SECURITY DEFINER/search_path/ACL of all six unchanged" "$SIG_BEFORE" "$(sigs)"
check "accept_invitation_v2 + accept_invitation_by_id_v2 NOT redefined" "$(echo "$SNAP_BEFORE" | grep -E 'accept_invitation_v2|accept_invitation_by_id_v2')" "$(snap | grep -E 'accept_invitation_v2|accept_invitation_by_id_v2')"
check "helpers not executable by authenticated/anon" "0" "$(q "select count(*) from pg_proc p where p.proname in ('invitation_session_email_matches_v1','invitation_mask_email_v1') and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));")"
check "exactly one overload of every redefined function" "6" "$(q "select count(*) from (select proname from pg_proc where proname in ('accept_invitation_apply_v2','accept_invitation_v1','decline_invitation_v1','decline_invitation_v2','get_invitation_preview_v1','get_invitation_preview_v2') group by 1 having count(*)=1) x;")"

echo ""; echo "=============================================================="; echo " STEP 4 -- AFTER"; echo "=============================================================="
PHASE=AFTER; suite
SNAP_AFTER="$(snap)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; check "re-applying is idempotent (bodies identical)" "$SNAP_AFTER" "$(snap)"

echo ""; echo "=============================================================="; echo " STEP 5 -- COMPOSITION with PR #2152 (verified-email boundary)"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/staff-invitation-email-binding-v1.prelude2152.sql" >/dev/null 2>/tmp/_sieb_c_$$ || { echo "2152 EXTRACT FAILED"; cat /tmp/_sieb_c_$$; exit 1; }
rm -f /tmp/_sieb_c_$$
$PSQL -c "grant execute on function public.session_email_verified_v1() to authenticated; grant execute on function public.accept_invitation_by_id_v1(uuid) to authenticated;" >/dev/null
BYID_2152="$(fnmd5 accept_invitation_by_id_v2)/$(fnmd5 accept_invitation_by_id_v1)"
check "2152 by-id bodies carry the verified gate" "2" "$(q "select count(*) from pg_proc where proname like 'accept_invitation_by_id_v%' and prosrc like '%session_email_verified_v1%';")"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "re-applying MY migration after 2152 does not undo its by-id gate" "$BYID_2152" "$(fnmd5 accept_invitation_by_id_v2)/$(fnmd5 accept_invitation_by_id_v1)"
reset_state; mk c1 join_as_employee "$IEM"
check "unverified-but-MATCHING token holder is ALLOWED (token door)" "accepted" "$(outc "$(as $INV $IEM "select public.accept_invitation_v2('tok-c1');")")"
reset_state; mk c2 join_as_employee "$IEM"
check "unverified MISMATCHING token holder is DENIED" "email_mismatch" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-c2');")")"
reset_state; mk c3 join_as_employee "$IEM"; BID="$(q "select id from public.invitations limit 1;")"
check "2152 gate still holds on the by-id door for an unverified matching user" "email_unverified" "$(outc "$(as $INV $IEM "select public.accept_invitation_by_id_v2('$BID');")")"
check "  and that refusal did not consume the invitation" "pending/0/-" "$(inv_state c3)"
$PSQL -c "insert into auth.users (id,email,email_confirmed_at) values ('$INV','$IEM',now()); insert into public.email_verification_policy_v1 (singleton,cutover_at) values (true, now()) on conflict do nothing; insert into public.email_verifications_v1 (profile_id,email,method) values ('$INV','$IEM','mailbox_proof');" >/dev/null 2>&1
check "verified matching user passes BOTH gates on by-id" "accepted" "$(outc "$(as $INV $IEM "select public.accept_invitation_by_id_v2('$BID');")")"
reset_state; mk c4 join_as_employee "$IEM"; BID="$(q "select id from public.invitations limit 1;")"
check "verified STRANGER address still denied by the e-mail binding (token door)" "email_mismatch" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-c4');")")"
check "  and by the by-id door" "email_unverified" "$(outc "$(as $STR $SEM "select public.accept_invitation_by_id_v2('$BID');")")"

echo ""; echo "=============================================================="; echo " STEP 6 -- rollback restores the live pre-image"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 || { echo "ROLLBACK FAILED"; exit 1; }
for f in $FNS; do
  check "rollback restores $f body identically" "$(echo "$SNAP_BEFORE" | grep "^$f=")" "$f=$(fnmd5 $f)"
done
check "rollback drops both helpers" "0" "$(q "select count(*) from pg_proc where proname in ('invitation_session_email_matches_v1','invitation_mask_email_v1');")"
reset_state; mk rb join_as_employee "$IEM"
check "after rollback the defect is back (proves the rollback is real)" "accepted" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-rb');")")"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; reset_state; mk rb2 join_as_employee "$IEM"
check "forward migration re-applies after rollback and refuses again" "email_mismatch" "$(outc "$(as $STR $SEM "select public.accept_invitation_v2('tok-rb2');")")"

echo ""; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
