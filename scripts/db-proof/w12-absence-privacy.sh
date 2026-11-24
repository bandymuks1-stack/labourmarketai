#!/usr/bin/env bash
# ============================================================================
# W12 employer absence privacy hardening — REAL per-role behaviour proof.
#
# Spins nothing up itself: expects a THROWAWAY Postgres 15 container named
# $CT to be running (see the header of booking-atomic-double-booking.sh for the
# same convention). Loads the faithful harness (prelude), then measures who can
# read WHAT BEFORE and AFTER executing the actual migration file
#   supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql
# and the actual rollback
#   supabase/rollbacks/20260808120000_worker_absence_scheduling_view_v1.down.sql
# each VERBATIM. Nothing here re-implements them.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS genuinely decides the result.
#
# Never point this at production or at a shared local Supabase stack.
# ============================================================================
set -uo pipefail

CT=${CT:-w12-privacy-proof}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260808120000_worker_absence_scheduling_view_v1.down.sql"

WORKER='11111111-1111-4111-8111-111111111111'
EMP_A='22222222-2222-4222-8222-222222222222'   # manages the worker
EMP_B='33333333-3333-4333-8333-333333333333'   # unrelated
ADMIN='44444444-4444-4444-8444-444444444444'

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

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-62s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-62s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

echo "=============================================================="
echo " W12 employer absence privacy hardening — per-role proof"
echo "=============================================================="
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT not ready"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w12-absence-privacy.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w12-absence-privacy.seed.sql"   >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

probe_emp_reason_approved() { as authenticated "$EMP_A" "select note||' / '||absence_type from public.worker_absences where status='approved';" | tok; }
probe_emp_reason_pending()  { as authenticated "$EMP_A" "select note from public.worker_absences where status='requested';" | tok; }
probe_emp_sched_base()      { as authenticated "$EMP_A" "select start_date||'..'||end_date from public.worker_absences where status='approved';" | tok; }
probe_emp_sched_view()      { as authenticated "$EMP_A" "select start_date||'..'||end_date from public.worker_absence_scheduling;" | tok; }
probe_emp_star()            { as authenticated "$EMP_A" "select count(*) from public.worker_absences;" | tok; }
probe_worker_full()         { as authenticated "$WORKER" "select count(*)||':'||coalesce(string_agg(note,','),'-') from public.worker_absences;" | tok; }
probe_unrelated_base()      { as authenticated "$EMP_B" "select count(*) from public.worker_absences;" | tok; }
probe_unrelated_view()      { as authenticated "$EMP_B" "select count(*) from public.worker_absence_scheduling;" | tok; }
probe_admin_full()          { as authenticated "$ADMIN" "select count(*) from public.worker_absences;" true | tok; }
probe_anon_base()           { as anon "$EMP_A" "select count(*) from public.worker_absences;" | tok; }
probe_anon_view()           { as anon "$EMP_A" "select count(*) from public.worker_absence_scheduling;" | tok; }
probe_view_columns()        { q "select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid='public.worker_absence_scheduling'::regclass and attnum>0 and not attisdropped;"; }

echo
echo "--- BEFORE (main's policy: manager admitted to the WHOLE row) ---"
B_REASON=$(probe_emp_reason_approved);  echo "  employer A -> approved note/type : $B_REASON"
B_SCHED=$(probe_emp_sched_base);        echo "  employer A -> approved schedule  : $B_SCHED"
B_PEND=$(probe_emp_reason_pending);     echo "  employer A -> pending note       : $B_PEND"
B_WORKER=$(probe_worker_full);          echo "  worker     -> own rows           : $B_WORKER"
B_UNREL=$(probe_unrelated_base);        echo "  employer B -> row count          : $B_UNREL"
check "BEFORE: the exposure is real (employer reads the private reason)" \
      "PRIVATE-REASON do not disclose to employer / sickness" "$B_REASON"
check "BEFORE: unrelated employer already sees nothing"     "0" "$B_UNREL"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$APPLY_OUT" | head -10; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"
echo "  view columns: $(probe_view_columns)"

echo
echo "--- AFTER ---"
check "view exists and carries ONLY scheduling columns" \
      "id,worker_id,start_date,end_date,half_day,status" "$(probe_view_columns)"
check "view carries NO note column"       "0" "$(q "select count(*) from pg_attribute where attrelid='public.worker_absence_scheduling'::regclass and attname='note';")"
check "view carries NO absence_type"      "0" "$(q "select count(*) from pg_attribute where attrelid='public.worker_absence_scheduling'::regclass and attname='absence_type';")"
check "AUTHORIZED EMPLOYER: scheduling read SUCCEEDS (via view)" "2026-09-01..2026-09-05" "$(probe_emp_sched_view)"
check "AUTHORIZED EMPLOYER: approved private reason DENIED"      "NOROWS" "$(probe_emp_reason_approved)"
check "AUTHORIZED EMPLOYER: approved row unreachable on base tbl" "NOROWS" "$(probe_emp_sched_base)"
check "PENDING WORKFLOW: manager still reads the pending note"   "PENDING-REASON manager must read this to decide" "$(probe_emp_reason_pending)"
check "AUTHORIZED EMPLOYER: base table now yields ONLY pending"  "1" "$(probe_emp_star)"
check "WORKER SELF: full rows incl. every note, unchanged"       "$B_WORKER" "$(probe_worker_full)"
check "UNRELATED EMPLOYER: base table -> no rows"                "0" "$(probe_unrelated_base)"
check "UNRELATED EMPLOYER: view -> no rows"                      "0" "$(probe_unrelated_view)"
check "ADMIN: privileges unchanged (all 3 rows)"                 "3" "$(probe_admin_full)"
check "ANON: base table denied"                                  "DENIED" "$(probe_anon_base)"
check "ANON: view denied"                                        "DENIED" "$(probe_anon_view)"
check "view excludes non-approved statuses (only the approved row)" "1" \
      "$(as authenticated "$EMP_A" "select count(*) from public.worker_absence_scheduling;" | tok)"
check "no UPDATE/DELETE grant added on worker_absences for authenticated" "0" \
      "$(q "select count(*) from information_schema.role_table_grants where table_name='worker_absences' and grantee='authenticated' and privilege_type in ('UPDATE','DELETE','INSERT');")"
check "anon holds NOTHING on the view" "0" \
      "$(q "select count(*) from information_schema.role_table_grants where table_name='worker_absence_scheduling' and grantee='anon';")"

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
RB_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$RB_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RB_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "ROLLBACK restores the pre-change employer read"  "$B_REASON" "$(probe_emp_reason_approved)"
check "ROLLBACK removes the view"                       "0" "$(q "select count(*) from pg_class where relname='worker_absence_scheduling';")"

echo
echo "--- RE-APPLY (migration is re-runnable) ---"
RE_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$RE_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RE_OUT" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "RE-APPLY: approved reason denied again"          "NOROWS" "$(probe_emp_reason_approved)"
check "RE-APPLY: scheduling still available"            "2026-09-01..2026-09-05" "$(probe_emp_sched_view)"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
