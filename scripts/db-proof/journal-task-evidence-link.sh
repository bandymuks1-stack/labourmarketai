#!/usr/bin/env bash
# ============================================================================
# Work Journal <-> work_task EVIDENCE LINK v1 — REAL per-role RLS proof.
#
# Proves migration 20260819190000_journal_task_evidence_link_v1 (and its
# rollback) against a REAL PostgreSQL server, as several DISTINCT users plus
# anon. Every probe runs under `set role authenticated` (or `anon`) with a
# real `request.jwt.claim.sub`, never as the superuser, so RLS genuinely
# decides each result.
#
# The prelude is NOT an invented schema: the helper functions
# (owns_worker / is_admin / manages_organization / can_manage_project) and the
# journal_entries / work_tasks RLS predicates are copied VERBATIM from
# production via pg_get_functiondef and pg_policies, and the grants match
# production role_table_grants (authenticated: SELECT on engagement_contexts,
# photos and confirmations; NO grant at all on audit_logs).
#
# Usage — native cluster (works where container registries are unreachable):
#   /usr/lib/postgresql/16/bin/initdb -D /tmp/pgproof/data -U postgres --auth=trust
#   /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgproof/data \
#       -o '-p 55432 -k /tmp/pgproof' -l /tmp/pgproof/pg.log start
#   bash scripts/db-proof/journal-task-evidence-link.sh
#
# Usage — throwaway container (the other db-proof scripts' convention):
#   docker run -d --name jte-proof -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16
#   PGPROOF_HOST=127.0.0.1 bash scripts/db-proof/journal-task-evidence-link.sh
#
# Never point this at production or at a shared local Supabase stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260819190000_journal_task_evidence_link_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260819190000_journal_task_evidence_link_v1.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-/tmp/pgproof}
PGPROOF_PORT=${PGPROOF_PORT:-55432}
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/journal-task-evidence-link.prelude.sql" >/dev/null || { echo "prelude FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null || { echo "MIGRATION FAILED TO APPLY"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/journal-task-evidence-link.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
$PSQL -c "create table hash_before_persist as select id,hash_prev,hash_self,original_text,created_at,updated_at,deleted_at,superseded_by from public.journal_entries;" >/dev/null
echo "PROOF 1 — the migration applies cleanly to a real PostgreSQL server: PASS"
echo ""

W1=11111111-1111-1111-1111-111111111111   # worker one  (org A, task assignee)
W2=22222222-2222-2222-2222-222222222222   # worker two  (org A)
MGR=33333333-3333-3333-3333-333333333333  # manager     (org A)
OUT=44444444-4444-4444-4444-444444444444  # OUTSIDER    (org B)
E1=e1e1e1e1-0000-0000-0000-000000000001   # worker one's entry (photo+confirmation)
E2=e2e2e2e2-0000-0000-0000-000000000001   # worker two's entry
E4=e4e4e4e4-0000-0000-0000-000000000001   # outsider's entry
T1=7a5c0000-0000-0000-0000-000000000001   # project task (org A)
T2=7a5c0000-0000-0000-0000-000000000002   # outsider's personal task

pass=0; fail=0
# as <profile-uuid|anon> <sql>  → prints result
as() {
  local who="$1"; shift
  if [ "$who" = "anon" ]; then
    $PSQL -c "set role anon; $*" 2>&1 | tr -d '\r'
  else
    $PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub','$who',false); $*" 2>&1 | tail -n +2 | tr -d '\r'
  fi
}
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi
}

# denied <who> <sql> -> "denied" | "LEAKED"
# NOTE: written as capture-then-grep on purpose. Under `set -o pipefail` a
# `psql | grep -q` pipeline reports psql's non-zero exit even when grep
# matched, which would silently invert every expected-denial probe.
denied() {
  local out
  out="$(as "$1" "$2")"
  if printf '%s' "$out" | grep -qiE 'permission denied'; then echo denied; else echo LEAKED; fi
}

