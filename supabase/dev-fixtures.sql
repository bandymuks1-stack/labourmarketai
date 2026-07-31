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

-- ═══════════════════════════════════════════════════════════════════════════
-- ACCEPTANCE SCENARIO (unified premium product v1)
--
-- One COHERENT story rather than scattered demo rows: the worker
-- (dev.worker@local.test) has really been working on the company's project,
-- and every downstream surface is derivable from those same rows — the Player
-- Card charts, the skill evidence links, the calendar, the documents and the
-- invoice basis.
--
-- Deterministic ids (1e…/1f…/cd…/ab… prefixes). NOTE the prefixes deliberately
-- avoid ee…/dd…: the seeded PROJECT already owns
-- eeeeeeee-0000-0000-0000-000000000001, and reusing that space silently
-- collides with it.
-- Idempotent: ON CONFLICT DO NOTHING, so re-running never duplicates.
-- ═══════════════════════════════════════════════════════════════════════════

-- 14 journal entries across ~6 months. Spread over time on purpose: the
-- 12-month activity chart and the "skills grew from real work" claim are both
-- meaningless against a single day's data.
insert into public.journal_entries
  (id, worker_id, engagement_context_id, entry_type_slug, original_text,
   original_language, visibility_scope, project_id, hash_self, created_at)
