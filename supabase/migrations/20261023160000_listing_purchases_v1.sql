-- @human-gate-approved
-- ============================================================================
-- DRAFT — needs-human-gate — RED class. DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push` / `prisma migrate deploy`.
--
-- 20261023160000 — listing purchases v1 (registry 6.13 goods purchase
-- lifecycle + 6.14 delivery fields). The owner calls it an "order"; in the
-- product vocabulary it is a PURCHASE REQUEST on a goods listing (the word
-- "order" stays out of in-app copy — lib/guards/concept-naming-drift.test.ts —
-- so ONE transaction dictionary survives: service request for services,
-- purchase request for goods).
--
-- WHY A NEW TABLE (doctrine §2 canonical check, searched by concept + history):
--   * marketplace_listings is the THING offered — one row per listing, many
--     buyers; a purchase is a second party's intent with its own lifecycle.
--   * service_offering_requests is the same SHAPE for services but its FK,
--     RLS and conversation source are bound to service_offerings; widening it
--     to listings would mix two parents in one FK column (no FK possible).
--   * customer_requests is DEMAND (the sole structured-demand intake); a
--     purchase is a response to a published OFFER (SEP-4: DEMAND ≠ SUPPLY).
--   * proposals / agreements (MKT-4) are org-scoped negotiation documents,
--     person-party agreements are NOT BUILT; a goods purchase must work for a
--     person buying from a person.
--   * finance records are money facts; NO money moves here.
--   So ONE new table, mirroring service_offering_requests (2-party RLS,
--   RPC-only writes, one open intent per buyer per item) and the listing
--   tables' authority predicate (manages_organization) for organizations.
--
-- WHAT IT IS:
--   requested → accepted → fulfilled
--   requested → declined            (seller)
--   requested | accepted → cancelled (buyer; seller only from accepted)
--   Terminal states never move. Every transition runs through ONE definer RPC
--   with `for update` on the row (no lost update between two managers).
--
-- NO PAYMENT. payment_arrangement has exactly one value today,
-- 'direct_between_parties' — the honest state: the parties settle payment
-- themselves. It is the clean extension point: a later, owner-armed checkout
-- widens this CHECK (MKT-7 two owner acts), it never repurposes a column.
--
-- LOGISTICS (6.14) = delivery fields ONLY: pickup | delivery, an address
-- REFERENCE (a short label the buyer chooses to share, e.g. "site gate B,
-- Kaunas" — never a structured home address), country, requested date and a
-- seller-written carrier note. No carrier integration, no tracking, no fees.
--
-- TERMS SNAPSHOT (evidence, not a stale copy): listing_title, unit and the
-- stated price are recorded AS SHOWN WHEN REQUESTED. The listing can be edited
-- or closed afterwards; the purchase must still say what was asked for
-- (doctrine §3 reliability). This mirrors conversations.subject snapshotting
-- the source title at creation.
--
-- ORGANIZATION-AWARE: seller_organization_id is bound from the listing at
-- request time (never from the caller); buyer_organization_id is the buyer's
-- governed organization, validated with manages_organization. Managers of
-- either organization read and act for their side.
--
-- DELETION NEVER ERASES A PURCHASE: listing_id is ON DELETE SET NULL. A
-- deleted listing (by its owner, or by the erasure cascade of the owner's
-- account — marketplace_listings.owner_id is allow_cascade) leaves every
-- purchase on it intact, still readable by both parties through the terms
-- snapshot. This deliberately differs from service_offering_requests, whose
-- offering_id cascade erased buyers' requests (audit 2026-10-20) and needed an
-- app-level refusal to compensate.
--
-- PRIVACY: free text (buyer_note, seller_note, delivery_location_label,
-- carrier_note) is scrubbed when a party's identity is severed (registry rows
-- below; legal_review = true, retention not yet documented → the erasure plan
-- refuses for affected people and sends them to human review, the same
-- conservative state service_offering_requests holds).
--
-- SELF-PURCHASE is refused in the request RPC (the only writer), not by a
-- table CHECK: a CHECK buyer_id <> seller_id would make the SECOND party's
-- erasure fail once the first was already severed to the same sentinel.
--
-- What this migration does NOT touch: no existing table, policy, function,
-- trigger or row is altered. conversations and its source_type CHECK are
-- untouched (the thread opens through a grant, without a source stamp).
--
-- ROLLBACK: supabase/rollbacks/20261023160000_listing_purchases_v1.down.sql
-- (guarded: refuses while any purchase row exists).
-- ============================================================================

begin;

-- 1. The purchase object ─────────────────────────────────────────────────────
create table if not exists public.listing_purchases (
  id                       uuid primary key default gen_random_uuid(),
  listing_id               uuid references public.marketplace_listings(id) on delete set null,
  seller_id                uuid not null references public.profiles(id) on delete cascade,
  seller_organization_id   uuid references public.organizations(id) on delete set null,
  buyer_id                 uuid not null references public.profiles(id) on delete cascade,
  buyer_organization_id    uuid references public.organizations(id) on delete set null,
  listing_title            text not null check (char_length(listing_title) between 1 and 160),
  unit                     text check (unit is null or char_length(unit) <= 24),
  price_amount             numeric(14,2) check (price_amount is null or price_amount >= 0),
  currency                 char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  price_text               text check (price_text is null or char_length(price_text) <= 80),
  quantity                 numeric(14,3) not null check (quantity > 0 and quantity < 100000000000),
  buyer_note               text check (buyer_note is null or char_length(buyer_note) <= 2000),
  fulfilment_method        text not null check (fulfilment_method in ('pickup','delivery')),
  delivery_location_label  text check (delivery_location_label is null or char_length(delivery_location_label) <= 200),
  delivery_country         char(2) check (delivery_country is null or delivery_country ~ '^[A-Z]{2}$'),
  requested_date           date,
  carrier_note             text check (carrier_note is null or char_length(carrier_note) <= 500),
  payment_arrangement      text not null default 'direct_between_parties'
                             check (payment_arrangement in ('direct_between_parties')),
  status                   text not null default 'requested'
                             check (status in ('requested','accepted','fulfilled','declined','cancelled')),
  seller_note              text check (seller_note is null or char_length(seller_note) <= 2000),
  cancelled_by             text check (cancelled_by is null or cancelled_by in ('buyer','seller')),
  responded_at             timestamptz,
  fulfilled_at             timestamptz,
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint listing_purchases_price_needs_currency check (price_amount is null or currency is not null),
  constraint listing_purchases_delivery_needs_place check (
    fulfilment_method <> 'delivery' or delivery_location_label is not null),
  constraint listing_purchases_cancel_coherent check (
    (status = 'cancelled') = (cancelled_by is not null and cancelled_at is not null))
);

-- One OPEN request per buyer per listing (no spam / duplicate open intents).
create unique index if not exists listing_purchases_one_open_idx
  on public.listing_purchases (listing_id, buyer_id)
  where status = 'requested';
create index if not exists listing_purchases_seller_idx
  on public.listing_purchases (seller_id, status, created_at desc);
create index if not exists listing_purchases_buyer_idx
  on public.listing_purchases (buyer_id, created_at desc);
create index if not exists listing_purchases_seller_org_idx
  on public.listing_purchases (seller_organization_id)
  where seller_organization_id is not null;
create index if not exists listing_purchases_buyer_org_idx
  on public.listing_purchases (buyer_organization_id)
  where buyer_organization_id is not null;

comment on table public.listing_purchases is
  'Goods purchase request on a marketplace listing (registry 6.13 + 6.14 delivery fields). Two-party RLS, organization-aware; writes only through request_listing_purchase_v1 / transition_listing_purchase_v1. No payment: payment_arrangement = direct_between_parties is the honest state and the extension point.';

-- 2. RLS — the two parties (and managers of either side's organization) read;
--    writes are RPC-only (no write policy, no write grant).
alter table public.listing_purchases enable row level security;

drop policy if exists listing_purchases_select on public.listing_purchases;
create policy listing_purchases_select on public.listing_purchases
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or (seller_organization_id is not null and public.manages_organization(seller_organization_id))
    or (buyer_organization_id is not null and public.manages_organization(buyer_organization_id))
    or public.is_admin()
  );

revoke all on public.listing_purchases from public;
revoke all on public.listing_purchases from anon;
revoke all on public.listing_purchases from authenticated;
grant select on public.listing_purchases to authenticated;

-- 3. Request — the buyer's door. Binds seller, seller organization and the
--    terms snapshot from the listing (never from the caller).
create or replace function public.request_listing_purchase_v1(
  p_listing_id uuid,
  p_quantity numeric,
  p_fulfilment_method text,
  p_note text default null,
  p_delivery_location_label text default null,
  p_delivery_country text default null,
  p_requested_date date default null,
  p_buyer_organization_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_listing public.marketplace_listings%rowtype;
  v_domain text;
  v_label text := nullif(left(btrim(coalesce(p_delivery_location_label, '')), 200), '');
  v_country text := nullif(upper(btrim(coalesce(p_delivery_country, ''))), '');
  v_id uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select * into v_listing from public.marketplace_listings where id = p_listing_id;
  if v_listing.id is null then raise exception 'listing_not_found' using errcode = 'P0002'; end if;
  if v_listing.status <> 'active'
     or (v_listing.expires_at is not null and v_listing.expires_at <= now()) then
    raise exception 'listing_not_active' using errcode = 'P0002';
  end if;

  -- Purchasable = a SALE of goods or of a movable work resource. Rentals,
  -- wanted listings, property (accommodation / premises), personal and
  -- project work are not goods purchases.
  select r.domain into v_domain from public.market_subject_types r where r.subject = v_listing.category;
  if v_listing.listing_kind <> 'sale'
     or v_domain is null
     or v_domain not in ('goods', 'work_resource')
     or v_listing.category in ('accommodation', 'premises') then
    raise exception 'listing_not_purchasable' using errcode = '22023';
  end if;

  if v_listing.owner_id = uid then
    raise exception 'cannot_purchase_own_listing' using errcode = '42501';
  end if;
  if v_listing.organization_id is not null and public.manages_organization(v_listing.organization_id) then
    raise exception 'cannot_purchase_own_listing' using errcode = '42501';
  end if;
  if p_buyer_organization_id is not null then
    if not public.manages_organization(p_buyer_organization_id) then
      raise exception 'not_authorized_for_organization' using errcode = '42501';
    end if;
    if p_buyer_organization_id = v_listing.organization_id then
      raise exception 'cannot_purchase_own_listing' using errcode = '42501';
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity >= 100000000000 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if v_listing.quantity is not null and p_quantity > v_listing.quantity then
    raise exception 'quantity_exceeds_listing' using errcode = '22023';
  end if;
  if p_fulfilment_method is null or p_fulfilment_method not in ('pickup', 'delivery') then
    raise exception 'invalid_fulfilment_method' using errcode = '22023';
  end if;
  if p_fulfilment_method = 'delivery' and v_label is null then
    raise exception 'delivery_place_required' using errcode = '22023';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country' using errcode = '22023';
  end if;
  if p_requested_date is not null and p_requested_date < current_date then
    raise exception 'requested_date_in_past' using errcode = '22023';
  end if;

  insert into public.listing_purchases (
    listing_id, seller_id, seller_organization_id, buyer_id, buyer_organization_id,
    listing_title, unit, price_amount, currency, price_text,
    quantity, buyer_note, fulfilment_method, delivery_location_label,
    delivery_country, requested_date)
  values (
    v_listing.id, v_listing.owner_id, v_listing.organization_id, uid, p_buyer_organization_id,
    left(v_listing.title, 160), v_listing.unit, v_listing.price_amount, v_listing.currency, v_listing.price_text,
    p_quantity,
    nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
    p_fulfilment_method,
    case when p_fulfilment_method = 'delivery' then v_label end,
    case when p_fulfilment_method = 'delivery' then v_country end,
    p_requested_date)
  returning id into v_id;
  return v_id;
end; $$;

-- 4. Transition — ONE door for every status move. Returns a reason token
--    (never raises for a business refusal) so the app maps it to copy.
--    seller side = seller_id or a manager of seller_organization_id;
--    buyer side  = buyer_id  or a manager of buyer_organization_id.
create or replace function public.transition_listing_purchase_v1(
  p_id uuid,
  p_action text,
  p_note text default null,
  p_carrier_note text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_row public.listing_purchases%rowtype;
  v_seller boolean;
  v_buyer boolean;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
  v_carrier text := nullif(left(btrim(coalesce(p_carrier_note, '')), 500), '');
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept', 'decline', 'fulfil', 'cancel') then
    return 'bad_action';
  end if;

  select * into v_row from public.listing_purchases where id = p_id for update;
  if v_row.id is null then return 'not_found'; end if;

  v_seller := v_row.seller_id = uid
    or (v_row.seller_organization_id is not null and public.manages_organization(v_row.seller_organization_id));
  v_buyer := v_row.buyer_id = uid
    or (v_row.buyer_organization_id is not null and public.manages_organization(v_row.buyer_organization_id));
  if not v_seller and not v_buyer then return 'not_party'; end if;

  if p_action = 'accept' then
    if not v_seller then return 'not_seller'; end if;
    if v_row.status <> 'requested' then return 'invalid_transition'; end if;
    update public.listing_purchases
       set status = 'accepted', seller_note = coalesce(v_note, seller_note),
           carrier_note = coalesce(v_carrier, carrier_note),
           responded_at = now(), updated_at = now()
     where id = p_id;
  elsif p_action = 'decline' then
    if not v_seller then return 'not_seller'; end if;
    if v_row.status <> 'requested' then return 'invalid_transition'; end if;
    update public.listing_purchases
       set status = 'declined', seller_note = coalesce(v_note, seller_note),
           responded_at = now(), updated_at = now()
     where id = p_id;
  elsif p_action = 'fulfil' then
    if not v_seller then return 'not_seller'; end if;
    if v_row.status <> 'accepted' then return 'invalid_transition'; end if;
    update public.listing_purchases
       set status = 'fulfilled', seller_note = coalesce(v_note, seller_note),
           carrier_note = coalesce(v_carrier, carrier_note),
           fulfilled_at = now(), updated_at = now()
     where id = p_id;
  else -- cancel
    -- The buyer may withdraw while requested or accepted; the seller may
    -- cancel only what they accepted (a requested one is DECLINED instead).
    if v_buyer and v_row.status in ('requested', 'accepted') then
      update public.listing_purchases
         set status = 'cancelled', cancelled_by = 'buyer', cancelled_at = now(),
             buyer_note = coalesce(buyer_note, v_note), updated_at = now()
       where id = p_id;
    elsif v_seller and v_row.status = 'accepted' then
      update public.listing_purchases
         set status = 'cancelled', cancelled_by = 'seller', cancelled_at = now(),
             seller_note = coalesce(v_note, seller_note), updated_at = now()
       where id = p_id;
    else
      return 'invalid_transition';
    end if;
  end if;
  return 'ok';
end; $$;

-- 5. Privileges — authenticated only.
revoke execute on function public.request_listing_purchase_v1(uuid, numeric, text, text, text, text, date, uuid) from public;
revoke execute on function public.request_listing_purchase_v1(uuid, numeric, text, text, text, text, date, uuid) from anon;
grant  execute on function public.request_listing_purchase_v1(uuid, numeric, text, text, text, text, date, uuid) to authenticated;

revoke execute on function public.transition_listing_purchase_v1(uuid, text, text, text) from public;
revoke execute on function public.transition_listing_purchase_v1(uuid, text, text, text) from anon;
grant  execute on function public.transition_listing_purchase_v1(uuid, text, text, text) to authenticated;

-- 6. GDPR erasure decisions (privacy_erasure_registry_v3: an FK without a row
--    REFUSES the whole erasure by name). A party's identity on a counterparty
--    commercial record is severed to the sentinel and the free text scrubbed;
--    legal_review = true and no retention period yet → the plan refuses for an
--    affected person and routes to human review (owner / legal decide).
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, scrub_columns, note) values
  ('public', 'listing_purchases', 'buyer_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true,
   'Art. 17(3)(b)/(e): counterparty commercial record (goods purchase request) the person took part in - LEGAL TO CONFIRM retention',
   array['buyer_note','delivery_location_label','carrier_note']::text[],
   'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'listing_purchases', 'seller_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true,
   'Art. 17(3)(b)/(e): counterparty commercial record (goods purchase request) the person took part in - LEGAL TO CONFIRM retention',
   array['seller_note','carrier_note']::text[],
   'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;

commit;

-- ROLLBACK: see supabase/rollbacks/20261023160000_listing_purchases_v1.down.sql
-- (guarded: refuses while any listing_purchases row exists; drops the two
-- functions, the table and the two registry rows).