echo "=============================================================="
echo " PROOF 2 — RLS + grants: two workers, a manager, an outsider, anon"
echo "=============================================================="
check "anon cannot read journal_entry_tasks" "denied" "$(denied anon 'select count(*) from public.journal_entry_tasks;')"
check "anon cannot execute the link RPC" "denied" "$(denied anon "select public.link_journal_entry_to_task_v1('$E1','$T1');")"
check "authenticated has NO direct INSERT on the link table" "denied" "$(denied "$W1" "insert into public.journal_entry_tasks(entry_id,task_id) values ('$E1','$T1');")"
check "authenticated has NO direct UPDATE on the link table" "denied" "$(denied "$W1" "update public.journal_entry_tasks set unlinked_at=now();")"
check "authenticated has NO direct DELETE on the link table" "denied" "$(denied "$W1" "delete from public.journal_entry_tasks;")"

echo ""
echo "=============================================================="
echo " PROOF 3 — an EXISTING journal entry links to a task"
echo "=============================================================="
check "worker one links own existing entry to the assigned task" \
  "ok" "$(as "$W1" "select public.link_journal_entry_to_task_v1('$E1','$T1');")"
check "the link row exists and is live" \
  "1" "$(as "$W1" "select count(*) from public.journal_entry_tasks where entry_id='$E1' and task_id='$T1' and unlinked_at is null;")"
check "re-linking is idempotent, not an error" \
  "already_linked" "$(as "$W1" "select public.link_journal_entry_to_task_v1('$E1','$T1');")"
check "still exactly ONE live link (no duplicate)" \
  "1" "$(as "$W1" "select count(*) from public.journal_entry_tasks where entry_id='$E1' and task_id='$T1' and unlinked_at is null;")"
# audit_logs has NO grant to authenticated in production (verified) — the
# definer function writes it; only a privileged reader can see it.
check "linking wrote an audit row (read as superuser)" \
  "1" "$($PSQL -c "select count(*) from public.audit_logs where action='journal_entry_task_linked' and entity_id='$E1';")"
check "authenticated genuinely CANNOT read audit_logs (matches prod grants)" "denied" "$(denied "$W1" "select count(*) from public.audit_logs;")"
check "worker one links a SECOND entry to the same task" \
  "ok" "$(as "$W1" "select public.link_journal_entry_to_task_v1('e1e1e1e1-0000-0000-0000-000000000002','$T1');")"

echo ""
echo "=============================================================="
echo " PROOF 4 — the task surfaces its evidence + photo, NOT duplicated"
echo "=============================================================="
check "task shows 2 pieces of evidence" \
  "2" "$(as "$W1" "select count(*) from public.journal_entry_tasks where task_id='$T1' and unlinked_at is null;")"
check "evidence carries its photo through the JOIN (1 photo on entry 1)" \
  "1" "$(as "$W1" "select count(*) from public.journal_entry_photos p join public.journal_entry_tasks jet on jet.entry_id=p.entry_id where jet.task_id='$T1' and jet.unlinked_at is null;")"
check "evidence carries its manager confirmation" \
  "1" "$(as "$W1" "select count(*) from public.journal_entry_confirmations c join public.journal_entry_tasks jet on jet.entry_id=c.entry_id where jet.task_id='$T1' and jet.unlinked_at is null;")"
check "NO evidence text was copied — journal_entry_tasks stores no text" \
  "0" "$(as "$W1" "select count(*) from information_schema.columns where table_name='journal_entry_tasks' and (column_name like '%text%' or column_name like '%photo%' or column_name like '%body%');")"
check "journal entry count UNCHANGED by linking (no duplication)" \
  "4" "$($PSQL -c 'select count(*) from public.journal_entries;')"
check "photo count UNCHANGED by linking (no duplication)" \
  "1" "$($PSQL -c 'select count(*) from public.journal_entry_photos;')"

echo ""
echo "=============================================================="
echo " PROOF 6 — the OUTSIDER (different org) is blocked every way"
echo "=============================================================="
check "outsider cannot READ the link (entry is not visible to them)" \
  "0" "$(as "$OUT" "select count(*) from public.journal_entry_tasks where task_id='$T1';")"
check "outsider cannot ATTACH their own entry to someone else's task" \
  "not_found" "$(as "$OUT" "select public.link_journal_entry_to_task_v1('$E4','$T1');")"