select
  ('1e111111-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
  w.id,
  '99999999-0000-0000-0000-000000000001',
  'freeform',
  (array[
    'Klojau plyteles antrame aukste, 8 valandos.',
    'Hidroizoliacija vonios patalpoje, 6 valandos.',
    'Grindu islyginimas, 7 valandos.',
    'Plyteliu klojimas koridoriuje, 8 valandos.',
    'Siuliu uzpildymas ir valymas, 5 valandos.',
    'Vonios sienu plyteles, 8 valandos.',
    'Medziagu priemimas ir tikrinimas, 3 valandos.'
  ])[1 + (g % 7)],
  'lt', 'org',
  p.id,
  encode(extensions.digest('acceptance-entry-' || g::text, 'sha256'), 'hex'),
  now() - ((g * 13) || ' days')::interval
from public.workers w,
     generate_series(1, 14) g,
     lateral (select id from public.projects order by created_at limit 1) p
where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- Skill evidence — provenance is recognized/confirmed (NOT "journal"): the
-- tier drives how the Player Card renders backing, and a quarter are confirmed
-- so the verified tier is actually exercised.
-- The patented loop's visible half: each entry BACKS a skill.
-- Skills are chosen by rank, not by hardcoded slug: the taxonomy is seeded by
-- migrations and an assumed slug silently seeds nothing (floor-screed did not
-- exist). Uneven distribution on purpose, so the absolute-scale skill bars have
-- something real to differentiate — a flat distribution would hide a
-- normalization bug rather than expose it.
insert into public.journal_entry_skills
  (id, journal_entry_id, worker_id, skill_id, provenance)
select
  ('1f111111-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
  ('1e111111-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
  w.id, s.id, case when g % 4 = 0 then 'confirmed' else 'recognized' end
from public.workers w,
     generate_series(1, 14) g,
     lateral (
       select id from public.skills
        order by slug
        offset (g % 3) limit 1
     ) s
where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- Worker documents — the Evidence catalogue needs real rows, not an empty tab.
insert into public.worker_documents
  (id, worker_id, document_type_slug, status, updated_by, verification)
select
  ('cdcdcdcd-0000-0000-0000-00000000000' || g::text)::uuid,
  w.id, dt.slug, 'ready', 'aaaaaaaa-0000-0000-0000-000000000001', 'unverified'
from public.workers w,
     generate_series(1, 2) g,
     lateral (select slug from public.document_types order by slug offset (g - 1) limit 1) dt
where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- Calendar — an absence so the calendar result has a real, non-empty week.
insert into public.worker_absences
  (id, worker_id, absence_type, start_date, end_date, status, requested_by)
select
  'abababab-0000-0000-0000-000000000001', w.id, 'annual_leave',
  (now() + interval '9 days')::date, (now() + interval '11 days')::date,
  'approved', 'aaaaaaaa-0000-0000-0000-000000000001'
from public.workers w
where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACCEPTANCE: MARKET DEMAND ACROSS COUNTRIES
--
-- The authenticated MarketMap could not be verified because there were zero
-- open job_demands — the map correctly rendered its honest-empty state, which
-- proved the guard worked and proved nothing about the journey. This seeds the
-- minimum coherent chain: project -> geography -> open need -> headcount.
--
-- Deliberately UNEVEN across four countries so one region wins for a REASON
-- (most open headcount, concentrated in two cities) rather than by being the
-- only rows present. NL 23 / DE 11 / BE 8 / PL 6.
--
-- Prefix 2b… . Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.projects
  (id, company_id, title, country, city, status)
values
  ('2b000000-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','Rotterdam haven — elektros instaliacija','NL','Rotterdam','live'),
  ('2b000000-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','Eindhoven campus — silpnos srovės','NL','Eindhoven','live'),
  ('2b000000-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000001','Amsterdam Noord — renovacija','NL','Amsterdam','live'),
  ('2b000000-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000001','Duisburg Logistikzentrum','DE','Duisburg','live'),
  ('2b000000-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000001','Hamburg Hafen — Elektro','DE','Hamburg','live'),
  ('2b000000-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-000000000001','Antwerpen terminal','BE','Antwerpen','live'),
  ('2b000000-0000-0000-0000-000000000007','cccccccc-0000-0000-0000-000000000001','Gdansk stocznia','PL','Gdansk','live')
on conflict (id) do nothing;

insert into public.job_demands
  (id, project_id, role_title, headcount_needed, status, visibility, start_date)
values
  ('2b111111-0000-0000-0000-000000000001','2b000000-0000-0000-0000-000000000001','Elektrikas', 9,'open','public',(now() + interval '21 days')::date),
  ('2b111111-0000-0000-0000-000000000002','2b000000-0000-0000-0000-000000000002','Elektrikas', 7,'open','public',(now() + interval '28 days')::date),
  ('2b111111-0000-0000-0000-000000000003','2b000000-0000-0000-0000-000000000003','Elektrikas', 4,'open','public',(now() + interval '45 days')::date),
  ('2b111111-0000-0000-0000-000000000004','2b000000-0000-0000-0000-000000000004','Elektriker', 6,'open','public',(now() + interval '35 days')::date),
  ('2b111111-0000-0000-0000-000000000005','2b000000-0000-0000-0000-000000000005','Elektriker', 5,'open','public',(now() + interval '60 days')::date),
  ('2b111111-0000-0000-0000-000000000006','2b000000-0000-0000-0000-000000000006','Elektricien', 8,'open','public',(now() + interval '30 days')::date),
  ('2b111111-0000-0000-0000-000000000007','2b000000-0000-0000-0000-000000000007','Elektryk',    6,'open','public',(now() + interval '75 days')::date)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACCEPTANCE: GOAL 3 — PROJECT EVALUATION
--
-- The market seed above proved WHERE demand is. Evaluating a project needs the
-- cases the journey actually has to survive, so each row below exists to make
-- one of them reachable in the authenticated browser:
--
--   * MULTIPLE PROJECTS IN ONE CITY — Rotterdam now holds three. One project
--     per city would let a broken filter pass by accident.
--   * COMPLETE TIMING — 2b…008 carries a project start AND end date.
--   * MISSING TIMING — 2b…009 carries neither, and its need has no start date
--     either, so the "missing" indication has something real to report.
--   * MULTIPLE ROLES AND SKILLS — 2b…008 has TWO open needs with different
--     role titles and different `required_skills`, so a project is not
--     assumed to be one role.
--
-- Already covered by the market seed and deliberately not duplicated:
--   * UNRESOLVED GEOGRAPHY — Duisburg (DE) and Antwerpen (BE) are not in the
--     canonical city table, so they fold into their country's approximate
--     aggregate. That IS the country-precision case.
--   * ZERO MATCH — any valid place with no project, e.g. LT / Vilnius.
--
-- `required_skills` is `uuid[] -> skills.id`, so the slugs are resolved from
-- the canonical skills table rather than hard-coded — a renamed skill fails
-- loudly here instead of rendering a raw uuid in the panel.
--
-- Prefix 2b… . Idempotent. LOCAL DETERMINISTIC ACCEPTANCE ROWS IN REAL DOMAIN
-- TABLES, read through real domain queries under RLS. Not production data.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.projects
  (id, company_id, title, country, city, status, start_date, end_date)
values
  ('2b000000-0000-0000-0000-000000000008','cccccccc-0000-0000-0000-000000000001','Rotterdam Maasvlakte — plieno konstrukcijos','NL','Rotterdam','live',(now() + interval '30 days')::date,(now() + interval '210 days')::date),
  ('2b000000-0000-0000-0000-000000000009','cccccccc-0000-0000-0000-000000000001','Rotterdam Kralingen — vidaus apdaila','NL','Rotterdam','live',null,null)
on conflict (id) do nothing;

insert into public.job_demands
  (id, project_id, role_title, headcount_needed, status, visibility, start_date, required_skills)
values
  ('2b111111-0000-0000-0000-000000000008','2b000000-0000-0000-0000-000000000008','Suvirintojas', 5,'open','public',(now() + interval '30 days')::date,
   array(select id from public.skills where slug in ('mig-mag-welding','tig-welding'))),
  ('2b111111-0000-0000-0000-000000000009','2b000000-0000-0000-0000-000000000008','Montuotojas',  3,'open','public',(now() + interval '52 days')::date,
   array(select id from public.skills where slug in ('scaffolding','steel-fixing'))),
  ('2b111111-0000-0000-0000-000000000010','2b000000-0000-0000-0000-000000000009','Apdailininkas',2,'open','public',null, null)
on conflict (id) do nothing;
