#!/usr/bin/env bash
# ============================================================================
# M3 COMPUTE WIRING — REAL arithmetic + dedupe + tenant proof for
# 20260831170000_timesheet_compute_allocations_v1.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (prelude + seed), then measures what timesheet_compute_lines_v1 computes
#   BEFORE -> AFTER -> ROLLBACK -> RE-APPLY
# around the actual files
#   supabase/migrations/20260819220000_timesheet_task_attribution_v1.sql (the
#     CURRENTLY APPLIED body, loaded verbatim as the BEFORE state)
#   supabase/migrations/20260831170000_timesheet_compute_allocations_v1.sql
#   supabase/rollbacks/20260831170000_timesheet_compute_allocations_v1.down.sql
# each executed VERBATIM. Nothing here re-implements them.
#
# What it proves (task letters):
#   (a) BEFORE: allocations exist in the table, the compute returns ZERO
#       lines from them (the M3 defect, reproduced);
#   (b) AFTER: allocation lines appear with correct hours, titles and totals;
#   (c) DEDUPE: an allocation LINKED to a journal entry that itself carries
#       time metrics yields ONE line (the allocation), counted once;
#   (d) superseded and rejected allocations are excluded;
#   (e) NO-LOSS CONTROL: a journal-only worker's 'lines' are byte-identical
#       across the two bodies;
#   (f) cross-tenant: another org's allocations never appear, and a foreign
#       org's OBJECT NAME is withheld even from an own-org allocation;
#   (g) ROLLBACK restores the exact prior body (md5 of pg_proc.prosrc),
#       RE-APPLY is clean;
#   (+) the 500-line cap holds ACROSS both sources.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/m3-timesheet-compute-allocations.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-m3-compute-alloc-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CURRENT="$REPO/supabase/migrations/20260819220000_timesheet_task_attribution_v1.sql"
NEW="$REPO/supabase/migrations/20260831170000_timesheet_compute_allocations_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260831170000_timesheet_compute_allocations_v1.down.sql"

W1=aaaa1111-0000-0000-0000-000000000001   # journal + allocations
W2=aaaa2222-0000-0000-0000-000000000002   # journal only — the no-loss control
W3=aaaa3333-0000-0000-0000-000000000003   # 520 allocations + 1 journal entry — the cap
ORG_A=aaaaaaaa-0000-0000-0000-000000000001
ORG_B=bbbbbbbb-0000-0000-0000-000000000002
E1=e0000001-0000-0000-0000-000000000001
AL3=a1100003-0000-4000-8000-000000000003  # the journal-linked allocation
AL4=a1100004-0000-4000-8000-000000000004  # superseded
AL6=a1100006-0000-4000-8000-000000000006  # rejected
AL7=a1100007-0000-4000-8000-000000000007  # org B's allocation

CALL_W1="select public.timesheet_compute_lines_v1('$W1'::uuid,'$ORG_A'::uuid,'2026-08-01'::date,'2026-08-31'::date)"
CALL_W2="select public.timesheet_compute_lines_v1('$W2'::uuid,'$ORG_A'::uuid,'2026-08-01'::date,'2026-08-31'::date)"
CALL_W3="select public.timesheet_compute_lines_v1('$W3'::uuid,'$ORG_A'::uuid,'2026-08-01'::date,'2026-08-31'::date)"
CALL_W1_B="select public.timesheet_compute_lines_v1('$W1'::uuid,'$ORG_B'::uuid,'2026-08-01'::date,'2026-08-31'::date)"
PROSRC="select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='timesheet_compute_lines_v1'"

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=[%s] actual=[%s]\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

echo "=============================================================="
echo " M3 — timesheet_compute_lines_v1 learns work_hour_allocations"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

tr -d '\r' < "$HERE/m3-timesheet-compute-allocations.prelude.sql" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - >/dev/null || { echo "prelude failed"; exit 1; }
tr -d '\r' < "$HERE/m3-timesheet-compute-allocations.seed.sql" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- BEFORE: the CURRENTLY APPLIED body ($(basename "$CURRENT"), verbatim) ---"
CUR_OUT=$(tr -d '\r' < "$CURRENT" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - 2>&1)
if echo "$CUR_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$CUR_OUT" | head -20; echo "CURRENT BODY FAILED TO LOAD"; exit 1; fi
MD5_OLD=$(q "$PROSRC;")
B_HOURS=$(q "select ($CALL_W1)->'totals'->>'totalHours';")
B_LINES=$(q "select ($CALL_W1)->'totals'->>'lineCount';")
B_CONF=$(q "select jsonb_array_length(($CALL_W1)->'conflicts');")
echo "  W1 totals: totalHours=$B_HOURS lineCount=$B_LINES conflicts=$B_CONF  (prosrc md5 $MD5_OLD)"
check "(a) allocations EXIST in the table (8 for W1 + 520 for W3)" "528" \
  "$(q "select count(*) from public.work_hour_allocations;")"
