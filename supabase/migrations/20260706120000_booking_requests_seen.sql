-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- "New responses since last seen" tracking for the booking loop
-- (root-cause audit PR5 — booking status changes were silent for the
-- proposing company: a worker's accept/decline was visible only if the
-- company happened to reopen /dashboard/bookings).
--
-- Mirrors 20260627181500_service_requests_seen exactly (Option C′ — one
-- per-user seen timestamp): ONE tiny single-purpose table holding exactly one
-- row per user (user_id + seen_at) and ONE SECURITY DEFINER upsert RPC to
-- mark the caller's own row. "New" counts are computed APP-SIDE by comparing
-- the booking row's status + updated_at (set by the worker-response RPC) to
-- this seen_at — no per-booking seen rows, no event bus, no notification
-- records, no profile change, no PII.
--
-- INVARIANTS:
--   * One row per user: (user_id pk, seen_at). Nothing else is stored.
--   * RLS: a user reads ONLY their own row. Writes are RPC-only (no write
--     policy, no write grant) — the RPC only ever upserts auth.uid().
--   * No anon/public grant, no using(true). No other party's data stored.
--
-- ROLLBACK: supabase/rollbacks/20260706120000_booking_requests_seen.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

-- One row per user: when did this user last open their bookings surface.
create table if not exists public.booking_requests_seen (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.booking_requests_seen enable row level security;

-- Read your OWN row only. Writes go through the RPC below (no write policy,
-- no write grant) — so a user can never read or write anyone else's seen state.
drop policy if exists booking_requests_seen_select on public.booking_requests_seen;
create policy booking_requests_seen_select on public.booking_requests_seen
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.booking_requests_seen to authenticated;

-- Mark the caller's own bookings surface as seen (upsert auth.uid()'s single
-- row). The only writer. No-op for the unauthenticated caller.
create or replace function public.mark_booking_requests_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.booking_requests_seen (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now();
end $$;

revoke all on function public.mark_booking_requests_seen() from public;
grant execute on function public.mark_booking_requests_seen() to authenticated;

commit;
