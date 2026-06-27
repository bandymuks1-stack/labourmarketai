-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- "New updates since last seen" tracking for the marketplace request loop
-- (Option C′ — one per-user seen timestamp).
--
-- PROBLEM: the dashboard can show request counts/statuses, but nothing persists
-- whether a user has already SEEN the loop, so we cannot honestly show a "new
-- since last visit" marker.
--
-- SOLUTION: ONE tiny single-purpose table holding exactly one row per user
-- (user_id + seen_at) and ONE SECURITY DEFINER upsert RPC to mark the caller's
-- own row. "New" counts are computed APP-SIDE by comparing the OTHER party's
-- action timestamp (already on each request row) to this seen_at — no per-request
-- seen rows, no event bus, no notification records, no profile change, no PII.
--
-- INVARIANTS:
--   * One row per user: (user_id pk, seen_at). Nothing else is stored.
--   * RLS: a user reads ONLY their own row. Writes are RPC-only (no write policy,
--     no write grant) — the SECURITY DEFINER RPC only ever upserts auth.uid().
--   * No anon/public grant, no using(true). No other party's data is stored here.
--
-- ROLLBACK: supabase/rollbacks/20260627181500_service_requests_seen.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

-- One row per user: when did this user last open the unified request loop.
create table if not exists public.service_offering_requests_seen (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.service_offering_requests_seen enable row level security;

-- Read your OWN row only. Writes go through the RPC below (no write policy,
-- no write grant) — so a user can never read or write anyone else's seen state.
drop policy if exists service_offering_requests_seen_select on public.service_offering_requests_seen;
create policy service_offering_requests_seen_select on public.service_offering_requests_seen
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.service_offering_requests_seen to authenticated;

-- Mark the caller's own loop as seen (upsert auth.uid()'s single row). The only
-- writer. No-op for the unauthenticated caller (never inserts a null user_id).
create or replace function public.mark_service_requests_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.service_offering_requests_seen (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now();
end $$;

revoke all on function public.mark_service_requests_seen() from public;
grant execute on function public.mark_service_requests_seen() to authenticated;

commit;
