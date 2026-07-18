-- @human-gate-approved
-- Wagon 13 — European Work & Business Ecosystem Marketplace: work-resource listings.
--
-- Additive, default-closed, ONE new table. The professional-SERVICES half of
-- the marketplace already exists as the canonical `service_offerings` (reused,
-- never duplicated); business showcase profiles are a read-composition over
-- `organizations`; enquiries reuse the canonical `conversations` inbox; search
-- reuses the canonical command registry. The ONLY genuinely-new artifact is
-- this table: WORK-RELATED physical resources offered for sale / rent / wanted
-- (accommodation & worker housing, commercial premises, vehicles/transport,
-- tools, equipment, machinery, safety equipment) — bounded to work & projects,
-- never generic consumer classifieds.
--
-- Discovery mirrors `service_offerings`: an authenticated user sees `active`
-- listings (marketplace discovery) plus their own drafts/closed; owners CRUD
-- via SECURITY DEFINER RPCs. No anon path, no `using (true)`, no cross-table
-- subquery in the SELECT policy (non-recursive). Optional organization / project
-- linkage is validated inside the write RPCs against the canonical gates
-- (`manages_organization`, `can_manage_project`) so a listing can only be
-- attached to an org/project the caller actually controls.
--
-- RED class (SECURITY DEFINER RPCs + GRANTs). Applied under owner standing
-- authorization (real-user-launch + operations train v2). Rollback:
-- supabase/rollbacks/20260718210000_marketplace_listings.down.sql

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  listing_kind text not null
    check (listing_kind in ('sale','rental','wanted')),
  category text not null
    check (category in (
      'accommodation','premises','vehicle','tools','equipment','machinery','safety_equipment')),
  title text not null,
  description text,
  location_country char(2),
  location_label text,
  -- Pricing is optional and free-text on purpose (rent/sale/"by agreement",
  -- multi-currency across Europe). No cents ledger here — money that changes
  -- hands stays in the canonical finance ledger, never in a listing.
  price_text text,
  status text not null default 'draft'
    check (status in ('draft','active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_listings_title_len check (char_length(title) between 3 and 160),
  constraint marketplace_listings_text_len check (
    (description is null or char_length(description) <= 2000)
    and (location_label is null or char_length(location_label) <= 120)
    and (price_text is null or char_length(price_text) <= 80)
  ),
  constraint marketplace_listings_country_fmt check (
    location_country is null or location_country ~ '^[A-Z]{2}$')
);

create index if not exists marketplace_listings_discovery_idx
  on public.marketplace_listings (status, category, listing_kind);
create index if not exists marketplace_listings_owner_idx
  on public.marketplace_listings (owner_id, status);

alter table public.marketplace_listings enable row level security;

-- Discovery: any authenticated user sees ACTIVE listings; owners also see their
-- own drafts/closed; admin sees all. No cross-table subquery → non-recursive.
drop policy if exists marketplace_listings_select on public.marketplace_listings;
create policy marketplace_listings_select on public.marketplace_listings
  for select using (
    status = 'active' or owner_id = auth.uid() or public.is_admin());

grant select on public.marketplace_listings to authenticated;

-- ── Write RPCs (owner-gated, RPC-only) ──────────────────────────────────────
create or replace function public.create_marketplace_listing_v1(
  p_listing_kind text,
  p_category text,
  p_title text,
  p_description text default null,
  p_location_country text default null,
  p_location_label text default null,
  p_price_text text default null,
  p_organization_id uuid default null,
  p_project_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_listing_kind not in ('sale','rental','wanted') then raise exception 'invalid listing_kind'; end if;
  if p_category not in ('accommodation','premises','vehicle','tools','equipment','machinery','safety_equipment')
    then raise exception 'invalid category'; end if;
  if p_title is null or char_length(trim(p_title)) < 3 then raise exception 'title required'; end if;
  -- A listing may be attached to an org / project ONLY if the caller controls it.
  if p_organization_id is not null and not public.manages_organization(p_organization_id)
    then raise exception 'not authorized for organization'; end if;
  if p_project_id is not null and not public.can_manage_project(p_project_id)
    then raise exception 'not authorized for project'; end if;
  insert into public.marketplace_listings (
    owner_id, organization_id, project_id, listing_kind, category, title, description,
    location_country, location_label, price_text)
  values (
    auth.uid(), p_organization_id, p_project_id, p_listing_kind, p_category,
    left(trim(p_title),160),
    nullif(left(coalesce(p_description,''),2000),''),
    nullif(upper(left(coalesce(p_location_country,''),2)),''),
    nullif(left(coalesce(p_location_label,''),120),''),
    nullif(left(coalesce(p_price_text,''),80),''))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_marketplace_listing_v1(
  p_id uuid,
  p_title text,
  p_category text,
  p_listing_kind text,
  p_description text default null,
  p_location_country text default null,
  p_location_label text default null,
  p_price_text text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.marketplace_listings where id = p_id;
  if v_owner is null then raise exception 'listing not found'; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  if p_listing_kind not in ('sale','rental','wanted') then raise exception 'invalid listing_kind'; end if;
  if p_category not in ('accommodation','premises','vehicle','tools','equipment','machinery','safety_equipment')
    then raise exception 'invalid category'; end if;
  if p_title is null or char_length(trim(p_title)) < 3 then raise exception 'title required'; end if;
  update public.marketplace_listings set
    title = left(trim(p_title),160),
    category = p_category,
    listing_kind = p_listing_kind,
    description = nullif(left(coalesce(p_description,''),2000),''),
    location_country = nullif(upper(left(coalesce(p_location_country,''),2)),''),
    location_label = nullif(left(coalesce(p_location_label,''),120),''),
    price_text = nullif(left(coalesce(p_price_text,''),80),''),
    updated_at = now()
  where id = p_id;
end; $$;

create or replace function public.set_marketplace_listing_status_v1(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.marketplace_listings where id = p_id;
  if v_owner is null then raise exception 'listing not found'; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','active','closed') then raise exception 'invalid status'; end if;
  update public.marketplace_listings set status = p_status, updated_at = now() where id = p_id;
end; $$;

create or replace function public.delete_marketplace_listing_v1(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.marketplace_listings where id = p_id;
  if v_owner is null then return; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  delete from public.marketplace_listings where id = p_id;
end; $$;

grant execute on function public.create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_marketplace_listing_status_v1(uuid, text) to authenticated;
grant execute on function public.delete_marketplace_listing_v1(uuid) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718210000_marketplace_listings.down.sql
