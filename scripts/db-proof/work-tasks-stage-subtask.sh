#!/usr/bin/env bash
# ============================================================================
# work_tasks STAGE + SUBTASK v1 — REAL PostgreSQL proof (no Docker, no Supabase).
#
# Proves migration 20261002150000_work_tasks_stage_and_subtask_v1 (and its
# rollback) on a THROWAWAY native PostgreSQL 16 cluster. The REAL prior
# migrations build the schema (work_objects, work_tasks v1, project_stages,
# work_tasks v2, journal evidence link); only what is external to this
# feature is stubbed in work-tasks-stage-subtask.prelude.sql (auth.uid(),
# roles, organizations/projects/workers/engagement_contexts/journal tables,
# helper predicates copied from production, has_org_demand_access,
# caller_manages_worker -> false, set_updated_at).
#
# Every probe runs under `set role authenticated|anon` with a real
# request.jwt.claim.sub, so RLS / EXECUTE grants genuinely decide.
#
# Usage (Windows git-bash; ports 54290-54389 are outside the Windows
# excluded range, 55432 is NOT):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/work-tasks-stage-subtask.sh
# Linux: PGPROOF_HOST=/tmp/pgproof PGPROOF_PORT=55432 (unix socket) works too.
#
# Never point this at production or at a shared local Supabase stack. It
# DROPs schema public.
# ============================================================================
set -uo pipefail
# psql on Windows takes the client encoding from the console code page; pin UTF-8 so
# multi-byte characters inside function bodies survive (they change md5/definitions).
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
MIGRATION="$M/20261002150000_work_tasks_stage_and_subtask_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20261002150000_work_tasks_stage_and_subtask_v1.down.sql"