check "(a) M3 DEFECT REPRODUCED: zero allocation-derived lines"    "0" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'derivedFrom'='work_hour_allocation';")"
check "(a) BEFORE W1: journal-only totals (6x8h + 2h + 3h)"        "53.00" "$B_HOURS"
check "(a) BEFORE W1: 8 journal lines"                             "8"     "$B_LINES"
B_W2_LINES=$(q "select (($CALL_W2)->'lines')::text;")
B_W2_HOURS=$(q "select ($CALL_W2)->'totals'->>'totalHours';")
check "control W2 BEFORE: 1 line, 8.00 h" "8.00" "$B_W2_HOURS"

echo
echo "--- APPLYING $(basename "$NEW") verbatim ---"
APPLY_OUT=$(tr -d '\r' < "$NEW" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - 2>&1)
if echo "$APPLY_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"
check "the body actually changed (prosrc md5 differs)" "t" \
  "$(q "select ($PROSRC) <> '$MD5_OLD';")"

echo
echo "--- AFTER: (b) allocation lines appear, totals sum BOTH sources ---"
# Journal half post-dedupe: E2,E3,E4,E6,E7 = 5x8h, E5 = 2h+3h -> 45.00 / 7 lines.
# Alloc half: AL1 8 + AL2 2 + AL3 5 + AL5 4 + AL8 7 -> 26.00 / 5 lines.
check "(b) totalHours sums both sources post-dedupe (45 + 26)" "71.00" \
  "$(q "select ($CALL_W1)->'totals'->>'totalHours';")"
check "(b) lineCount sums both sources post-dedupe (7 + 5)"    "12" \
  "$(q "select ($CALL_W1)->'totals'->>'lineCount';")"
check "(b) exactly 5 allocation-derived lines"                 "5" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'derivedFrom'='work_hour_allocation';")"
check "(b) conflicts untouched (E5's ignored 9h, exactly as before)" "$B_CONF" \
  "$(q "select jsonb_array_length(($CALL_W1)->'conflicts');")"
check "(b) doc source states BOTH stores" "work_hour_allocations+journal_entry_metrics" \
  "$(q "select ($CALL_W1)->>'source';")"
a() { q "select l->>'$2' from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'lineKey'='alloc:$1' limit 1;"; }
check "(b) AL1 title = FIRST LINE of the operator's note" "Kabelių tiesimas" "$(a a1100001-0000-4000-8000-000000000001 title)"
check "(b) AL1 hours travel as recorded"                  "8.00"             "$(a a1100001-0000-4000-8000-000000000001 hours)"
check "(b) AL1 objectTitle = the object's real name"      "Object 01"        "$(a a1100001-0000-4000-8000-000000000001 objectTitle)"
check "(b) AL1 unit is hours"                             "hours"            "$(a a1100001-0000-4000-8000-000000000001 unit)"
check "(b) AL2 (note NULL) titles from the object name"   "Object 05"        "$(a a1100002-0000-4000-8000-000000000002 title)"
check "(b) AL2 projectTitle travels via the object spine" "Kabelių trasa"    "$(a a1100002-0000-4000-8000-000000000002 projectTitle)"
check "(b) AL2 projectId travels via the object spine"    "99999999-0000-0000-0000-000000000001" "$(a a1100002-0000-4000-8000-000000000002 projectId)"
check "(b) allocation lines carry their provenance"       "import"           "$(a a1100002-0000-4000-8000-000000000002 metricSource)"
check "(b) a day's allocation sorts before its journal lines (2026-08-10 first line)" \
  "work_hour_allocation" "$(q "select (($CALL_W1)->'lines'->0)->>'derivedFrom';")"

echo
echo "--- AFTER: (c) allocation-wins dedupe — one hour fact, one line ---"
check "(c) exactly ONE line references E1 (was: its 8h journal line)" "1" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'journalEntryId'='$E1';")"
check "(c) ...and it is the ALLOCATION line"       "alloc:$AL3" \
  "$(q "select l->>'lineKey' from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'journalEntryId'='$E1';")"
check "(c) ...carrying the allocation's 5h, not the entry's 8h" "5.00" \
  "$(q "select l->>'hours' from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'journalEntryId'='$E1';")"
check "(c) the link is visible on the line (allocationId)" "$AL3" \
  "$(q "select l->>'allocationId' from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'journalEntryId'='$E1';")"
check "(c) E1's own journal line is GONE (no '#entry' key for it)" "0" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'lineKey'='$E1#entry';")"

echo
echo "--- AFTER: (d) superseded and rejected allocations are excluded ---"
check "(d) superseded AL4 appears nowhere"  "0" \
  "$(q "select case when ($CALL_W1)::text like '%$AL4%' then 1 else 0 end;")"
check "(d) its correction AL5 counts, once, with the corrected hours" "4.00" \
  "$(a a1100005-0000-4000-8000-000000000005 hours)"
