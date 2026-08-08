#!/usr/bin/env bash
# ============================================================================
# W14 item 6 — ai_runs retention redaction: REAL per-role behaviour proof.
#
# Expects a THROWAWAY Postgres 15 container named $CT to be running. Loads the
# faithful harness (prelude = the real 20260714150000 append-only posture),
# then measures BEFORE / AFTER executing VERBATIM
#   supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql
#   supabase/rollbacks/20260808130000_ai_runs_retention_redaction_v1.down.sql
#
# Every probe runs under a REAL role (`set local role service_role` /
# `authenticated` / `anon`), never as the superuser, so grants and RLS actually
# decide. Nothing here re-implements the migration.
#
# Never point this at production or at a shared local Supabase stack.
# ============================================================================
set -uo pipefail

CT=${CT:-w14-retention-proof}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260808130000_ai_runs_retention_redaction_v1.down.sql"

R10='11110000-0000-4000-8000-000000000010'
R89='11110000-0000-4000-8000-000000000089'
R90='11110000-0000-4000-8000-000000000090'
R91='11110000-0000-4000-8000-000000000091'

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

as() { # $1=role  $2=sql
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
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

excerpt() { q "select coalesce(output_excerpt,'<NULL>') from public.ai_runs where id='$1';"; }
audit_fp() { q "select task_type||'/'||provider||'/'||model_alias||'/'||input_tokens||'/'||output_tokens||'/'||actual_cost_usd||'/'||estimated_cost_usd||'/'||route_reason from public.ai_runs where id='$1';"; }

echo "=============================================================="
echo " W14 item 6 — ai_runs retention redaction proof"
echo "=============================================================="
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT not ready"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w14-ai-runs-retention.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w14-ai-runs-retention.seed.sql"   >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

FP10=$(audit_fp "$R10"); FP90=$(audit_fp "$R90"); FP91=$(audit_fp "$R91")

echo
echo "--- BEFORE: the append-only posture the table exists to provide ---"
check "service_role has NO table UPDATE"  "REFUSED" "$(as service_role "update public.ai_runs set output_excerpt='x' where id='$R91';" | tok)"
check "service_role has NO table DELETE"  "REFUSED" "$(as service_role "delete from public.ai_runs where id='$R91';" | tok)"
check "no retention function exists yet"  "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$APPLY_OUT" | head -10; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"

echo
echo "--- §5 SECURITY CONTRACT: who may do what ---"
check "ordinary service_role: still NO unrestricted UPDATE on ai_runs" "REFUSED" "$(as service_role "update public.ai_runs set output_excerpt='x' where id='$R91';" | tok)"
check "ordinary service_role: still NO DELETE on ai_runs"              "REFUSED" "$(as service_role "delete from public.ai_runs where id='$R91';" | tok)"
# The table OWNER (`postgres`) always holds every privilege implicitly — that is
# not a grant this migration made, it cannot be revoked away, and it is exactly
# what lets the SECURITY DEFINER function work at all. The property that
# matters is that no NON-OWNER role gained UPDATE or DELETE.
check "no UPDATE/DELETE grant for any NON-OWNER role" "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs' and grantee<>'postgres' and privilege_type in ('UPDATE','DELETE');")"
check "the exact grant matrix on ai_runs is unchanged" \
  "authenticated:SELECT|service_role:INSERT|service_role:SELECT" \
  "$(q "select string_agg(grantee||':'||privilege_type, '|' order by grantee, privilege_type) from information_schema.role_table_grants where table_name='ai_runs' and grantee<>'postgres';")"
check "anon holds NOTHING on ai_runs" "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs' and grantee='anon';")"
check "authenticated CANNOT invoke the retention capability" "REFUSED" "$(as authenticated "select public.redact_expired_ai_run_content();" | tok)"
check "anon CANNOT invoke the retention capability"          "REFUSED" "$(as anon          "select public.redact_expired_ai_run_content();" | tok)"
check "service_role CAN invoke it (EXECUTE granted)"         "1" \
  "$(q "select has_function_privilege('service_role','public.redact_expired_ai_run_content(integer)','execute')::int;")"
check "authenticated holds NO execute on the retention fn"   "0" \
  "$(q "select has_function_privilege('authenticated','public.redact_expired_ai_run_content(integer)','execute')::int;")"
check "anon holds NO execute on the retention fn"            "0" \
  "$(q "select has_function_privilege('anon','public.redact_expired_ai_run_content(integer)','execute')::int;")"
check "the function is SECURITY DEFINER with a pinned search_path" "1" \
  "$(q "select (p.prosecdef and array_to_string(p.proconfig,',') like '%search_path=public%')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"

