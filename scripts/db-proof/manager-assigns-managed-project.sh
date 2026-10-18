#!/usr/bin/env bash
# ============================================================================
# assign_worker_to_project — "a manager may staff a project they MANAGE from that
# project's own company roster" — REAL PostgreSQL proof (no Docker, no Supabase).
#
# Proves migration 20261002142000_manager_assigns_roster_worker_on_managed_project_v1
# and its rollback on a throwaway local PostgreSQL 16:
#   BEFORE  the pre-change body (installed from the rollback file) refuses a manager;
#   AFTER   a manager of THIS project's organization may assign an ACTIVE worker of
#           THIS project's company roster — and nothing else changed: other-org
#           managers, out-of-roster workers, inactive roster rows, NULL organization /
#           company, completed projects, the booking-engagement arm, owner/admin and
#           the agency-placement collaborator block all behave as before.
# Also: anon/PUBLIC have no EXECUTE, ACL identical before/after, rollback restores
# the pre-change body byte-identically, re-apply is idempotent, and NO operand of
# the authorization can be NULL (missing relationships deny).
#
# Setup (Windows git-bash; ports 54290-54389 are outside the excluded range):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/manager-assigns-managed-project.sh
#   (optional) LIVE_MD5=<md5(prosrc) of production assign_worker_to_project> asserts the base == live.
# Uses database `mgrassign` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261002142000_manager_assigns_roster_worker_on_managed_project_v1
MIG="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d mgrassign -tA -q"

$ADMINP -c "drop database if exists mgrassign" -c "create database mgrassign" >/dev/null 2>&1
for f in "$HERE/manager-assigns-managed-project.prelude.sql" "$HERE/manager-assigns-managed-project.prelude2.sql" \
         "$HERE/manager-assigns-managed-project.seed.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_mgr_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_mgr_err_$$; rm -f /tmp/_mgr_err_$$; exit 1; }
done
rm -f /tmp/_mgr_err_$$

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift; if [ "$who" = anon ]; then printf '%s\n' "set role anon; $*"; else printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*"; fi | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
md5f() { q "select md5(prosrc)||' '||length(prosrc) from pg_proc where proname='assign_worker_to_project' and pronamespace='public'::regnamespace;"; }
aclf() { q "select coalesce(proacl::text,'-')||' secdef='||prosecdef||' cfg='||coalesce(proconfig::text,'-') from pg_proc where proname='assign_worker_to_project' and pronamespace='public'::regnamespace;"; }

OWN=33333333-3333-3333-3333-333333333333; MGR=77777777-7777-7777-7777-777777777777; MGRB=66666666-6666-6666-6666-666666666666
ADM=55555555-5555-5555-5555-555555555555; NOBODY=ee000000-0000-0000-0000-00000000000e
W1=a1000000-0000-0000-0000-000000000001; W2=a2000000-0000-0000-0000-000000000002; W3=a3000000-0000-0000-0000-000000000003
W4=a4000000-0000-0000-0000-000000000004; W5=a5000000-0000-0000-0000-000000000005
PA1=99999999-0000-0000-0000-0000000000a1; PA2=99999999-0000-0000-0000-0000000000a2; PN=99999999-0000-0000-0000-0000000000a3
PCN=99999999-0000-0000-0000-0000000000a4; PB1=99999999-0000-0000-0000-0000000000b1

PHASE=BEFORE
reset_state() { su "truncate public.project_worker_assignments; delete from public.audit_logs; delete from public.agency_candidate_offers; delete from public.booking_requests; delete from public.engagement_contexts where relationship_slug='collaborator';" >/dev/null; }
# probe <label> <expect-BEFORE> <expect-AFTER> <who> <project> <worker-profile>
probe() { local label="$1" eb="$2" ea="$3" who="$4" p="$5" w="$6"; local want="$ea"; [ "$PHASE" = BEFORE ] && want="$eb"
  check "[$PHASE] $label" "$want" "$(as "$who" "select public.zz_try_assign('$p','$w');" | head -1)"; }
