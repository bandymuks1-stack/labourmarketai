-- DISPOSABLE LOCAL DATABASE ONLY: no project database, no customer data.
-- Minimal fixture tests actual owner RLS + this draft; not the whole Supabase stack.
-- psql -X -v ON_ERROR_STOP=1 -c "set lm.test_disposable='public-services-20261125'" -f THIS_FILE
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
create table auth.users (id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}');
create table public.profiles (id uuid primary key references auth.users(id));
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
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
-- The actual existing owner-scoped CRUD policies and grants.
\ir ../migrations/20260627121713_service_offerings.sql
alter table public.service_offerings add column expires_at timestamptz;
alter table public.service_offerings add column closed_outcome text;
alter table public.service_offerings drop constraint service_offerings_status_check;
alter table public.service_offerings add constraint service_offerings_status_check check(status in('draft','active','paused','closed'));
-- Member discovery predicate from 20261003150300.
create policy service_offerings_discover_active on public.service_offerings
 for select to authenticated using(status='active' and(expires_at is null or expires_at>now()));
-- Canonical helper body from 20261028123000; only this dependency is needed.
create function public.is_synthetic_fixture_label_v1(variadic p_values text[])
returns boolean language sql immutable parallel safe set search_path to 'pg_catalog'
as $function$
 select coalesce(bool_or(v ~* '\yQA[-_ ]SYNTHETIC\y' or v ~* '\[E2E\]' or v ~* '\yE2E[-_ ]FIXTURE\y'),false)
 from unnest(p_values) as v where v is not null and v<>''
$function$;
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001','one@local.test','{}'),
 ('00000000-0000-4000-8000-000000000002','two@local.test','{}'),
 ('00000000-0000-4000-8000-000000000003','synthetic@local.test','{"qa_synthetic":true}'),
 ('00000000-0000-4000-8000-000000000004','qa.public-service@labourmarket.ai','{}');
insert into public.profiles select id from auth.users;
insert into public.service_offerings(id,provider_id,title,status) values
 ('10000000-0000-4000-8000-000000000900','00000000-0000-4000-8000-000000000001','Existing active offer','active');
\ir ../migrations/20261125133404_public_personal_service_search_v1.sql
do $test$ begin
 if (select public_search_enabled from public.service_offerings where id='10000000-0000-4000-8000-000000000900') is distinct from false
 then raise exception 'FAIL existing offer opted in'; end if;
 if has_table_privilege('anon','public.service_offerings','select') or has_table_privilege('anon','auth.users','select')
 then raise exception 'FAIL raw anonymous table grant'; end if;
 if exists(select from public.audit_logs where entity='service_offerings')
 then raise exception 'FAIL fabricated pre-migration history'; end if;
 if has_function_privilege('anon','public.service_offering_history_v1()','execute')
 or has_function_privilege('authenticated','public.service_offering_history_v1()','execute')
 or has_table_privilege('anon','public.audit_logs','select')
 then raise exception 'FAIL history RPC or public audit read exposed'; end if;
 raise notice 'PASS old rows default off, no historical backfill, and no raw-table/history grants';
end $test$;
-- Invented visible rows omit fixture markers because exclusion itself is tested.
insert into public.service_offerings
 (id,provider_id,title,description,category_slug,location_country,rate_text,status,public_search_enabled,expires_at,created_at)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('00000000-0000-4000-8000-'||lpad((case n when 12 then 3 when 13 then 4 when 2 then 2 else 1 end)::text,12,'0'))::uuid,
 case n when 8 then '[E2E] invisible' else 'Repair '||n end,
 case n when 9 then 'QA-SYNTHETIC invisible' else 'woodwork' end,
 case n when 10 then 'E2E_FIXTURE' when 2 then 'Plumbing' else 'Furniture Repair' end,
 case n when 2 then 'DE' else 'LT' end,
 case n when 11 then '[E2E]' else 'By agreement' end,
 case n when 4 then 'draft' when 5 then 'paused' when 6 then 'closed' else 'active' end,
 n<>3,
 case n when 7 then now()-interval '1 minute' when 14 then now()+interval '1 day' else null end,
 '2026-11-25 10:00Z'::timestamptz