echo
echo "--- §6 RETENTION BOUNDARY ---"
# EXACT BOUNDARY SEMANTICS, measured rather than assumed.
#   predicate: created_at < now() - make_interval(days => 90)
#   `now()` is the RUNNING transaction's clock, so "90 days old" means 90 days
#   old AT EXECUTION TIME. The 90d fixture row is seeded some milliseconds
#   before the sweep runs, so by the time the predicate is evaluated its age is
#   90 days + those milliseconds and it IS eligible. That matches the owner
#   contract ">= 90-day eligible row -> redacted"; only a row whose age is
#   strictly under 90 days survives, and the 89-day row proves that edge.
N1=$(as service_role "select public.redact_expired_ai_run_content();" | tok)
echo "  first run redacted: $N1"
check "first run redacts exactly the eligible rows (90d + 91d)" "2" "$N1"
check "10-day row  PRESERVED"  "KEEP-10d model output"  "$(excerpt "$R10")"
check "89-day row  PRESERVED (the last day inside the horizon)" "KEEP-89d model output" "$(excerpt "$R89")"
check "90-day row  REDACTED (>= 90d at execution time is eligible)" "<NULL>" "$(excerpt "$R90")"
check "91-day row  REDACTED"   "<NULL>"                 "$(excerpt "$R91")"
check "audit identity + tokens + cost PRESERVED on the 90d row too" "$FP90" "$(audit_fp "$R90")"
check "audit identity + tokens + cost PRESERVED on the redacted row" "$FP91" "$(audit_fp "$R91")"
check "untouched row is byte-identical"                 "$FP10" "$(audit_fp "$R10")"
check "NO row was deleted"     "5" "$(q "select count(*) from public.ai_runs;")"

N2=$(as service_role "select public.redact_expired_ai_run_content();" | tok)
check "IDEMPOTENT: re-run redacts 0 more"               "0" "$N2"
check "IDEMPOTENT: still 5 rows"                        "5" "$(q "select count(*) from public.ai_runs;")"

echo
echo "--- §6 REFUSALS ---"
check "shortening the horizon below 90 is REFUSED"      "REFUSED" "$(as service_role "select public.redact_expired_ai_run_content(30);" | tok)"
check "shortening to 89 is REFUSED"                     "REFUSED" "$(as service_role "select public.redact_expired_ai_run_content(89);" | tok)"
check "90 is accepted (the approved horizon itself)"    "0"       "$(as service_role "select public.redact_expired_ai_run_content(90);" | tok)"
check "LENGTHENING to 365 is allowed and redacts nothing new" "0" "$(as service_role "select public.redact_expired_ai_run_content(365);" | tok)"
check "after every refusal the 89-day content SURVIVES" "KEEP-89d model output" "$(excerpt "$R89")"
check "unapproved field mutation has no path: only output_excerpt is assigned" "1" \
  "$(q "select (position('set output_excerpt = null' in pg_get_functiondef(p.oid)) > 0 and (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid),' set ','')))/5 = 1)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"
check "the function body contains NO delete statement"  "0" \
  "$(q "select (position(' delete ' in lower(pg_get_functiondef(p.oid))) > 0)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"
check "the approved horizon reads 90"                   "90" "$(q "select public.ai_runs_retention_days();")"

echo
echo "--- 0-ELIGIBLE-ROWS PATH (the scheduler's normal day) ---"
docker exec -i "$CT" psql -U postgres -q -f - < "$HERE/w14-ai-runs-retention.seed.sql" >/dev/null
as service_role "select public.redact_expired_ai_run_content();" >/dev/null
check "second sweep over a swept table returns 0, not an error" "0" "$(as service_role "select public.redact_expired_ai_run_content();" | tok)"
q "delete from public.ai_runs;" >/dev/null
check "empty table returns 0 rows redacted (success, not failure)" "0" "$(as service_role "select public.redact_expired_ai_run_content();" | tok)"

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
RB_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$RB_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RB_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "ROLLBACK removes the capability"      "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"
check "ROLLBACK leaves ai_runs append-only"  "0" "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs' and grantee<>'postgres' and privilege_type in ('UPDATE','DELETE');")"

echo
echo "--- RE-APPLY ---"
RE_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$RE_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RE_OUT" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "RE-APPLY: capability restored"        "1" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redact_expired_ai_run_content';")"
check "RE-APPLY: still no non-owner UPDATE/DELETE grant" "0" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='ai_runs' and grantee<>'postgres' and privilege_type in ('UPDATE','DELETE');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
