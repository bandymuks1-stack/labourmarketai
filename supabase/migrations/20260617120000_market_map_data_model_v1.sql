-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration AFTER explicit owner sign-off
-- (see docs/audits/market-map-data-model-v1-owner-signoff.md).
-- Never `db push` (repo filenames don't match the prod ledger versions).
--
-- Market Map Data Model v1 — gives the live market map real signal sources
-- beyond today's profile/company country fields:
--   1. public.preferred_locations             (NEW)  — where a person WANTS to
--      work / buy / sell / join a team / run a project. NOT their registration.
--   2. public.consented_login_location_signals (NEW) — APPROXIMATE, consent-gated
--      login-area signal. Country/region/city ONLY — there are intentionally
--      NO latitude/longitude/address columns, so an exact point CANNOT be stored.
--   3. public.company_demand_locations         (EXTEND, additive) — add need_type,
--      counts, dates, urgency, mobility/accommodation, granularity, visibility,
--      active. (The table already exists — migration 20260615120000.)
--   4. public.projects                         (EXTEND, additive) — add
--      granularity, location_confirmed, visibility_level. (country/city exist.)
--
-- Every signal-bearing row carries a visibility_level so the read layer can
-- decide what the public/aggregated map may show vs. self_only/private/admin.
--
-- Honesty / privacy invariants (doctrine §7 / §18):
--   * no fake markers, no random coordinates;
--   * login location is approximate + consent-gated, never an exact point;
--   * additive only — NO drop/rename/backfill of existing columns, NO RLS
--     loosening, NO `using (true)`, NO grant to anon/public, NO new SECURITY
--     DEFINER function. New-table grants are to `authenticated` only. The grants
--     are the migration-safety RED flag → this PR is owner-gated (draft + label).
--
-- ROLLBACK: supabase/rollbacks/20260617120000_market_map_data_model_v1.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

-- Allowed visibility levels (shared convention, enforced per-table by CHECK):
--   private | self_only | aggregated | region_visible | city_visible
--   | plan_gated | company_only | admin_only

-- ── 1. preferred_locations (NEW) ────────────────────────────────────────────
-- A person's DESIRED locations + intent. Distinct from profiles.country /
-- workers.current_location_country. Multiple intents per row via a text[] that
-- is CHECK-constrained to the allowed set (`<@` = all elements contained in).
create table if not exists public.preferred_locations (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name  text check (country_name is null or char_length(country_name) <= 120),
  region        text check (region is null or char_length(region) <= 160),
  city          text check (city is null or char_length(city) <= 160),
  granularity   text not null default 'country'
                  check (granularity in ('country','region','city')),
  intents       text[] not null default '{}'
                  check (
                    intents <@ array[
                      'work','find_job','sell_services','buy_services',
                      'join_team','hire_team','project_interest','relocate',
                      'remote_if_possible'
                    ]::text[]
                  ),
  priority      text not null default 'secondary'
                  check (priority in ('primary','secondary','optional')),
  short_note    text check (short_note is null or char_length(short_note) <= 280),
  visibility_level text not null default 'self_only'
                  check (visibility_level in (
                    'private','self_only','aggregated','region_visible',
                    'city_visible','plan_gated','company_only','admin_only')),
  confirmed_by_user boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists preferred_locations_profile_idx
  on public.preferred_locations (profile_id);
create index if not exists preferred_locations_country_idx
  on public.preferred_locations (country_code);

alter table public.preferred_locations enable row level security;
create policy preferred_locations_select on public.preferred_locations
  for select using (profile_id = auth.uid() or public.is_admin());
create policy preferred_locations_write on public.preferred_locations
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on public.preferred_locations to authenticated;

-- ── 2. consented_login_location_signals (NEW) ───────────────────────────────
-- APPROXIMATE login-area signal. Country/region/city ONLY — NO lat/lng/address
-- columns exist here by design, so an exact point can never be stored. Hidden
-- unless consent_status = 'consented'; readable only by the owner/admin.
create table if not exists public.consented_login_location_signals (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  country_code   text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name   text check (country_name is null or char_length(country_name) <= 120),
  region         text check (region is null or char_length(region) <= 160),
  city           text check (city is null or char_length(city) <= 160),
  granularity    text not null default 'country'
                   check (granularity in ('country','region','city')),
  precision_level text not null default 'country'
                   check (precision_level in ('country','region','city')),
  source         text not null default 'request_headers'
                   check (source in ('request_headers','auth_metadata','user_confirmed','other_safe_source')),
  consent_status text not null default 'not_requested'
                   check (consent_status in ('not_requested','consented','revoked')),
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profile_id)
);
create index if not exists consented_login_location_profile_idx
  on public.consented_login_location_signals (profile_id);

alter table public.consented_login_location_signals enable row level security;
-- Self/admin read ONLY; a revoked/not-requested row is still owner-readable but
-- the read layer must exclude it from any shared/aggregated output.
create policy consented_login_location_select on public.consented_login_location_signals
  for select using (profile_id = auth.uid() or public.is_admin());
create policy consented_login_location_write on public.consented_login_location_signals
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on public.consented_login_location_signals to authenticated;

-- ── 3. company_demand_locations (EXTEND — additive) ─────────────────────────
-- The need/demand location table already exists; enrich it with the need shape.
alter table public.company_demand_locations
  add column if not exists granularity text not null default 'country'
    check (granularity in ('country','region','city')),
  add column if not exists need_type text
    check (need_type is null or need_type in (
      'workers','team','subcontractors','freelancers','service_provider',
      'project_capacity','accommodation_support','transport_support')),
  add column if not exists people_count_min integer
    check (people_count_min is null or people_count_min >= 0),
  add column if not exists people_count_max integer
    check (people_count_max is null or people_count_max >= 0),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists urgency text
    check (urgency is null or urgency in ('low','medium','high')),
  add column if not exists mobility_required boolean not null default false,
  add column if not exists accommodation_needed boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists visibility_level text not null default 'company_only'
    check (visibility_level in (
      'private','self_only','aggregated','region_visible',
      'city_visible','plan_gated','company_only','admin_only'));

-- ── 4. projects (EXTEND — additive; country/city already exist) ─────────────
alter table public.projects
  add column if not exists granularity text not null default 'country'
    check (granularity in ('country','region','city')),
  add column if not exists location_confirmed boolean not null default false,
  add column if not exists visibility_level text not null default 'company_only'
    check (visibility_level in (
      'private','self_only','aggregated','region_visible',
      'city_visible','plan_gated','company_only','admin_only'));

commit;
