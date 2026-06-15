-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude review.
-- Never `db push` (repo filenames don't match the prod ledger versions).
--
-- Company demand locations (RED draft v1) — first REAL geo layer candidate for
-- the live market map (#422 foundation). A company demand location is WHERE an
-- employer actually needs workers / a brigade / a service / a project executed.
-- It is NOT the company's registration address, NOT a catalogue point, NOT a
-- fake marker. It is a labour-market signal: where the need is.
--
-- Design (additive, reversible):
--   * NEW owner-scoped child table of public.customer_requests (the canonical
--     demand store, migration 0028). Mirrors public.demand_shortlist RLS
--     (owner_id = auth.uid() OR is_admin()); NO public/anon read (there is no
--     public approved-demand model yet — doctrine: never leak before consent).
--   * country_code is required (a location has at least a country); city /
--     region / locality / address_text / a human location_label are optional.
--   * latitude/longitude are OPTIONAL and may ONLY be stored once geocoding is
--     verified/manual — the DB itself forbids random/unverified coordinates
--     (CHECK below). Until then the market map shows the demand layer as
--     "schema prepared", never a fake point. No PostGIS, no external geocoder.
--
-- Honesty invariants (doctrine §7 / §18):
--   * no fake markers, no random coordinates — enforced by CHECK, not just code;
--   * contacts are NOT touched here (this is a location signal only);
--   * additive only — no drop/rename/backfill, no change to customer_requests,
--     no RLS loosening, no new SECURITY DEFINER function, grant to authenticated
--     only. The GRANT is the single migration-safety RED flag → @human-gate.
--
-- ROLLBACK: supabase/rollbacks/20260615120000_company_demand_locations.down.sql
--   (drops public.company_demand_locations; the table is new and additive, so
--    the reversal is a clean DROP — see the .down.sql for the exact SQL).
-- ============================================================================

-- @human-gate-approved
begin;

-- Company demand locations — owner-scoped, linked to a real demand row ────────
create table if not exists public.company_demand_locations (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.customer_requests(id) on delete cascade,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  country_code    text not null
                    check (country_code ~ '^[A-Z]{2}$'),
  region          text check (region is null or char_length(region) <= 160),
  city            text check (city is null or char_length(city) <= 160),
  locality        text check (locality is null or char_length(locality) <= 160),
  address_text    text check (address_text is null or char_length(address_text) <= 400),
  location_label  text not null
                    check (char_length(location_label) between 1 and 200),
  latitude        numeric,
  longitude       numeric,
  geo_precision   text not null default 'unknown'
                    check (geo_precision in ('country','city','address','coordinates','unknown')),
  geocode_status  text not null default 'not_required'
                    check (geocode_status in ('not_required','pending','verified','failed','manual')),
  source          text not null default 'demand_form'
                    check (source in ('demand_form','admin','import','manual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- coordinates are both-or-neither and must be in valid WGS84 ranges …
  constraint company_demand_locations_coords_valid
    check (
      (latitude is null and longitude is null)
      or (latitude between -90 and 90 and longitude between -180 and 180)
    ),
  -- … and may ONLY exist once geocoding is verified/manual (no random points) …
  constraint company_demand_locations_coords_require_verification
    check (latitude is null or geocode_status in ('verified','manual')),
  -- … and a 'coordinates' precision claim must actually carry coordinates.
  constraint company_demand_locations_precision_matches_coords
    check (geo_precision <> 'coordinates' or latitude is not null)
);

-- Read paths the market-map demand layer will use (owner + admin), once applied.
create index if not exists company_demand_locations_request_idx
  on public.company_demand_locations (request_id);
create index if not exists company_demand_locations_owner_idx
  on public.company_demand_locations (owner_id);
create index if not exists company_demand_locations_country_idx
  on public.company_demand_locations (country_code);

-- RLS — owner-scoped read/write + admin read, NO anon, NO public ─────────────
-- Mirrors public.demand_shortlist (migration 20260612220000): the company user
-- who owns the demand row sees and edits only their own locations; admin reads
-- via the existing public.is_admin() predicate. There is intentionally NO
-- public/anon policy — demand locations stay private until a future, explicit,
-- consented public-demand model exists.
alter table public.company_demand_locations enable row level security;

create policy company_demand_locations_select on public.company_demand_locations
  for select
  using (owner_id = auth.uid() or public.is_admin());

-- Write: owner-only, and you may only attach a location to YOUR OWN demand.
-- The WITH CHECK additionally requires the referenced customer_requests row to
-- belong to auth.uid() — so a caller cannot point a location at someone else's
-- request_id even with their own owner_id (the request-spoofing gap). The
-- subquery is itself RLS-filtered (customer_requests select = profile_id =
-- auth.uid() or is_admin), so this is defence in depth.
create policy company_demand_locations_write on public.company_demand_locations
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.customer_requests cr
       where cr.id = request_id
         and cr.profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.company_demand_locations to authenticated;

commit;
