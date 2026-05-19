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
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'dev.worker@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"worker","locale":"lt"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'dev.company@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"company","locale":"en"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'dev.agency@local.test', crypt('password', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"agency","locale":"lt"}'::jsonb)
on conflict (id) do nothing;

-- Flesh out the auto-created profiles.
update public.profiles set full_name = 'Dev Worker',  country = 'LT', onboarded = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.profiles set full_name = 'Dev Company', country = 'NL', onboarded = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update public.profiles set full_name = 'Dev Agency',  country = 'LT', onboarded = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';

insert into public.workers
  (id, profile_id, display_name, headline, experience_years,
   current_location_country, preferred_countries, availability_status,
   trust_score, profile_completeness)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Dev Worker', 'Steel fixer • 8y exp', 8, 'LT',
   array['NL','DK','DE'], 'available', 70, 80)
on conflict (id) do nothing;

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