# Windows checkouts may carry CRLF; production bodies are LF. Feed psql LF copies so
# md5/definition comparisons are about the SQL, not the checkout's line endings.
LFD="$(mktemp -d)"
for f in "$M"/*.sql; do tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
tr -d '\r' < "$ROLLBACK" > "$LFD/rollback.down.sql"
M="$LFD"; MIGRATION="$LFD/20261002150000_work_tasks_stage_and_subtask_v1.sql"; ROLLBACK="$LFD/rollback.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-tasks-stage-subtask.prelude.sql" \
         "$M/20260817150000_work_objects_v1.sql" \
         "$M/20260711210000_work_tasks_v1.sql" \
         "$M/20260718140000_project_operations_stages.sql" \
         "$M/20260817151000_work_tasks_v2_collaboration.sql" \
         "$M/20260819190000_journal_task_evidence_link_v1.sql" \
         "$M/20261002141500_work_task_authz_null_safe_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASELINE FAILED: $f"; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/work-tasks-stage-subtask.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }

# Pre-migration fingerprints of the three functions the PR replaces + their ACLs.
fp() { $PSQL -c "select p.oid::regprocedure::text||' '||md5(pg_get_functiondef(p.oid))||' '||coalesce(p.proacl::text,'-')
  from pg_proc p where p.pronamespace='public'::regnamespace
  and p.proname in ('create_work_task_v2','update_work_task_v2','link_journal_entry_to_task_v1') order by 1;"; }
FP_BEFORE="$(fp)"
defs() { $PSQL -c "select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('create_work_task_v2','update_work_task_v2','link_journal_entry_to_task_v1') order by p.oid::regprocedure::text;"; }
DEFS_BEFORE="$(defs)"

# IDs
M_=33333333-3333-3333-3333-333333333333   # manager / company owner of org A (projects P1,P2)
W1=11111111-1111-1111-1111-111111111111   # worker, actively assigned to P1, engaged in A (and B)
W2=22222222-2222-2222-2222-222222222222   # worker in A, assigned to nothing
OUT=44444444-4444-4444-4444-444444444444  # org B worker
MB=66666666-6666-6666-6666-666666666666   # manager of org B (other company)
ADM=55555555-5555-5555-5555-555555555555  # platform admin
P1=99999999-0000-0000-0000-000000000001
P2=99999999-0000-0000-0000-000000000002
PB=99999999-0000-0000-0000-00000000000b
S1=51111111-0000-0000-0000-000000000001; S2=51111111-0000-0000-0000-000000000002; S3=51111111-0000-0000-0000-000000000003
EC_W1=ecec1111-0000-0000-0000-000000000001; EC_W1B=ecec1111-0000-0000-0000-00000000000b
EC_OUT=ecec4444-0000-0000-0000-000000000004; EC_W1X=ecec1111-0000-0000-0000-00000000000c
E1=e1e1e1e1-0000-0000-0000-000000000001   # W1, ctx A, project P1
E2=e1e1e1e1-0000-0000-0000-000000000002   # W1, ctx A, NO project
E3=e1e1e1e1-0000-0000-0000-000000000003   # W1, ctx A, project P2
E4=e1e1e1e1-0000-0000-0000-000000000004   # W1, ctx B, project P1   (organization mismatch)
E5=e2e2e2e2-0000-0000-0000-000000000001   # W2, ctx A, NO project (W2 not assigned)
E6=e1e1e1e1-0000-0000-0000-000000000006   # W1, ctx A, NO project (for the unassigned P2 task)
TP1=7a5c0000-0000-0000-0000-000000000001  # task in P1 assignee W1 (legacy, created by old RPC)
TP2=7a5c0000-0000-0000-0000-000000000002  # task in P2 assignee W1

pass=0; fail=0
as() { # as <uuid|anon> <sql>
  local who="$1"; shift
  local pre="set role authenticated; set request.jwt.claim.sub='$who';"
  [ "$who" = "anon" ] && pre="set role anon;"
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'
}
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { # has <label> <needle-regex> <actual>
  if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
newtask() { as "$1" "select public.create_work_task_v2('$2','d','normal',null,'$3',null,null,'$4','$5');"; }

echo "=============================================================="
echo " LEGACY rows created through the ORIGINAL (pre-migration) RPCs"
echo "=============================================================="
L1=$(as $M_ "select public.create_work_task_v2('Legacy project task','d','normal',null,'$P1',null,'$W1');")
L2=$(as $W1 "select public.create_work_task_v2(p_title=>'Legacy personal task',p_description=>'d',p_priority=>'low',p_due_date=>null,p_project_id=>null,p_object_id=>null,p_assignee_profile_id=>null);")
has "old 7-arg positional create works pre-migration (uuid)" '^[0-9a-f-]{36}$' "$L1"
has "old named create works pre-migration (uuid)" '^[0-9a-f-]{36}$' "$L2"
check "legacy link written by ORIGINAL link RPC (E1 -> L1)" "ok" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E1','$L1');")"
su "insert into public.work_tasks(id,project_id,title,created_by,assignee_profile_id) values ('$TP1','$P1','Task P1 assigned','$M_','$W1'),('$TP2','$P2','Task P2 assigned','$M_','$W1');" >/dev/null

$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>/tmp/_mig_err_$$ || { echo "PROOF 1 FAILED — migration did not apply:"; cat /tmp/_mig_err_$$; exit 1; }
rm -f /tmp/_mig_err_$$
echo "PROOF 1 — migration applies cleanly on a real PostgreSQL 16 server: PASS"; pass=$((pass+1))
# second application = idempotent re-run
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  migration re-applies idempotently"; pass=$((pass+1)); else echo "  FAIL  migration is not re-runnable"; fail=$((fail+1)); fi

echo ""
echo "=============================================================="
echo " PROOF 2 — legacy rows + OLD argument lists still work"
echo "=============================================================="
check "legacy task has NULL stage/parent" "|" "$(q "select stage_id||'|'||parent_task_id from public.work_tasks where id='$L1';" | sed 's/^$/|/')"
check "legacy task still readable by assignee under RLS" "1" "$(as $W1 "select count(*) from public.work_tasks where id='$L1';")"
check "old 6-arg POSITIONAL update still works" "updated" "$(as $M_ "select public.update_work_task_v2('$L1','Legacy renamed','d2','high',null,null);")"
check "old NAMED update still works" "updated" "$(as $M_ "select public.update_work_task_v2(p_task_id=>'$L1',p_title=>'Legacy renamed 2',p_description=>'d',p_priority=>'normal',p_due_date=>null,p_object_id=>null);")"
check "assignee (non-manager) can still edit with OLD args" "updated" "$(as $W1 "select public.update_work_task_v2('$L1','Legacy by assignee','d','low',null,null);")"
has "old 7-arg positional create still works" '^[0-9a-f-]{36}$' "$(as $M_ "select public.create_work_task_v2('Old shape create','d','normal',null,'$P1',null,'$W1');")"
has "old NAMED create still works" '^[0-9a-f-]{36}$' "$(as $W1 "select public.create_work_task_v2(p_title=>'Old named create',p_description=>null,p_priority=>'normal',p_due_date=>null,p_project_id=>null,p_object_id=>null,p_assignee_profile_id=>null);")"
check "no ambiguous overloads: exactly 1 create_work_task_v2 and 1 update_work_task_v2" "1|1" "$(q "select (select count(*) from pg_proc where proname='create_work_task_v2')||'|'||(select count(*) from pg_proc where proname='update_work_task_v2');")"
check "legacy evidence link untouched (still live)" "1" "$(q "select count(*) from public.journal_entry_tasks where entry_id='$E1' and task_id='$L1' and unlinked_at is null;")"
check "relinking the legacy pair is idempotent" "already_linked" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E1','$L1');")"
as $M_ "select public.update_work_task_v2('$L1','Keep stage test','d','normal',null,null,'$S1',null);" >/dev/null
# L1 now has live evidence + stage S1 set above? -> it was NULL before, so that WAS a re-stage with evidence.
check "(sanity) setting a stage on a task WITH live evidence is refused" "evidence_linked" "$(as $M_ "select public.update_work_task_v2('$L1','Keep stage test','d','normal',null,null,'$S1',null);")"
UL=$(q "select id from public.journal_entry_tasks where entry_id='$E1' and task_id='$L1' and unlinked_at is null;")
as $W1 "select public.unlink_journal_entry_from_task_v1('$UL','proof');" >/dev/null
check "after unlinking, the stage can be set" "updated" "$(as $M_ "select public.update_work_task_v2('$L1','Keep stage test','d','normal',null,null,'$S1',null);")"
check "OLD-argument update does NOT clear an existing stage" "$S1" "$(as $M_ "select public.update_work_task_v2('$L1','Old args again','d','normal',null,null); select stage_id from public.work_tasks where id='$L1';" | tail -1)"
as $M_ "select public.update_work_task_v2('$L1','Old args again','d','normal',null,null,'',null);" >/dev/null
check "'' clears the stage explicitly" "" "$(q "select coalesce(stage_id::text,'') from public.work_tasks where id='$L1';")"

echo ""
echo "=============================================================="
echo " PROOF 3 — structure rules (RPC outcome words + trigger backstop)"
echo "=============================================================="
A=$(newtask $M_ 'Stage1 task A' $P1 $S1 '')
has "create with stage-in-project" '^[0-9a-f-]{36}$' "$A"
check "stage from ANOTHER project refused" "invalid_stage" "$(newtask $M_ 'Wrong stage task' $P1 $S3 '')"
check "stage on a personal (project-less) task refused" "invalid_stage" "$(newtask $W1 'Personal staged' '' $S1 '')"
Bk=$(newtask $M_ 'Subtask B of A' $P1 '' $A)
has "subtask create (parent only)" '^[0-9a-f-]{36}$' "$Bk"
check "subtask INHERITS parent's stage" "$S1" "$(q "select stage_id from public.work_tasks where id='$Bk';")"
check "child stage != parent stage refused" "invalid_stage" "$(newtask $M_ 'Child other stage' $P1 $S2 $A)"
check "child with explicit stage == parent stage accepted" "t" "$(as $M_ "select (public.create_work_task_v2('Child same stage','d','normal',null,'$P1',null,null,'$S1','$A'))~'^[0-9a-f-]{36}$';")"
TB=$(newtask $M_ 'Other project root' $P2 '' '')
check "parent in ANOTHER project refused" "invalid_parent" "$(newtask $M_ 'Cross project child' $P1 '' $TB)"
check "parent that does not exist refused" "invalid_parent" "$(newtask $M_ 'Ghost parent child' $P1 '' 'deadbeef-0000-0000-0000-000000000000')"
Cc=$(newtask $M_ 'Level three C' $P1 '' $Bk)
has "depth 3 allowed (A -> B -> C)" '^[0-9a-f-]{36}$' "$Cc"
check "depth 4 refused (child of C)" "depth_exceeded" "$(newtask $M_ 'Level four D' $P1 '' $Cc)"
check "self-parent refused (RPC)" "cycle" "$(as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,null,'$A');")"
check "cycle refused (A under its own grandchild C)" "cycle" "$(as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,null,'$Cc');")"
R2=$(newtask $M_ 'Second root' $P1 '' '')
R2c=$(newtask $M_ 'Second root child' $P1 '' $R2)
check "moving a 3-deep subtree under a depth-2 chain refused (subtree height counted)" "depth_exceeded" "$(as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,null,'$R2c');")"
check "moving a single leaf under a root is fine" "updated" "$(as $M_ "select public.update_work_task_v2('$R2c','Second root child','d','normal',null,null,null,'');")"
check "'' parent clears the parent" "" "$(q "select coalesce(parent_task_id::text,'') from public.work_tasks where id='$R2c';")"
check "assignee WITHOUT manage authority cannot restructure" "not_allowed" "$(as $W1 "select public.update_work_task_v2('$TP1','Task P1 assigned','d','normal',null,null,'$S1',null);")"
check "outsider cannot even see the task" "not_found" "$(as $OUT "select public.update_work_task_v2('$A','x y z','d','normal',null,null,null,null);")"
has "direct write: self-parent blocked by TRIGGER" 'work_task_self_parent' "$(su "update public.work_tasks set parent_task_id=id where id='$A';")"
has "direct write: stage of another project blocked by TRIGGER" 'work_task_stage_project_mismatch' "$(su "update public.work_tasks set stage_id='$S3' where id='$A';")"
has "direct write: cycle blocked by TRIGGER" 'work_task_parent_cycle' "$(su "update public.work_tasks set parent_task_id='$Cc' where id='$A';")"
has "direct write: depth cap blocked by TRIGGER" 'work_task_depth_exceeded' "$(su "insert into public.work_tasks(project_id,title,created_by,parent_task_id) values ('$P1','Direct level four','$M_','$Cc');")"
has "direct write: child stage mismatch blocked by TRIGGER" 'work_task_child_stage_mismatch' "$(su "insert into public.work_tasks(project_id,title,created_by,parent_task_id,stage_id) values ('$P1','Direct stage clash','$M_','$A','$S2');")"
has "direct write: parent in another project blocked by TRIGGER" 'work_task_parent_project_mismatch' "$(su "insert into public.work_tasks(project_id,title,created_by,parent_task_id) values ('$P1','Direct cross proj','$M_','$TB');")"
has "deleting a parent that still has children is refused (NO ACTION)" 'violates foreign key' "$(su "delete from public.work_tasks where id='$A';")"

echo ""
echo "=============================================================="
echo " PROOF 4 — re-staging cascades; refused while live evidence exists"
echo "=============================================================="
check "re-stage A (S1 -> S2) succeeds" "updated" "$(as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,'$S2',null);")"
check "cascade reached the child AND grandchild" "S2|S2" "$(q "select (select case when stage_id='$S2' then 'S2' else 'x' end from public.work_tasks where id='$Bk')||'|'||(select case when stage_id='$S2' then 'S2' else 'x' end from public.work_tasks where id='$Cc');")"
check "clearing the stage ('') cascades NULL to descendants" "0" "$( as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,'',null);" >/dev/null; q "select count(*) from public.work_tasks where id in ('$A','$Bk','$Cc') and stage_id is not null;")"
as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,'$S1',null);" >/dev/null
# entry for the grandchild: E1 (project P1). Task C is created by M with no assignee -> W1 cannot see it; link as manager.
check "manager links E1 to grandchild C (same project)" "ok" "$(as $M_ "select public.link_journal_entry_to_task_v1('$E1','$Cc');")"
check "re-staging ROOT A refused: live evidence on a DESCENDANT" "evidence_linked" "$(as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,'$S2',null);")"
check "nothing moved by the refusal" "S1|S1|S1" "$(q "select string_agg(case when stage_id='$S1' then 'S1' else 'x' end,'|' order by id) from public.work_tasks where id in ('$A','$Bk','$Cc');")"
check "ordinary edit (same stage) with evidence still allowed" "updated" "$(as $M_ "select public.update_work_task_v2('$Cc','Level three C renamed','d','normal',null,null);")"
has "TRIGGER refuses re-pointing project_id of a task with live evidence" 'work_task_has_live_evidence' "$(su "update public.work_tasks set project_id='$P2' where id='$Cc';")"
LK=$(q "select id from public.journal_entry_tasks where entry_id='$E1' and task_id='$Cc' and unlinked_at is null;")
as $M_ "select public.unlink_journal_entry_from_task_v1('$LK','restage');" >/dev/null
check "after unlinking the evidence, re-staging succeeds" "updated" "$(as $M_ "select public.update_work_task_v2('$A','Stage1 task A','d','normal',null,null,'$S2',null);")"

echo ""
echo "=============================================================="
echo " PROOF 5 — link_journal_entry_to_task_v1 attribution consistency"
echo "=============================================================="
check "entry in P1 -> task in P2: project_mismatch" "project_mismatch" "$(as $M_ "select public.link_journal_entry_to_task_v1('$E1','$TP2');")"
check "entry in P2 -> task in P1: project_mismatch" "project_mismatch" "$(as $M_ "select public.link_journal_entry_to_task_v1('$E3','$TP1');")"
check "entry in P1 but engaged in org B -> P1 task: organization_mismatch" "organization_mismatch" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E4','$TP1');")"
check "NULL-project entry -> task of an ACTIVELY assigned project: ok" "ok" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E2','$TP1');")"
check "same call again is idempotent" "already_linked" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E2','$TP1');")"
check "NULL-project entry -> task of a project the worker is NOT assigned to: project_mismatch" "project_mismatch" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E6','$TP2');")"
su "update public.project_worker_assignments set status='ended' where project_id='$P1' and worker_id='aaaa1111-0000-0000-0000-000000000001';" >/dev/null
check "assignment no longer ACTIVE -> NULL-project entry refused" "project_mismatch" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E6','$TP1');")"
su "update public.project_worker_assignments set status='active' where project_id='$P1' and worker_id='aaaa1111-0000-0000-0000-000000000001';" >/dev/null
check "personal task: NULL-project entry may link (nothing to compare)" "ok" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E6','$L2');")"
check "outsider cannot link their own entry to someone else's UNASSIGNED personal task (NULL-assignee three-valued logic)" "not_found" "$(as $OUT "select public.link_journal_entry_to_task_v1('e4e4e4e4-0000-0000-0000-000000000001','$L2');")"
check "outsider cannot link someone else's entry" "not_found" "$(as $OUT "select public.link_journal_entry_to_task_v1('$E2','$TP1');")"
check "unrelated worker W2 cannot see W1's entry" "not_found" "$(as $W2 "select public.link_journal_entry_to_task_v1('$E2','$TP1');")"
check "garbage ids -> invalid" "invalid" "$(as $W1 "select public.link_journal_entry_to_task_v1('','$TP1');")"
check "an audit row exists for the new link" "t" "$(q "select count(*)>=1 from public.audit_logs where action='journal_entry_task_linked' and entity_id='$E2';")"
# per-entry limit (20) on a project entry: 20 tasks in P1 assigned to W1
su "insert into public.work_tasks(project_id,title,created_by,assignee_profile_id) select '$P1','Limit task '||g,'$M_','$W1' from generate_series(1,21) g;" >/dev/null
# E3 is P2; use a fresh P1 entry for the limit run
su "insert into public.journal_entries(id,worker_id,engagement_context_id,original_text,hash_self,project_id) values ('e1e1e1e1-0000-0000-0000-0000000000a1','aaaa1111-0000-0000-0000-000000000001','$EC_W1','limit entry','h-limit','$P1');" >/dev/null
i=0; res=""
for t in $(q "select string_agg(id::text,' ') from public.work_tasks where title like 'Limit task %';"); do
  i=$((i+1)); res="$(as $W1 "select public.link_journal_entry_to_task_v1('e1e1e1e1-0000-0000-0000-0000000000a1','$t');")"
  [ $i -le 20 ] && [ "$res" != "ok" ] && echo "    unexpected $res at link $i"
done
check "21st live link on ONE entry -> limit_reached (v1 cap kept)" "limit_reached" "$res"
# per-task limit (200): 200 live links on a task
su "insert into public.journal_entries(id,worker_id,engagement_context_id,original_text,hash_self,project_id)
    select gen_random_uuid(),'aaaa1111-0000-0000-0000-000000000001','$EC_W1','bulk '||g,'h-bulk-'||g,'$P1' from generate_series(1,200) g;
    insert into public.journal_entry_tasks(entry_id,task_id,linked_by)
    select id,'$TP1','$W1' from public.journal_entries where original_text like 'bulk %';" >/dev/null
check "201st live link on ONE task -> limit_reached (v1 cap kept)" "limit_reached" "$(as $W1 "select public.link_journal_entry_to_task_v1('e1e1e1e1-0000-0000-0000-0000000000a1','$TP1');")"
su "delete from public.journal_entry_tasks where entry_id in (select id from public.journal_entries where original_text like 'bulk %'); delete from public.journal_entry_tasks where entry_id='e1e1e1e1-0000-0000-0000-0000000000a1';" >/dev/null

echo ""
echo "=============================================================="
echo " PROOF 6 — set_project_stage_responsible_v1 authority + org check"
echo "=============================================================="
check "manager sets an ACTIVE engagement of the project's org" "" "$(as $M_ "select public.set_project_stage_responsible_v1('$S1','$EC_W1');")"
check "…and it is stored" "$EC_W1" "$(q "select responsible_engagement_id from public.project_stages where id='$S1';")"
has "engagement of ANOTHER organization refused" 'does not belong to this project organization' "$(as $M_ "select public.set_project_stage_responsible_v1('$S1','$EC_OUT');")"
has "INACTIVE engagement of the right org refused" 'does not belong to this project organization' "$(as $M_ "select public.set_project_stage_responsible_v1('$S1','$EC_W1X');")"
has "assigned worker (not a manager) refused" 'not authorized to manage this project' "$(as $W1 "select public.set_project_stage_responsible_v1('$S1',null);")"
has "manager of ANOTHER org refused" 'not authorized to manage this project' "$(as $MB "select public.set_project_stage_responsible_v1('$S1','$EC_OUT');")"
has "unknown stage refused" 'stage not found' "$(as $M_ "select public.set_project_stage_responsible_v1('deadbeef-0000-0000-0000-000000000000',null);")"
has "anon refused (no EXECUTE)" 'permission denied' "$(as anon "select public.set_project_stage_responsible_v1('$S1',null);")"
check "NULL clears the responsible engagement" "" "$(as $M_ "select public.set_project_stage_responsible_v1('$S1',null);" >/dev/null; q "select coalesce(responsible_engagement_id::text,'') from public.project_stages where id='$S1';")"
check "platform admin may set it" "$EC_W1" "$(as $ADM "select public.set_project_stage_responsible_v1('$S1','$EC_W1');" >/dev/null; q "select responsible_engagement_id from public.project_stages where id='$S1';")"

echo ""
echo "=============================================================="
echo " PROOF 7 — grants: no anon/PUBLIC anywhere; internals closed"
echo "=============================================================="
acl() { # acl <regprocedure> <role|public> -> t/f
  if [ "$2" = "public" ]; then
    q "select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a where p.oid='$1'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE');"
  else
    q "select has_function_privilege('$2','$1'::regprocedure,'EXECUTE');"
  fi; }
for f in 'public.create_work_task_v2(text,text,text,text,text,text,text,text,text)' \
         'public.update_work_task_v2(text,text,text,text,text,text,text,text)' \
         'public.set_project_stage_responsible_v1(uuid,uuid)' \
         'public.link_journal_entry_to_task_v1(text,text)'; do
  check "$f: anon=f PUBLIC=f authenticated=t" "f|f|t" "$(acl "$f" anon)|$(acl "$f" public)|$(acl "$f" authenticated)"
done
for f in 'public.work_task_structure_check_v1(uuid,uuid,uuid,uuid,uuid)' 'public.work_tasks_structure_guard_v1()'; do
  check "$f: anon=f PUBLIC=f authenticated=f (internal)" "f|f|f" "$(acl "$f" anon)|$(acl "$f" public)|$(acl "$f" authenticated)"
done
has "anon cannot call create_work_task_v2" 'permission denied' "$(as anon "select public.create_work_task_v2('abc','d','normal',null,null,null,null,null,null);")"
has "authenticated cannot call the internal check helper" 'permission denied' "$(as $M_ "select public.work_task_structure_check_v1(null,null,null,null,null);")"
has "authenticated has no direct write on work_tasks" 'permission denied' "$(as $M_ "update public.work_tasks set stage_id=null where id='$A';")"
check "NO RLS policy was added/changed on work_tasks / project_stages" "project_stages_select|wt_select" "$(q "select string_agg(policyname,'|' order by policyname collate \"C\") from pg_policies where tablename in ('work_tasks','project_stages');")"

echo ""
echo "=============================================================="
echo " PROOF 9 — NULL-safe authorization survives on the NEW signatures"
echo "   (task with assignee_profile_id IS NULL; outsider must be REFUSED)"
echo "=============================================================="
NT1=7a5c0000-0000-0000-0000-0000000000a1; NT2=7a5c0000-0000-0000-0000-0000000000a2
su "insert into public.work_tasks(id,project_id,title,created_by,assignee_profile_id) values ('$NT1','$P1','Null assignee P1','$M_',null),('$NT2','$P2','Null assignee P2','$M_',null);" >/dev/null
check "setup: both tasks have NULL assignee" "2" "$(q "select count(*) from public.work_tasks where id in ('$NT1','$NT2') and assignee_profile_id is null;")"
check "org-B outsider: 8-arg update, no structure args -> not_found" "not_found" "$(as $OUT "select public.update_work_task_v2('$NT1','Hacked','d','normal',null,null);")"
check "org-B outsider: 8-arg update WITH stage -> not_found" "not_found" "$(as $OUT "select public.update_work_task_v2('$NT1','Hacked','d','normal',null,null,'$S1',null);")"
check "org-B outsider: 8-arg update WITH parent -> not_found" "not_found" "$(as $OUT "select public.update_work_task_v2('$NT1','Hacked','d','normal',null,null,null,'$NT2');")"
check "org-A worker (non-manager, not assignee) 8-arg update -> not_found" "not_found" "$(as $W2 "select public.update_work_task_v2('$NT1','Hacked','d','normal',null,null);")"
check "org-A worker (non-manager) 8-arg update WITH stage -> not_found" "not_found" "$(as $W2 "select public.update_work_task_v2('$NT1','Hacked','d','normal',null,null,'$S1',null);")"
check "assigned worker W1 is NOT the manager of P2: update -> not_found" "not_found" "$(as $W1 "select public.update_work_task_v2('$NT2','Hacked','d','normal',null,null);")"
check "titles unchanged by every refused attempt" "Null assignee P1|Null assignee P2" "$(q "select (select title from public.work_tasks where id='$NT1')||'|'||(select title from public.work_tasks where id='$NT2');")"
check "no stage/parent set by refused attempts" "0" "$(q "select count(*) from public.work_tasks where id in ('$NT1','$NT2') and (stage_id is not null or parent_task_id is not null);")"
check "link RPC: W1 (own entry, not manager/assignee/creator of NULL-assignee task) -> not_found" "not_found" "$(as $W1 "select public.link_journal_entry_to_task_v1('$E6','$NT2');")"
check "no evidence link was created for the NULL-assignee tasks" "0" "$(q "select count(*) from public.journal_entry_tasks where task_id in ('$NT1','$NT2');")"
check "CONTROL: project manager can still update the NULL-assignee task (8-arg)" "updated" "$(as $M_ "select public.update_work_task_v2('$NT1','Renamed by manager','d','normal',null,null);")"
check "CONTROL: project manager can set a stage on it" "updated" "$(as $M_ "select public.update_work_task_v2('$NT1','Renamed by manager','d','normal',null,null,'$S1',null);")"
check "CONTROL: platform admin can update it" "updated" "$(as $ADM "select public.update_work_task_v2('$NT1','Renamed by admin','d','normal',null,null);")"
check "8-arg update and link bodies both carry the coalesce guard" "2" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('update_work_task_v2','link_journal_entry_to_task_v1') and prosrc like '%not coalesce((%';")"
check "exactly ONE update_work_task_v2 exists (the 8-arg); the 6-arg is gone" "1|8" "$(q "select count(*)||'|'||max(pronargs) from pg_proc where proname='update_work_task_v2';")"

echo ""
echo "=============================================================="
echo " PROOF 8— rollback: refuses while rows use the columns, then restores byte-identically"
echo "=============================================================="
out="$($PSQL -f "$ROLLBACK" 2>&1 | tr -d '\r')"
has "rollback REFUSES while a task carries stage/parent" 'rollback refused' "$out"
check "…columns still present after the refusal" "2" "$(q "select count(*) from information_schema.columns where table_name='work_tasks' and column_name in ('stage_id','parent_task_id');")"
su "alter table public.work_tasks disable trigger trg_work_tasks_structure_guard; update public.work_tasks set parent_task_id=null, stage_id=null; alter table public.work_tasks enable trigger trg_work_tasks_structure_guard;" >/dev/null
out="$($PSQL -v ON_ERROR_STOP=1 -f "$ROLLBACK" 2>&1 | tr -d '\r')"; rc=$?
check "rollback succeeds with zero structured rows" "0" "$rc"
check "columns, trigger, helper, setter all gone" "0|0|0|0" "$(q "select (select count(*) from information_schema.columns where table_name='work_tasks' and column_name in ('stage_id','parent_task_id'))||'|'||(select count(*) from pg_trigger where tgname='trg_work_tasks_structure_guard')||'|'||(select count(*) from pg_proc where proname in ('work_task_structure_check_v1','work_tasks_structure_guard_v1','set_project_stage_responsible_v1'))||'|'||(select count(*) from pg_class where relname in ('wt_stage_idx','wt_parent_idx'));")"
FP_AFTER="$(fp)"
check "original function bodies + ACLs restored BYTE-IDENTICALLY (md5 of pg_get_functiondef + proacl)" "$FP_BEFORE" "$FP_AFTER"
[ "$FP_BEFORE" = "$FP_AFTER" ] || diff <(printf '%s' "$DEFS_BEFORE") <(printf '%s' "$(defs)") | head -40
check "pre-existing project_stages.responsible_engagement_id untouched" "1" "$(q "select count(*) from information_schema.columns where table_name='project_stages' and column_name='responsible_engagement_id';")"
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  forward migration re-applies after rollback (round trip)"; pass=$((pass+1)); else echo "  FAIL  re-apply after rollback"; fail=$((fail+1)); fi

echo ""
echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
