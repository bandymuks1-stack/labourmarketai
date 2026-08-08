#!/usr/bin/env bash
# ============================================================================
# A1 — caller_manages_worker vs booking engagements: REAL per-role proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (prelude + seed), then measures who can read/do WHAT
#   BEFORE -> AFTER -> ROLLBACK -> RE-APPLY
# around the actual files
#   supabase/migrations/20260808150000_caller_manages_worker_engagements_v1.sql
#   supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql
# each executed VERBATIM. Nothing here re-implements them.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS genuinely decides the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/a1-caller-manages-worker-engagements.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-a1-engagement-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260808150000_caller_manages_worker_engagements_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql"

WORKER='11111111-1111-4111-8111-111111111111'   # W1 — engaged, on NO roster
WORKER_R='15151515-1515-4151-8151-151515151515' # W2 — rostered control
EMP_ENG='22222222-2222-4222-8222-222222222222'  # E1 — holds the ACTIVE engagement; owns 2 companies
EMP_UNREL='33333333-3333-4333-8333-333333333333' # E2 — unrelated; rosters W2; holds a DETACHED row
EMP_ENDED='55555555-5555-4555-8555-555555555555' # E3 — engagement ENDED
ADMIN='44444444-4444-4444-8444-444444444444'

W1_ID='aaaa1111-0000-4000-8000-00000000000a'
W2_ID='aaaa2222-0000-4000-8000-00000000000b'
PRJ_ENG='eeee1111-0000-4000-8000-00000000000e'   # project of the ENGAGING company
PRJ_SIB='eeee2222-0000-4000-8000-00000000000e'   # project of a SIBLING company, same owner
PRJ_UNREL='eeee3333-0000-4000-8000-00000000000e'
AB_PENDING='ab000001-0000-4000-8000-000000000001'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql [$4=is_admin]
as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
set local app.is_admin = '${4:-false}';
$3
commit;
SQL
}

# Collapse a probe result to a single comparable token.
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

