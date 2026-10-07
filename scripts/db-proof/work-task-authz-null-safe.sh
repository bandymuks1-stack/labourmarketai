#!/usr/bin/env bash
# ============================================================================
# NULL-safe (fail-closed) authorization in work-task / workflow / invitation
# RPCs — REAL PostgreSQL proof (no Docker, no Supabase), throwaway cluster.
#
# Proves migration 20261002141500_work_task_authz_null_safe_v1 and its rollback:
#   BEFORE  the eight LIVE bodies (installed from the rollback file, whose
#           md5(prosrc) is asserted EQUAL to production's) let an outsider
#           through when work_tasks.assignee_profile_id / journal_entry_tasks.
#           linked_by / organizations.owner_profile_id is NULL;
#   AFTER   the same calls are refused, while every authorized path
#           (creator, assignee, project manager, admin, org owner, delegated
#           invitation authority) behaves identically.
# Also: ACLs identical, the diff is guard lines only, rollback restores the live
# bodies byte-identically (md5), re-apply is idempotent.
#
# Setup (Windows git-bash; ports 54290-54389 are outside the excluded range):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/work-task-authz-null-safe.sh
# Uses database `authz` on that cluster (dropped and rebuilt). Refuses non-local hosts.
# Never point this at production or a shared Supabase stack.
# ============================================================================
set -uo pipefail
# psql on Windows picks the client encoding from the console code page; with output redirected it can
# fall back to a single-byte one and mangle the multi-byte characters inside function bodies (changing
# md5(prosrc)). Pin it.
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
MIG="$M/20261002141500_work_task_authz_null_safe_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261002141500_work_task_authz_null_safe_v1.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d authz -tA -q"
TMP="${TMPDIR:-/tmp}/authz_proof_$$"; mkdir -p "$TMP"

$ADMINP -c "drop database if exists authz" -c "create database authz" >/dev/null 2>&1
for f in "$HERE/work-task-authz-null-safe.prelude.sql" "$M/20260817150000_work_objects_v1.sql" \
  "$M/20260711210000_work_tasks_v1.sql" "$M/20260718140000_project_operations_stages.sql" \
  "$M/20260817151000_work_tasks_v2_collaboration.sql" "$M/20260819190000_journal_task_evidence_link_v1.sql" \
  "$HERE/work-task-authz-null-safe.prelude2.sql" "$M/20260817130000_workflow_engine_v1.sql" "$M/20260819210000_workflow_work_task_context_v1.sql" \
  "$M/20260820070000_workflow_work_task_definition_v1.sql" "$M/20260712200000_canonical_invitations_v1.sql" \
  "$M/20260817121000_invitation_org_authority_v1.sql" "$HERE/work-task-authz-null-safe.prelude3.sql" \
  "$HERE/work-task-authz-null-safe.seed.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$TMP/err" || { echo "BASELINE FAILED: $f"; cat "$TMP/err"; exit 1; }
done

# live fingerprints (md5(prosrc)) read from production by the owner (read-only)
declare -A LIVE=( [add_work_task_dependency_v1]=b4aa67a04b8021547599e0f31548d111 [create_invitation_v1]=96e5d497f5c5258455078b3aaf3b5d22
 [create_invitation_v2]=b31af3fbe4b52d951b04697a368141bb [link_journal_entry_to_task_v1]=fab5806eb9ac80f4f3e4d8f66109282a
 [set_work_task_status_v2]=45cd14e41b82f34f36f1f4bb0f9af48e [start_workflow_instance_v1]=d7ecdfa6bb50dfe7cbb355647dd4f5b9
 [unlink_journal_entry_from_task_v1]=d7dc3a6f7722e682bae873275084f3e9 [update_work_task_v2]=22dc98695dcb2fc0523bd9eac387173d )
