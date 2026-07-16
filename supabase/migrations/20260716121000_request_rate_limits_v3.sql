-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- 20260716121000 — request rate limits v3 (Wagon 1: worker discovery and
-- consent).
--
-- PROBLEM: propose_booking_request (APPLIED, 20260613100100) has no volume
-- cap: one company account could open an unbounded number of booking
-- proposals against workers. The app layer now enforces a bounded budget
-- (apps/web/lib/limits/request-rate-limits.ts: max 10 open + 30 per rolling
-- 24h) in the server action, which works TODAY on the applied schema — but an
-- app-layer check alone can be bypassed by calling the RPC directly.
--
-- SOLUTION (defense-in-depth): a v3 WRAPPER that enforces the same caps
-- inside the database and then delegates to the UNCHANGED applied v1 RPC.
-- The applied function's behaviour is not modified; the app calls v3 first
-- and honestly falls back to v1 (app-layer caps still active) while this
-- migration is not applied.
--
-- The new contact-disclosure ask RPC (20260716120000) carries the same caps
-- natively. The in-app conversation path creates rows through the caller's
-- own RLS INSERT (no RPC seam exists there), so its cap remains app-layer
-- only — stated honestly here rather than pretended otherwise.
--
-- Additive only. Rollback:
--   supabase/rollbacks/20260716121000_request_rate_limits_v3.down.sql

create or replace function public.propose_booking_request_v3(
  p_request_id        uuid,
  p_worker_id         uuid,
  p_start_date        text,
  p_expected_end_date text,
  p_location_country  text,
  p_role_text         text,
  p_note              text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_open int;
  v_day  int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Same budget as the app layer: 10 open proposals, 30 created / 24h.
  select count(*) into v_open from public.booking_requests
   where owner_id = v_uid and status = 'proposed';
  if v_open >= 10 then
    raise exception 'Too many open booking proposals' using errcode = 'P0004';
  end if;
  select count(*) into v_day from public.booking_requests
   where owner_id = v_uid and created_at > now() - interval '24 hours';
  if v_day >= 30 then
    raise exception 'Booking proposal daily limit reached' using errcode = 'P0004';
  end if;

  -- Delegate to the UNCHANGED applied v1 RPC (auth.uid() context carries
  -- through — v1 re-runs its own ownership + validity checks).
  return public.propose_booking_request(
    p_request_id, p_worker_id, p_start_date, p_expected_end_date,
    p_location_country, p_role_text, p_note);
end;
$$;

revoke all on function public.propose_booking_request_v3(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.propose_booking_request_v3(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.propose_booking_request_v3(uuid, uuid, text, text, text, text, text) to authenticated;

-- ROLLBACK: supabase/rollbacks/20260716121000_request_rate_limits_v3.down.sql
