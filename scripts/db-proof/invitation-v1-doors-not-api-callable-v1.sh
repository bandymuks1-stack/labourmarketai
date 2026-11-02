#!/usr/bin/env bash
# ============================================================================
# invitation_v1_doors_not_api_callable_v1 -- REAL PostgreSQL proof on a
# throwaway local PG16 (no Docker, no Supabase stack). Refuses non-local hosts.
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58733 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58733 bash scripts/db-proof/invitation-v1-doors-not-api-callable-v1.sh
#
# Database `ivd` (dropped and rebuilt). Chain (the order production will see):
#   prelude (externals + LIVE accept_invitation_v2 / by_id_v2)
#   -> live v1 + apply_v2 bodies (the 151100 rollback file IS those bodies)
#   -> 20261003151000 extract (PR #2152: verified-email predicates + by-id gates)
#   -> 20261003151100 (PR #2155: e-mail binding)          = BEFORE
#   -> 20261003151500 (this migration)                     = AFTER
#   -> its rollback, then re-apply.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"; R="$REPO/supabase/rollbacks"
B1=20261003151100_staff_invitation_email_binding_v1
NAME=20261003151500_invitation_v1_doors_not_api_callable_v1
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58733}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d ivd -tA -q"

$ADMINP -c "drop database if exists ivd" -c "create database ivd" >/dev/null 2>&1
for f in "$HERE/staff-invitation-email-binding-v1.prelude.sql" "$R/$B1.down.sql" "$HERE/staff-invitation-email-binding-v1.prelude2152.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_ivd_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_ivd_err_$$; rm -f /tmp/_ivd_err_$$; exit 1; }
done
rm -f /tmp/_ivd_err_$$
# Production ACL before any of the three migrations: authenticated only.
$PSQL -c "revoke all on all functions in schema public from public, anon, authenticated;
 grant execute on function public.accept_invitation_v1(text), public.accept_invitation_v2(text),
   public.accept_invitation_by_id_v1(uuid), public.accept_invitation_by_id_v2(uuid),
   public.decline_invitation_v1(text), public.decline_invitation_v2(text),
   public.get_invitation_preview_v1(text), public.get_invitation_preview_v2(text) to authenticated;
 grant execute on function public.session_email_verified_v1() to authenticated;
 grant usage on schema extensions to authenticated;" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$M/$B1.sql" >/dev/null 2>/tmp/_ivd_m_$$ || { echo "151100 FAILED"; cat /tmp/_ivd_m_$$; exit 1; }
