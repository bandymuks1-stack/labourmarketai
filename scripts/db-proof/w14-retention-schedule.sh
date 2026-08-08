#!/usr/bin/env bash
# ============================================================================
# W14 item 6 SCHEDULER — REAL behaviour + failure-semantics proof.
#
# Expects a THROWAWAY Postgres 15 container named $CT. Loads the harness
# (prelude = real ai_runs posture + real 20260808130000 capability + a pg_cron
# SHIM), then executes
#   supabase/migrations/20260808140000_ai_runs_retention_schedule_v1.sql
#   supabase/rollbacks/20260808140000_ai_runs_retention_schedule_v1.down.sql
#
# ONE DEVIATION, printed rather than hidden: the `create extension … pg_cron`
# line is stripped, because pg_cron needs shared_preload_libraries and cannot
# load in a stock container. Everything else runs verbatim. Whether the real
# extension installs and the real job fires is a PRODUCTION fact, verified
# there against `cron.job` after apply — never inferred from here.
#
# Never point this at production or at a shared local Supabase stack.
# ============================================================================
set -uo pipefail

CT=${CT:-w14-schedule-proof}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260808140000_ai_runs_retention_schedule_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260808140000_ai_runs_retention_schedule_v1.down.sql"

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }
as() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.is_admin = 'true';
$2
commit;
SQL
}
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d')
        if echo "$out" | grep -qiE '(^|:)\s*(ERROR|FATAL)'; then echo "REFUSED"
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-64s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-64s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

echo "=============================================================="
echo " W14 item 6 — retention SCHEDULER proof"
echo "=============================================================="
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT not ready"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w14-retention-schedule.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
echo "harness loaded (throwaway $CT; pg_cron SHIMMED)"
echo "  STRIPPED LINE (cannot run in a container): $(grep -n 'create extension if not exists pg_cron' "$MIGRATION" | head -1)"

apply() { grep -v 'create extension if not exists pg_cron' "$1" | docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 2>&1; }

echo
echo "--- BEFORE: capability exists, nothing calls it ---"
check "the retention capability is present"       "1" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"
check "no scheduled job yet"                      "0" "$(q "select count(*) from cron.job where jobname='ai-runs-retention-daily';")"
check "no telemetry table yet"                    "0" "$(q "select count(*) from pg_class where relname='ai_runs_retention_sweeps';")"

echo
echo "--- APPLYING $(basename "$MIGRATION") (minus the extension line) ---"
OUT=$(apply "$MIGRATION")
if echo "$OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$OUT" | head -12; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"

echo
echo "--- §9 SCHEDULER SAFETY ---"
check "the job is scheduled under its canonical name" "1" "$(q "select count(*) from cron.job where jobname='ai-runs-retention-daily';")"
check "cadence is DAILY, not high-frequency"          "17 3 * * *" "$(q "select schedule from cron.job where jobname='ai-runs-retention-daily';")"
check "it invokes ONLY the narrow retention wrapper"  "select public.run_ai_runs_retention_sweep()" "$(q "select command from cron.job where jobname='ai-runs-retention-daily';")"
check "the wrapper passes NO horizon argument"        "1" \
  "$(q "select (position('redact_expired_ai_run_content()' in pg_get_functiondef(p.oid))>0)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='run_ai_runs_retention_sweep';")"
check "the wrapper contains NO delete"                "0" \
  "$(q "select (position(' delete ' in lower(pg_get_functiondef(p.oid)))>0)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='run_ai_runs_retention_sweep';")"
# `into public.ai_runs` is a PREFIX of `into public.ai_runs_retention_sweeps`,
# so match the table name with its statement terminator to avoid certifying a
# violation that is really the telemetry insert.
check "the wrapper never writes ai_runs itself"       "0" \
  "$(q "select (lower(pg_get_functiondef(p.oid)) ~ 'into\s+public\.ai_runs\s')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='run_ai_runs_retention_sweep';")"
check "the wrapper's ONLY insert target is the telemetry table" "1" \
  "$(q "select (lower(pg_get_functiondef(p.oid)) ~ 'into\s+public\.ai_runs_retention_sweeps')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='run_ai_runs_retention_sweep';")"
check "SECURITY DEFINER with pinned search_path"      "1" \
  "$(q "select (p.prosecdef and array_to_string(p.proconfig,',') like '%search_path=public%')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='run_ai_runs_retention_sweep';")"
