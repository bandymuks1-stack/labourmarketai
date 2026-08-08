-- Worker demand org attribution proof — SEED (idempotent: truncates first).
--
-- Actors
--   OWNER_MULTI  owns TWO verified companies (Alfa older, Beta newer), one
--                organization per company. This is the live 2026-08-06 shape.
--   OWNER_MIXED  owns an UNVERIFIED company (Gamma, bound to its org) and a
--                verified one (Delta) — the misattribution trap.
--   WORKER_P     a worker (the board caller).
--   PLAIN_P      authenticated but NOT a worker.
--
-- Demand rows (all status='submitted')
--   D1  OWNER_MULTI, stamped org ORG_A  → truth: Alfa's demand.
--   D2  OWNER_MULTI, organization_id NULL (pre-org row).
--   D3  OWNER_MIXED, stamped org ORG_G (Gamma — UNVERIFIED company).

truncate public.company_demand_locations,
         public.customer_requests,
         public.organizations,
         public.companies,
         public.workers,
         public.profiles
  cascade;

insert into public.profiles (id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'employer'),  -- OWNER_MULTI
  ('bbbbbbbb-0000-4000-8000-000000000002', 'employer'),  -- OWNER_MIXED
  ('cccccccc-0000-4000-8000-000000000003', 'worker'),    -- WORKER_P
  ('dddddddd-0000-4000-8000-000000000004', 'worker');    -- PLAIN_P (no workers row)

insert into public.workers (id, profile_id) values
  ('11110000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003');

insert into public.companies
  (id, profile_id, legal_name, display_name, verification_status, created_at)
values
  ('21110000-0000-4000-8000-00000000000a',
   'aaaaaaaa-0000-4000-8000-000000000001',
   'Alfa UAB', 'Alfa', 'verified', '2026-01-01T00:00:00Z'),
  ('21110000-0000-4000-8000-00000000000b',
   'aaaaaaaa-0000-4000-8000-000000000001',
   'Beta UAB', 'Beta', 'verified', '2026-06-01T00:00:00Z'),
  ('21110000-0000-4000-8000-00000000000c',
   'bbbbbbbb-0000-4000-8000-000000000002',
   'Gamma UAB', 'Gamma', 'pending', '2026-02-01T00:00:00Z'),
  ('21110000-0000-4000-8000-00000000000d',
   'bbbbbbbb-0000-4000-8000-000000000002',
   'Delta UAB', 'Delta', 'verified', '2026-03-01T00:00:00Z');

insert into public.organizations (id, legacy_company_id) values
  ('31110000-0000-4000-8000-00000000000a',
   '21110000-0000-4000-8000-00000000000a'),  -- ORG_A → Alfa
  ('31110000-0000-4000-8000-00000000000b',
   '21110000-0000-4000-8000-00000000000b'),  -- ORG_B → Beta
  ('31110000-0000-4000-8000-00000000000c',
   '21110000-0000-4000-8000-00000000000c');  -- ORG_G → Gamma (unverified)

insert into public.customer_requests
  (id, profile_id, organization_id, status, role_or_work_type, country,
   team_size, start_period, location, payload, created_at)
values
  ('41110000-0000-4000-8000-000000000001',                       -- D1
   'aaaaaaaa-0000-4000-8000-000000000001',
   '31110000-0000-4000-8000-00000000000a',
   'submitted', 'bricklayer', 'NL', 4, '2026-09',
   'Rotterdam', '{}'::jsonb, '2026-08-01T10:00:00Z'),
  ('41110000-0000-4000-8000-000000000002',                       -- D2 (pre-org)
   'aaaaaaaa-0000-4000-8000-000000000001',
   null,
   'submitted', 'electrician', 'NL', 2, '2026-10',
   'Utrecht', '{}'::jsonb, '2026-08-02T10:00:00Z'),
  ('41110000-0000-4000-8000-000000000003',                       -- D3
   'bbbbbbbb-0000-4000-8000-000000000002',
   '31110000-0000-4000-8000-00000000000c',
   'submitted', 'welder', 'DE', 3, '2026-09',
   'Bremen', '{}'::jsonb, '2026-08-03T10:00:00Z');
