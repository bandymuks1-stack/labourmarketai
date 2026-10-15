#!/usr/bin/env bash
# Local PG16 test of the erasure v2 draft. Assumes a cluster is running on
# localhost:54329 (see TEST_PLAN.md). Recreates database "erasure" each run.
set -euo pipefail
export PATH="/c/Program Files/PostgreSQL/16/bin:$PATH"
cd "$(dirname "$0")"
P="psql -h localhost -p 54329 -U postgres -d erasure -v ON_ERROR_STOP=1 -q"
U=00000000-0000-0000-0000-0000000000a1
X=00000000-0000-0000-0000-0000000000a4

dropdb -h localhost -p 54329 -U postgres --if-exists erasure
createdb -h localhost -p 54329 -U postgres erasure
python gen_stub.py > stub_base.sql
for f in pre.sql stub_base.sql extra.sql ../migration_up.sql scenario.sql; do $P -f "$f" 2>&1 | grep -v NOTICE || true; done
echo "== migration + scenario loaded"

echo "== 1 prepare (dry run) — subject has no blockers, X is last owner"
$P -Atc "select public.privacy_erasure_prepare_v2('$U')->>'state'"
$P -Atc "select public.privacy_erasure_prepare_v2('$X')->'blockers'"

echo "== 2 execute X -> blocked, nothing touched"
JX=$($P -Atc "select id from public.privacy_erasure_jobs where subject_user_id='$X'")
$P -Atc "select public.privacy_erasure_execute_v2('$X', '$JX')->>'state'"
$P -Atc "select count(*) from public.profiles where id='$X'"

echo "== 3 execute subject"
J=$($P -Atc "select id from public.privacy_erasure_jobs where subject_user_id='$U'")
$P -Atc "select (r->>'state') || ' ops=' || jsonb_array_length(r->'storage_ops') from (select public.privacy_erasure_execute_v2('$U', '$J') r) s"
$P -f assert_after_execute.sql 2>&1 | grep -E "PASSED|ERROR"

echo "== 4 replay is idempotent"
$P -Atc "select public.privacy_erasure_execute_v2('$U', '$J')->>'replayed'"

echo "== 5 storage_done refuses while objects remain"
$P -Atc "select public.privacy_erasure_storage_done_v2('$J')"
echo "   (simulate the server: Storage API delete + move)"
$P -Atc "
  with ops as (select jsonb_array_elements(storage_ops) o from public.privacy_erasure_jobs where id='$J')
  update storage.objects s set name = ops.o->>'to', owner_id = null from ops
   where ops.o->>'op'='move' and s.bucket_id = ops.o->>'bucket' and s.name = ops.o->>'path';
  with ops as (select jsonb_array_elements(storage_ops) o from public.privacy_erasure_jobs where id='$J')
  delete from storage.objects s using ops where ops.o->>'op'='delete' and s.bucket_id = ops.o->>'bucket' and s.name = ops.o->>'path';"
$P -Atc "select public.privacy_erasure_storage_done_v2('$J')->>'state'"

echo "== 6 complete refuses while auth user exists, then succeeds"
$P -Atc "select public.privacy_erasure_complete_v2('$J')" 2>&1 | grep -o "auth user still exists" || true
$P -Atc "delete from auth.users where id='$U'"   # stands in for auth.admin.deleteUser
$P -Atc "select public.privacy_erasure_complete_v2('$J')->>'state'"
$P -Atc "select coalesce(subject_user_id::text,'<null>') || ' ops=' || coalesce(storage_ops::text,'<null>') || ' on=' || completed_on from public.privacy_erasure_jobs where id='$J'"
$P -Atc "select count(*) from public.privacy_erasure_jobs j where j::text like '%$U%'"

echo "== 7 drift guard: a new unclassified FK onto profiles blocks every erasure"
$P -c "create table public.new_feature (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id));"
$P -Atc "select public.privacy_erasure_blockers_v2('00000000-0000-0000-0000-0000000000a2')"
$P -c "drop table public.new_feature;"

echo "== 8 failure path: an error inside execute rolls back and marks the job failed"
$P -Atc "insert into auth.users values ('00000000-0000-0000-0000-0000000000a5','f@example.test');
  insert into public.profiles (id, email) values ('00000000-0000-0000-0000-0000000000a5','f@example.test');
  insert into public.customer_requests (profile_id, payload, status) values ('00000000-0000-0000-0000-0000000000a5', '{\"source\":\"privacy_self_service\",\"privacy_request_type\":\"account_deletion\"}', 'approved');
  insert into public.ai_runs (profile_id, output_excerpt) values ('00000000-0000-0000-0000-0000000000a5', 'x');
  alter table public.ai_runs add constraint test_force_failure check (profile_id is not null) not valid;" >/dev/null
$P -Atc "select public.privacy_erasure_prepare_v2('00000000-0000-0000-0000-0000000000a5')->>'state'"
JF=$($P -Atc "select id from public.privacy_erasure_jobs where subject_user_id='00000000-0000-0000-0000-0000000000a5'")
$P -Atc "select public.privacy_erasure_execute_v2('00000000-0000-0000-0000-0000000000a5', '$JF')"
$P -Atc "select state || ' ' || last_error || ' profile_kept=' || (select count(*) from public.profiles where id='00000000-0000-0000-0000-0000000000a5') || ' disabled_triggers=' || (select count(*) from pg_trigger where not tgisinternal and tgenabled='D') from public.privacy_erasure_jobs where id='$JF'"

$P -c "alter table public.ai_runs drop constraint test_force_failure;"
echo "   retry after the cause is fixed (resumable):"
$P -Atc "select public.privacy_erasure_execute_v2('00000000-0000-0000-0000-0000000000a5', '$JF')->>'state'"
echo "== 9 grants: no API role can execute"
$P -Atc "select string_agg(r || ':' || has_function_privilege(r, 'public.privacy_erasure_execute_v2(uuid,uuid)', 'execute')::text, ' ') from unnest(array['anon','authenticated','service_role']) r"

echo "== 10 rollback refuses after a completed job"
$P -f ../migration_down.sql 2>&1 | grep -E "ERROR|refus" | head -2 || true
echo "== done"