check "authenticated CANNOT invoke the sweep"         "0" "$(q "select has_function_privilege('authenticated','public.run_ai_runs_retention_sweep()','execute')::int;")"
check "anon CANNOT invoke the sweep"                  "0" "$(q "select has_function_privilege('anon','public.run_ai_runs_retention_sweep()','execute')::int;")"
check "service_role CAN invoke the sweep"             "1" "$(q "select has_function_privilege('service_role','public.run_ai_runs_retention_sweep()','execute')::int;")"
check "telemetry is append-only: no write grant, any role" "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs_retention_sweeps' and grantee<>'postgres' and privilege_type in ('INSERT','UPDATE','DELETE');")"
check "anon holds NOTHING on the telemetry table"     "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs_retention_sweeps' and grantee='anon';")"
check "ai_runs still has no non-owner write grant"    "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs' and grantee<>'postgres' and privilege_type in ('UPDATE','DELETE');")"
# Scan EXECUTABLE lines only. The header names CRON_SECRET and
# SUPABASE_SERVICE_ROLE_KEY on purpose — explaining why neither is needed is the
# point of that prose, and a scan that flags the explanation would push the next
# author to delete it to make the check pass.
check "no credential string in any EXECUTABLE line of the migration" "0" \
  "$(grep -v '^\s*--' "$MIGRATION" | grep -icE 'service_role_key|cron_secret|password|bearer |eyJ[A-Za-z0-9]{6}' || true)"

echo
echo "--- §10 FAILURE SEMANTICS ---"
echo "  (a) 0 eligible rows -> success, 0 redacted"
check "empty table: sweep returns 0"                  "0" "$(as service_role "select public.run_ai_runs_retention_sweep();" | tok)"
check "empty table: exactly ONE telemetry row exists" "1" "$(q "select count(*) from public.ai_runs_retention_sweeps;")"
check "that row records 0 redacted, horizon 90"       "0|90" "$(q "select redacted_count||'|'||retention_days from public.ai_runs_retention_sweeps order by ran_at desc limit 1;")"

echo "  (b) eligible rows -> correct count"
q "insert into public.ai_runs (created_at, task_type, provider, model_alias, output_excerpt) values
     (now() - interval '100 days','t','p','m','OLD-A'),
     (now() - interval '120 days','t','p','m','OLD-B'),
     (now() - interval '10 days','t','p','m','FRESH');" >/dev/null
check "sweep redacts exactly the 2 eligible rows"     "2" "$(as service_role "select public.run_ai_runs_retention_sweep();" | tok)"
check "the fresh row is untouched"                    "FRESH" "$(q "select output_excerpt from public.ai_runs where output_excerpt is not null;")"
check "no audit row was deleted"                      "3" "$(q "select count(*) from public.ai_runs;")"
check "telemetry now has 2 rows, latest = 2 redacted" "2|2" "$(q "select (select count(*) from public.ai_runs_retention_sweeps)||'|'||(select redacted_count from public.ai_runs_retention_sweeps order by ran_at desc limit 1);")"

echo "  (c) re-run -> no additional mutation"
check "re-run redacts 0"                              "0" "$(as service_role "select public.run_ai_runs_retention_sweep();" | tok)"
check "re-run still leaves the fresh row intact"      "FRESH" "$(q "select output_excerpt from public.ai_runs where output_excerpt is not null;")"
check "re-run deleted nothing"                        "3" "$(q "select count(*) from public.ai_runs;")"

echo "  (d) the capability is unavailable -> truthful failure, NO success row"
SWEEPS_BEFORE=$(q "select count(*) from public.ai_runs_retention_sweeps;")
q "alter function public.redact_expired_ai_run_content(integer) rename to redact_expired_ai_run_content_hidden;" >/dev/null
check "sweep FAILS loudly when the capability is gone" "REFUSED" "$(as service_role "select public.run_ai_runs_retention_sweep();" | tok)"
check "and writes NO telemetry row (absence, not false success)" "$SWEEPS_BEFORE" "$(q "select count(*) from public.ai_runs_retention_sweeps;")"
q "alter function public.redact_expired_ai_run_content_hidden(integer) rename to redact_expired_ai_run_content;" >/dev/null

