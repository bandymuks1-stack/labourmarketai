-- M-P0-6 — organization demand spine v2: TWO-ORGANIZATION ACTOR proof (LOCAL ONLY).
-- Applies the v2 migration INSIDE a transaction, impersonates actors via
-- request.jwt.claims + role, prints PASS/FAIL, ROLLS BACK — zero drift.
-- Requires: local stack with slice 1+2 objects and dev-fixtures-mp03.sql
-- (P owns Alfa + Beta with ACTIVE owner memberships; O owns Delta).
-- Usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/db-proof/mp06-demand-spine-v2-proof.sql
begin;

\i supabase/migrations/20260806200000_org_demand_spine_v2.sql

select o.id as org_a from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000a' \gset
select o.id as org_b from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000b' \gset
select o.id as org_d from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000d' \gset
select w.id as worker_w from public.workers w
 where w.profile_id = 'a0300000-0000-0000-0000-000000000003' \gset

\set P_CLAIMS '{"sub":"a0300000-0000-0000-0000-000000000001","role":"authenticated"}'
\set O_CLAIMS '{"sub":"a0300000-0000-0000-0000-000000000002","role":"authenticated"}'

-- P must hold ACTIVE owner memberships on A and B (slice-1 backfill truth).
select case when (
  select count(*) from public.company_memberships
   where profile_id = 'a0300000-0000-0000-0000-000000000001'
     and organization_id in (:'org_a', :'org_b') and status = 'active'
) = 2 then 'PASS fixture: P active in A and B' else 'FAIL fixture' end;

\echo === 1. P creates demand in A context, then SEPARATE demand in B context ===
select set_config('request.jwt.claims', :'P_CLAIMS', true);
select public.submit_demand_request_v2(
  'company_request', 'MP06 demand for Alfa', 'need crew A', '{}'::jsonb, 'lt',
  :'org_a') as demand_a \gset
select public.submit_demand_request_v2(
  'company_request', 'MP06 demand for Beta', 'need crew B', '{}'::jsonb, 'lt',
  :'org_b') as demand_b \gset
select case when
  (select organization_id from public.customer_requests where id = :'demand_a') = :'org_a'
  and
  (select organization_id from public.customer_requests where id = :'demand_b') = :'org_b'
then 'PASS 1: same actor, two contexts, two separate stamps' else 'FAIL 1' end;

\echo === 2. forged org (no membership) is refused — no stamp, no row ===
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"a0300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
    perform public.submit_demand_request_v2(
      'company_request', 'MP06 forged', 'x', '{}'::jsonb, 'lt',
      (select id from public.organizations where legacy_company_id = 'c0300000-0000-0000-0000-00000000000d'));
    raise exception 'FAIL 2: forged organization was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS 2: forged organization refused (42501 not_org_member)';
  end;
end $$;

\echo === 3. raw authenticated PATCH can neither claim nor rewrite attribution ===
select set_config('request.jwt.claims', :'P_CLAIMS', true);
select set_config('role', 'authenticated', true);
do $$
begin
  begin
    update public.customer_requests
       set organization_id = (select organization_id from public.customer_requests cr2 where cr2.title = 'MP06 demand for Beta')
     where title = 'MP06 demand for Alfa';
    raise exception 'FAIL 3a: attribution was rewritten';
  exception when insufficient_privilege then
    raise notice 'PASS 3a: value -> value rewrite refused (immutable)';
  end;
end $$;
select set_config('role', 'postgres', true);

-- personal row for the NULL->value raw-claim check
select set_config('request.jwt.claims', :'P_CLAIMS', true);
select public.submit_demand_request_v2(
  'company_request', 'MP06 personal', 'personal need', '{}'::jsonb, 'lt',
  null) as demand_p \gset
select set_config('role', 'authenticated', true);
do $$
begin
  begin
    update public.customer_requests
       set organization_id = (select organization_id from public.customer_requests cr2 where cr2.title = 'MP06 demand for Alfa')
     where title = 'MP06 personal';
    raise exception 'FAIL 3b: raw PATCH claimed an organization';
  exception when insufficient_privilege then
    raise notice 'PASS 3b: raw NULL -> value claim refused';
  end;
end $$;
select set_config('role', 'postgres', true);
select case when
  (select organization_id from public.customer_requests where id = :'demand_p') is null