check "(d) exactly ONE allocation line on the corrected day (2026-08-13)" "1" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'day'='2026-08-13';")"
check "(d) rejected AL6 appears nowhere"    "0" \
  "$(q "select case when ($CALL_W1)::text like '%$AL6%' then 1 else 0 end;")"

echo
echo "--- AFTER: (e) no-loss control — journal-only output is byte-identical ---"
check "(e) W2 'lines' json BYTE-IDENTICAL to the pre-migration output" "true" \
  "$(q "select ((($CALL_W2)->'lines')::text = \$\$${B_W2_LINES}\$\$)::text;")"
check "(e) W2 totals unchanged" "$B_W2_HOURS" "$(q "select ($CALL_W2)->'totals'->>'totalHours';")"
check "(e) W2 has zero allocation lines (it has zero allocations)" "0" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W2)->'lines') l where l->>'derivedFrom'='work_hour_allocation';")"

echo
echo "--- AFTER: (f) tenant boundaries ---"
check "(f) org B's allocation (AL7, 9h) never reaches org A's sheet" "0" \
  "$(q "select case when ($CALL_W1)::text like '%$AL7%' then 1 else 0 end;")"
check "(f) org B's OWN sheet sees exactly that one allocation" "9.00" \
  "$(q "select ($CALL_W1_B)->'totals'->>'totalHours';")"
check "(f) org B's sheet has exactly 1 line" "1" \
  "$(q "select ($CALL_W1_B)->'totals'->>'lineCount';")"
check "(f) SECDEF defence: a foreign org's OBJECT NAME appears nowhere" "0" \
  "$(q "select case when ($CALL_W1)::text like '%ORG B SECRET OBJECT%' then 1 else 0 end;")"
check "(f) ...but the own-org allocation's HOURS still count (AL8, 7h)" "7.00" \
  "$(a a1100008-0000-4000-8000-000000000008 hours)"
check "(f) ...with an empty title, never an invented one" "" \
  "$(a a1100008-0000-4000-8000-000000000008 title)"
check "(f) ORG B's task title STILL appears nowhere (20260819220000 defence kept)" "0" \
  "$(q "select case when ($CALL_W1)::text like '%ORG B SECRET TASK TITLE%' then 1 else 0 end;")"

echo
echo "--- AFTER: the 500-line cap holds ACROSS both sources ---"
check "cap: W3 (1 journal + 520 alloc candidates) emits exactly 500 lines" "500" \
  "$(q "select ($CALL_W3)->'totals'->>'lineCount';")"
check "cap: earliest-day journal line survives, 499 allocations follow (8 + 499)" "507.00" \
  "$(q "select ($CALL_W3)->'totals'->>'totalHours';")"

echo
echo "--- AFTER: grants / posture ---"
check "anon holds NO execute"          "f" \
  "$(q "select has_function_privilege('anon','public.timesheet_compute_lines_v1(uuid,uuid,date,date)','execute');")"
check "authenticated holds NO execute" "f" \
  "$(q "select has_function_privilege('authenticated','public.timesheet_compute_lines_v1(uuid,uuid,date,date)','execute');")"
check "SECURITY DEFINER with search_path pinned" "1" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='timesheet_compute_lines_v1' and p.prosecdef and 'search_path=public' = any(p.proconfig);")"

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
RB_OUT=$(tr -d '\r' < "$ROLLBACK" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - 2>&1)
if echo "$RB_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RB_OUT" | head -20; echo "ROLLBACK FAILED"; exit 1; fi
check "(g) ROLLBACK restores the EXACT prior body (prosrc md5)" "$MD5_OLD" "$(q "$PROSRC;")"
check "(g) totals return to the journal-only BEFORE values" "$B_HOURS" "$(q "select ($CALL_W1)->'totals'->>'totalHours';")"
check "(g) lineCount returns to BEFORE"                     "$B_LINES" "$(q "select ($CALL_W1)->'totals'->>'lineCount';")"
check "(g) zero allocation lines after rollback"            "0" \
  "$(q "select count(*) from jsonb_array_elements(($CALL_W1)->'lines') l where l->>'derivedFrom'='work_hour_allocation';")"
check "(g) work_hour_allocations rows are untouched by the rollback" "528" \
  "$(q "select count(*) from public.work_hour_allocations;")"

echo
echo "--- RE-APPLY (migration is re-runnable) ---"
RE_OUT=$(tr -d '\r' < "$NEW" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - 2>&1)
if echo "$RE_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RE_OUT" | head -20; echo "RE-APPLY FAILED"; exit 1; fi
check "RE-APPLY: combined totals are back" "71.00" "$(q "select ($CALL_W1)->'totals'->>'totalHours';")"
check "RE-APPLY: 12 lines"                 "12"    "$(q "select ($CALL_W1)->'totals'->>'lineCount';")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
