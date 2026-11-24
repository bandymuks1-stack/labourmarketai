-- 0026 — Customer / Buyer first-class entity (Stage 2 PR 1).
--
-- Closes the partial state surfaced by PR #93 / #95 / #97: the
-- /[locale]/dashboard/start/buyer page and the role catalogue both
-- carried explicit "missing public.customers table" blockers. This
-- migration creates the table, owns_customer() helper, RLS policies,
-- a focused save_customer_setup() RPC for the setup form, and
-- extends add_role()'s customer branch to insert the entity row.
--
-- Schema:
--   public.customers (
--     id, profile_id, contact_name, customer_type, country, market,
--     need_summary, contact_preference, review_status,
--     manual_review_note, created_at, updated_at
--   )
-- customer_type enum:  individual | small_business | nonprofit | other
-- review_status enum:  pending | in_review | approved | needs_followup
-- contact_preference enum: email | phone | platform_message
--
-- Helpers + RLS + grants mirror the existing companies/agencies pattern.
-- One human = one profiles row; one customers row per profile.
--
-- Self-entry stays open (signup → addRole('customer') still works).
-- This migration only adds capability; nothing existing is dropped.
--
-- Application status:
--   Migration file COMMITTED. Owner runs apply_migration separately.
--   /dashboard/start/buyer + /dashboard/buyer gracefully render
--   "Migration 0026 not yet applied" when the table/RPC are absent.

-- ── 1. Table ─────────────────────────────────────────────────────────
create table if not exists public.customers (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  contact_name        text,
  customer_type       text not null default 'individual'
                        check (customer_type in (
                          'individual','small_business','nonprofit','other'
                        )),
  country             text,
  market              text,
  need_summary        text,
  contact_preference  text not null default 'platform_message'
                        check (contact_preference in (
                          'email','phone','platform_message'
                        )),
  review_status       text not null default 'pending'
                        check (review_status in (
                          'pending','in_review','approved','needs_followup'
                        )),
  manual_review_note  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (profile_id)
);

-- ── 2. Helper: owns_customer ─────────────────────────────────────────
create or replace function public.owns_customer(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customers
    where id = c and profile_id = auth.uid()
  )
$$;

-- ── 3. RLS ───────────────────────────────────────────────────────────
alter table public.customers enable row level security;

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert
  with check (public.is_admin());
-- INSERT goes through the RPC only; reduces footgun risk.

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete
  using (public.is_admin());

-- ── 4. Grants ────────────────────────────────────────────────────────
grant select, update on public.customers to authenticated;
-- INSERT/DELETE intentionally not granted; INSERT via RPC, DELETE via admin.

-- ── 5. Setup RPC ─────────────────────────────────────────────────────
-- save_customer_setup is the one-shot upsert used by the buyer setup
-- form. It (a) creates the customer row if absent, (b) updates it if
-- present, and (c) ensures the user holds the 'customer' role via
-- profile_roles. The RPC is idempotent and never elevates roles other
-- than 'customer'.
create or replace function public.save_customer_setup(
  p_contact_name       text,
  p_customer_type      text default 'individual',
  p_country            text default null,
  p_market             text default null,
  p_need_summary       text default null,
  p_contact_preference text default 'platform_message',
  p_manual_review_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  customer_uuid  uuid;
  cleaned_name   text := nullif(trim(coalesce(p_contact_name, '')), '');
  cleaned_type   text := lower(trim(coalesce(p_customer_type, 'individual')));
  cleaned_pref   text := lower(trim(coalesce(p_contact_preference, 'platform_message')));
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_type not in ('individual','small_business','nonprofit','other') then
    raise exception 'Invalid customer_type: %', cleaned_type using errcode = '22023';
  end if;
  if cleaned_pref not in ('email','phone','platform_message') then
    raise exception 'Invalid contact_preference: %', cleaned_pref using errcode = '22023';
  end if;

  -- ensure profile_roles has customer (additive; never removes)
  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, 'customer', true, '{}'::jsonb)
  on conflict (profile_id, role) do update
     set is_active = true;

  -- upsert customers row
  insert into public.customers (
    profile_id, contact_name, customer_type, country, market,
    need_summary, contact_preference, manual_review_note
  ) values (
    uid,
    cleaned_name,
    cleaned_type,
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_market, '')), ''),
    nullif(trim(coalesce(p_need_summary, '')), ''),
    cleaned_pref,
    nullif(trim(coalesce(p_manual_review_note, '')), '')
  )
  on conflict (profile_id) do update set
    contact_name       = excluded.contact_name,
    customer_type      = excluded.customer_type,
    country            = coalesce(excluded.country, public.customers.country),
    market             = coalesce(excluded.market, public.customers.market),
    need_summary       = coalesce(excluded.need_summary, public.customers.need_summary),
    contact_preference = excluded.contact_preference,
    manual_review_note = coalesce(excluded.manual_review_note, public.customers.manual_review_note),
    updated_at         = now()
  returning id into customer_uuid;

  return customer_uuid;
end $$;

revoke all on function public.save_customer_setup(text, text, text, text, text, text, text) from public;
grant execute on function public.save_customer_setup(text, text, text, text, text, text, text) to authenticated;

-- ── 6. Extend add_role's customer branch ─────────────────────────────
-- Mirror the agency / company branches: if a profile already has a
-- customers row, do nothing; otherwise insert with sensible defaults
-- (contact_name pulled from profiles.full_name when present, country
-- inherited from profiles.country). This keeps addRole('customer')
-- end-to-end consistent with the agency / company flows.
create or replace function public.add_role(
  p_role      text,
  p_role_data jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  profile_country text;
  profile_name    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('worker','company','agency','customer') then
    raise exception 'Invalid role: %', p_role
      using errcode = '22023';
  end if;

  select country, full_name into profile_country, profile_name
    from public.profiles
   where id = uid;

  update public.profiles
     set active_role = p_role
   where id = uid;

  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, p_role, true, coalesce(p_role_data, '{}'::jsonb))
  on conflict (profile_id, role) do update
     set is_active = true,
         role_data = excluded.role_data;

  if p_role = 'worker' then
    insert into public.workers (
      profile_id,
      current_location_country
    )
    values (
      uid,
      nullif(trim(coalesce(profile_country, '')), '')
    )
    on conflict (profile_id) do nothing;

  elsif p_role = 'company' then
    if not exists (
      select 1 from public.companies where profile_id = uid
    ) then
      insert into public.companies (
        profile_id, legal_name, display_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(profile_country, '')), '')
      );
    end if;

  elsif p_role = 'agency' then
    if not exists (
      select 1 from public.agencies where profile_id = uid
    ) then
      insert into public.agencies (
        profile_id, legal_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(profile_country, '')), '')
      );
    end if;

  elsif p_role = 'customer' then
    if not exists (
      select 1 from public.customers where profile_id = uid
    ) then
      insert into public.customers (
        profile_id, contact_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', profile_name, '')), ''),
        nullif(trim(coalesce(profile_country, '')), '')
      );
    end if;
  end if;
end $$;