FNS="add_work_task_dependency_v1 create_invitation_v1 create_invitation_v2 link_journal_entry_to_task_v1 set_work_task_status_v2 start_workflow_instance_v1 unlink_journal_entry_from_task_v1 update_work_task_v2"
INLIST="'$(echo $FNS | sed "s/ /','/g")'"
md5s() { $PSQL -c "select proname||' '||md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname in ($INLIST) order by 1;" | tr -d '\r'; }
acls() { $PSQL -c "select proname||' '||coalesce(proacl::text,'-')||' secdef='||prosecdef||' cfg='||coalesce(proconfig::text,'-') from pg_proc where pronamespace='public'::regnamespace and proname in ($INLIST) order by 1;" | tr -d '\r'; }
defs() { $PSQL -c "select pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace and proname in ($INLIST) order by oid::regprocedure::text;" | tr -d '\r'; }
EXPECT_LIVE="$(for f in $FNS; do echo "$f ${LIVE[$f]}"; done)"

pass=0; fail=0
# check <label> <expected> <actual>; an expected value of "UUID" means "a uuid"
check() {
  if [ "$2" = "UUID" ]; then
    if printf '%s' "$3" | grep -qE '^[0-9a-f-]{36}$'; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected a uuid, got [$3])"; fail=$((fail+1)); fi
  elif [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi
}
as() { local who="$1"; shift; printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }

M_=33333333-3333-3333-3333-333333333333; PM=77777777-7777-7777-7777-777777777777; ASG=11111111-1111-1111-1111-111111111111
CR=88888888-8888-8888-8888-888888888888; OUTA=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; OUT=44444444-4444-4444-4444-444444444444
ADM=55555555-5555-5555-5555-555555555555; DEL=dddddddd-dddd-dddd-dddd-dddddddddddd
P1=99999999-0000-0000-0000-000000000001; ORGA=a0a0a0a0-0000-0000-0000-00000000000a; ORGN=a0a0a0a0-0000-0000-0000-00000000000f
T() { echo "7a000000-0000-0000-0000-0000000000$1"; }
TN=$(T 01); TA=$(T 02); TP=$(T 03); TO=$(T 04); TO2=$(T 05); TC=$(T 06)
EA=e1e1e1e1-0000-0000-0000-00000000000a; EB=e1e1e1e1-0000-0000-0000-00000000000b; EC=e1e1e1e1-0000-0000-0000-00000000000c
ECR=e8e8e8e8-0000-0000-0000-000000000001; EO=e4e4e4e4-0000-0000-0000-000000000001
tok() { printf '%064d' "$1"; }

reset_state() {
  su "truncate public.work_tasks, public.invitations, public.audit_logs, public.workflow_instances cascade;
  insert into public.work_tasks (id, project_id, title, created_by, assignee_profile_id) values
   ('$TN','$P1','Unassigned project task','$M_',null),
   ('$TA','$P1','Assigned project task','$M_','$ASG'),
   ('$TP',null,'Personal task no assignee','$CR',null),
   ('$TO',null,'Outsider personal task','$OUT',null),
   ('$TO2',null,'Outsider personal task two','$OUT',null),
   ('$TC','$P1','Second unassigned project task','$M_',null),
   ('$(T 11)','$P1','WF creator task','$M_',null),
   ('$(T 12)','$P1','WF assignee task','$M_','$ASG'),
   ('$(T 13)','$P1','WF manager task','$M_',null),
   ('$(T 14)','$P1','WF admin task','$M_',null),
   ('$(T 15)','$P1','WF exploit task','$M_',null),
   ('$(T 16)','$P1','WF outsider-org task','$M_',null);" >/dev/null
}

