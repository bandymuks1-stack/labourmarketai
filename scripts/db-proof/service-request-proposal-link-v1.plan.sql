-- Scratch fixture with invented profile, offering and request IDs from the existing proof.
-- All fixture writes and the RPC timing below run only in the isolated test database.
\set ON_ERROR_STOP 1
insert into public.service_offering_requests (id,offering_id,provider_id,buyer_id,status)
select md5('srpl-request-' || g)::uuid,'b0000000-0000-0000-0000-000000000001',
       'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','accepted'
from generate_series(1,20000) as g;
insert into public.proposals (owner_id,service_offering_request_id,title,status)
select provider_id,id,'Synthetic offer',
       case when row_number() over (order by id) % 4 = 0 then 'withdrawn' else 'draft' end
from public.service_offering_requests
where id not in ('c0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000d');
analyze public.proposals;
analyze public.service_offering_requests;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false);
-- Compile the exact lookup from the installed function into a scratch PL/pgSQL
-- wrapper. Each call reuses the nested plan, including after the fifth call.
do $fixture$
declare
  v_lookup text;
begin
  select substring(prosrc from '(select id into v_id[[:space:]]+from public\.proposals.*?limit 1;)')
  into strict v_lookup from pg_proc
  where oid='public.create_proposal_from_service_request_v1(uuid,text,bigint,text,text,date)'::regprocedure;
  if v_lookup is null then raise exception 'installed open-offer lookup changed'; end if;
  execute format(
    'create function pg_temp.open_offer_lookup(p_request_id uuid) returns uuid language plpgsql stable as %L',
    'declare v_id uuid; v_uid uuid := auth.uid(); begin ' || v_lookup || ' return v_id; end;'
  );
end $fixture$;
select (select min(service_offering_request_id::text) from public.proposals where status='draft') as hit,
       (select min(service_offering_request_id::text) from public.proposals where status='withdrawn') as closed,
       'ffffffff-ffff-ffff-ffff-ffffffffffff'::text as missing
\gset
select format('{%s,%s,%s}', :'hit', :'closed', :'missing') as terms
\gset
\set call 'select pg_temp.open_offer_lookup(%L::uuid)'
\ir plan-cache-probe.sql
-- The production RPC also takes a row lock and cannot run in READ ONLY mode.
-- Repeat its reopen path for the same accepted request without changing the proposal.
select set_config('probe.hit', :'hit', false);
do $rpc$
declare
  v_mode text;
  v_req uuid := current_setting('probe.hit')::uuid;
  v_expected uuid := pg_temp.open_offer_lookup(v_req);
  v_start timestamptz;
  v_worst numeric;
  v_result uuid;
begin
  if v_expected is null then raise exception 'fixture requires an open offer'; end if;
  foreach v_mode in array array['auto','force_generic_plan'] loop
    perform set_config('plan_cache_mode', v_mode, true);
    v_worst := 0;
    for i in 1..10 loop
      v_start := clock_timestamp();
      v_result := public.create_proposal_from_service_request_v1(v_req,'Existing',0);
      v_worst := greatest(v_worst, extract(epoch from clock_timestamp()-v_start)*1000);
      if v_result is distinct from v_expected then raise exception 'RPC returned the wrong offer'; end if;
    end loop;
    raise notice 'RPC mode=% calls=10 worst_ms=%', v_mode, round(v_worst,3);
  end loop;
end $rpc$;
