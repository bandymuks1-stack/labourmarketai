-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- P0 Marketplace — first request loop slice. Additive only: ONE new discovery
-- RLS policy on the EXISTING service_offerings (no schema change to it, the W8
-- migration file stays frozen), ONE new table, and THREE SECURITY DEFINER RPCs.
-- No existing table is altered; no existing row is mutated at apply time.
--
-- The loop: a buyer DISCOVERS active offerings (authenticated-only), REQUESTS a
-- specific offering → the request lands in the provider's inbox → the provider
-- ACCEPTS/DECLINES → the buyer sees the status. Withdraw is the buyer's.
--
-- Honesty / safety invariants:
--   * Discovery is AUTHENTICATED-ONLY and ACTIVE-ONLY. The added policy lets a
--     signed-in user SELECT service_offerings rows where status='active'. It adds
--     NO insert/update/delete cross-user; NO anon/public grant; it exposes only
--     the fields the provider already published as active (no contact details
--     are stored on the table; no buyer data).
--   * service_offering_requests is 2-PARTY scoped: only the buyer, the provider,
--     and admin can SELECT a row. Writes are RPC-ONLY (no insert/update/delete
--     grant, no write policy) — the three SECURITY DEFINER RPCs are the only
--     writers, and each re-checks live identity + scope at fire time.
--   * No payment, no rating, no fake data, no seed rows.
--
-- ROLLBACK: supabase/rollbacks/20260627145318_service_offering_requests.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

-- 1. Discovery: authenticated users may SEE active offerings (additive policy on
--    the existing table; owners still see their own any-status via the W8 policy).
drop policy if exists service_offerings_discover_active on public.service_offerings;
create policy service_offerings_discover_active on public.service_offerings
  for select to authenticated
  using (status = 'active');

-- 2. The request object — a buyer's intent toward one offering.
create table if not exists public.service_offering_requests (
  id            uuid primary key default gen_random_uuid(),
  offering_id   uuid not null references public.service_offerings(id) on delete cascade,
  -- denormalized from the offering at request time so RLS + provider scope are
  -- cheap and stable even if the offering later changes hands (it cannot today).
  provider_id   uuid not null references public.profiles(id) on delete cascade,
  buyer_id      uuid not null references public.profiles(id) on delete cascade,
  message       text check (message is null or char_length(message) <= 2000),
  status        text not null default 'sent'
                  check (status in ('sent','accepted','declined','withdrawn')),
  response_note text check (response_note is null or char_length(response_note) <= 2000),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- a buyer cannot request their own offering
  constraint service_offering_requests_not_self check (buyer_id <> provider_id)
);
-- one OPEN request per buyer per offering (no spam / duplicate open intents)
create unique index if not exists service_offering_requests_one_open_idx
  on public.service_offering_requests (offering_id, buyer_id)
  where status = 'sent';
create index if not exists service_offering_requests_provider_idx
  on public.service_offering_requests (provider_id, status, created_at desc);
create index if not exists service_offering_requests_buyer_idx
  on public.service_offering_requests (buyer_id, created_at desc);

-- 3. RLS — 2-party visibility; writes are RPC-only (no write policy, no write grant).
alter table public.service_offering_requests enable row level security;

drop policy if exists service_offering_requests_select on public.service_offering_requests;
create policy service_offering_requests_select on public.service_offering_requests
  for select to authenticated
  using (buyer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

-- SELECT only. The three RPCs below (SECURITY DEFINER) are the ONLY writers.
grant select on public.service_offering_requests to authenticated;

-- 4. RPCs — the only write path. Each re-checks auth.uid() and the specific scope
--    at fire time. Status only ever moves OUT of 'sent' (terminal states never
--    transition). No verified writes, no payment.

-- 4a. Buyer requests an ACTIVE offering. Binds provider_id from the offering
--     (never trusts the caller). Returns the new request id.
create or replace function public.request_service_offering(
  p_offering_id uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_provider uuid; v_status text; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select provider_id, status into v_provider, v_status
    from public.service_offerings where id = p_offering_id;
  if not found then raise exception 'offering_not_found' using errcode = 'P0002'; end if;
  if v_status <> 'active' then raise exception 'offering_not_active' using errcode = 'P0002'; end if;
  if v_provider = uid then raise exception 'cannot_request_own_offering' using errcode = '42501'; end if;

  insert into public.service_offering_requests (offering_id, provider_id, buyer_id, message, status)
  values (p_offering_id, v_provider, uid,
          nullif(btrim(coalesce(p_message, '')), ''), 'sent')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_service_offering(uuid, text) from public;
grant execute on function public.request_service_offering(uuid, text) to authenticated;

-- 4b. Provider responds to a request FOR THEIR OWN offering. Only the provider,
--     only while 'sent', only accepted/declined.
create or replace function public.respond_service_offering_request(
  p_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_provider uuid; v_status text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('accepted','declined') then return 'bad_decision'; end if;
  select provider_id, status into v_provider, v_status
    from public.service_offering_requests where id = p_id;
  if not found then return 'not_found'; end if;
  if v_provider <> uid then return 'not_provider'; end if;     -- live provider scope
  if v_status <> 'sent' then return 'not_pending'; end if;     -- terminal states are immutable

  update public.service_offering_requests
     set status = p_decision,
         response_note = nullif(btrim(coalesce(p_note, '')), ''),
         responded_at = now(), updated_at = now()
   where id = p_id;
  return 'ok';
end $$;
revoke all on function public.respond_service_offering_request(uuid, text, text) from public;
grant execute on function public.respond_service_offering_request(uuid, text, text) to authenticated;

-- 4c. Buyer withdraws their OWN request while still 'sent'.
create or replace function public.withdraw_service_offering_request(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_buyer uuid; v_status text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select buyer_id, status into v_buyer, v_status
    from public.service_offering_requests where id = p_id;
  if not found then return 'not_found'; end if;
  if v_buyer <> uid then return 'not_buyer'; end if;          -- live buyer scope
  if v_status <> 'sent' then return 'not_pending'; end if;

  update public.service_offering_requests
     set status = 'withdrawn', updated_at = now()
   where id = p_id;
  return 'ok';
end $$;
revoke all on function public.withdraw_service_offering_request(uuid) from public;
grant execute on function public.withdraw_service_offering_request(uuid) to authenticated;

commit;
