#!/usr/bin/env bash
# ============================================================================
# Task attribution of canonical work-time — REAL arithmetic + attribution proof
# for 20260819220000_timesheet_task_attribution_v1.
#
# Runs BOTH function bodies against the SAME data on a real PostgreSQL server:
# first the applied 20260818150000 body (via this migration's own rollback
# file, which restores it verbatim), then the new body. The decisive assertion
# is that TOTAL HOURS and LINE COUNT are IDENTICAL across the two — attribution
# must add information without changing a single number.
#
# Usage — native cluster:
#   /usr/lib/postgresql/16/bin/initdb -D /tmp/pgproof/data -U postgres --auth=trust
#   /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgproof/data \
#       -o '-p 55432 -k /tmp/pgproof' -l /tmp/pgproof/pg.log start
#   bash scripts/db-proof/timesheet-task-attribution.sh
#
# Never point this at production or a shared local Supabase stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NEW="$REPO/supabase/migrations/20260819220000_timesheet_task_attribution_v1.sql"
OLD="$REPO/supabase/rollbacks/20260819220000_timesheet_task_attribution_v1.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-/tmp/pgproof}
PGPROOF_PORT=${PGPROOF_PORT:-55432}
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

W=aaaa1111-0000-0000-0000-000000000001
O=aaaaaaaa-0000-0000-0000-000000000001
CALL="select public.timesheet_compute_lines_v1('$W'::uuid,'$O'::uuid,'2026-08-01'::date,'2026-08-31'::date)"

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
          else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi }

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public;" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/timesheet-task-attribution.prelude.sql" >/dev/null || { echo "prelude FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/timesheet-task-attribution.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }

echo ""
echo "=============================================================="
echo " BASELINE — the CURRENTLY APPLIED body (restored from rollback)"
echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$OLD" >/dev/null 2>&1 || { echo "  old body FAILED to load"; exit 1; }
OLD_HOURS=$($PSQL -c "$CALL->'totals'->>'totalHours';")
OLD_LINES=$($PSQL -c "$CALL->'totals'->>'lineCount';")
OLD_CONF=$($PSQL -c "select jsonb_array_length(($CALL)->'conflicts');")
OLD_DAYS=$($PSQL -c "$CALL->'totals'->>'totalDayUnits';")
echo "  totalHours=$OLD_HOURS  lineCount=$OLD_LINES  conflicts=$OLD_CONF  dayUnits=$OLD_DAYS"
check "the old body emits NO taskId (attribution did not exist)" \
  "0" "$($PSQL -c "select count(*) from jsonb_array_elements(($CALL)->'lines') l where l ? 'taskId';")"

echo ""
echo "=============================================================="
echo " APPLY the new body"
echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$NEW" >/dev/null 2>&1 && echo "  PASS  migration applies" && pass=$((pass+1)) || { echo "  FAIL  migration failed"; fail=$((fail+1)); }

echo ""
echo "=============================================================="
echo " THE INVARIANT — attribution changes NO number whatsoever"
echo "=============================================================="
check "totalHours identical"    "$OLD_HOURS" "$($PSQL -c "$CALL->'totals'->>'totalHours';")"
check "lineCount identical"     "$OLD_LINES" "$($PSQL -c "$CALL->'totals'->>'lineCount';")"
check "totalDayUnits identical" "$OLD_DAYS"  "$($PSQL -c "$CALL->'totals'->>'totalDayUnits';")"
check "conflicts identical"     "$OLD_CONF"  "$($PSQL -c "select jsonb_array_length(($CALL)->'conflicts');")"
check "rule A still wins over rule B (the 9h entry-level is ignored)" \
  "1" "$($PSQL -c "select count(*) from jsonb_array_elements(($CALL)->'conflicts') c where c->>'reason'='entry_quantity_ignored_fragments_present';")"

echo ""
echo "=============================================================="
echo " ATTRIBUTION — exactly one live link, or nothing"
echo "=============================================================="
q() { $PSQL -c "select l->>'$2' from jsonb_array_elements(($CALL)->'lines') l where l->>'journalEntryId'='$1' limit 1;"; }
check "E1 (exactly ONE live link) is attributed to that task" \
  "7a5c0000-0000-0000-0000-000000000001" "$(q e0000001-0000-0000-0000-000000000001 taskId)"
check "E1 carries the task's real title, not an invented one" \
  "Install cable run, floor 3" "$(q e0000001-0000-0000-0000-000000000001 taskTitle)"
check "E1 reports linkCount 1" "1" "$(q e0000001-0000-0000-0000-000000000001 taskLinkCount)"

check "E2 (TWO live links) is NOT attributed — never a guess" \
  "" "$(q e0000002-0000-0000-0000-000000000002 taskId)"
check "E2 still REPORTS the ambiguity (linkCount 2, not hidden)" \
  "2" "$(q e0000002-0000-0000-0000-000000000002 taskLinkCount)"
check "E2's hours are counted IN FULL exactly once (8, not 16)" \
  "8.00" "$($PSQL -c "select l->>'hours' from jsonb_array_elements(($CALL)->'lines') l where l->>'journalEntryId'='e0000002-0000-0000-0000-000000000002';")"
check "E2 produced exactly ONE line despite two links (no fan-out)" \
  "1" "$($PSQL -c "select count(*) from jsonb_array_elements(($CALL)->'lines') l where l->>'journalEntryId'='e0000002-0000-0000-0000-000000000002';")"

check "E3 (no links) is not attributed" \
  "" "$(q e0000003-0000-0000-0000-000000000003 taskId)"
check "E3 reports linkCount 0" "0" "$(q e0000003-0000-0000-0000-000000000003 taskLinkCount)"

check "E4 (link WITHDRAWN) counts as no link at all" \
  "" "$(q e0000004-0000-0000-0000-000000000004 taskId)"
check "E4 reports linkCount 0 — a withdrawn claim is not a link" \
  "0" "$(q e0000004-0000-0000-0000-000000000004 taskLinkCount)"

check "E5 (one link + fragments) attributes BOTH fragment lines to the task" \
  "2" "$($PSQL -c "select count(*) from jsonb_array_elements(($CALL)->'lines') l where l->>'journalEntryId'='e0000005-0000-0000-0000-000000000005' and l->>'taskId'='7a5c0000-0000-0000-0000-000000000003';")"

echo ""
echo "=============================================================="
echo " TENANT SCOPE — another organization's task never leaks in"
echo "=============================================================="
# The link table is not a tenant boundary: link_journal_entry_to_task_v1 asks
# only that the caller sees the entry and sees the task, never that they share
# an organization. This function is SECURITY DEFINER, so without an explicit
# predicate org B's task TITLE would be frozen into org A's timesheet.
check "E6 (link to an ORG B task) is NOT attributed on org A's sheet" \
  "" "$(q e0000006-0000-0000-0000-000000000006 taskId)"
check "E6 reports linkCount 0 — org A learns nothing about org B's task" \
  "0" "$(q e0000006-0000-0000-0000-000000000006 taskLinkCount)"
check "E6's hours still count IN FULL (the worker did work them)" \
  "8.00" "$($PSQL -c "select l->>'hours' from jsonb_array_elements(($CALL)->'lines') l where l->>'journalEntryId'='e0000006-0000-0000-0000-000000000006';")"
check "ORG B's task TITLE appears NOWHERE in the whole payload" \
  "0" "$($PSQL -c "select case when ($CALL)::text like '%ORG B SECRET TASK TITLE%' then 1 else 0 end;")"

check "E7 (task with NO organization spine) is NOT attributed" \
  "" "$(q e0000007-0000-0000-0000-000000000007 taskId)"
check "E7 reports linkCount 0 — a task owned by nobody is claimable by nobody" \
  "0" "$(q e0000007-0000-0000-0000-000000000007 taskLinkCount)"
check "the orphan task's title appears nowhere either" \
  "0" "$($PSQL -c "select case when ($CALL)::text like '%Orphan personal task%' then 1 else 0 end;")"

# The OBJECT spine must work, not just the project spine — E5's task reaches
# org A through work_objects with no project at all.
check "E5's task reaches org A through the OBJECT spine and IS attributed" \
  "Third task" "$(q e0000005-0000-0000-0000-000000000005 taskTitle)"

echo ""
echo "=============================================================="
echo " PROVENANCE — every pre-existing field still travels"
echo "=============================================================="
# Derived, never hardcoded: EVERY line must carry EVERY pre-existing field,
# so the expected count is the line count the function itself reports.
NLINES=$($PSQL -c "$CALL->'totals'->>'lineCount';")
echo "  (lines in this period: $NLINES)"
for k in metricId metricSource derivedFrom evidencePhrase projectId projectTitle lineKey day unit hours taskId taskTitle taskLinkCount; do
  check "every line carries '$k'" "$NLINES" \
    "$($PSQL -c "select count(*) from jsonb_array_elements(($CALL)->'lines') l where l ? '$k';")"
done

echo ""
echo "=============================================================="
echo " ROLLBACK — the attribution fields disappear, numbers do not"
echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$OLD" >/dev/null 2>&1 && echo "  PASS  rollback applies" && pass=$((pass+1)) || { echo "  FAIL"; fail=$((fail+1)); }
check "taskId gone after rollback" \
  "0" "$($PSQL -c "select count(*) from jsonb_array_elements(($CALL)->'lines') l where l ? 'taskId';")"
check "totalHours STILL identical after rollback" \
  "$OLD_HOURS" "$($PSQL -c "$CALL->'totals'->>'totalHours';")"
check "lineCount STILL identical after rollback" \
  "$OLD_LINES" "$($PSQL -c "$CALL->'totals'->>'lineCount';")"

echo ""
echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
