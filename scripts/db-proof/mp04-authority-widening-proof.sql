-- M-P0-4 consumer slice DB widening — EDIT-AUTHORITY matrix proof (LOCAL ONLY).
-- Applies the widening migration INSIDE a transaction, impersonates actors via
-- request.jwt.claims, prints PASS/FAIL, ROLLS BACK — zero drift.
-- Requires: seeded local stack with dev-fixtures-mp03.sql (P owns Alfa).
-- Usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/db-proof/mp04-authority-widening-proof.sql
begin;

\i supabase/migrations/20260806180000_membership_authority_widening_v1.sql

select o.id as org_a from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000a' \gset
\set COMPANY_A 'c0300000-0000-0000-0000-00000000000a'

-- Disposable actors: admin / manager / member on Alfa, plus a stranger.
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
  ('a0700000-0000-0000-0000-000000000001'::uuid, 'mp04w.admin@local.test'),
  ('a0700000-0000-0000-0000-000000000002'::uuid, 'mp04w.manager@local.test'),
  ('a0700000-0000-0000-0000-000000000003'::uuid, 'mp04w.member@local.test'),
  ('a0700000-0000-0000-0000-000000000004'::uuid, 'mp04w.stranger@local.test')
) as x(id, email)
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('a0700000-0000-0000-0000-000000000001', 'mp04w.admin@local.test'),
  ('a0700000-0000-0000-0000-000000000002', 'mp04w.manager@local.test'),
  ('a0700000-0000-0000-0000-000000000003', 'mp04w.member@local.test'),
  ('a0700000-0000-0000-0000-000000000004', 'mp04w.stranger@local.test')
on conflict (id) do nothing;
insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
values (:'org_a', 'a0700000-0000-0000-0000-000000000001', 'admin',   'active', 'proof', now()),
       (:'org_a', 'a0700000-0000-0000-0000-000000000002', 'manager', 'active', 'proof', now()),
       (:'org_a', 'a0700000-0000-0000-0000-000000000003', 'member',  'active', 'proof', now());

\echo === 1. ADMIN membership (non-creator) may edit the bound company ===
select set_config('request.jwt.claims',
  '{"sub":"a0700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select case when public.save_company_setup_v3(
  :'COMPANY_A'::uuid, 'MP03 Alfa (admin edit)', null, null, null, null, null, null, null, false, null
) = :'COMPANY_A'::uuid
then 'PASS 1: admin membership edits the selected company' else 'FAIL 1' end;

\echo === 2. MANAGER cannot edit company identity ===
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"a0700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
    perform public.save_company_setup_v3(
      'c0300000-0000-0000-0000-00000000000a'::uuid, 'MP03 Alfa (manager edit)',
      null, null, null, null, null, null, null, false, null);
    raise exception 'FAIL 2: manager edited company identity';
  exception when insufficient_privilege then
    raise notice 'PASS 2: manager refused (not_owner) — operations, not identity';
  end;
end $$;

\echo === 3. MEMBER cannot edit ===
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"a0700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    perform public.save_company_setup_v3(
      'c0300000-0000-0000-0000-00000000000a'::uuid, 'MP03 Alfa (member edit)',
      null, null, null, null, null, null, null, false, null);
    raise exception 'FAIL 3: member edited company identity';
  exception when insufficient_privilege then
    raise notice 'PASS 3: member refused';
  end;
end $$;

\echo === 4. STRANGER refused with the SAME error (anti-oracle) ===
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"a0700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
    perform public.save_company_setup_v3(
      'c0300000-0000-0000-0000-00000000000a'::uuid, 'MP03 Alfa (stranger edit)',
      null, null, null, null, null, null, null, false, null);
    raise exception 'FAIL 4a: stranger edited';
  exception when insufficient_privilege then
    raise notice 'PASS 4a: stranger refused';
  end;
  begin
    perform public.save_company_setup_v3(
      '99999999-9999-4999-8999-999999999999'::uuid, 'ghost',
      null, null, null, null, null, null, null, false, null);
    raise exception 'FAIL 4b: missing row not refused';
  exception when insufficient_privilege then
    raise notice 'PASS 4b: missing row → same not_owner (no existence oracle)';
  end;
end $$;

\echo === 5. LEGACY CREATOR compatibility still edits ===
select set_config('request.jwt.claims',
  '{"sub":"a0300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select case when public.save_company_setup_v3(
  :'COMPANY_A'::uuid, 'MP03 Alfa', null, null, null, null, null, null, null, false, null
) = :'COMPANY_A'::uuid
then 'PASS 5: creator compatibility arm edits' else 'FAIL 5' end;

\echo === 6. manages_organization role matrix ===
select set_config('request.jwt.claims',
  '{"sub":"a0700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select case when public.manages_organization(:'org_a')
then 'PASS 6a: manager membership manages' else 'FAIL 6a' end;
select set_config('request.jwt.claims',
  '{"sub":"a0700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select case when not public.manages_organization(:'org_a')
then 'PASS 6b: member does NOT manage' else 'FAIL 6b' end;
select set_config('request.jwt.claims',
  '{"sub":"a0700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select case when not public.manages_organization(:'org_a')
then 'PASS 6c: stranger does NOT manage' else 'FAIL 6c' end;

rollback;
\echo === proof complete — transaction rolled back, zero drift ===