check "outsider cannot ATTACH someone else's entry to their own task" \
  "not_found" "$(as "$OUT" "select public.link_journal_entry_to_task_v1('$E1','$T2');")"
LINKID=$($PSQL -c "select id from public.journal_entry_tasks where entry_id='$E1' and task_id='$T1' and unlinked_at is null;")
check "outsider cannot UNLINK a link they cannot see" \
  "not_found" "$(as "$OUT" "select public.unlink_journal_entry_from_task_v1('$LINKID','nope');")"
# Correct NON-LEAKING behaviour: worker two cannot even SEE worker one's
# entry, so the answer is not_found — it must not confirm the link exists.
check "worker TWO cannot unlink, and is not told the link exists" \
  "not_found" "$(as "$W2" "select public.unlink_journal_entry_from_task_v1('$LINKID','nope');")"
check "worker two cannot attach worker one's entry" \
  "not_found" "$(as "$W2" "select public.link_journal_entry_to_task_v1('$E1','$T1');")"

echo ""
echo "=============================================================="
echo " PROOF 2b — the MANAGER sees the evidence (org authority works)"
echo "=============================================================="
check "manager of org A CAN read the links on the task" \
  "2" "$(as "$MGR" "select count(*) from public.journal_entry_tasks where task_id='$T1' and unlinked_at is null;")"
check "manager can attach an existing team entry (review workflow)" \
  "ok" "$(as "$MGR" "select public.link_journal_entry_to_task_v1('$E2','$T1');")"
check "outsider STILL sees nothing after the manager acted" \
  "0" "$(as "$OUT" "select count(*) from public.journal_entry_tasks where task_id='$T1';")"

echo ""
echo "=============================================================="
echo " PROOF 5 — unlinking PRESERVES the record (who / when / reason)"
echo "=============================================================="
BEFORE=$($PSQL -c "select count(*) from public.journal_entry_tasks;")
check "worker one (the linker) may withdraw their own claim" \
  "ok" "$(as "$W1" "select public.unlink_journal_entry_from_task_v1('$LINKID','wrong task, corrected');")"
check "row COUNT unchanged — nothing was deleted" \
  "$BEFORE" "$($PSQL -c 'select count(*) from public.journal_entry_tasks;')"
check "the withdrawn row records WHO" \
  "$W1" "$($PSQL -c "select unlinked_by from public.journal_entry_tasks where id='$LINKID';")"
check "the withdrawn row records WHEN" \
  "t" "$($PSQL -c "select unlinked_at is not null from public.journal_entry_tasks where id='$LINKID';")"
check "the withdrawn row records the REASON" \
  "wrong task, corrected" "$($PSQL -c "select unlink_reason from public.journal_entry_tasks where id='$LINKID';")"
check "the original linker/linked_at are still intact" \
  "$W1" "$($PSQL -c "select linked_by from public.journal_entry_tasks where id='$LINKID';")"
check "withdrawn evidence no longer counts as live evidence" \
  "2" "$(as "$MGR" "select count(*) from public.journal_entry_tasks where task_id='$T1' and unlinked_at is null;")"
check "unlinking wrote an audit row" \
  "1" "$($PSQL -c "select count(*) from public.audit_logs where action='journal_entry_task_unlinked' and entity_id='$E1';")"
# The genuine not_allowed branch: worker two CAN read their own entry (so the
# row is visible, no not_found) but did NOT make the claim and manages
# nothing — a worker must not be able to silently withdraw a MANAGER's
# evidence claim about their own work.
MGRLINK=$($PSQL -c "select id from public.journal_entry_tasks where entry_id='$E2' and task_id='$T1' and unlinked_at is null;")
check "worker two may NOT withdraw the manager's claim on their own entry" \
  "not_allowed" "$(as "$W2" "select public.unlink_journal_entry_from_task_v1('$MGRLINK','not mine to withdraw');")"
check "the manager's claim is still live after that refusal" \
  "1" "$($PSQL -c "select count(*) from public.journal_entry_tasks where id='$MGRLINK' and unlinked_at is null;")"