from generate_series(1,14) n;
set role anon;
do $test$
declare ids uuid[]; keys text[];
begin
 select array_agg(id order by id) into ids from public.search_public_service_offerings_v1();
 if ids is distinct from array['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000014'::uuid]
 then raise exception 'FAIL visibility %',ids; end if;
 for i in 3..13 loop
  if exists(select from public.get_public_service_offering_v1(('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid))
  then raise exception 'FAIL hidden detail %',i; end if;
 end loop;
 select array_agg(k order by k) into keys
 from public.get_public_service_offering_v1('10000000-0000-4000-8000-000000000001') r,
 lateral jsonb_object_keys(to_jsonb(r)) k;
 if keys is distinct from array['category_slug','created_at','description','id','location_country','rate_text','remote','title']
 then raise exception 'FAIL projection %',keys; end if;
 if exists(select from public.get_public_service_offering_v1(null)) then raise exception 'FAIL null detail'; end if;
 raise notice 'PASS opt-in + active + expiry + four label fields + synthetic providers + exact projection';
 if (select count(*) from public.search_public_service_offerings_v1(p_country=>' lt ',p_category=>'REPAIR'))<>2
 or (select count(*) from public.search_public_service_offerings_v1(p_query=>'Plumbing'))<>1
 or (select count(*) from public.search_public_service_offerings_v1(p_country=>'Lithuania'))<>0
 or (select count(*) from public.search_public_service_offerings_v1(p_query=>'%'))<>0
 or (select count(*) from public.search_public_service_offerings_v1(p_query=>''' OR true --'))<>0
 then raise exception 'FAIL literal filter semantics'; end if;
 begin
  perform provider_id from public.get_public_service_offering_v1('10000000-0000-4000-8000-000000000001');
  raise exception 'FAIL provider identity reachable';
 exception when undefined_column then null; end;
 begin perform 1 from public.service_offerings; raise exception 'FAIL raw table readable';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS literal filters and anonymous private-field/table denial';
end $test$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $test$ declare changed integer; begin
 update public.service_offerings set public_search_enabled=false where id='10000000-0000-4000-8000-000000000002';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'FAIL other owner update'; end if;
 update public.service_offerings set public_search_enabled=false where id='10000000-0000-4000-8000-000000000001';
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'FAIL owner opt-out'; end if;
 begin
  update public.service_offerings set provider_id='00000000-0000-4000-8000-000000000002' where id='10000000-0000-4000-8000-000000000001';
  raise exception 'FAIL ownership transfer';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.service_offerings(provider_id,title,public_search_enabled)
  values('00000000-0000-4000-8000-000000000002','Unauthorized',true);
  raise exception 'FAIL insert for other owner';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS existing owner-only writes and no ownership transfer';
end $test$;
reset role;
set role anon;
do $test$ begin
 if exists(select from public.get_public_service_offering_v1('10000000-0000-4000-8000-000000000001'))
 then raise exception 'FAIL opted-out detail still public'; end if;
 raise notice 'PASS immediate opt-out';
end $test$;
reset role;
-- A real authenticated owner's successful actions accumulate separate facts.
-- Free text below is invented, and must never be copied into the audit payload.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into public.service_offerings(id,provider_id,title,description,status)
 values('10000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000001',
        'private-old-title','private-old-contact@local.invalid','draft');
update public.service_offerings set status='active' where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set public_search_enabled=true where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set title='private-new-title',description='private-new-contact@local.invalid'
 where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set status='paused' where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set status='active' where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set expires_at='2026-12-25 00:00Z' where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set status='closed',closed_outcome='completed'
 where id='10000000-0000-4000-8000-000000000801';
update public.service_offerings set title=title,updated_at=now()+interval '1 second'
 where id='10000000-0000-4000-8000-000000000801';
delete from public.service_offerings where id='10000000-0000-4000-8000-000000000801';
do $test$ begin
 if exists(select from public.audit_logs) then raise exception 'FAIL owner can read audit rows'; end if;
 begin
  insert into public.audit_logs(action,entity,entity_id) values('forged','service_offerings','10000000-0000-4000-8000-000000000801');
  raise exception 'FAIL owner can forge history';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
do $test$ begin
 if (select count(*) from public.audit_logs where entity='service_offerings'
     and entity_id='10000000-0000-4000-8000-000000000801')<>9
 then raise exception 'FAIL history did not accumulate or no-op created an event'; end if;
 if exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000801'
           and (actor_id is distinct from '00000000-0000-4000-8000-000000000001'::uuid
                or payload::text like '%private-%'))
 then raise exception 'FAIL wrong history actor or private text copied'; end if;
 if not exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000801'
               and action='service_offering_created' and payload->'from_state'='null'::jsonb
               and payload#>>'{to_state,status}'='draft')
 or not exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000801'
               and payload->'changed_fields'='["public_search_enabled"]'::jsonb
               and payload#>>'{from_state,public_search_enabled}'='false'
               and payload#>>'{to_state,public_search_enabled}'='true')
 or not exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000801'
               and payload->'changed_fields'='["description","title"]'::jsonb)
 or not exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000801'
               and action='service_offering_deleted' and payload->'to_state'='null'::jsonb
               and payload#>>'{from_state,status}'='closed'
               and payload#>>'{from_state,closed_outcome}'='completed')
 or exists(select from public.service_offerings where id='10000000-0000-4000-8000-000000000801')
 then raise exception 'FAIL retained lifecycle/publication/edit/delete facts'; end if;
 raise notice 'PASS atomic owner history accumulates through DELETE, excludes private text, ignores no-ops and remains admin-only';
end $test$;

-- Existing provider FK cascades must remain compatible with profile erasure:
-- actor references are nullable, including the delete event made by the cascade.
insert into auth.users values('00000000-0000-4000-8000-000000000005','erasure@local.test','{}');
insert into public.profiles values('00000000-0000-4000-8000-000000000005');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
insert into public.service_offerings(id,provider_id,title,status)
 values('10000000-0000-4000-8000-000000000821','00000000-0000-4000-8000-000000000005','Cascade fixture','draft');
reset role;
delete from public.profiles where id='00000000-0000-4000-8000-000000000005';
do $test$ begin
 if exists(select from public.service_offerings where id='10000000-0000-4000-8000-000000000821')
 or (select count(*) from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000821')<>2
 or exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000821' and actor_id is not null)
 then raise exception 'FAIL profile cascade blocked or erased minimal offering history'; end if;
 raise notice 'PASS profile cascade retains minimal history and severs actor identity';
end $test$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

-- Fail an actual audit append. Each otherwise-authorized original statement
-- must roll back too; a separate best-effort append would fail these tests.
set role authenticated;
insert into public.service_offerings(id,provider_id,title,status)
 values('10000000-0000-4000-8000-000000000811','00000000-0000-4000-8000-000000000001','Atomic original','draft');
reset role;
alter table public.audit_logs add constraint test_reject_service_history
 check(entity_id not in ('10000000-0000-4000-8000-000000000811'::uuid,'10000000-0000-4000-8000-000000000812'::uuid)) not valid;
set role authenticated;
do $test$ declare failure_constraint text; begin
 begin
  update public.service_offerings set public_search_enabled=true where id='10000000-0000-4000-8000-000000000811';
  raise exception 'FAIL update survived audit failure';
 exception when check_violation then
  get stacked diagnostics failure_constraint=constraint_name;
  if failure_constraint<>'test_reject_service_history' then raise; end if;
 end;
 begin
  insert into public.service_offerings(id,provider_id,title,status)
   values('10000000-0000-4000-8000-000000000812','00000000-0000-4000-8000-000000000001','Atomic refused','draft');
  raise exception 'FAIL insert survived audit failure';
 exception when check_violation then
  get stacked diagnostics failure_constraint=constraint_name;
  if failure_constraint<>'test_reject_service_history' then raise; end if;
 end;
 begin
  delete from public.service_offerings where id='10000000-0000-4000-8000-000000000811';
  raise exception 'FAIL delete survived audit failure';
 exception when check_violation then
  get stacked diagnostics failure_constraint=constraint_name;
  if failure_constraint<>'test_reject_service_history' then raise; end if;
 end;
 if not exists(select from public.service_offerings where id='10000000-0000-4000-8000-000000000811'
               and public_search_enabled=false and status='draft')
 or exists(select from public.service_offerings where id='10000000-0000-4000-8000-000000000812')
 then raise exception 'FAIL original row changes were not rolled back'; end if;
end $test$;
reset role;
do $test$ begin
 if (select count(*) from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000811')<>1
 or exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000812')
 then raise exception 'FAIL failed mutation retained an audit row'; end if;
 raise notice 'PASS audit failure rolls back authorized INSERT, UPDATE and DELETE atomically';
end $test$;
alter table public.audit_logs drop constraint test_reject_service_history;
insert into public.service_offerings(id,provider_id,title,status,public_search_enabled,created_at)
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000001','Bounded service '||n,'active',true,'2026-11-26 10:00Z'
from generate_series(1,610)n;
set role anon;
do $test$ declare first_id uuid; capped_id uuid; begin
 if (select count(*) from public.search_public_service_offerings_v1(p_limit=>2147483647))<>7
 or (select count(*) from public.search_public_service_offerings_v1(p_limit=>-5))<>1
 or (select count(*) from public.search_public_service_offerings_v1(p_limit=>null))<>7
 then raise exception 'FAIL output limit'; end if;
 select id into first_id from public.search_public_service_offerings_v1(p_limit=>1,p_offset=>-10);
 select id into capped_id from public.search_public_service_offerings_v1(p_limit=>1,p_offset=>2147483647);
 if first_id<>'20000000-0000-4000-8000-000000000001'::uuid or capped_id<>'20000000-0000-4000-8000-000000000595'::uuid
 then raise exception 'FAIL pagination % / %',first_id,capped_id; end if;
 if exists(select id from public.search_public_service_offerings_v1(p_limit=>6,p_offset=>0)
 intersect select id from public.search_public_service_offerings_v1(p_limit=>6,p_offset=>6))
 then raise exception 'FAIL duplicate across pages'; end if;
 raise notice 'PASS limit/offset caps and deterministic nonoverlapping pages';
end $test$;
reset role;
create temporary table saved_service_history as select * from public.audit_logs;
\ir ../rollbacks/20261125133404_public_personal_service_search_v1.down.sql
do $test$ begin
 if to_regprocedure('public.get_public_service_offering_v1(uuid)') is not null
 or to_regprocedure('public.search_public_service_offerings_v1(text,text,text,integer,integer,uuid)') is not null
 then raise exception 'FAIL rollback readers remain'; end if;
 if (select public_search_enabled from public.service_offerings where id='10000000-0000-4000-8000-000000000002') is distinct from true
 or (select public_search_enabled from public.service_offerings where id='10000000-0000-4000-8000-000000000001') is distinct from false
 then raise exception 'FAIL choices lost on rollback'; end if;
 if to_regprocedure('public.service_offering_history_v1()') is not null
 or exists(select from pg_catalog.pg_trigger where tgrelid='public.service_offerings'::regclass and tgname='service_offering_history_v1')
 then raise exception 'FAIL rollback retained history writer'; end if;
 if exists((select * from public.audit_logs except select * from saved_service_history)
           union all (select * from saved_service_history except select * from public.audit_logs))
 then raise exception 'FAIL rollback changed accumulated history'; end if;
 raise notice 'PASS rollback removes readers and writer, retaining owner choices and accumulated history';
end $test$;
\ir ../migrations/20261125133404_public_personal_service_search_v1.sql
set role anon;
do $test$ begin
 if not exists(select from public.get_public_service_offering_v1('10000000-0000-4000-8000-000000000002'))
 or exists(select from public.get_public_service_offering_v1('10000000-0000-4000-8000-000000000001'))
 or exists(select from public.get_public_service_offering_v1('10000000-0000-4000-8000-000000000900'))
 then raise exception 'FAIL reapply changes choices'; end if;
 raise notice 'PASS reapply restores only explicitly retained public choices';
end $test$;
reset role;

do $test$ begin
 if exists((select * from public.audit_logs except select * from saved_service_history)
           union all (select * from saved_service_history except select * from public.audit_logs))
 then raise exception 'FAIL reapply fabricated or lost history'; end if;
end $test$;
set role authenticated;
update public.service_offerings set status='paused' where id='10000000-0000-4000-8000-000000000900';
reset role;
do $test$ begin
 if (select count(*) from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000900')<>1
 or not exists(select from public.audit_logs where entity_id='10000000-0000-4000-8000-000000000900'
               and action='service_offering_changed'
               and payload#>>'{from_state,status}'='active' and payload#>>'{to_state,status}'='paused')
 then raise exception 'FAIL reapply did not resume prospective history'; end if;
 raise notice 'PASS reapply preserves old history without backfill and resumes prospective appends';
end $test$;