suite() {
  reset_state
  echo "--- the new capability"
  probe "manager of the project's org assigns an ACTIVE roster worker of the project's company" 42501 ok $MGR $PA1 $W1
  echo "--- everything that must NOT widen"
  probe "manager on a project of ANOTHER org (does not manage it)"            42501 42501 $MGR  $PB1 $W1
  probe "manager of org B on org A's project"                                 42501 42501 $MGRB $PA1 $W1
  probe "manager assigns a worker on ANOTHER company's roster"                42501 42501 $MGR  $PA1 $W2
  probe "manager assigns an INACTIVE roster row"                              42501 42501 $MGR  $PA1 $W3
  probe "manager assigns an engagement-only worker (no roster)"               42501 42501 $MGR  $PA1 $W4
  probe "manager assigns a booking-engagement worker (arm belongs to the company owner)" 42501 42501 $MGR $PA1 $W5
  probe "manager on a project with NO organization"                           42501 42501 $MGR  $PN  $W1
  probe "manager on a project with NO company (join finds no roster)"         42501 42501 $MGR  $PCN $W1
  probe "caller with no relationship to anything"                             42501 42501 $NOBODY $PA1 $W1
  probe "unknown project id"                                                  42501 42501 $MGR  99999999-0000-0000-0000-0000000000ff $W1
  probe "worker profile with no worker row"                                   P0002 P0002 $MGR  $PA1 ee000000-0000-0000-0000-0000000000ff
  probe "missing arguments"                                                   22023 22023 $MGR  $PA1 ''
  echo "--- unchanged paths"
  probe "owner assigns own roster worker"                                     ok ok $OWN $PA1 $W1
  probe "owner assigns a worker of ANOTHER company's roster"                  42501 42501 $OWN $PA1 $W2
  probe "owner via the booking-engagement arm (not on roster)"                ok ok $OWN $PA1 $W5
  probe "admin assigns anyone"                                                ok ok $ADM $PA1 $W2
  probe "owner on a completed project"                                        22023 22023 $OWN $PA2 $W1
  probe "admin on a completed project"                                        22023 22023 $ADM $PA2 $W1
  probe "manager on a completed project (authorized after the change, then refused as completed)" 42501 22023 $MGR $PA2 $W1
  probe "re-assign is idempotent (reactivates, same row)"                     ok ok $OWN $PA1 $W1
  check "[$PHASE] exactly one assignment row for W1/PA1 after the re-assign" "1" "$(q "select count(*) from public.project_worker_assignments where project_id='$PA1' and worker_id='aaaa0001-0000-0000-0000-000000000001';")"
  echo "--- agency-placement collaborator block (accepted offer for the client company)"
  su "insert into public.booking_requests (id,status) values ('bb000000-0000-0000-0000-000000000001','accepted');
      insert into public.agency_candidate_offers (worker_id,client_company_id,booking_id,status) values
        ('aaaa0005-0000-0000-0000-000000000005','c0c0c0c0-0000-0000-0000-00000000000a','bb000000-0000-0000-0000-000000000001','accepted');
      delete from public.engagement_contexts where profile_id='$W5' and relationship_slug='collaborator';" >/dev/null
  probe "admin assigns the accepted-offer worker" ok ok $ADM $PA1 $W5
  check "[$PHASE] a collaborator engagement context was opened (block runs for the admin path)" "1" "$(q "select count(*) from public.engagement_contexts where profile_id='$W5' and relationship_slug='collaborator' and status='active';")"
  check "[$PHASE] and audited" "1" "$(q "select count(*) from public.audit_logs where action='placement_collaboration_opened';")"
  # the manager path must run the SAME block: W1 on CA roster + accepted offer for W1
  su "insert into public.agency_candidate_offers (worker_id,client_company_id,booking_id,status) values
        ('aaaa0001-0000-0000-0000-000000000001','c0c0c0c0-0000-0000-0000-00000000000a','bb000000-0000-0000-0000-000000000001','accepted');
      delete from public.project_worker_assignments; delete from public.engagement_contexts where profile_id='$W1' and relationship_slug='collaborator';" >/dev/null
  probe "manager assigns a roster worker who also has an accepted placement offer" 42501 ok $MGR $PA1 $W1
  [ "$PHASE" = AFTER ] && check "[AFTER] the manager path ran the same collaborator block (1 context)" "1" "$(q "select count(*) from public.engagement_contexts where profile_id='$W1' and relationship_slug='collaborator' and status='active';")"
  su "delete from public.agency_candidate_offers where worker_id='aaaa0001-0000-0000-0000-000000000001';" >/dev/null
}