echo "  (e) the sweep transaction is atomic — a failure leaves nothing behind"
q "alter table public.ai_runs_retention_sweeps add constraint tmp_block check (false) not valid;" >/dev/null
q "alter table public.ai_runs_retention_sweeps validate constraint tmp_block;" >/dev/null 2>&1
BEFORE_E=$(q "select coalesce(sum(case when output_excerpt is null then 1 else 0 end),0) from public.ai_runs;")
q "insert into public.ai_runs (created_at, task_type, provider, model_alias, output_excerpt) values (now() - interval '200 days','t','p','m','SHOULD-SURVIVE-A-FAILED-SWEEP');" >/dev/null
check "sweep fails when telemetry cannot be written"  "REFUSED" "$(as service_role "select public.run_ai_runs_retention_sweep();" | tok)"
check "…and the redaction ROLLED BACK with it (no half-done sweep)" "SHOULD-SURVIVE-A-FAILED-SWEEP" \
  "$(q "select output_excerpt from public.ai_runs where output_excerpt='SHOULD-SURVIVE-A-FAILED-SWEEP';")"
q "alter table public.ai_runs_retention_sweeps drop constraint tmp_block;" >/dev/null

echo
echo "--- HEALTH READ: never healthy without positive evidence ---"
as service_role "select public.run_ai_runs_retention_sweep();" >/dev/null
check "healthy after a fresh completed sweep + scheduled job" "t" "$(q "select healthy from public.ai_runs_retention_health();")"
check "it reports the job as scheduled"               "t" "$(q "select job_scheduled from public.ai_runs_retention_health();")"
q "update public.ai_runs_retention_sweeps set ran_at = now() - interval '5 days';" >/dev/null
check "a 5-day-old last sweep is NOT healthy"         "f" "$(q "select healthy from public.ai_runs_retention_health();")"
q "delete from public.ai_runs_retention_sweeps;" >/dev/null
check "no sweep ever -> last_sweep_at is NULL, not 0" "NOROWS" "$(q "select last_sweep_at from public.ai_runs_retention_health();" | tok)"
check "no sweep ever -> NOT healthy"                  "f" "$(q "select healthy from public.ai_runs_retention_health();")"
as service_role "select public.run_ai_runs_retention_sweep();" >/dev/null
q "insert into cron.job_run_details (jobid, status, return_message) select jobid,'failed','boom' from cron.job where jobname='ai-runs-retention-daily';" >/dev/null
check "a FAILED cron run after the last sweep -> NOT healthy" "f" "$(q "select healthy from public.ai_runs_retention_health();")"
check "…and the failure time is surfaced, not swallowed" "1" "$(q "select (last_failure_at is not null)::int from public.ai_runs_retention_health();")"
q "delete from cron.job_run_details;" >/dev/null
q "delete from cron.job where jobname='ai-runs-retention-daily';" >/dev/null
check "job unscheduled -> NOT healthy even with a fresh sweep" "f" "$(q "select healthy from public.ai_runs_retention_health();")"
docker exec -i "$CT" psql -U postgres -q -c "select cron.schedule('ai-runs-retention-daily','17 3 * * *','select public.run_ai_runs_retention_sweep()');" >/dev/null

echo
echo "--- IDEMPOTENT RE-APPLY ---"
OUT2=$(apply "$MIGRATION")
if echo "$OUT2" | grep -qiE '^(ERROR|FATAL)'; then echo "$OUT2" | head -12; echo "RE-APPLY FAILED"; exit 1; fi
check "re-apply leaves exactly ONE job, not a duplicate" "1" "$(q "select count(*) from cron.job where jobname='ai-runs-retention-daily';")"
check "re-apply preserves telemetry history"             "1" "$(q "select (count(*) > 0)::int from public.ai_runs_retention_sweeps;")"

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
RB=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$RB" | grep -qiE '^(ERROR|FATAL)'; then echo "$RB" | head -12; echo "ROLLBACK FAILED"; exit 1; fi
check "ROLLBACK unschedules the job"        "0" "$(q "select count(*) from cron.job where jobname='ai-runs-retention-daily';")"
check "ROLLBACK drops the wrapper"          "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='run_ai_runs_retention_sweep';")"
check "ROLLBACK drops the telemetry table"  "0" "$(q "select count(*) from pg_class where relname='ai_runs_retention_sweeps';")"
check "ROLLBACK leaves the CAPABILITY intact (that is #1091's, not ours)" "1" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"
check "ROLLBACK leaves ai_runs append-only" "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs' and grantee<>'postgres' and privilege_type in ('UPDATE','DELETE');")"
check "already-redacted rows STAY redacted (rollback cannot resurrect)" "0" \
  "$(q "select count(*) from public.ai_runs where output_excerpt in ('OLD-A','OLD-B');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