# assign_worker_to_project collapses to ASSIGNED / DENIED (the uuid varies).
assign() { local out; out=$(as authenticated "$1" "select public.assign_worker_to_project('$2','$3');" | tok)
           if [ "$out" = "DENIED" ]; then echo "DENIED"; else echo "ASSIGNED"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-64s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-64s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/a1-caller-manages-worker-engagements.seed.sql" >/dev/null; }

echo "=============================================================="
echo " A1 — caller_manages_worker vs booking engagements"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/a1-caller-manages-worker-engagements.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
seed || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

# ── Probes ─────────────────────────────────────────────────────────────────
p_eng_pending()    { as authenticated "$EMP_ENG"   "select note from public.worker_absences where worker_id='$W1_ID' and status='requested';" | tok; }
p_eng_manages()    { as authenticated "$EMP_ENG"   "select public.caller_manages_worker('$W1_ID');" | tok; }
p_eng_review()     { as authenticated "$EMP_ENG"   "select public.review_worker_absence_v1('$AB_PENDING','approved');" | tok; }
p_eng_sched()      { as authenticated "$EMP_ENG"   "select start_date||'..'||end_date from public.worker_absence_scheduling where worker_id='$W1_ID';" | tok; }
p_eng_private()    { as authenticated "$EMP_ENG"   "select note from public.worker_absences where worker_id='$W1_ID' and status='approved';" | tok; }
p_unrel_w1()       { as authenticated "$EMP_UNREL" "select count(*) from public.worker_absences where worker_id='$W1_ID';" | tok; }
p_unrel_manages()  { as authenticated "$EMP_UNREL" "select public.caller_manages_worker('$W1_ID');" | tok; }
p_unrel_review()   { as authenticated "$EMP_UNREL" "select public.review_worker_absence_v1('$AB_PENDING','approved');" | tok; }
p_ended_manages()  { as authenticated "$EMP_ENDED" "select public.caller_manages_worker('$W1_ID');" | tok; }
p_ended_w1()       { as authenticated "$EMP_ENDED" "select count(*) from public.worker_absences where worker_id='$W1_ID';" | tok; }
p_worker_self()    { as authenticated "$WORKER"    "select count(*)||':'||coalesce(string_agg(note,',' order by start_date),'-') from public.worker_absences where worker_id='$W1_ID';" | tok; }
p_roster_pending() { as authenticated "$EMP_UNREL" "select note from public.worker_absences where worker_id='$W2_ID' and status='requested';" | tok; }
p_roster_manages() { as authenticated "$EMP_UNREL" "select public.caller_manages_worker('$W2_ID');" | tok; }
p_admin_all()      { as authenticated "$ADMIN"     "select count(*) from public.worker_absences;" true | tok; }
p_anon_base()      { as anon          "$EMP_ENG"   "select count(*) from public.worker_absences;" | tok; }

echo
echo "--- BEFORE (production's current behaviour, both defects live) ---"
B_PENDING=$(p_eng_pending);       echo "  E1 -> W1 pending note        : $B_PENDING"
B_SELF=$(p_worker_self);          echo "  W1 -> own rows               : $B_SELF"
B_ROSTER=$(p_roster_pending);     echo "  E2 -> W2 pending note        : $B_ROSTER"
check "A1 REPRODUCED: engaging employer sees NO pending request"    "NOROWS" "$B_PENDING"
check "A1 REPRODUCED: caller_manages_worker is blind to engagement" "f"      "$(p_eng_manages)"
check "A1 REPRODUCED: engaging employer cannot review the request"  "DENIED" "$(p_eng_review)"
check "A1 REPRODUCED: scheduling view hides engaged worker too"     "NOROWS" "$(p_eng_sched)"
check "PROBLEM 2 REPRODUCED: assign to the ENGAGING company's project" \
      "DENIED" "$(assign "$EMP_ENG" "$PRJ_ENG" "$WORKER")"
check "BEFORE: roster control works (E2 reads W2's request)" \
      "ROSTER-PENDING control" "$B_ROSTER"
check "BEFORE: unrelated employer sees nothing of W1"              "0"      "$(p_unrel_w1)"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"

echo
echo "--- AFTER: (a) the engaged employer is admitted ---"
check "(a) engaging employer SEES the pending request" \
      "ENGAGED-PENDING employer must be able to review this" "$(p_eng_pending)"
check "(a) caller_manages_worker now TRUE via the engagement"      "t" "$(p_eng_manages)"
check "(a) scheduling view now shows engaged worker unavailability" \
      "2026-09-01..2026-09-05" "$(p_eng_sched)"

echo
echo "--- AFTER: (b) unrelated / ended / detached still see nothing ---"
check "(b) UNRELATED employer: still 0 absence rows for W1"        "0"      "$(p_unrel_w1)"
check "(b) UNRELATED employer: caller_manages_worker still false"  "f"      "$(p_unrel_manages)"
check "(b) UNRELATED employer: review still denied"                "DENIED" "$(p_unrel_review)"
check "(b) DETACHED engagement (worker_id NULL) grants nothing"    "f"      "$(p_unrel_manages)"
check "(b) ENDED engagement: caller_manages_worker false"          "f"      "$(p_ended_manages)"
check "(b) ENDED engagement: 0 absence rows"                       "0"      "$(p_ended_w1)"
check "(b) ANON: base table denied"                                "DENIED" "$(p_anon_base)"

echo
echo "--- AFTER: (c) worker self-visibility unchanged ---"
check "(c) worker sees own rows, byte-identical to BEFORE"  "$B_SELF" "$(p_worker_self)"
check "(c) admin unchanged (all 3 rows)"                    "3"       "$(p_admin_all)"

echo
echo "--- AFTER: W12 privacy narrowing survives the widening ---"
check "employer STILL cannot read the approved private reason"     "NOROWS" "$(p_eng_private)"
check "scheduling view still carries NO note column"               "0" \
      "$(q "select count(*) from pg_attribute where attrelid='public.worker_absence_scheduling'::regclass and attname='note';")"
check "scheduling view still carries NO absence_type column"       "0" \
      "$(q "select count(*) from pg_attribute where attrelid='public.worker_absence_scheduling'::regclass and attname='absence_type';")"

echo
echo "--- AFTER: roster path is untouched ---"
check "roster employer still reads W2's request"  "ROSTER-PENDING control" "$(p_roster_pending)"
check "roster employer caller_manages_worker true" "t" "$(p_roster_manages)"
check "roster assign still works"  "ASSIGNED" "$(assign "$EMP_UNREL" "$PRJ_UNREL" "$WORKER_R")"

echo
echo "--- AFTER: the project-assign binding (the trap) ---"
check "bridge RESTORED: assign to the ENGAGING company's project" \
      "ASSIGNED" "$(assign "$EMP_ENG" "$PRJ_ENG" "$WORKER")"
check "ISOLATION HELD: assign to a SIBLING company's project REFUSED" \
      "DENIED"   "$(assign "$EMP_ENG" "$PRJ_SIB" "$WORKER")"
# The two lines above are the whole reason assign_worker_to_project is in this
# migration: caller_manages_worker is TRUE for E1 here, yet the sibling project
# is still refused, because assign uses caller_manages_worker_by_roster + the
# project-bound helper rather than the widened predicate.
check "…while caller_manages_worker IS true for that caller"       "t" "$(p_eng_manages)"
check "by_roster is roster-only (false for the engaged-only worker)" "f" \
      "$(as authenticated "$EMP_ENG" "select public.caller_manages_worker_by_roster('$W1_ID');" | tok)"
check "by_roster is true for a genuinely rostered worker"          "t" \
      "$(as authenticated "$EMP_UNREL" "select public.caller_manages_worker_by_roster('$W2_ID');" | tok)"
check "assign now calls the project-bound engagement helper"       "1" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='assign_worker_to_project' and p.prosrc like '%caller_has_booking_engagement_for_project%';")"
check "W11 completed-project guard preserved in the new body"      "1" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='assign_worker_to_project' and p.prosrc like '%Project is completed%';")"

echo
echo "--- AFTER: grants / hygiene ---"
check "new helper: anon holds NO execute"  "f" \
      "$(q "select has_function_privilege('anon','public.caller_manages_worker_by_roster(uuid)','execute');")"
check "new helper: authenticated holds execute" "t" \
      "$(q "select has_function_privilege('authenticated','public.caller_manages_worker_by_roster(uuid)','execute');")"
check "caller_manages_worker: anon still holds NO execute" "f" \
      "$(q "select has_function_privilege('anon','public.caller_manages_worker(uuid)','execute');")"
check "all three functions are SECURITY DEFINER with search_path pinned" "3" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('caller_manages_worker','caller_manages_worker_by_roster','assign_worker_to_project') and p.prosecdef and 'search_path=public' = any(p.proconfig);")"
check "no new UPDATE/DELETE/INSERT grant on worker_absences" "0" \
      "$(q "select count(*) from information_schema.role_table_grants where table_name='worker_absences' and grantee='authenticated' and privilege_type in ('UPDATE','DELETE','INSERT');")"
check "no RLS policy was added or dropped (still exactly 1 on worker_absences)" "1" \
      "$(q "select count(*) from pg_policies where tablename='worker_absences';")"

echo
echo "--- AFTER: the review action itself now completes (mutates state) ---"
check "engaging employer CAN approve the request" "NOROWS" "$(p_eng_review)"
check "…and the row really moved to approved"     "approved" \
      "$(q "select status from public.worker_absences where id='$AB_PENDING';")"
seed  # restore the pre-review state so the rollback comparison is like-for-like

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
RB_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$RB_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RB_OUT" | head -20; echo "ROLLBACK FAILED"; exit 1; fi
check "ROLLBACK restores the BEFORE employer read"       "$B_PENDING" "$(p_eng_pending)"
check "ROLLBACK restores roster-only caller_manages_worker" "f"       "$(p_eng_manages)"
check "ROLLBACK removes caller_manages_worker_by_roster"  "0" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='caller_manages_worker_by_roster';")"
check "ROLLBACK restores the roster control unchanged"   "$B_ROSTER"  "$(p_roster_pending)"
check "ROLLBACK leaves assign_worker_to_project callable" "DENIED" \
      "$(assign "$EMP_ENG" "$PRJ_ENG" "$WORKER")"

echo
echo "--- RE-APPLY (migration is re-runnable) ---"
RE_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$RE_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RE_OUT" | head -20; echo "RE-APPLY FAILED"; exit 1; fi
check "RE-APPLY: engaging employer sees the request again" \
      "ENGAGED-PENDING employer must be able to review this" "$(p_eng_pending)"
check "RE-APPLY: sibling isolation still held" \
      "DENIED" "$(assign "$EMP_ENG" "$PRJ_SIB" "$WORKER")"
check "RE-APPLY: unrelated employer still sees nothing"  "0" "$(p_unrel_w1)"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
