-- =====================================================================
-- 20261114100000_booking_refuses_closed_need_v1
--
-- RED by rule: a SECURITY DEFINER trigger function on booking_requests.
-- Needs the human gate (draft PR + needs-human-gate); never auto-applied.
--
-- THE DEFECT. A worker could ACCEPT a date proposal after the employer had
-- closed the need it belongs to. The accept wrote an accepted booking and,
-- through respond_booking_request_v3 / _v4, an engagement: a working
-- relationship recorded against a need that no longer existed. Proposing on a
-- closed need was already refused (propose_booking_request_v3, 'demand_closed',
-- 20261021095200), but that check reads the need without a lock, so a close
-- that commits between the check and the write was not seen either.
--
-- THE RULE (one place, every path). A booking may ENTER 'proposed' or
-- 'accepted' only while its need is not closed. Enforced as a BEFORE trigger
-- on the booking row itself, so it covers every writer at once: the v1, v2,
-- v3 and v4 respond functions, the propose function (insert and re-open), the
-- agency path (which proposes through propose_booking_request_v3) and any
-- future writer. Leaving those states (decline, withdraw, expire) is never
-- refused: closing a need must never trap a proposal open.
--
-- ONE EXCEPTION, NAMED: a booking that was ALREADY ACCEPTED. A need is often
-- closed right after the hire; the employer may later change the dates of
-- that hire, which (20260928140000) moves the booking accepted -> proposed so
-- the worker confirms the new dates, and the worker's confirmation moves it
-- back to accepted. Refusing those would break a working relationship that
-- began while the need was open. The exemption is read from the booking's own
-- event log (an earlier event with to_status = 'accepted'); the respond
-- functions write that event AFTER the status update, so a FIRST accept never
-- sees one and is always checked.
--
-- CONCURRENCY. The need row is read FOR SHARE. Closing a need is an UPDATE of
-- that row, which takes a lock FOR SHARE waits on:
--   * close first, accept second: the accept waits for the close to commit,
--     then reads 'closed' and is refused;
--   * accept first, close second: the close waits for the accept to commit;
--     the booking was accepted while the need was open, which is the truth.
-- Either way no accepted booking exists whose accept happened after the close.
--
-- WHY DEFINER. The worker accepting cannot read the need (customer_requests
-- read policy: author, organization, admins). Under the caller's rights the
-- read would return no row and the guard would let the accept through. The
-- function reads one column of one row by primary key, returns nothing and
-- cannot be called directly (all EXECUTE revoked), the same shape as
-- demand_chain_inherit_organization (20260806200000).
--
-- The error is the word the propose function already uses ('demand_closed',
-- P0001), so every app path that reads it keeps one meaning.
--
-- Data: none touched. Existing bookings are not changed; an accepted booking
-- on a need closed later stays as it is (it was accepted while open).
-- ROLLBACK: supabase/rollbacks/20261114100000_booking_refuses_closed_need_v1.down.sql
-- =====================================================================

begin;

create or replace function public.booking_requests_open_need_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_need_status text;
begin
  if new.status not in ('proposed', 'accepted') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  -- The named exception: an existing hire whose dates change and are confirmed.
  if tg_op = 'UPDATE' and (
       old.status = 'accepted'
       or exists (select 1 from public.booking_request_events e
                   where e.booking_request_id = new.id and e.to_status = 'accepted')
     ) then
    return new;
  end if;

  select cr.status into v_need_status
    from public.customer_requests cr
   where cr.id = new.request_id
   for share;

  if v_need_status is not distinct from 'closed' then
    raise exception 'demand_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.booking_requests_open_need_guard() from public;
revoke all on function public.booking_requests_open_need_guard() from anon;
revoke all on function public.booking_requests_open_need_guard() from authenticated;

drop trigger if exists booking_requests_open_need_guard on public.booking_requests;
create trigger booking_requests_open_need_guard
  before insert or update of status on public.booking_requests
  for each row execute function public.booking_requests_open_need_guard();

commit;
