-- ════════════════════════════════════════════════════════════════════════
-- dev-fixtures-mp03.sql — LOCAL DEVELOPMENT ONLY (M-P0-3 §13 actor matrix)
--
--   ⛔  NEVER apply this to the Supabase Cloud project.
--   ⛔  NEVER reference this file from production code.
--
-- Disposable actors for the M-P0-3 active-workspace-authority browser proof
-- (tests/e2e/m-p0-3-workspace-authority.spec.ts, gate E2E_MP03_LOCAL=1):
--
--   P  mp03.owner@local.test   OWNS "MP03 Alfa UAB" (A) and "MP03 Beta UAB"
--                              (B) — a REAL two-company owner (possible since
--                              M-P0-1); MANAGES "MP03 Gamma UAB" (C) via an
--                              active manager engagement; has a dual
--                              worker+company identity so the Personal
--                              workspace exists in the chip.
--   O  mp03.other@local.test   owns C and "MP03 Delta UAB" (D). D has NO
--                              relation to P — it must never appear in P's
--                              chip.
--   W  mp03.worker@local.test  worker; ACTIVE roster member of A only.
--
-- Organizations are auto-mirrored from companies by on_company_mirror_org.
-- Idempotent: ON CONFLICT / WHERE NOT EXISTS throughout. Same GoTrue rules
-- as dev-fixtures.sql (empty-string token columns, identities row).
-- ════════════════════════════════════════════════════════════════════════

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change,
   email_change_token_new, email_change_token_current,
   phone_change, phone_change_token, reauthentication_token,
   email_change_confirm_status, is_sso_user)
values
  ('00000000-0000-0000-0000-000000000000',
   'a0300000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'mp03.owner@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"company","locale":"en"}'::jsonb,
   '', '', '', '', '', '', '', '', 0, false),
  ('00000000-0000-0000-0000-000000000000',
   'a0300000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'mp03.other@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"company","locale":"en"}'::jsonb,
   '', '', '', '', '', '', '', '', 0, false),
  ('00000000-0000-0000-0000-000000000000',
   'a0300000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'mp03.worker@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"worker","locale":"en"}'::jsonb,
   '', '', '', '', '', '', '', '', 0, false)
on conflict (id) do nothing;

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id,
   last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true),
       'email', u.id::text, now(), now(), now()
  from auth.users u
 where u.id in ('a0300000-0000-0000-0000-000000000001',
                'a0300000-0000-0000-0000-000000000002',
                'a0300000-0000-0000-0000-000000000003')
   and not exists (select 1 from auth.identities i
                    where i.provider = 'email' and i.user_id = u.id);

update public.profiles
   set full_name = 'MP03 Owner', country = 'LT', onboarded = true,
       onboarded_at = coalesce(onboarded_at, now())
 where id = 'a0300000-0000-0000-0000-000000000001';
update public.profiles
   set full_name = 'MP03 Other', country = 'LT', onboarded = true,
       onboarded_at = coalesce(onboarded_at, now())
 where id = 'a0300000-0000-0000-0000-000000000002';
update public.profiles
   set full_name = 'MP03 Worker', country = 'LT', onboarded = true,
       onboarded_at = coalesce(onboarded_at, now())
 where id = 'a0300000-0000-0000-0000-000000000003';

-- Dual identity for P: the Personal workspace only exists with a worker role.
insert into public.profile_roles (profile_id, role, is_active, role_data)
values ('a0300000-0000-0000-0000-000000000001', 'worker', true, '{}'::jsonb)
on conflict (profile_id, role) do update set is_active = true;

insert into public.workers
  (id, profile_id, display_name, current_location_country, availability_status)
values
  ('b0300000-0000-0000-0000-000000000001',
   'a0300000-0000-0000-0000-000000000001', 'MP03 Owner', 'LT', 'unavailable'),
  ('b0300000-0000-0000-0000-000000000003',
   'a0300000-0000-0000-0000-000000000003', 'MP03 Worker', 'LT', 'available')
on conflict (profile_id) do nothing;

-- P owns TWO companies (A + B) — the real multi-org state M-P0-1 opened.
-- O owns C (managed by P) and D (unrelated to P).
insert into public.companies (id, profile_id, legal_name, display_name, country)
values
  ('c0300000-0000-0000-0000-00000000000a',
   'a0300000-0000-0000-0000-000000000001', 'MP03 Alfa UAB',  'MP03 Alfa',  'LT'),
  ('c0300000-0000-0000-0000-00000000000b',
   'a0300000-0000-0000-0000-000000000001', 'MP03 Beta UAB',  'MP03 Beta',  'LT'),
  ('c0300000-0000-0000-0000-00000000000c',
   'a0300000-0000-0000-0000-000000000002', 'MP03 Gamma UAB', 'MP03 Gamma', 'LT'),
  ('c0300000-0000-0000-0000-00000000000d',
   'a0300000-0000-0000-0000-000000000002', 'MP03 Delta UAB', 'MP03 Delta', 'LT')
on conflict (id) do nothing;

-- Owner engagements (manages_organization authority) on P's own orgs, and the
-- MANAGER-not-owner engagement on C — same shapes the RPCs would write.
insert into public.engagement_contexts
  (id, profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
select
  'e0300000-0000-0000-0000-00000000000a',
  'a0300000-0000-0000-0000-000000000001', o.id, 'owner', 'active', false,
  encode(extensions.digest(
    'a0300000-0000-0000-0000-000000000001:owner:' || o.id::text, 'sha256'), 'hex')
from public.organizations o
where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000a'
on conflict (id) do nothing;

insert into public.engagement_contexts
  (id, profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
select
  'e0300000-0000-0000-0000-00000000000b',
  'a0300000-0000-0000-0000-000000000001', o.id, 'owner', 'active', false,
  encode(extensions.digest(
    'a0300000-0000-0000-0000-000000000001:owner:' || o.id::text, 'sha256'), 'hex')
from public.organizations o
where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000b'
on conflict (id) do nothing;

insert into public.engagement_contexts
  (id, profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
select
  'e0300000-0000-0000-0000-00000000000c',
  'a0300000-0000-0000-0000-000000000001', o.id, 'manager', 'active', false,
  encode(extensions.digest(
    'a0300000-0000-0000-0000-000000000001:manager:' || o.id::text, 'sha256'), 'hex')
from public.organizations o
where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000c'
on conflict (id) do nothing;
-- Re-arm on re-seed: the revocation test ends this row; a fresh proof run
-- starts from the granted state.
update public.engagement_contexts set status = 'active'
 where id = 'e0300000-0000-0000-0000-00000000000c';

-- W is an ACTIVE roster member of A only — workspace B must not see him.
insert into public.company_workers (company_id, worker_id, status)
select 'c0300000-0000-0000-0000-00000000000a', w.id, 'active'
  from public.workers w
 where w.profile_id = 'a0300000-0000-0000-0000-000000000003'
on conflict (company_id, worker_id) do update set status = 'active';
