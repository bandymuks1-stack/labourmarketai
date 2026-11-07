-- @human-gate-approved
-- 20261024100000 - one lifecycle contract, the human-gated half (v1).
--
-- RED (needs-human-gate): a SECURITY DEFINER function + GRANT, and a
-- replacement of the human-gated demand transition trigger function. Apply
-- only after the owner approves THIS migration (owner channel, Supabase MCP
-- apply_migration). The GREEN half is 20261024090000.
--
-- WHY (owner architecture decision 2026-10-24, apps/web/lib/market-lifecycle):
--
--   A. LISTINGS record WHY they closed. Every own listing has the contract's
--      Complete and Remove-from-market actions, but marketplace_listings is
--      written only through SECURITY DEFINER RPCs, so the outcome needs a door:
--      set_marketplace_listing_status_v3 = the unchanged v2 checks (owner,
--      status list, expiry, the ONE publish policy) + the outcome, and it
--      refuses to put a discarded draft back on the market.
--
--   B. A DISCARDED DEMAND DRAFT NEVER RE-ENTERS THE MARKET, at the database.
--      Every need submitted from a draft leaves that draft behind as `closed`
--      (production 2026-10-24), and the trigger allowed closed -> submitted
--      for any closed row, so "reopen" could publish a draft nobody
--      submitted. The app already refuses (contract); this makes every door
--      refuse (PostgREST, reopen_demand_v1, a colleague's call). Rows closed
--      before outcomes were recorded (closed_outcome NULL) keep today's
--      behaviour: nothing is inferred about history.
--
-- NOT HERE: a paused state for demand (separate, larger owner decision: it
-- touches the open-needs ceiling, matching and scouting).
--
-- SAFETY: additive nullable column (NULL for every existing row, no backfill);
-- v3 calls v2 for every check, so the publish policy stays ONE; the trigger
-- keeps every existing owner transition and adds exactly one refusal; the
-- function keeps search_path = public (20260727120000 L-08).
-- ROLLBACK: supabase/rollbacks/20261024100000_market_lifecycle_listing_outcome_and_discard_guard_v1.down.sql
-- POST-APPLY:
--   select proname, prosecdef from pg_proc where proname in
--     ('set_marketplace_listing_status_v3','customer_requests_status_transition_guard');
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'marketplace_listings_closed_outcome_check';

begin;

-- A. listings: why a closed listing is closed ─────────────────────────────
alter table public.marketplace_listings
  add column if not exists closed_outcome text;
alter table public.marketplace_listings
  add constraint marketplace_listings_closed_outcome_check
  check (closed_outcome is null or closed_outcome in ('completed', 'withdrawn', 'discarded'));
comment on column public.marketplace_listings.closed_outcome is
  'Why a closed listing is closed: completed | withdrawn | discarded. NULL = open, or closed before outcomes were recorded. lib/market-lifecycle/contract.ts';

create or replace function public.set_marketplace_listing_status_v3(
  p_id uuid,
  p_status text,
  p_closed_outcome text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_current_outcome text;
begin
  if p_closed_outcome is not null
     and p_closed_outcome not in ('completed', 'withdrawn', 'discarded') then
    raise exception 'invalid closed outcome';
  end if;
  if p_status <> 'closed' and p_closed_outcome is not null then
    raise exception 'closed outcome only for closed';
  end if;
  select closed_outcome into v_current_outcome
    from public.marketplace_listings where id = p_id and owner_id = auth.uid();
  if v_current_outcome = 'discarded' and p_status in ('active', 'paused') then
    raise exception 'a discarded draft cannot be published';
  end if;
  -- Every other check (auth, owner, status list, expiry, publish policy) is
  -- v2's, unchanged: one policy, one door behind both versions.
  perform public.set_marketplace_listing_status_v2(p_id, p_status);
  update public.marketplace_listings
     set closed_outcome = case when p_status = 'closed' then p_closed_outcome else null end
   where id = p_id and owner_id = auth.uid();
end; $$;

revoke execute on function public.set_marketplace_listing_status_v3(uuid, text, text) from public;
revoke execute on function public.set_marketplace_listing_status_v3(uuid, text, text) from anon;
grant  execute on function public.set_marketplace_listing_status_v3(uuid, text, text) to authenticated;

-- B. demand: a discarded draft never re-enters the market ─────────────────
create or replace function public.customer_requests_status_transition_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;
    -- Lifecycle contract: a draft that left the form was never in the market.
    if old.status = 'closed' and new.status = 'submitted'
       and old.closed_outcome = 'discarded' then
      raise exception 'a discarded draft cannot be reopened'
        using errcode = '23514';
    end if;
    if (old.status = 'draft' and new.status in ('submitted', 'closed'))
       or (old.status = 'submitted' and new.status = 'closed')
       or (old.status = 'closed' and new.status = 'submitted') then
      return new;
    end if;
    raise exception 'invalid demand status transition: % -> %',
      old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

commit;