PHASE=BEFORE
# probe <label> <expect-BEFORE> <expect-AFTER> <who> <sql>
probe() {
  local label="$1" eb="$2" ea="$3" who="$4"; shift 4
  local want="$ea"; [ "$PHASE" = BEFORE ] && want="$eb"
  check "[$PHASE] $label" "$want" "$(as "$who" "$*" | head -1)"
}
suite() {
  reset_state
  echo "--- update_work_task_v2 (6-arg)"
  probe "OUTSIDER edits an unassigned project task"           updated not_found $OUT  "select public.update_work_task_v2('$TN','Hijacked title','d','high',null,null);"
  [ "$PHASE" = AFTER ] && check "[AFTER] title was NOT changed by the refused outsider" "Unassigned project task" "$(q "select title from public.work_tasks where id='$TN';")"
  probe "creator edits"                                       updated updated   $M_   "select public.update_work_task_v2('$TN','Creator edit','d','low',null,null);"
  probe "assignee edits an assigned task"                     updated updated   $ASG  "select public.update_work_task_v2('$TA','Assignee edit','d','low',null,null);"
  probe "engagement-manager (project manager) edits"          updated updated   $PM   "select public.update_work_task_v2('$TN','PM edit','d','low',null,null);"
  probe "admin edits"                                         updated updated   $ADM  "select public.update_work_task_v2('$TN','Admin edit','d','low',null,null);"
  probe "creator edits own personal task"                     updated updated   $CR   "select public.update_work_task_v2('$TP','Personal edit','d','low',null,null);"
  probe "outsider edits someone's personal unassigned task"   updated not_found $OUT  "select public.update_work_task_v2('$TP','Hijack personal','d','low',null,null);"
  probe "org employee WITHOUT authority edits assigned task"  not_found not_found $OUTA "select public.update_work_task_v2('$TA','nope nope','d','low',null,null);"
  echo "--- set_work_task_status_v2"
  probe "OUTSIDER sets status on an unassigned project task"  updated not_found $OUT  "select public.set_work_task_status_v2('$TC','done');"
  [ "$PHASE" = AFTER ] && check "[AFTER] status was NOT changed by the refused outsider" "todo" "$(q "select status from public.work_tasks where id='$TC';")"
  probe "creator sets status"                                 updated updated   $M_   "select public.set_work_task_status_v2('$TN','in_progress');"
  probe "assignee sets status"                                updated updated   $ASG  "select public.set_work_task_status_v2('$TA','in_progress');"
  probe "engagement-manager sets status"                      updated updated   $PM   "select public.set_work_task_status_v2('$TN','blocked');"
  probe "admin sets status"                                   updated updated   $ADM  "select public.set_work_task_status_v2('$TN','in_progress');"
  probe "creator sets status on own personal task"            updated updated   $CR   "select public.set_work_task_status_v2('$TP','in_progress');"
  probe "outsider sets status on someone's personal task"     updated not_found $OUT  "select public.set_work_task_status_v2('$TP','cancelled');"
  echo "--- link_journal_entry_to_task_v1"
  probe "OUTSIDER links own entry to an unassigned project task" ok not_found $OUT "select public.link_journal_entry_to_task_v1('$EO','$TN');"
  probe "assignee links own entry to the assigned task"       ok ok             $ASG  "select public.link_journal_entry_to_task_v1('$EA','$TA');"
  probe "creator/manager links a team entry"                  ok ok             $M_   "select public.link_journal_entry_to_task_v1('$EB','$TN');"
  probe "engagement-manager links a team entry"               ok ok             $PM   "select public.link_journal_entry_to_task_v1('$EC','$TC');"
  probe "admin links a team entry"                            ok ok             $ADM  "select public.link_journal_entry_to_task_v1('$EA','$TN');"
  probe "creator links own entry to own personal task"        ok ok             $CR   "select public.link_journal_entry_to_task_v1('$ECR','$TP');"
  probe "re-link is idempotent"                               already_linked already_linked $ASG "select public.link_journal_entry_to_task_v1('$EA','$TA');"
  [ "$PHASE" = AFTER ] && check "[AFTER] no outsider link row exists" "0" "$(q "select count(*) from public.journal_entry_tasks where entry_id='$EO';")"
  echo "--- add_work_task_dependency_v1 (BLOCKER guard)"
  probe "OUTSIDER adds someone's unassigned task as blocker of their own" created not_found $OUT "select public.add_work_task_dependency_v1('$TN','$TO');"
  probe "creator adds own task as blocker of own task"        created created   $OUT  "select public.add_work_task_dependency_v1('$TO2','$TO');"
  probe "manager: blocked + blocker both project tasks"       created created   $M_   "select public.add_work_task_dependency_v1('$TN','$TA');"
  probe "engagement-manager: project tasks"                   created created   $PM   "select public.add_work_task_dependency_v1('$TC','$TA');"
  probe "admin"                                               created created   $ADM  "select public.add_work_task_dependency_v1('$TP','$TC');"
  [ "$PHASE" = AFTER ] && check "[AFTER] no outsider dependency row exists" "0" "$(q "select count(*) from public.task_dependencies where created_by='$OUT' and blocker_task_id='$TN';")"
  echo "--- unlink_journal_entry_from_task_v1 (linked_by NULL)"
  su "truncate public.journal_entry_tasks;
      insert into public.journal_entry_tasks (entry_id, task_id, linked_by) values
      ('$EA','$TC',null),('$EB','$TA','$ASG'),('$EC','$TN',null),('$ECR','$TP',null),('$EB','$TC',null);" >/dev/null
  lid() { q "select id from public.journal_entry_tasks where entry_id='$1' and task_id='$2' and unlinked_at is null;"; }
  probe "entry READER (not linker, no authority) unlinks a linked_by=NULL claim" ok not_allowed $ASG "select public.unlink_journal_entry_from_task_v1('$(lid $EA $TC)','x');"
  probe "the linker withdraws own claim"                      ok ok             $ASG  "select public.unlink_journal_entry_from_task_v1('$(lid $EB $TA)','x');"
  probe "engagement-manager withdraws"                        ok ok             $PM   "select public.unlink_journal_entry_from_task_v1('$(lid $EC $TN)','x');"
  probe "admin withdraws"                                     ok ok             $ADM  "select public.unlink_journal_entry_from_task_v1('$(lid $EB $TC)','x');"
  probe "personal-task creator withdraws (linked_by NULL)"    ok ok             $CR   "select public.unlink_journal_entry_from_task_v1('$(lid $ECR $TP)','x');"
  echo "--- start_workflow_instance_v1"
  D=de1de1de-0000-0000-0000-000000000001
  probe "org-A employee WITHOUT task authority starts a workflow on an unassigned task" UUID not_found $OUTA "select public.start_workflow_instance_v1('$D','Approval run',null,'$(T 15)');"
  probe "creator starts a workflow"                           UUID UUID         $M_   "select public.start_workflow_instance_v1('$D','Approval run',null,'$(T 11)');"
  probe "assignee (org member) starts a workflow"             UUID UUID         $ASG  "select public.start_workflow_instance_v1('$D','Approval run',null,'$(T 12)');"
  probe "engagement-manager starts a workflow"                UUID UUID         $PM   "select public.start_workflow_instance_v1('$D','Approval run',null,'$(T 13)');"
  probe "admin starts a workflow"                             UUID UUID         $ADM  "select public.start_workflow_instance_v1('$D','Approval run',null,'$(T 14)');"
  probe "org-B-only outsider (not in the definition's org)"   not_found not_found $OUT "select public.start_workflow_instance_v1('$D','Approval run',null,'$(T 16)');"
  echo "--- create_invitation_v1 / v2 (org branch; organizations.owner_profile_id NULL)"
  probe "v1 OUTSIDER invites into an org with NO owner" created not_authorized $OUT  "select (public.create_invitation_v1('$(tok 101)','join_organization','a@example.com','A','$ORGN'))->>'outcome';"
  probe "v1 org owner invites into own org" created created             $M_   "select (public.create_invitation_v1('$(tok 102)','join_organization','b@example.com','B','$ORGA'))->>'outcome';"
  probe "v1 delegated authority invites into the ownerless org" created created           $DEL  "select (public.create_invitation_v1('$(tok 103)','join_organization','c@example.com','C','$ORGN'))->>'outcome';"
  probe "v1 admin invites" created created             $ADM  "select (public.create_invitation_v1('$(tok 104)','join_organization','d@example.com','D','$ORGN'))->>'outcome';"
  probe "v1 org member WITHOUT authority (owner is set)"      not_authorized not_authorized $OUTA "select (public.create_invitation_v1('$(tok 105)','join_organization','e@example.com','E','$ORGA'))->>'outcome';"
  probe "v2 OUTSIDER invites into an org with NO owner" created not_authorized $OUT  "select (public.create_invitation_v2('$(tok 201)','join_organization','a2@example.com','A','$ORGN'))->>'outcome';"
  probe "v2 org owner invites into own org" created created             $M_   "select (public.create_invitation_v2('$(tok 202)','join_organization','b2@example.com','B','$ORGA'))->>'outcome';"
  probe "v2 delegated authority invites into the ownerless org" created created           $DEL  "select (public.create_invitation_v2('$(tok 203)','join_organization','c2@example.com','C','$ORGN'))->>'outcome';"
  probe "v2 admin invites" created created             $ADM  "select (public.create_invitation_v2('$(tok 204)','join_organization','d2@example.com','D','$ORGN'))->>'outcome';"
  probe "v2 org member WITHOUT authority (owner is set)"      not_authorized not_authorized $OUTA "select (public.create_invitation_v2('$(tok 205)','join_organization','e2@example.com','E','$ORGA'))->>'outcome';"
}

