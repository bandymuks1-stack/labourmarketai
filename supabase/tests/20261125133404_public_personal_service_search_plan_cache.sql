-- DISPOSABLE LOCAL PLAN-CACHE PROOF. Never run against a project database.
-- Minimal invented data: 100,000 offerings / 1,000 providers, 10% opt-in,
-- mixed lifecycle/expiry/countries and no real identities or project secrets.
-- Mirrors the repeated-call rule in scripts/db-proof/plan-cache-probe.sql.
-- Run on one fresh loopback connection, with the same explicit marker as the
-- service visibility regression. This is local fixture evidence, not an SLA.
-- Only the proven created-at index remains in the draft. Repeated-call timings
-- and actual nested plans below are followed by targeted index/choice rollback
-- and reapply checks; the separate visibility suite is not repeated here.
-- Recorded 2026-11-25, final single-index PG16 fixture:
-- 100000 offers / 1000 providers / 7792 indexed-public-active / 5195 eligible.
-- 320 RPC calls (8 terms x 10 calls x 2 shapes x 2 plan modes).
-- First-page worst: auto164.0ms / force_generic_plan167.1ms.
-- LT+repair+offset594 worst: auto161.5ms / force_generic_plan330.0ms.
-- Four actual warmed SQL-function nested plans chose a bitmap scan of
-- service_offerings_public_created_idx and checked providers via users_pkey.
-- Not a production SLA, a large-scale proof, or a bounded physical scan claim.
\set ON_ERROR_STOP on
do $guard$ begin
 if current_database() <> 'lm_public_service_draft_test'
    or inet_server_addr() is distinct from inet '127.0.0.1'
    or current_setting('lm.test_disposable',true) is distinct from 'public-services-20261125'
    or to_regclass('public.service_offerings') is not null then
   raise exception 'Requires fresh explicitly marked disposable loopback database';
 end if;
end $guard$;
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth,public to anon,authenticated;
create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}');
create table public.profiles(id uuid primary key references auth.users(id));
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function public.is_admin() returns boolean language sql stable as $$select false$$;
-- Exact canonical audit columns and admin-only policies from 0001.
-- This is a disposable fixture, not a new production audit table.
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references public.profiles(id) on delete set null,
 action text, entity text, entity_id uuid, payload jsonb,
 occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select using(public.is_admin());
create policy audit_logs_insert on public.audit_logs for insert with check(public.is_admin());
grant select,insert,update,delete on public.audit_logs to authenticated;
\ir ../migrations/20260627121713_service_offerings.sql
alter table public.service_offerings add column expires_at timestamptz;
alter table public.service_offerings add column closed_outcome text;
create function public.is_synthetic_fixture_label_v1(variadic p_values text[])
returns boolean language sql immutable parallel safe set search_path to 'pg_catalog'
as $function$
 select coalesce(bool_or(v ~* '\yQA[-_ ]SYNTHETIC\y' or v ~* '\[E2E\]' or v ~* '\yE2E[-_ ]FIXTURE\y'),false)
 from unnest(p_values) as v where v is not null and v<>''
$function$;
\ir ../migrations/20261125133404_public_personal_service_search_v1.sql
insert into auth.users
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       'provider-'||n||'@local.test','{}'::jsonb
from generate_series(1,1000)n;
insert into public.profiles select id from auth.users;
insert into public.service_offerings
 (id,provider_id,title,description,category_slug,location_country,status,public_search_enabled,expires_at,created_at)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-'||lpad((1+(n%1000))::text,12,'0'))::uuid,
       (array['Furniture repair','Plumbing','Translation','Roofing','Home care'])[1+((n/100)%5)],
       'Independent local service by agreement',
       (array['repair','plumbing','translation','roofing','care'])[1+((n/100)%5)],
       (array['LT','DE','PL','NL','SE'])[1+((n/10)%5)],
       case when n%7=0 then 'paused' when n%11=0 then 'draft' else 'active' end,
       n%10=0,
       case when n%3=0 then now()-interval '1 day' else null end,
       '2026-11-25 00:00Z'::timestamptz-(n||' seconds')::interval
