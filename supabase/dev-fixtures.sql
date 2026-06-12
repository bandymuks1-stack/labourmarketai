-- ════════════════════════════════════════════════════════════════════════
-- dev-fixtures.sql — LOCAL DEVELOPMENT ONLY
--
--   ⛔  NEVER apply this to the Supabase Cloud project.
--   ⛔  NEVER reference this file from production code.
--
-- These are throwaway test rows so the authenticated app dashboard (M2+) has
-- something to render during local development. They are applied ONLY via
-- `pnpm db:fixtures:local`, which hard-refuses to run unless the Supabase URL
-- points at a local instance. Cloud stays real-data-only (brief §10.2).
--
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- ════════════════════════════════════════════════════════════════════════

-- Seed auth users. raw_user_meta_data.role drives public.handle_new_user(),
-- which auto-creates the matching public.profiles row.
-- GoTrue requires the *_token columns to be EMPTY STRINGS, not NULL — a NULL
-- confirmation_token makes every password login fail with "Database error
-- querying schema" (sql: converting NULL to string is unsupported).
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
   'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'dev.worker@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"worker","locale":"lt"}'::jsonb,
   '', '', '', '', '', '', '', '', 0, false),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'dev.company@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"company","locale":"en"}'::jsonb,
   '', '', '', '', '', '', '', '', 0, false),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'dev.agency@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"agency","locale":"lt"}'::jsonb,
   '', '', '', '', '', '', '', '', 0, false)
on conflict (id) do nothing;

-- Catch-up for DBs seeded by the older fixture version (NULL tokens).
update auth.users
   set confirmation_token          = coalesce(confirmation_token, ''),
       recovery_token              = coalesce(recovery_token, ''),
       email_change                = coalesce(email_change, ''),
       email_change_token_new      = coalesce(email_change_token_new, ''),
       email_change_token_current  = coalesce(email_change_token_current, ''),
       phone_change                = coalesce(phone_change, ''),
       phone_change_token          = coalesce(phone_change_token, ''),
       reauthentication_token      = coalesce(reauthentication_token, '')
 where id in ('aaaaaaaa-0000-0000-0000-000000000001',
              'aaaaaaaa-0000-0000-0000-000000000002',
              'aaaaaaaa-0000-0000-0000-000000000003');

-- GoTrue also resolves the email provider through auth.identities — without
-- an identity row a password login cannot resolve the user.
insert into auth.identities
  (id, user_id, identity_data, provider, provider_id,
   last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true),
       'email', u.id::text, now(), now(), now()
  from auth.users u
 where u.id in ('aaaaaaaa-0000-0000-0000-000000000001',
                'aaaaaaaa-0000-0000-0000-000000000002',
                'aaaaaaaa-0000-0000-0000-000000000003')
   and not exists (select 1 from auth.identities i
                    where i.provider = 'email' and i.user_id = u.id);

-- Flesh out the auto-created profiles.
update public.profiles set full_name = 'Dev Worker',  country = 'LT', onboarded = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.profiles set full_name = 'Dev Company', country = 'NL', onboarded = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update public.profiles set full_name = 'Dev Agency',  country = 'LT', onboarded = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- NOTE: a role trigger auto-creates the workers row for role=worker signups,
-- so this insert is a no-op on conflict and the row keeps its generated id —
-- always reference the worker via profile_id lookup, never a fixed worker id.
insert into public.workers
  (id, profile_id, display_name, headline, experience_years,
   current_location_country, preferred_countries, availability_status,
   trust_score, profile_completeness)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Dev Worker', 'Steel fixer • 8y exp', 8, 'LT',
   array['NL','DK','DE'], 'available', 70, 80)
on conflict (profile_id) do nothing;

insert into public.companies
  (id, profile_id, legal_name, display_name, country, trust_score)
values
  ('cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'Dev Construction BV', 'Dev Construction', 'NL', 60)
on conflict (id) do nothing;

insert into public.agencies (id, profile_id, legal_name, country)
values
  ('dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'Dev Staffing UAB', 'LT')
on conflict (id) do nothing;

insert into public.projects
  (id, company_id, title, country, city, status, housing_provided)
values
  ('eeeeeeee-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'Renovation Works – Amsterdam', 'NL', 'Amsterdam', 'live', true)
on conflict (id) do nothing;

insert into public.job_demands
  (id, project_id, role_title, headcount_needed, salary_offered_eur,
   status, visibility)
values
  ('ffffffff-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001',
   'Steel fixer', 4, 3200, 'open', 'public')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- Work Journal e2e links — the authenticated closed loop
-- (worker logs entry → manager sees it in the inbox → manager confirms).
--
-- Canonical model (migration 20260530140000_membership_engagement_reroute):
-- membership + manager authority live in engagement_contexts; the review gate
-- is engagement_contexts.journal_review_enabled. These rows mirror exactly
-- what add_org_member / grant_org_manager / set_engagement_journal_review
-- would write — same shapes, no parallel structures.
-- ═══════════════════════════════════════════════════════════════════════════

-- Middleware bounces any profile without onboarded_at to /onboarding.
update public.profiles set onboarded_at = coalesce(onboarded_at, now())
 where id in ('aaaaaaaa-0000-0000-0000-000000000001',
              'aaaaaaaa-0000-0000-0000-000000000002',
              'aaaaaaaa-0000-0000-0000-000000000003');

-- Employment roster link. journal_review_enabled mirrored here for the
-- legacy-reading surfaces (the canonical gate is on the engagement context).
insert into public.company_workers
  (company_id, worker_id, status, journal_review_enabled)
select 'cccccccc-0000-0000-0000-000000000001', w.id, 'active', true
  from public.workers w
 where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict (company_id, worker_id)
do update set status = 'active', journal_review_enabled = true;

-- Worker "employee" engagement on the company's mirrored organization
-- (companies insert above auto-created it via the 0013 mirror trigger).
-- Primary + review-enabled so the journal composer renders AND the entry is
-- reviewable in the manager inbox.
insert into public.engagement_contexts
  (id, profile_id, organization_id, relationship_slug, status, is_primary,
   journal_review_enabled, hash_self)
select
  '99999999-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001', o.id, 'employee', 'active', true,
  true,
  encode(extensions.digest(
    'aaaaaaaa-0000-0000-0000-000000000001:employee:' || o.id::text,
    'sha256'), 'hex')
from public.organizations o
where o.legacy_company_id = 'cccccccc-0000-0000-0000-000000000001'
on conflict (id) do nothing;
update public.engagement_contexts
   set status = 'active', journal_review_enabled = true
 where id = '99999999-0000-0000-0000-000000000001';

-- Company owner "owner" engagement — manages_organization() (0013) requires
-- an active manager/owner/external_manager engagement row; owning the
-- organizations row alone does NOT grant inbox access.
insert into public.engagement_contexts
  (id, profile_id, organization_id, relationship_slug, status, is_primary,
   hash_self)
select
  '99999999-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000002', o.id, 'owner', 'active', false,
  encode(extensions.digest(
    'aaaaaaaa-0000-0000-0000-000000000002:owner:' || o.id::text,
    'sha256'), 'hex')
from public.organizations o
where o.legacy_company_id = 'cccccccc-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- Worker direction for the composer's profession select (tiler is the
-- profession 0013 seeds with a structured journal template).
insert into public.worker_professions (worker_id, profession_id, is_primary)
select w.id, p.id, true
  from public.workers w, public.professions p
 where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and p.slug = 'tiler'
on conflict do nothing;