echo "=============================================================="; echo " STEP 1 — install the PRE-CHANGE body (rollback file)"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 || { echo "rollback file failed to apply"; exit 1; }
MD5_BASE="$(md5f)"; echo "    base md5/length: $MD5_BASE"
[ -n "${LIVE_MD5:-}" ] && check "base body == production md5(prosrc) (LIVE_MD5)" "$LIVE_MD5" "${MD5_BASE%% *}"
ACL_BASE="$(aclf)"; echo "    base ACL: $ACL_BASE"
check "pre-change ACL is {postgres, authenticated} only, SECURITY DEFINER, search_path=public" "{postgres=X/postgres,authenticated=X/postgres} secdef=true cfg={search_path=public}" "$ACL_BASE"
su "select pg_get_functiondef(oid) from pg_proc where proname='assign_worker_to_project'" > /tmp/_mgr_def_before_$$
echo ""; echo "=============================================================="; echo " STEP 2 — BEFORE"; echo "=============================================================="
PHASE=BEFORE; suite

echo ""; echo "=============================================================="; echo " STEP 3 — apply the migration"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "MIGRATION FAILED"; exit 1; }
check "migration applies cleanly" ok ok
check "ACL / SECURITY DEFINER / search_path identical to the pre-change state" "$ACL_BASE" "$(aclf)"
check "anon has no EXECUTE" "f" "$(q "select has_function_privilege('anon','public.assign_worker_to_project(text,text)','EXECUTE');")"
check "PUBLIC has no EXECUTE" "f" "$(q "select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a where p.oid='public.assign_worker_to_project(text,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE');")"
check "authenticated has EXECUTE" "t" "$(q "select has_function_privilege('authenticated','public.assign_worker_to_project(text,text)','EXECUTE');")"
check "anon call is refused (permission denied)" "1" "$(as anon "select public.assign_worker_to_project('$PA1','$W1');" | grep -c 'permission denied')"
check "no other function changed: still exactly one assign_worker_to_project, no new function" "1" "$(q "select count(*) from pg_proc where proname='assign_worker_to_project';")"
su "select pg_get_functiondef(oid) from pg_proc where proname='assign_worker_to_project'" > /tmp/_mgr_def_after_$$
echo "    exact SQL diff of the function (pre-change -> migration):"; diff /tmp/_mgr_def_before_$$ /tmp/_mgr_def_after_$$ | sed 's/^/    /'

echo ""; echo "=============================================================="; echo " STEP 4 — AFTER"; echo "=============================================================="
PHASE=AFTER; suite
MD5_FIXED="$(md5f)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "applying the migration a second time is idempotent (md5 unchanged)" "$MD5_FIXED" "$(md5f)"

echo ""; echo "=============================================================="; echo " STEP 5 — rollback"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 || { echo "ROLLBACK FAILED"; exit 1; }
check "rollback restores the pre-change body byte-identically (md5 + length)" "$MD5_BASE" "$(md5f)"
check "rollback ACL identical" "$ACL_BASE" "$(aclf)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "forward migration re-applies after rollback (same md5)" "$MD5_FIXED" "$(md5f)"

rm -f /tmp/_mgr_def_before_$$ /tmp/_mgr_def_after_$$
echo ""; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