from generate_series(1,100000)n;
analyze auth.users;
analyze public.service_offerings;
select count(*) as fixture_rows,
       count(*) filter(where public_search_enabled and status='active') as indexed_public_active,
       count(*) filter(where public_search_enabled and status='active' and(expires_at is null or expires_at>now())) as eligible_public
from public.service_offerings;

set role anon;

-- Literal short/mid/whole, missing and wildcard-character terms. Both bounded
-- first-page and deep country/category cases measure the final single-index draft.
\set terms '{"","a","re","rep","repair","plumbing","zz-no-match","%"}'
\set call 'select count(*) from public.search_public_service_offerings_v1(%L,null,null,7,0,null)'
\ir ../../scripts/db-proof/plan-cache-probe.sql
\set call 'select count(*) from public.search_public_service_offerings_v1(%L,''LT'',''repair'',7,594,null)'
\ir ../../scripts/db-proof/plan-cache-probe.sql
reset role;

-- Observe the actual function's nested plans on this same warmed connection.
-- auto_explain exposes the ACTUAL SQL-function inner plan (outer EXPLAIN only
-- says Function Scan). Log these calls AFTER the repeated-call timings.
load 'auto_explain';
set auto_explain.log_min_duration='1ms';
set auto_explain.log_analyze=on;
set auto_explain.log_buffers=on;
set auto_explain.log_nested_statements=on;
set auto_explain.log_timing=off;
set role anon;
begin read only;
set local plan_cache_mode=auto;
explain(analyze,buffers,timing off) select * from public.search_public_service_offerings_v1(null,null,null,7,594,null);
explain(analyze,buffers,timing off) select * from public.search_public_service_offerings_v1('repair','LT',null,7,594,null);
set local plan_cache_mode=force_generic_plan;
explain(analyze,buffers,timing off) select * from public.search_public_service_offerings_v1(null,null,null,7,594,null);
explain(analyze,buffers,timing off) select * from public.search_public_service_offerings_v1('repair','LT',null,7,594,null);
rollback;
reset role;
set auto_explain.log_min_duration=-1;

-- Only the changed index/rollback/reapply surface is checked here.
create temporary table plan_proof_choices as
 select count(*) filter(where public_search_enabled) as enabled,
        count(*) filter(where not public_search_enabled) as disabled
 from public.service_offerings;
do $test$ begin
 if to_regclass('public.service_offerings_public_created_idx') is null
    or to_regclass('public.service_offerings_public_country_created_idx') is not null then
   raise exception 'FAIL final draft must contain only the proven created index';
 end if;
end $test$;
\ir ../rollbacks/20261125133404_public_personal_service_search_v1.down.sql
do $test$ begin
 if to_regclass('public.service_offerings_public_created_idx') is not null
    or to_regprocedure('public.search_public_service_offerings_v1(text,text,text,integer,integer,uuid)') is not null
    or to_regprocedure('public.get_public_service_offering_v1(uuid)') is not null then
   raise exception 'FAIL rollback left the public index or readers';
 end if;
 if exists(
   select count(*) filter(where public_search_enabled),count(*) filter(where not public_search_enabled)
   from public.service_offerings
   except select enabled,disabled from plan_proof_choices
 ) then raise exception 'FAIL rollback changed saved owner choices'; end if;
 raise notice 'PASS final-index rollback removes public readers/index and retains owner choices';
end $test$;
\ir ../migrations/20261125133404_public_personal_service_search_v1.sql
do $test$ begin
 if to_regclass('public.service_offerings_public_created_idx') is null
    or to_regclass('public.service_offerings_public_country_created_idx') is not null then
   raise exception 'FAIL reapply index inventory';
 end if;
 if exists(
   select count(*) filter(where public_search_enabled),count(*) filter(where not public_search_enabled)
   from public.service_offerings
   except select enabled,disabled from plan_proof_choices
 ) then raise exception 'FAIL reapply changed saved owner choices'; end if;
 raise notice 'PASS final-index reapply restores only the created index and retains owner choices';
end $test$;
set role anon;
do $test$ begin
 if (select count(*) from public.search_public_service_offerings_v1())<>7 then
   raise exception 'FAIL public read unavailable after reapply';
 end if;
 raise notice 'PASS public reader availability after reapply';
end $test$;
reset role;
