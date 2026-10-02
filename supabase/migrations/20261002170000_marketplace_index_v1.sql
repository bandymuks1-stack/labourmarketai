-- @human-gate-approved
-- ============================================================================
-- DRAFT — needs-human-gate — RED class. DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push` / `prisma migrate deploy`.
--
-- Universal Marketplace — ONE discovery layer over existing domain tables
-- (owner direction, "Option C"):
--
--   * reuse the existing domain tables (marketplace_listings, service_offerings);
--   * ONE universal discovery view  public.market_index_v1  (security_invoker);
--   * ONE policy hook function      public.market_publish_policy_v1;
--   * ONE subject registry          public.market_subject_types  (seeded here).
--
-- OWNER DECISION (final): there is NO age / birth / adult column anywhere and
-- no adult-only domain model. The model is PERSON + a separate POLICY layer.
-- market_publish_policy_v1 reads NOTHING about age or identity in v1 — it is
-- THE single hook where future guardian / legal facts plug in (via a facts
-- table it will read) without any schema change to the listing tables.
--
-- NO payment, NO escrow, NO fulfilment. price_amount/currency are DESCRIPTIVE
-- facts a person states about their own listing; no money moves through here.
--
-- What this migration does NOT touch (existing-data survival):
--   * no existing row is updated, deleted or rewritten;
--   * v1 RPC signatures (create/update/set_status/delete_marketplace_listing_v1)
--     are untouched and stay callable;
--   * conversations / conversations.source_type are untouched;
--   * customer_requests and public_vacancies are NOT unioned into the index:
--     demand stays on its own SECURITY DEFINER RPCs;
--   * organization_id on service_offerings is DEFERRED (needs RPC/RLS work).
--
-- listing_kind stays sale|rental|wanted. Direction is DERIVED (wanted -> need,
-- sale/rental -> offer). No use case needed a fourth kind: a contractor's
-- project capability is an `offer` (sale) of subject project_work. A client's
-- project / contract NEED stays in the projects domain (projects / proposals /
-- contracts) and is NOT a marketplace listing: the policy hook refuses
-- `project_work` as a need.
--
-- The public-surface expiry predicate on get_public_business_listings_v1 (anon
-- reachable) is deliberately NOT in this file: it ships as the separate
-- migration 20261002170100_marketplace_public_business_expiry_v1.sql so the
-- gate can review the public surface independently.
--
-- ROLLBACK: supabase/rollbacks/20261002170000_marketplace_index_v1.down.sql
-- (guarded: refuses if any new column holds data or any new subject is in use).
-- ============================================================================

begin;

-- 1. Subject registry ─────────────────────────────────────────────────────────
create table if not exists public.market_subject_types (
  domain  text not null check (domain ~ '^[a-z][a-z0-9_]{1,40}$'),
  subject text not null check (subject ~ '^[a-z][a-z0-9_]{1,40}$'),
  active  boolean not null default true,
  primary key (domain, subject),
  -- A subject belongs to exactly ONE domain, so a listing's domain is DERIVED
  -- by joining category -> registry (there is deliberately no domain column).
  constraint market_subject_types_subject_unique unique (subject)
);

alter table public.market_subject_types enable row level security;

drop policy if exists market_subject_types_select on public.market_subject_types;
create policy market_subject_types_select on public.market_subject_types
  for select to authenticated
  using (auth.uid() is not null);

-- Read-only catalog for signed-in users; seeded by migration ONLY.
revoke all on public.market_subject_types from public;
revoke all on public.market_subject_types from anon;
revoke all on public.market_subject_types from authenticated;
grant select on public.market_subject_types to authenticated;

insert into public.market_subject_types (domain, subject) values
  ('work_resource', 'accommodation'),
  ('work_resource', 'premises'),
  ('work_resource', 'vehicle'),
  ('work_resource', 'tools'),
  ('work_resource', 'equipment'),
  ('work_resource', 'machinery'),
  ('work_resource', 'safety_equipment'),
  ('goods',         'goods_food_homegrown'),
  ('goods',         'goods_handmade'),
  ('goods',         'goods_household'),
  ('goods',         'goods_other'),
  ('service_need',  'service_general'),
  ('service_need',  'service_trade'),
  ('service_need',  'service_creative'),
  ('service_need',  'service_other'),
  ('personal',      'personal'),
  ('project_work',  'project_work')
on conflict (domain, subject) do nothing;

-- 2. marketplace_listings: nullable additive columns ONLY ───────────────────
alter table public.marketplace_listings
  add column if not exists price_amount numeric(14,2)
    constraint marketplace_listings_price_amount_nonneg check (price_amount >= 0),
  add column if not exists currency char(3)
    constraint marketplace_listings_currency_fmt check (currency ~ '^[A-Z]{3}$'),
  add column if not exists quantity numeric(14,3)
    constraint marketplace_listings_quantity_pos check (quantity > 0),
  add column if not exists unit text
    constraint marketplace_listings_unit_len check (char_length(unit) <= 24),
  add column if not exists expires_at timestamptz;

-- A stated amount always names its currency (descriptive, not a ledger).
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_price_needs_currency;
alter table public.marketplace_listings
  add constraint marketplace_listings_price_needs_currency
    check (price_amount is null or currency is not null);

-- 3. Widen status (+ 'paused') and open category (closed list -> FORMAT) ───
--    Existing values stay valid; no row is rewritten.
alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_status_check
    check (status in ('draft','active','paused','closed'));

alter table public.marketplace_listings drop constraint if exists marketplace_listings_category_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_category_fmt
    check (category ~ '^[a-z][a-z0-9_]{1,40}$');

-- Post-condition: the OLD closed category list must be gone, whatever the
-- original constraint was auto-named on this database.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketplace_listings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%safety_equipment%'
  ) then
    raise exception 'old closed category CHECK still present on marketplace_listings';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketplace_listings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%''draft''%'
      and pg_get_constraintdef(oid) not like '%''paused''%'
  ) then
    raise exception 'old status CHECK still present on marketplace_listings';
  end if;
end $$;

-- 4. SELECT policy: active AND not-expired for authenticated; own rows always;
--    admin sees all. Rows without expires_at behave exactly as before.
drop policy if exists marketplace_listings_select on public.marketplace_listings;
create policy marketplace_listings_select on public.marketplace_listings
  for select using (
    (status = 'active' and (expires_at is null or expires_at > now()))
    or owner_id = auth.uid()
    or public.is_admin());

-- 5. service_offerings: nullable additive columns ONLY ──────────────────────
--    (organization_id is DEFERRED to a follow-up: it needs RPC/RLS changes.)
alter table public.service_offerings
  add column if not exists expires_at timestamptz,
  add column if not exists price_amount numeric(14,2)
    constraint service_offerings_price_amount_nonneg check (price_amount >= 0),
  add column if not exists currency char(3)
    constraint service_offerings_currency_fmt check (currency ~ '^[A-Z]{3}$'),
  add column if not exists location_label text
    constraint service_offerings_location_label_len check (char_length(location_label) <= 120);

alter table public.service_offerings
  drop constraint if exists service_offerings_price_needs_currency;
alter table public.service_offerings
  add constraint service_offerings_price_needs_currency
    check (price_amount is null or currency is not null);

-- An expired offering stops being discoverable (owner still sees their own).
drop policy if exists service_offerings_discover_active on public.service_offerings;
create policy service_offerings_discover_active on public.service_offerings
  for select to authenticated
  using (status = 'active' and (expires_at is null or expires_at > now()));

-- 6. Policy hook ─────────────────────────────────────────────────────────────
--    v1 reads NOTHING about age / identity. Allowed = registered + active
--    subject, with a coherent direction. p_actor / p_org are accepted so a
--    future guardian / legal-facts table plugs in HERE with no schema change
--    to the listing tables and no signature change for callers.
create or replace function public.market_publish_policy_v1(
  p_actor uuid,
  p_org uuid,
  p_domain text,
  p_subject text,
  p_direction text
) returns table (allowed boolean, reason_key text)
language plpgsql stable set search_path = public as $$
begin
  if p_direction is null or p_direction not in ('offer', 'need') then
    return query select false, 'invalid_direction'::text;
    return;
  end if;
  if not exists (
    select 1 from public.market_subject_types r
    where r.domain = p_domain and r.subject = p_subject
  ) then
    return query select false, 'unknown_subject'::text;
    return;
  end if;
  if not exists (
    select 1 from public.market_subject_types r
    where r.domain = p_domain and r.subject = p_subject and r.active
  ) then
    return query select false, 'inactive_subject'::text;
    return;
  end if;
  -- A free-standing SERVICE NEED is a need by definition; offers of services
  -- live on service_offerings.
  if p_domain = 'service_need' and p_direction <> 'need' then
    return query select false, 'direction_not_allowed'::text;
    return;
  end if;
  -- Project / contract NEEDS live in the projects domain, not in listings;
  -- a contractor may still OFFER project capability.
  if p_domain = 'project_work' and p_direction <> 'offer' then
    return query select false, 'direction_not_allowed'::text;
    return;
  end if;
  return query select true, 'ok'::text;
end; $$;

-- 7. Write RPCs v2 (v1 signatures stay FROZEN and callable) ─────────────────
create or replace function public.create_marketplace_listing_v2(
  p_listing_kind text,
  p_category text,
  p_title text,
  p_description text default null,
  p_location_country text default null,
  p_location_label text default null,
  p_price_text text default null,
  p_organization_id uuid default null,
  p_project_id uuid default null,
  p_price_amount numeric default null,
  p_currency text default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
  v_domain text;
  v_ok boolean;
  v_reason text;
  v_cur text := nullif(upper(trim(coalesce(p_currency, ''))), '');
begin
  if v_actor is null then raise exception 'not authorized'; end if;
  if p_listing_kind not in ('sale','rental','wanted') then raise exception 'invalid listing_kind'; end if;
  select r.domain into v_domain from public.market_subject_types r
    where r.subject = p_category and r.active;
  if v_domain is null then raise exception 'invalid category'; end if;
  if p_title is null or char_length(trim(p_title)) < 3 then raise exception 'title required'; end if;
  if p_price_amount is not null then
    if p_price_amount < 0 or p_price_amount >= 1000000000000 then raise exception 'invalid price_amount'; end if;
    if v_cur is null or v_cur !~ '^[A-Z]{3}$' then raise exception 'currency required'; end if;
  else
    v_cur := null;
  end if;
  if p_quantity is not null and (p_quantity <= 0 or p_quantity >= 100000000000) then
    raise exception 'invalid quantity';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;
  -- A listing may be attached to an org / project ONLY if the caller controls it.
  if p_organization_id is not null and not public.manages_organization(p_organization_id)
    then raise exception 'not authorized for organization'; end if;
  if p_project_id is not null and not public.can_manage_project(p_project_id)
    then raise exception 'not authorized for project'; end if;

  select p.allowed, p.reason_key into v_ok, v_reason
    from public.market_publish_policy_v1(
      v_actor, p_organization_id, v_domain, p_category,
      case when p_listing_kind = 'wanted' then 'need' else 'offer' end) p;
  if not coalesce(v_ok, false) then
    raise exception 'publish not allowed: %', coalesce(v_reason, 'unknown');
  end if;

  insert into public.marketplace_listings (
    owner_id, organization_id, project_id, listing_kind, category, title, description,
    location_country, location_label, price_text,
    price_amount, currency, quantity, unit, expires_at)
  values (
    v_actor, p_organization_id, p_project_id, p_listing_kind, p_category,
    left(trim(p_title),160),
    nullif(left(coalesce(p_description,''),2000),''),
    nullif(upper(left(coalesce(p_location_country,''),2)),''),
    nullif(left(coalesce(p_location_label,''),120),''),
    nullif(left(coalesce(p_price_text,''),80),''),
    p_price_amount, v_cur, p_quantity,
    nullif(left(trim(coalesce(p_unit,'')),24),''),
    p_expires_at)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_marketplace_listing_v2(
  p_id uuid,
  p_title text,
  p_category text,
  p_listing_kind text,
  p_description text default null,
  p_location_country text default null,
  p_location_label text default null,
  p_price_text text default null,
  p_price_amount numeric default null,
  p_currency text default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_expires_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_org uuid;
  v_old_expires timestamptz;
  v_domain text;
  v_ok boolean;
  v_reason text;
  v_cur text := nullif(upper(trim(coalesce(p_currency, ''))), '');
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id, organization_id, expires_at into v_owner, v_org, v_old_expires
    from public.marketplace_listings where id = p_id;
  if v_owner is null then raise exception 'listing not found'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if p_listing_kind not in ('sale','rental','wanted') then raise exception 'invalid listing_kind'; end if;
  select r.domain into v_domain from public.market_subject_types r
    where r.subject = p_category and r.active;
  if v_domain is null then raise exception 'invalid category'; end if;
  if p_title is null or char_length(trim(p_title)) < 3 then raise exception 'title required'; end if;
  if p_price_amount is not null then
    if p_price_amount < 0 or p_price_amount >= 1000000000000 then raise exception 'invalid price_amount'; end if;
    if v_cur is null or v_cur !~ '^[A-Z]{3}$' then raise exception 'currency required'; end if;
  else
    v_cur := null;
  end if;
  if p_quantity is not null and (p_quantity <= 0 or p_quantity >= 100000000000) then
    raise exception 'invalid quantity';
  end if;
  if p_expires_at is not null and p_expires_at is distinct from v_old_expires and p_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;

  select p.allowed, p.reason_key into v_ok, v_reason
    from public.market_publish_policy_v1(
      auth.uid(), v_org, v_domain, p_category,
      case when p_listing_kind = 'wanted' then 'need' else 'offer' end) p;
  if not coalesce(v_ok, false) then
    raise exception 'publish not allowed: %', coalesce(v_reason, 'unknown');
  end if;

  update public.marketplace_listings set
    title = left(trim(p_title),160),
    category = p_category,
    listing_kind = p_listing_kind,
    description = nullif(left(coalesce(p_description,''),2000),''),
    location_country = nullif(upper(left(coalesce(p_location_country,''),2)),''),
    location_label = nullif(left(coalesce(p_location_label,''),120),''),
    price_text = nullif(left(coalesce(p_price_text,''),80),''),
    price_amount = p_price_amount,
    currency = v_cur,
    quantity = p_quantity,
    unit = nullif(left(trim(coalesce(p_unit,'')),24),''),
    expires_at = p_expires_at,
    updated_at = now()
  where id = p_id;
end; $$;

-- v1 set_status cannot name 'paused' (frozen CHECK-list in its body); v2 can.
create or replace function public.set_marketplace_listing_status_v2(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.marketplace_listings%rowtype;
  v_domain text;
  v_ok boolean;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select * into v_row from public.marketplace_listings where id = p_id;
  if v_row.id is null then raise exception 'listing not found'; end if;
  if v_row.owner_id is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','active','paused','closed') then raise exception 'invalid status'; end if;
  if p_status = 'active' then
    if v_row.expires_at is not null and v_row.expires_at <= now() then
      raise exception 'listing expired';
    end if;
    select r.domain into v_domain from public.market_subject_types r
      where r.subject = v_row.category and r.active;
    if v_domain is null then raise exception 'invalid category'; end if;
    select p.allowed, p.reason_key into v_ok, v_reason
      from public.market_publish_policy_v1(
        auth.uid(), v_row.organization_id, v_domain, v_row.category,
        case when v_row.listing_kind = 'wanted' then 'need' else 'offer' end) p;
    if not coalesce(v_ok, false) then
      raise exception 'publish not allowed: %', coalesce(v_reason, 'unknown');
    end if;
  end if;
  update public.marketplace_listings set status = p_status, updated_at = now() where id = p_id;
end; $$;

-- 8. Backstop: activation by ANY path (including the frozen v1 set_status RPC)
--    runs the same policy hook, so the hook cannot be bypassed by calling v1.
--    For the 7 existing work categories the verdict is always 'allowed', so
--    existing behaviour is unchanged.
create or replace function public.marketplace_listings_publish_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_domain text;
  v_ok boolean;
  v_reason text;
begin
  if new.status = 'active' then
    select r.domain into v_domain from public.market_subject_types r
      where r.subject = new.category and r.active;
    if v_domain is null then raise exception 'invalid category'; end if;
    select p.allowed, p.reason_key into v_ok, v_reason
      from public.market_publish_policy_v1(
        new.owner_id, new.organization_id, v_domain, new.category,
        case when new.listing_kind = 'wanted' then 'need' else 'offer' end) p;
    if not coalesce(v_ok, false) then
      raise exception 'publish not allowed: %', coalesce(v_reason, 'unknown');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists marketplace_listings_publish_guard_trg on public.marketplace_listings;
create trigger marketplace_listings_publish_guard_trg
  before insert or update of status, category, listing_kind on public.marketplace_listings
  for each row execute function public.marketplace_listings_publish_guard();

-- 9. (moved) The anon-reachable get_public_business_listings_v1 expiry predicate
--    ships in 20261002170100_marketplace_public_business_expiry_v1.sql.

-- 10. ONE discovery view. Each branch rides its OWN table's RLS
--     (security_invoker). Demand (customer_requests) and public_vacancies are
--     deliberately NOT unioned: they stay on their own DEFINER RPCs.
create or replace view public.market_index_v1
with (security_invoker = true) as
select
  'marketplace_listings'::text                    as source_table,
  m.id                                            as source_id,
  m.owner_id                                      as owner_id,
  m.organization_id                               as organization_id,
  coalesce(r.domain, 'other')::text               as domain,
  m.category::text                                as subject,
  (case m.listing_kind
     when 'wanted' then 'need'
     when 'sale'   then 'offer'
     when 'rental' then 'offer'
     else 'other'
   end)::text                                     as direction,
  m.title::text                                   as title,
  m.description::text                             as description,
  m.location_country                              as location_country,
  m.location_label::text                          as location_label,
  m.price_text::text                              as price_text,
  m.price_amount                                  as price_amount,
  m.currency                                      as currency,
  m.quantity                                      as quantity,
  m.unit::text                                    as unit,
  m.expires_at                                    as expires_at,
  m.status::text                                  as status,
  m.created_at                                    as created_at,
  m.updated_at                                    as updated_at,
  'platform'::text                                as provenance,
  -- DERIVED expressions only (no stored duplicate data). Only routes that
  -- exist today: listings have no per-item route, so the destination is the
  -- listings surface with an anchor/highlight param.
  ('/dashboard/listings?focus=' || m.id::text)    as destination_path,
  'enquire'::text                                 as contact_action
from public.marketplace_listings m
left join public.market_subject_types r on r.subject = m.category
where m.status = 'active'
  and (m.expires_at is null or m.expires_at > now())
union all
select
  'service_offerings'::text,
  s.id,
  s.provider_id,
  null::uuid,
  'service'::text,
  s.category_slug::text,
  'offer'::text,
  s.title::text,
  s.description::text,
  s.location_country,
  s.location_label::text,
  s.rate_text::text,
  s.price_amount,
  s.currency,
  null::numeric(14,3),
  null::text,
  s.expires_at,
  s.status::text,
  s.created_at,
  s.updated_at,
  'platform'::text,
  -- No per-offering route exists today (offerings render inline on the
  -- services surface and on people/[workerId] and business pages).
  '/dashboard/services'::text,
  'request_service'::text
from public.service_offerings s
where s.status = 'active'
  and (s.expires_at is null or s.expires_at > now());

-- 11. Privileges — authenticated only. Supabase default privileges would
--     otherwise hand EXECUTE / table rights to anon; revoke explicitly.
revoke all on public.market_index_v1 from public;
revoke all on public.market_index_v1 from anon;
revoke all on public.market_index_v1 from authenticated;
grant select on public.market_index_v1 to authenticated;

revoke execute on function public.market_publish_policy_v1(uuid, uuid, text, text, text) from public;
revoke execute on function public.market_publish_policy_v1(uuid, uuid, text, text, text) from anon;
grant  execute on function public.market_publish_policy_v1(uuid, uuid, text, text, text) to authenticated;

revoke execute on function public.create_marketplace_listing_v2(text, text, text, text, text, text, text, uuid, uuid, numeric, text, numeric, text, timestamptz) from public;
revoke execute on function public.create_marketplace_listing_v2(text, text, text, text, text, text, text, uuid, uuid, numeric, text, numeric, text, timestamptz) from anon;
grant  execute on function public.create_marketplace_listing_v2(text, text, text, text, text, text, text, uuid, uuid, numeric, text, numeric, text, timestamptz) to authenticated;

revoke execute on function public.update_marketplace_listing_v2(uuid, text, text, text, text, text, text, text, numeric, text, numeric, text, timestamptz) from public;
revoke execute on function public.update_marketplace_listing_v2(uuid, text, text, text, text, text, text, text, numeric, text, numeric, text, timestamptz) from anon;
grant  execute on function public.update_marketplace_listing_v2(uuid, text, text, text, text, text, text, text, numeric, text, numeric, text, timestamptz) to authenticated;

revoke execute on function public.set_marketplace_listing_status_v2(uuid, text) from public;
revoke execute on function public.set_marketplace_listing_status_v2(uuid, text) from anon;
grant  execute on function public.set_marketplace_listing_status_v2(uuid, text) to authenticated;

-- The trigger function is never called directly.
revoke execute on function public.marketplace_listings_publish_guard() from public;
revoke execute on function public.marketplace_listings_publish_guard() from anon;
revoke execute on function public.marketplace_listings_publish_guard() from authenticated;

commit;

-- ROLLBACK: see supabase/rollbacks/20261002170000_marketplace_index_v1.down.sql
