-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- @human-gate-approved
-- Prepared under the owner's Production UX Root-Cause Repair v2 goal command
-- (2026-07-13, F12.4/5: "sukurk additive migraciją … migracijos nepritaikyk"):
-- migration prepared FULLY but NOT applied — production apply happens ONLY
-- after the owner reviews the PR #746 gate report. Never `db push`.
-- ============================================================================
--
-- company_locations v1 — company operating geography (F12.4/5, production
-- UX root-cause repair v2)
--
-- ██ HUMAN GATE — DO NOT APPLY WITHOUT EXPLICIT OWNER OK ██
-- Status: DRAFT / DEFERRED. Committed for review only. The consumer UI
-- (company workspace "Locations" section + market-map company layer)
-- detects the missing table (42P01) and shows an honest "prepared, owner
-- activation pending" state until this is applied.
--
-- WHY: production finding F12 — a company can only exist as a single
-- implicit point today (no table at all). Real companies work in multiple
-- countries and regions and need: headquarters, operating locations and
-- desired work markets, manageable from the company workspace and visible
-- on the company map layer.
--
-- MODEL:
--   public.company_locations — one row per (company, kind, place):
--     kind        headquarters | operating | desired_market
--     country     required ISO-3166-1 alpha-2 (matches the app's
--                 MARKET_COUNTRIES codes)
--     region/city optional free text (bounded)
--     label       optional short display label (bounded)
--     latitude/longitude — OPTIONAL company-entered approximate coords.
--                 COMPANY geography only; this table never stores private
--                 worker coordinates.
--   At most ONE headquarters per company (partial unique index).
--   Row cap 50/company enforced in the write RPC.
--
-- SECURITY (fail-closed):
--   RLS SELECT: owns_company(company_id) OR is_admin(). v1 is a private
--   management surface — NO public/worker read is granted here; any wider
--   exposure is a separate owner-gated decision.
--   Writes: RPC-only (save_company_location_v1 / remove_company_location_v1,
--   SECURITY DEFINER, owner-checked server-side, pinned search_path).
--   Table grant to authenticated: SELECT only. No anon grants.
--
-- Rollback: supabase/rollbacks/20260713120000_company_locations_v1.down.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Table ─────────────────────────────────────────────────────────────
create table if not exists public.company_locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null check (kind in ('headquarters','operating','desired_market')),
  country     text not null check (country ~ '^[A-Z]{2}$'),
  region      text check (region is null or char_length(region) <= 120),
  city        text check (city is null or char_length(city) <= 120),
  label       text check (label is null or char_length(label) <= 120),
  latitude    double precision check (latitude  is null or (latitude  >= -90  and latitude  <= 90)),
  longitude   double precision check (longitude is null or (longitude >= -180 and longitude <= 180)),
  -- Coordinates are both-or-neither: a half coordinate cannot render.
  constraint company_locations_coord_pair
    check ((latitude is null) = (longitude is null)),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_company_locations_company
  on public.company_locations(company_id);

-- One headquarters per company.
create unique index if not exists uq_company_locations_single_hq
  on public.company_locations(company_id) where kind = 'headquarters';

drop trigger if exists trg_company_locations_updated_at on public.company_locations;
create trigger trg_company_locations_updated_at
  before update on public.company_locations
  for each row execute function public.set_updated_at();

-- ── 2. RLS (fail-closed) ─────────────────────────────────────────────────
alter table public.company_locations enable row level security;

drop policy if exists company_locations_select on public.company_locations;
create policy company_locations_select on public.company_locations for select
  using (public.owns_company(company_id) or public.is_admin());

-- NO insert/update/delete policies — writes go through the RPCs below only.

grant select on public.company_locations to authenticated;

-- ── 3. Write RPCs (owner-gated, SECURITY DEFINER) ────────────────────────
create or replace function public.save_company_location_v1(
  p_kind      text,
  p_country   text,
  p_region    text default null,
  p_city      text default null,
  p_label     text default null,
  p_latitude  double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_count int;
  v_id uuid;
begin
  select c.id into v_company_id
  from public.companies c
  where c.profile_id = auth.uid();
  if v_company_id is null then
    raise exception 'not_company_owner' using errcode = '42501';
  end if;

  if p_kind not in ('headquarters','operating','desired_market') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_country is null or p_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.company_locations
  where company_id = v_company_id;
  if v_count >= 50 then
    raise exception 'location_cap_reached' using errcode = 'P0001';
  end if;

  -- Single-HQ contract: saving a headquarters replaces the previous one.
  if p_kind = 'headquarters' then
    delete from public.company_locations
    where company_id = v_company_id and kind = 'headquarters';
  end if;

  insert into public.company_locations
    (company_id, kind, country, region, city, label, latitude, longitude, created_by)
  values
    (v_company_id, p_kind, p_country,
     nullif(btrim(coalesce(p_region, '')), ''),
     nullif(btrim(coalesce(p_city, '')), ''),
     nullif(btrim(coalesce(p_label, '')), ''),
     p_latitude, p_longitude, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_company_location_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.company_locations cl
  using public.companies c
  where cl.id = p_id
    and c.id = cl.company_id
    and c.profile_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.save_company_location_v1(text, text, text, text, text, double precision, double precision) from public;
revoke all on function public.save_company_location_v1(text, text, text, text, text, double precision, double precision) from anon;
grant execute on function public.save_company_location_v1(text, text, text, text, text, double precision, double precision) to authenticated;

revoke all on function public.remove_company_location_v1(uuid) from public;
revoke all on function public.remove_company_location_v1(uuid) from anon;
grant execute on function public.remove_company_location_v1(uuid) to authenticated;
