-- @human-gate-approved
-- 20261024100000 - one lifecycle contract, the human-gated half (v1).
--
-- RED (needs-human-gate): a SECURITY DEFINER function + GRANT and two new
-- BEFORE UPDATE triggers. Apply only after the owner approves THIS migration
-- (owner channel, Supabase MCP apply_migration). The GREEN half is
-- 20261024090000.
--
-- WHY (owner architecture decision 2026-10-24, apps/web/lib/market-lifecycle):
--
--   A. LISTINGS record WHY they closed. Every own listing has the contract's
--      Complete and Remove-from-market actions, but marketplace_listings is
--      written only through SECURITY DEFINER RPCs, so the outcome needs a door:
--      set_marketplace_listing_status_v3 = the unchanged v2 checks (owner,
--      status list, expiry, the ONE publish policy) + the outcome.
--
--   B. A DISCARDED DRAFT NEVER RE-ENTERS THE MARKET, at the database, for
--      listings AND demand. Every need submitted from a draft leaves that draft
--      behind as `closed`, and the demand guard allows closed -> submitted for
--      any closed row, so "reopen" could publish a draft nobody submitted. The
--      app already refuses (contract); the triggers make every door refuse
--      (PostgREST, v2, v3, reopen_demand_v1, a colleague's call), including the
--      two-step path of first rewriting or clearing the outcome. Rows closed
--      before outcomes were recorded (closed_outcome NULL) keep today's
--      behaviour: nothing is inferred about history. Admin and calls without a
--      signed-in user (service role, runners) pass, exactly as the existing
--      demand transition guard lets them.
--
-- OWN TRIGGERS, NOT A REPLACED GUARD (owner decision 2026-11-14): this file
-- never replaces customer_requests_status_transition_guard. That function also
-- belongs to 20261109120000 (holder cancels account deletion); a second
-- CREATE OR REPLACE would silently drop whichever branch was applied first.
-- Separate trigger functions keep both rule sets whatever the apply order, and
-- each rollback removes only its own objects.
-- Proof, both apply orders: apps/web/scripts/db-proof/market-lifecycle-discard-guard-local.mjs
--
-- NOT HERE: a paused state for demand (separate, larger owner decision: it
-- touches the open-needs ceiling, matching and scouting).
--
-- SAFETY: additive nullable column (NULL for every existing row, no backfill);
-- v3 calls v2 for every check, so the publish policy stays ONE; the triggers
-- add refusals only for rows already closed as `discarded` (none exist when
-- this is applied for listings) and clear a stale outcome when a listing
-- leaves `closed`; every function pins search_path = public (20260727120000
-- L-08). Re-running this file is a no-op.
-- ROLLBACK: supabase/rollbacks/20261024100000_market_lifecycle_listing_outcome_and_discard_guard_v1.down.sql
-- POST-APPLY:
--   select proname, prosecdef from pg_proc where proname in
--     ('set_marketplace_listing_status_v3', 'marketplace_listings_discarded_guard',
--      'customer_requests_discarded_draft_guard');
--   select tgname, tgrelid::regclass from pg_trigger where tgname in
--     ('marketplace_listings_discarded_guard_trg', 'customer_requests_discarded_draft_guard_trg');
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'marketplace_listings_closed_outcome_check';

begin;

-- A. listings: why a closed listing is closed ─────────────────────────────
alter table public.marketplace_listings
  add column if not exists closed_outcome text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'marketplace_listings_closed_outcome_check'
       and conrelid = 'public.marketplace_listings'::regclass
  ) then
    alter table public.marketplace_listings
      add constraint marketplace_listings_closed_outcome_check
      check (closed_outcome is null or closed_outcome in ('completed', 'withdrawn', 'discarded'));
  end if;
end $$;
comment on column public.marketplace_listings.closed_outcome is
  'Why a closed listing is closed: completed | withdrawn | discarded. NULL = open, or closed before outcomes were recorded. lib/market-lifecycle/contract.ts';

create or replace function public.set_marketplace_listing_status_v3(
  p_id uuid,
  p_status text,
  p_closed_outcome text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_closed_outcome is not null
     and p_closed_outcome not in ('completed', 'withdrawn', 'discarded') then
    raise exception 'invalid closed outcome';
  end if;
  if p_status <> 'closed' and p_closed_outcome is not null then
    raise exception 'closed outcome only for closed';
  end if;
  -- Every other check (auth, owner, status list, expiry, publish policy) is
  -- v2's, unchanged: one policy, one door behind both versions. A discarded
  -- draft is refused by marketplace_listings_discarded_guard on either door.
  perform public.set_marketplace_listing_status_v2(p_id, p_status);
  -- Closing again without naming an outcome keeps the recorded one.
  update public.marketplace_listings
     set closed_outcome = case when p_status = 'closed'
                               then coalesce(p_closed_outcome, closed_outcome) end
   where id = p_id and owner_id = auth.uid();
end; $$;

revoke execute on function public.set_marketplace_listing_status_v3(uuid, text, text) from public;
revoke execute on function public.set_marketplace_listing_status_v3(uuid, text, text) from anon;
grant  execute on function public.set_marketplace_listing_status_v3(uuid, text, text) to authenticated;

-- B1. listings: a discarded draft stays closed and discarded ──────────────
create or replace function public.marketplace_listings_discarded_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.closed_outcome = 'discarded'
     and (new.status is distinct from 'closed' or new.closed_outcome is distinct from 'discarded')
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'a discarded draft cannot be published'
      using errcode = '23514';
  end if;
  -- An outcome describes a closed listing only.
  if new.status is distinct from 'closed' then
    new.closed_outcome := null;
  end if;
  return new;
end; $$;

create or replace trigger marketplace_listings_discarded_guard_trg
  before update of status, closed_outcome on public.marketplace_listings
  for each row execute function public.marketplace_listings_discarded_guard();

-- B2. demand: a discarded draft never re-enters the market ───────────────
create or replace function public.customer_requests_discarded_draft_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'closed' and old.closed_outcome = 'discarded'
     and (new.status is distinct from old.status or new.closed_outcome is distinct from old.closed_outcome)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'a discarded draft cannot be reopened'
      using errcode = '23514';
  end if;
  return new;
end; $$;

create or replace trigger customer_requests_discarded_draft_guard_trg
  before update of status, closed_outcome on public.customer_requests
  for each row execute function public.customer_requests_discarded_draft_guard();

-- Trigger functions are never called directly.
revoke execute on function public.marketplace_listings_discarded_guard() from public;
revoke execute on function public.marketplace_listings_discarded_guard() from anon;
revoke execute on function public.marketplace_listings_discarded_guard() from authenticated;
revoke execute on function public.customer_requests_discarded_draft_guard() from public;
revoke execute on function public.customer_requests_discarded_draft_guard() from anon;
revoke execute on function public.customer_requests_discarded_draft_guard() from authenticated;

commit;