then 'PASS 3c: personal demand stays personal (NULL org)' else 'FAIL 3c' end;

\echo === 4. shortlist inherits the demand organization; forged payload ignored ===
select set_config('request.jwt.claims', :'P_CLAIMS', true);
select set_config('role', 'authenticated', true);
insert into public.demand_shortlist (owner_id, request_id, worker_id, status, organization_id)
values ('a0300000-0000-0000-0000-000000000001', :'demand_a', :'worker_w', 'saved', :'org_d');
select set_config('role', 'postgres', true);
select case when
  (select organization_id from public.demand_shortlist where request_id = :'demand_a') = :'org_a'
then 'PASS 4: shortlist inherited A (forged Delta ignored)' else 'FAIL 4' end;

\echo === 5. booking inherits the demand organization through the untouched v1 RPC ===
select set_config('request.jwt.claims', :'P_CLAIMS', true);
select public.propose_booking_request(
  :'demand_a', :'worker_w', '2026-09-01', '2026-09-30', 'LT', 'mp06 role', null
) as booking_a \gset
select case when
  (select organization_id from public.booking_requests where id = :'booking_a') = :'org_a'
then 'PASS 5: booking inherited the demand organization' else 'FAIL 5' end;

\echo === 6. A-chain is invisible to the unrelated owner O (org D) ===
select set_config('request.jwt.claims', :'O_CLAIMS', true);
select set_config('role', 'authenticated', true);
select case when (
  (select count(*) from public.customer_requests where title like 'MP06%')
  + (select count(*) from public.demand_shortlist where request_id = :'demand_a')
  + (select count(*) from public.booking_requests  where id = :'booking_a')
) = 0 then 'PASS 6: unrelated actor reads ZERO rows of the chain' else 'FAIL 6' end;
select set_config('role', 'postgres', true);

\echo === 7. a same-org governance colleague CAN read; a mere member CANNOT ===
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token, email_change_confirm_status, is_sso_user)
select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated',
       x.email, crypt('password', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '', '', '', '', '', 0, false
from (values
  ('a0600000-0000-0000-0000-000000000001'::uuid, 'mp06.manager@local.test'),
  ('a0600000-0000-0000-0000-000000000002'::uuid, 'mp06.member@local.test')
) as x(id, email)
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('a0600000-0000-0000-0000-000000000001', 'mp06.manager@local.test'),
  ('a0600000-0000-0000-0000-000000000002', 'mp06.member@local.test')
on conflict (id) do nothing;
insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
values (:'org_a', 'a0600000-0000-0000-0000-000000000001', 'manager', 'active', 'proof', now()),
       (:'org_a', 'a0600000-0000-0000-0000-000000000002', 'member',  'active', 'proof', now());

select set_config('request.jwt.claims',
  '{"sub":"a0600000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select case when
  (select count(*) from public.customer_requests where id = :'demand_a') = 1
then 'PASS 7a: A manager reads the A demand' else 'FAIL 7a' end;
select set_config('role', 'postgres', true);

select set_config('request.jwt.claims',
  '{"sub":"a0600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select case when
  (select count(*) from public.customer_requests where id = :'demand_a') = 0
then 'PASS 7b: a mere member reads NOTHING (governance != belonging)' else 'FAIL 7b' end;
select set_config('role', 'postgres', true);

\echo === 8. B-context demand is NOT readable through A membership (A != B) ===
select set_config('request.jwt.claims',
  '{"sub":"a0600000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select case when
  (select count(*) from public.customer_requests where id = :'demand_b') = 0
then 'PASS 8: A manager cannot read the B chain' else 'FAIL 8' end;
select set_config('role', 'postgres', true);

\echo === 9. rollback archives attribution instead of destroying it ===
\i supabase/rollbacks/20260806200000_org_demand_spine_v2.down.sql
select case when
  (select count(*) from public.demand_org_attribution_archive
    where source_table = 'customer_requests') >= 2
then 'PASS 9: attribution archived before column drop' else 'FAIL 9' end;
select case when
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_requests'
      and column_name = 'organization_id') = 0
then 'PASS 9b: column removed by rollback' else 'FAIL 9b' end;

rollback;
\echo === proof complete — transaction rolled back, zero drift ===