echo "=============================================================="
echo " STEP 1 — install the LIVE bodies (rollback file) and fingerprint them"
echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>"$TMP/err" || { echo "rollback file failed to apply"; cat "$TMP/err"; exit 1; }
check "installed bodies == production md5(prosrc), all 8 functions" "$EXPECT_LIVE" "$(md5s)"
ACL_LIVE="$(acls)"
echo "$ACL_LIVE" | sed 's/^/    /'
defs > "$TMP/defs_before"
POL_BEFORE="$(q "select count(*)||':'||md5(string_agg(policyname||tablename||coalesce(qual,'')||coalesce(with_check,''),',' order by tablename,policyname)) from pg_policies;")"

echo ""; echo "=============================================================="; echo " STEP 2 — BEFORE: exploit reproduction on the LIVE bodies + authorized paths"; echo "=============================================================="
PHASE=BEFORE; suite

echo ""; echo "=============================================================="; echo " STEP 3 — apply the migration"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>"$TMP/err" || { echo "MIGRATION FAILED"; cat "$TMP/err"; exit 1; }
check "migration applies cleanly" "ok" "ok"
check "ACLs / SECURITY DEFINER / search_path identical to the live state" "$ACL_LIVE" "$(acls)"
check "RLS policy set unchanged (count + md5 of all policies)" "$POL_BEFORE" "$(q "select count(*)||':'||md5(string_agg(policyname||tablename||coalesce(qual,'')||coalesce(with_check,''),',' order by tablename,policyname)) from pg_policies;")"
defs > "$TMP/defs_after"
CHG=$(diff "$TMP/defs_before" "$TMP/defs_after" | grep -c '^[<>]')
check "diff = guard lines only (8 guards x 2 lines out + 2 lines in = 32)" "32" "$CHG"
diff "$TMP/defs_before" "$TMP/defs_after" | sed 's/^/    /'

echo ""; echo "=============================================================="; echo " STEP 4 — AFTER: same probes, exploits refused, authorized paths unchanged"; echo "=============================================================="
PHASE=AFTER; suite
MD5_FIXED="$(md5s)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "applying the migration a second time is idempotent (md5 unchanged)" "$MD5_FIXED" "$(md5s)"

echo ""; echo "=============================================================="; echo " STEP 5 — rollback restores the live bodies byte-identically"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>"$TMP/err" || { echo "ROLLBACK FAILED"; cat "$TMP/err"; exit 1; }
check "after rollback md5(prosrc) == production for all 8" "$EXPECT_LIVE" "$(md5s)"
check "after rollback ACLs identical" "$ACL_LIVE" "$(acls)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "forward migration re-applies after rollback (same fixed md5s)" "$MD5_FIXED" "$(md5s)"

rm -rf "$TMP"
echo ""; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