rm -f /tmp/_ivd_m_$$

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
as() { local uid="$1" email="$2"; shift 2
  local claims="{\"sub\":\"$uid\",\"email\":\"$email\"}"
  printf '%s\n' "set role authenticated; set request.jwt.claims = '$claims'; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
outc() { echo "$1" | head -1 | sed -E 's/.*"outcome": ?"([a-z_]+)".*/\1/'; }
denied() { echo "$1" | grep -c 'permission denied'; }

A=a0000000-0000-0000-0000-00000000000a; B=a0000000-0000-0000-0000-00000000000b; C=a0000000-0000-0000-0000-00000000000c
INVITER=a0000000-0000-0000-0000-000000000003; ORG=b0000000-0000-0000-0000-000000000001
AE=a@example.com; BE=b@example.com; CE=c@example.com

reset_state() {
  su "truncate public.invitation_acceptances, public.invitations, public.engagement_contexts, public.project_worker_assignments,
        public.demand_interest_signals, public.audit_logs, public.workers, public.profiles, public.organizations,
        public.email_verifications_v1, public.email_verification_requests_v1 cascade;
      insert into public.profiles (id, email, full_name) values ('$A','$AE','A'),('$B','$BE','B'),('$C','$CE','C'),('$INVITER','boss@example.com','Boss');
      insert into public.organizations (id, display_name) values ('$ORG','Acme Build');
      insert into public.workers (profile_id) values ('$A'),('$B'),('$C');
      insert into public.email_verifications_v1 (profile_id,email,method) values ('$A','$AE','mailbox_proof');
      insert into public.email_verification_policy_v1 (singleton,cutover_at) values (true, now()) on conflict do nothing;" >/dev/null
}
mk() { local tag="$1" em="$2" mx="$3"; local emv="null"; [ "$em" != NULL ] && emv="'$em'"
  su "insert into public.invitations (token_hash, invitation_type, status, invited_email, organization_id, inviter_profile_id, proposed_role, max_uses)
      values (encode(extensions.digest('tok-$tag','sha256'),'hex'), 'join_as_employee', 'pending', $emv, '$ORG', '$INVITER', 'Tiler', $mx);" >/dev/null; }
inv() { q "select status||'/'||use_count from public.invitations where token_hash=encode(extensions.digest('tok-$1','sha256'),'hex');"; }
ledger() { q "select count(*) from public.invitation_acceptances;"; }
fnmd5() { q "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='$1';"; }
canexec() { q "select has_function_privilege('$1', p.oid, 'execute') from pg_proc p where p.oid = '$2'::regprocedure;"; }

V1="accept_invitation_v1 accept_invitation_by_id_v1 decline_invitation_v1"
V2="accept_invitation_apply_v2 accept_invitation_v2 accept_invitation_by_id_v2 decline_invitation_v2 get_invitation_preview_v1 get_invitation_preview_v2"
snap() { for f in $V1 $V2; do echo "$f=$(fnmd5 $f)"; done; }
PHASE=BEFORE
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }

suite() {
  echo "--- the defect: one authenticated user exhausts a multi-use shareable link through v1"
  reset_state; mk camp NULL 3
  R1="$(as $A $AE "select public.accept_invitation_v1('tok-camp');")"
  exp "user A calls accept_invitation_v1 on a 3-seat shareable link" "accepted" "1" "$([ $PHASE = BEFORE ] && outc "$R1" || denied "$R1")"
  exp "link state after A's v1 call (BEFORE: closed after ONE use, ledger empty)" "accepted/0" "pending/0" "$(inv camp)"
  exp "user B then gets from v2" "exhausted" "accepted" "$(outc "$(as $B $BE "select public.accept_invitation_v2('tok-camp');")")"
  echo "--- decline: one caller kills the link for everybody"
  reset_state; mk camp2 NULL 3
  R1="$(as $A $AE "select public.decline_invitation_v1('tok-camp2');")"
  exp "user A calls decline_invitation_v1" "declined" "1" "$([ $PHASE = BEFORE ] && echo "$R1" | head -1 || denied "$R1")"
  exp "user B then gets from v2" "declined" "accepted" "$(outc "$(as $B $BE "select public.accept_invitation_v2('tok-camp2');")")"
  echo "--- by-id v1 bypasses the ledger (an addressed invitation accepted with no ledger row)"
  reset_state; mk addr "$AE" 1
  BID="$(q "select id from public.invitations limit 1;")"
  R1="$(as $A $AE "select public.accept_invitation_by_id_v1('$BID');")"
  exp "user A (verified, addressed) calls accept_invitation_by_id_v1" "accepted" "1" "$([ $PHASE = BEFORE ] && outc "$R1" || denied "$R1")"
  exp "ledger rows after the by-id v1 call (BEFORE: bypassed, 0)" "0" "0" "$(ledger)"
  echo "--- v2 unchanged: every real flow still works"
  reset_state; mk s1 NULL 3
  exp "A accepts the shareable link (v2)" "accepted" "accepted" "$(outc "$(as $A $AE "select public.accept_invitation_v2('tok-s1');")")"
  exp "B accepts the same link (v2)" "accepted" "accepted" "$(outc "$(as $B $BE "select public.accept_invitation_v2('tok-s1');")")"
  exp "C accepts: last seat closes it" "accepted" "accepted" "$(outc "$(as $C $CE "select public.accept_invitation_v2('tok-s1');")")"
  exp "link closed after 3 seats, ledger 3" "accepted/3|3" "accepted/3|3" "$(inv s1)|$(ledger)"
  exp "A again: idempotent already_accepted" "already_accepted" "already_accepted" "$(outc "$(as $A $AE "select public.accept_invitation_v2('tok-s1');")")"
  reset_state; mk s2 NULL 3
  exp "decline (v2) is the caller's OWN answer only; link stays open" "declined" "declined" "$(outc "$(as $A $AE "select public.decline_invitation_v2('tok-s2');")")"
  exp "B can still accept after A declined" "accepted" "accepted" "$(outc "$(as $B $BE "select public.accept_invitation_v2('tok-s2');")")"
  reset_state; mk t1 "$AE" 1
  exp "addressed token flow (v2): the invitee accepts" "accepted" "accepted" "$(outc "$(as $A $AE "select public.accept_invitation_v2('tok-t1');")")"
  reset_state; mk t2 "$AE" 1
  exp "addressed token flow (v2): a stranger is refused (151100)" "email_mismatch" "email_mismatch" "$(outc "$(as $B $BE "select public.accept_invitation_v2('tok-t2');")")"
  reset_state; mk bi "$AE" 1; BID="$(q "select id from public.invitations limit 1;")"
  exp "by-id v2 (verified invitee)" "accepted" "accepted" "$(outc "$(as $A $AE "select public.accept_invitation_by_id_v2('$BID');")")"
  exp "  ...and it wrote the ledger" "1" "1" "$(ledger)"
  reset_state; mk bi2 "$BE" 1; BID="$(q "select id from public.invitations limit 1;")"
  exp "by-id v2 for an UNVERIFIED invitee keeps the #2152 gate" "email_unverified" "email_unverified" "$(outc "$(as $B $BE "select public.accept_invitation_by_id_v2('$BID');")")"
  reset_state; mk dec "$AE" 1
  exp "decline (v2) by the invitee" "declined" "declined" "$(outc "$(as $A $AE "select public.decline_invitation_v2('tok-dec');")")"
  reset_state; mk pv "$AE" 1
  exp "preview v2 (invitee) ok" "ok" "ok" "$(outc "$(as $A $AE "select public.get_invitation_preview_v2('tok-pv');")")"
  exp "preview v1 (kept, read-only) ok" "ok" "ok" "$(outc "$(as $A $AE "select public.get_invitation_preview_v1('tok-pv');")")"
}

echo "=============================================================="; echo " STEP 1 -- BEFORE: after #2152 + #2155 (151000 extract + 151100)"; echo "=============================================================="
SNAP_BEFORE="$(snap)"
for f in accept_invitation_v1 accept_invitation_by_id_v1 decline_invitation_v1; do
  check "pre: authenticated may execute $f" "t" "$(q "select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname='$f';")"
done
PHASE=BEFORE; suite

echo ""; echo "=============================================================="; echo " STEP 2 -- apply 20261003151500"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$M/$NAME.sql" >/dev/null 2>/tmp/_ivd_m2_$$ || { echo "MIGRATION FAILED"; cat /tmp/_ivd_m2_$$; exit 1; }
rm -f /tmp/_ivd_m2_$$
check "migration applies cleanly" ok ok
check "NO function body changed (only the ACL moved)" "$SNAP_BEFORE" "$(snap)"
for f in accept_invitation_v1 accept_invitation_by_id_v1 decline_invitation_v1; do
  for r in authenticated anon; do
    check "$r cannot execute $f" "f" "$(q "select has_function_privilege('$r', p.oid, 'execute') from pg_proc p where p.proname='$f';")"
  done
  check "$f not granted to PUBLIC" "0" "$(q "select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.proname='$f' and a.grantee=0;")"
done
for f in accept_invitation_v2 accept_invitation_by_id_v2 decline_invitation_v2 get_invitation_preview_v1 get_invitation_preview_v2; do
  check "authenticated STILL executes $f" "t" "$(q "select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname='$f';")"
done
check "apply_v2 stays internal (not executable by authenticated)" "f" "$(q "select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname='accept_invitation_apply_v2';")"

echo ""; echo "=============================================================="; echo " STEP 3 -- AFTER"; echo "=============================================================="
PHASE=AFTER; suite
$PSQL -v ON_ERROR_STOP=1 -f "$M/$NAME.sql" >/dev/null 2>&1; check "re-applying is idempotent" "$SNAP_BEFORE" "$(snap)"

echo ""; echo "=============================================================="; echo " STEP 4 -- rollback restores the prior ACL"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$R/$NAME.down.sql" >/dev/null 2>&1 || { echo "ROLLBACK FAILED"; exit 1; }
for f in accept_invitation_v1 accept_invitation_by_id_v1 decline_invitation_v1; do
  check "rollback: authenticated may execute $f again" "t" "$(q "select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname='$f';")"
  check "rollback: anon still cannot execute $f" "f" "$(q "select has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname='$f';")"
done
check "rollback: bodies unchanged" "$SNAP_BEFORE" "$(snap)"
reset_state; mk rb NULL 3
check "after rollback the defect is back (proves the rollback is real)" "accepted/0" "$(as $A $AE "select public.accept_invitation_v1('tok-rb');" >/dev/null; inv rb)"
$PSQL -v ON_ERROR_STOP=1 -f "$M/$NAME.sql" >/dev/null 2>&1
reset_state; mk rb2 NULL 3
check "forward migration re-applies after rollback and denies again" "1" "$(denied "$(as $A $AE "select public.accept_invitation_v1('tok-rb2');")")"

echo ""; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
