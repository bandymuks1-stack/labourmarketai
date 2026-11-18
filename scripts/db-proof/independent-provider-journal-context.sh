#!/usr/bin/env bash
# ============================================================================
# INDEPENDENT PROVIDER -> CLIENT PROJECT JOURNAL, SUBMIT, CLIENT ACCEPT — REAL
# PostgreSQL proof (no Docker, no Supabase).
#
# An independent person (freelancer / sole trader: personal engagement context,
# organization NULL, or their OWN workspace) with an ACTIVE PERSON assignment on a
# CLIENT organisation's project must be able to journal against it (migration
# 20261003150700_brigade_journal_context_v1), submit the entry, and the client
# representative (registered counterparty) must be able to accept it through the
# #2143 resolver. The two #2143 migrations (150500 + 150550) are read from
# origin/fix/cc/evid2-self-confirmation-v1 at run time (they are NOT in this
# branch and are never edited here).
#
# Usage (Windows git-bash):
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58734 bash scripts/db-proof/independent-provider-journal-context.sh
# Never point this at production or at a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
LFD="$(mktemp -d)"
for f in "$M"/*.sql; do tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
tr -d '\r' < "$REPO/supabase/rollbacks/20261003150700_brigade_journal_context_v1.down.sql" > "$LFD/rollback2.down.sql"
EVID_REF="${EVID_REF:-origin/fix/cc/evid2-self-confirmation-v1}"
for n in 20261003150500_journal_counterparty_review_authority_v1 20261003150550_counterparty_link_assignment_kinds_review_doors_v1; do
  git -C "$REPO" show "$EVID_REF:supabase/migrations/$n.sql" 2>/dev/null | tr -d '\r' > "$LFD/evid_$n.sql"
  [ -s "$LFD/evid_$n.sql" ] || { echo "cannot read $n from $EVID_REF"; exit 2; }
done
M="$LFD"
MIG1="$M/20261003150600_brigade_work_assignment_v1.sql"
MIG2="$M/20261003150700_brigade_journal_context_v1.sql"
RB2="$M/rollback2.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-58734}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-tasks-stage-subtask.prelude.sql" \
         "$HERE/team-assignment-canonical.prelude2.sql" \
         "$M/20260817150000_work_objects_v1.sql" \
         "$M/20260711210000_work_tasks_v1.sql" \
         "$M/20260718140000_project_operations_stages.sql" \
         "$M/20260817151000_work_tasks_v2_collaboration.sql" \
         "$M/20260819190000_journal_task_evidence_link_v1.sql" \
         "$M/20261002141500_work_task_authz_null_safe_v1.sql" \
         "$M/20261002150000_work_tasks_stage_and_subtask_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_base_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_base_err_$$; exit 1; }
done
for s in team-assignment-canonical.seed.sql team-assignment-journal-context.seed.sql independent-provider-journal-context.seed.sql; do
  $PSQL -v ON_ERROR_STOP=1 -f "$HERE/$s" >/dev/null 2>/tmp/_seed_err_$$ || { echo "seed FAILED: $s"; cat /tmp/_seed_err_$$; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -f "$MIG1" >/dev/null 2>&1 || { echo "MIGRATION 1 FAILED"; exit 1; }
# Live production bodies of the replaced functions, then the 10-arg overload + the production ACL.
$PSQL -v ON_ERROR_STOP=1 -f "$RB2" >/dev/null 2>/tmp/_rb_err_$$ || { echo "BASELINE (live bodies) FAILED"; cat /tmp/_rb_err_$$; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -c "grant execute on all functions in schema public to authenticated;" >/dev/null
# relationship / confirmation prerequisites of #2143 (production shapes)
$PSQL -v ON_ERROR_STOP=1 -c "
create table if not exists public.audit_logs_dummy(x int);
alter table public.journal_entry_confirmations add column if not exists decision text;
create table if not exists public.relationship_types (slug text primary key, journal_reviewable boolean not null default false, grants_worker_visibility boolean not null default false);
create schema if not exists storage;
create table if not exists storage.objects (name text, bucket_id text);
create table if not exists storage.buckets (id text primary key);
" >/dev/null || { echo "prereq stubs FAILED"; exit 1; }
for n in 20261003150500_journal_counterparty_review_authority_v1 20261003150550_counterparty_link_assignment_kinds_review_doors_v1; do
  $PSQL -v ON_ERROR_STOP=1 -f "$M/evid_$n.sql" >/dev/null 2>/tmp/_evid_err_$$ || { echo "EVID MIGRATION FAILED: $n"; head -5 /tmp/_evid_err_$$; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -c "
drop trigger if exists journal_entry_confirmations_guard_t on public.journal_entry_confirmations;
create trigger journal_entry_confirmations_guard_t before insert on public.journal_entry_confirmations
  for each row execute function public.journal_entry_confirmations_guard();
grant insert on public.journal_entry_confirmations to authenticated;" >/dev/null || { echo "guard trigger FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$MIG2" >/dev/null 2>/tmp/_mig_err_$$ || { echo "PROOF 1 FAILED — migration 2 did not apply:"; cat /tmp/_mig_err_$$; exit 1; }
$PSQL -c "grant execute on all functions in schema public to authenticated;" >/dev/null

CLR=c1000000-0000-0000-0000-000000000001   # client representative (manager/owner of Client Org)
OTR=c1000000-0000-0000-0000-000000000007   # representative of ANOTHER client organisation
IND1=c1000000-0000-0000-0000-000000000002  # independent, ACTIVE person assignment on the client project
IND2=c1000000-0000-0000-0000-000000000003  # independent, NO assignment
IND3=c1000000-0000-0000-0000-000000000004  # independent, ENDED assignment
IND4=c1000000-0000-0000-0000-000000000005  # sole trader: personal context + OWN workspace, active assignment
EMP=c1000000-0000-0000-0000-000000000006   # employee of the client (employer flow)
W1=c2000000-0000-0000-0000-000000000002; W2=c2000000-0000-0000-0000-000000000003
W3=c2000000-0000-0000-0000-000000000004; W4=c2000000-0000-0000-0000-000000000005
WEMP=c2000000-0000-0000-0000-000000000006
PC=c9000000-0000-0000-0000-0000000000c1    # Client Hall (Client Org)
PO=c9000000-0000-0000-0000-0000000000c2    # Other Client Yard
CL=c0000000-0000-0000-0000-0000000000c1
WS=c0000000-0000-0000-0000-0000000000d1
U1=11111111-1111-1111-1111-111111111111; WU1=aaaa1111-0000-0000-0000-000000000001
MA=33333333-3333-3333-3333-333333333333
P1=99999999-0000-0000-0000-000000000001; TA=7ea00000-0000-0000-0000-00000000000a
ctx() { $PSQL -c "select id from public.engagement_contexts where profile_id='$1' and ${2} limit 1;" | head -1; }
C1=$(ctx $IND1 "organization_id is null"); C2=$(ctx $IND2 "organization_id is null"); C3=$(ctx $IND3 "organization_id is null")
CEMPP=$(ctx $EMP "organization_id is null")
C4P=$(ctx $IND4 "organization_id is null"); C4W=$(ctx $IND4 "organization_id='$WS'"); CEMP=$(ctx $EMP "organization_id='$CL'")
CU1T=$(ctx $U1 "organization_id='$TA'")

pass=0; fail=0
as() { local who="$1"; shift
  local pre="set role authenticated; set request.jwt.claim.sub='$who';"
  [ "$who" = "anon" ] && pre="set role anon;"
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
mk() { local pj="null::uuid"; [ "$4" != "null" ] && pj="'$4'::uuid"; as "$1" "select public.create_journal_entry_full('$2','$3','freeform',null,'text','lt','h','h$RANDOM','closed','[]'::jsonb,$pj,$5);"; }
projof() { q "select coalesce(project_id::text,'none') from public.journal_entries where id='$1';"; }

echo; echo "== PROOF A — the independent person with a PERSON assignment journals on the client's project"
R=$(mk $IND1 $W1 $C1 $PC true); E1=$(printf '%s' "$R" | head -1)
check "explicit: entry created on the client project" "$PC" "$(projof $E1)"
check "AUTHOR is the person" "$W1" "$(q "select worker_id from public.journal_entries where id='$E1';")"
check "entry organisation is the personal context (NULL) - differs from the client" "t" "$(q "select ec.organization_id is null from public.journal_entries je join public.engagement_contexts ec on ec.id=je.engagement_context_id where je.id='$E1';")"
R=$(mk $IND1 $W1 $C1 null false); E1a=$(printf '%s' "$R" | head -1)
check "auto-link: the one assigned client project is attributed" "$PC" "$(projof $E1a)"
R=$(mk $IND4 $W4 $C4W $PC true); E4=$(printf '%s' "$R" | head -1)
check "sole trader, OWN workspace context: explicit works" "$PC" "$(projof $E4)"
R=$(mk $IND4 $W4 $C4P $PC true); E4p=$(printf '%s' "$R" | head -1)
check "sole trader, personal context: explicit works" "$PC" "$(projof $E4p)"
check "NO fan-out: project_worker_assignments rows unchanged (4 seeded)" "4" "$(q "select count(*) from public.project_worker_assignments where project_id='$PC';")"

echo; echo "== PROOF B — who still cannot"
has "independent WITHOUT assignment cannot" 'project_not_assignable' "$(mk $IND2 $W2 $C2 $PC true)"
has "independent with ENDED assignment cannot" 'project_not_assignable' "$(mk $IND3 $W3 $C3 $PC true)"
has "assigned person cannot write into ANOTHER client's project" 'project_not_assignable' "$(mk $IND1 $W1 $C1 $PO true)"
has "another independent cannot use IND1's worker id" 'project_not_assignable|row-level security' "$(mk $IND2 $W1 $C2 $PC true)"
has "using someone ELSE's engagement context is refused" 'project_not_assignable' "$(mk $IND1 $W1 $C2 $PC true)"
has "wrong-org manager cannot" 'project_not_assignable|row-level security' "$(mk $OTR $W1 $C1 $PC true)"
has "client rep cannot write the provider's entry" 'project_not_assignable|row-level security' "$(mk $CLR $W1 $C1 $PC true)"
has "NULL uid denied" 'project_not_assignable|row-level security' "$(mk '' $W1 $C1 $PC true)"
has "anon denied" 'permission denied' "$(mk anon $W1 $C1 $PC true)"
check "independent_journal_context_v1: anon denied" "1" "$(as anon "select public.independent_journal_context_v1('$W1','$PC','$C1');" | grep -c 'permission denied')"
check "independent_journal_context_v1: a peer cannot probe IND1" "f" "$(as $IND2 "select public.independent_journal_context_v1('$W1','$PC','$C1');")"

echo; echo "== PROOF C — employer flow and team flow unchanged"
R=$(mk $EMP $WEMP $CEMP $PC true); EE=$(printf '%s' "$R" | head -1)
check "employee of the client, org-scoped context: explicit works exactly as before" "$PC" "$(projof $EE)"
has "employee of the client may NOT use a personal (NULL-org) context on the client's project" 'project_not_assignable' "$(mk $EMP $WEMP "$CEMPP" $PC true)"
as $MA "select public.assign_team_to_work_v1('$TA','$P1');" >/dev/null
R=$(mk $U1 $WU1 $CU1T $P1 true); ET=$(printf '%s' "$R" | head -1)
check "team member (team-org context): explicit works exactly as before" "$P1" "$(projof $ET)"

echo; echo "== PROOF D — SUBMIT -> client review (the #2143 resolver, unchanged)"
check "not yet submitted: the client rep has NO authority" "" "$(q "select public.journal_entry_review_authority_v1('$E1','$CLR');")"
R=$(as $CLR "select public.register_work_counterparty_link_v1('$PC','$W1','client');")
check "client rep registers the counterparty from the PERSON assignment" "registered" "$R"
check "registration for an unassigned independent is refused" "no_work_relationship" "$(as $CLR "select public.register_work_counterparty_link_v1('$PC','$W2','client');")"
check "other client's rep cannot register on the client project" "not_authorized" "$(as $OTR "select public.register_work_counterparty_link_v1('$PC','$W1','client');")"
check "the independent submits the entry for review" "submitted" "$(as $IND1 "select public.submit_journal_entry_for_review_v1('$E1');")"
check "resolver: basis = counterparty for the client rep" "counterparty" "$(q "select public.journal_entry_review_authority_v1('$E1','$CLR') ->> 'basis';")"
check "resolver: another client's rep has NO authority" "" "$(q "select public.journal_entry_review_authority_v1('$E1','$OTR');")"
check "resolver: the provider cannot accept their own work" "" "$(q "select public.journal_entry_review_authority_v1('$E1','$IND1');")"
check "the client rep ACCEPTS" "approved" "$(as $CLR "select public.review_journal_entry('$E1','approved',null);")"
check "the acceptance is a CLIENT acceptance (not a manager confirmation)" "client_accept|counterparty" "$(q "select confirmation_scope ->> 'action' || '|' || (confirmation_scope #>> '{authority,basis}') from public.journal_entry_confirmations where entry_id='$E1';")"
check "accepted entry still authored by the provider" "$W1" "$(q "select worker_id from public.journal_entries where id='$E1';")"
has "another client's rep cannot accept" 'not_authorized|review_authority_not_established|no_reviewer|entry_not_org_scoped' "$(as $OTR "select public.review_journal_entry('$E1','approved',null);")"
check "an unsubmitted entry of the same provider is NOT reviewable" "" "$(q "select public.journal_entry_review_authority_v1('$E1a','$CLR');")"
check "sole trader: client rep registers, then the sole trader submits (own-workspace ctx entry)" "registered|submitted" "$(as $CLR "select public.register_work_counterparty_link_v1('$PC','$W4','client');")|$(as $IND4 "select public.submit_journal_entry_for_review_v1('$E4');")"

echo; echo "== PROOF E — evidence link + rollback"
su "insert into public.work_tasks (id, project_id, title, created_by, assignee_profile_id, status) values ('7a5c0000-0000-0000-0000-0000000000c1','$PC','Client task','$CLR','$IND1','todo');" >/dev/null
check "independent, assignee of a client task, links the entry to it" "ok" "$(as $IND1 "select public.link_journal_entry_to_task_v1('$E1a','7a5c0000-0000-0000-0000-0000000000c1');")"
check "an unassigned independent cannot (no oracle)" "not_found" "$(as $IND2 "select public.link_journal_entry_to_task_v1('$E1a','7a5c0000-0000-0000-0000-0000000000c1');")"
echo; echo "== PROOF F — own-WORKSPACE entry of a sole trader as task evidence (the picker case)"
su "insert into public.work_tasks (id, project_id, title, created_by, assignee_profile_id, status) values
  ('7a5c0000-0000-0000-0000-0000000000c2','$PC','Sole trader task','$CLR','$IND4','todo'),
  ('7a5c0000-0000-0000-0000-0000000000c3','$PO','Task on a project IND4 is NOT assigned to','$OTR','$IND4','todo');" >/dev/null
KC2=7a5c0000-0000-0000-0000-0000000000c2; KC3=7a5c0000-0000-0000-0000-0000000000c3
check "own-workspace entry WITH the client project, task assignee: linkable" "ok" "$(as $IND4 "select public.link_journal_entry_to_task_v1('$E4','$KC2');")"
R=$(mk $IND4 $W4 $C4W null true); E4n=$(printf '%s' "$R" | head -1)
check "own-workspace entry with NO project is stored without project" "none" "$(projof $E4n)"
check "own-workspace entry WITHOUT a project, active person assignment + task assignee: linkable" "ok" "$(as $IND4 "select public.link_journal_entry_to_task_v1('$E4n','$KC2');")"
check "same own-workspace entry on a task of a project the sole trader is NOT assigned to: refused" "project_mismatch" "$(as $IND4 "select public.link_journal_entry_to_task_v1('$E4n','$KC3');")"
check "own-workspace entry, task on the client project but the viewer is not the task assignee: refused (no oracle)" "not_found" "$(as $IND1 "select public.link_journal_entry_to_task_v1('$E4n','$KC2');")"
check "an unassigned independent cannot link an own-workspace-style entry" "not_found" "$(as $IND2 "select public.link_journal_entry_to_task_v1('$E4n','$KC2');")"
su "update public.project_worker_assignments set status='ended', ended_at=now() where worker_id='$W4' and project_id='$PC';" >/dev/null
R=$(mk $IND4 $W4 $C4W null true); E4m=$(printf '%s' "$R" | head -1)
check "after the person assignment ENDED, a new own-workspace entry (explicit project) is refused" "project_not_assignable" "$(mk $IND4 $W4 $C4W $PC true | grep -o project_not_assignable | head -1)"
check "after it ended, linking a project-less own-workspace entry is refused" "project_mismatch" "$(as $IND4 "select public.link_journal_entry_to_task_v1('$E4m','$KC2');")"
su "update public.project_worker_assignments set status='active', ended_at=null where worker_id='$W4' and project_id='$PC';" >/dev/null

out="$($PSQL -v ON_ERROR_STOP=1 -f "$RB2" 2>&1 | tr -d '\r')"; rc=$?
check "rollback 2 succeeds" "0" "$rc"
check "the new function is gone" "0" "$(q "select count(*) from pg_proc where proname='independent_journal_context_v1';")"
has "after rollback the independent person is refused again (employer-only behaviour restored)" 'project_not_assignable' "$(mk $IND1 $W1 $C1 $PC true)"
check "past entries untouched by the rollback" "$PC" "$(projof $E1)"
if $PSQL -v ON_ERROR_STOP=1 -f "$MIG2" >/dev/null 2>&1; then echo "  PASS  forward migration re-applies after rollback (round trip)"; pass=$((pass+1)); else echo "  FAIL  re-apply after rollback"; fail=$((fail+1)); fi

echo; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