check "the project MANAGER may withdraw it (project authority)" \
  "ok" "$(as "$MGR" "select public.unlink_journal_entry_from_task_v1('$MGRLINK','reassigned to another task');")"
check "manager withdrawal is recorded against the MANAGER, not the worker" \
  "$MGR" "$($PSQL -c "select unlinked_by from public.journal_entry_tasks where id='$MGRLINK';")"
check "double-unlink is idempotent" \
  "already_unlinked" "$(as "$W1" "select public.unlink_journal_entry_from_task_v1('$LINKID','again');")"
check "a withdrawn pair can be RE-linked (partial unique index)" \
  "ok" "$(as "$W1" "select public.link_journal_entry_to_task_v1('$E1','$T1');")"
check "the withdrawn history row still exists alongside the new one" \
  "2" "$($PSQL -c "select count(*) from public.journal_entry_tasks where entry_id='$E1' and task_id='$T1';")"

echo ""
echo "=============================================================="
echo " PROOF 7 — the Work Journal hash / evidence chain is UNCHANGED"
echo "=============================================================="
check "no journal row changed (hash_prev, hash_self, text, timestamps)" \
  "0" "$($PSQL -c "select count(*) from (
        select id,hash_prev,hash_self,original_text,created_at,updated_at,deleted_at,superseded_by from public.journal_entries
        except
        select id,hash_prev,hash_self,original_text,created_at,updated_at,deleted_at,superseded_by from hash_before_persist) x;")"
check "the 2-entry chain still verifies (entry2.hash_prev = entry1.hash_self)" \
  "t" "$($PSQL -c "select (select hash_prev from public.journal_entries where id='e1e1e1e1-0000-0000-0000-000000000002')
                        = (select hash_self from public.journal_entries where id='$E1');")"
check "journal_entries still has NO task_id column" \
  "0" "$($PSQL -c "select count(*) from information_schema.columns where table_name='journal_entries' and column_name in ('task_id','object_id');")"
check "journal_entries still has no UPDATE/DELETE policy (append-only)" \
  "0" "$($PSQL -c "select count(*) from pg_policies where tablename='journal_entries' and cmd in ('UPDATE','DELETE');")"

echo ""
echo "=============================================================="
echo " PROOF 8 — bounds + input validation"
echo "=============================================================="
check "a garbage entry id is rejected, not 500" \
  "invalid" "$(as "$W1" "select public.link_journal_entry_to_task_v1('','$T1');")"
check "an over-long unlink reason is rejected" \
  "invalid" "$(as "$W1" "select public.unlink_journal_entry_from_task_v1('$LINKID', repeat('x',501));")"

echo ""
echo "=============================================================="
echo " PROOF 9 — the ROLLBACK refuses to destroy live claims, then works"
echo "=============================================================="
LIVE=$($PSQL -c "select count(*) from public.journal_entry_tasks where unlinked_at is null;")
if [ "$LIVE" -gt 0 ]; then
  OUT=$($PSQL -f "$ROLLBACK" 2>&1 | grep -ciE "rollback refused")
  check "rollback REFUSES while live evidence links exist" "1" "$OUT"
  check "the link table survived the refusal" \
    "1" "$($PSQL -c "select count(*) from information_schema.tables where table_name='journal_entry_tasks';")"
else
  echo "  SKIP  no live links to refuse on"
fi
$PSQL -c "update public.journal_entry_tasks set unlinked_at=now() where unlinked_at is null;" >/dev/null
$PSQL -f "$ROLLBACK" >/dev/null 2>&1
check "rollback SUCCEEDS once every claim is withdrawn" \
  "0" "$($PSQL -c "select count(*) from information_schema.tables where table_name='journal_entry_tasks';")"
check "rollback removed all three functions" \
  "0" "$($PSQL -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('link_journal_entry_to_task_v1','unlink_journal_entry_from_task_v1','can_read_journal_entry_v1');")"
check "the Work Journal is untouched by the rollback" \
  "0" "$($PSQL -c "select count(*) from (select id,hash_self from public.journal_entries except select id,hash_self from hash_before_persist) x;")"

echo ""
echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
