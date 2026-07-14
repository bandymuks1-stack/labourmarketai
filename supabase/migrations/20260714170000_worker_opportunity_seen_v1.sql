-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714170000 — worker_opportunity_seen v1 (Job Recommendation Engine
-- surfacing, Sprint v2 §4).
--
-- PROBLEM: the job-recommendation surfaces (dashboard "Man tinkantys darbai"
-- card, the aggregate "new matching jobs" notification-spine signal, the
-- journal context block) need an honest "new" definition and notification
-- dedup. Without a seen store, a "N naujų" count could never clear by
-- visiting — permanent noise, which the spine doctrine forbids.
--
-- SOLUTION (smallest honest slice): ONE first-seen marker table + ONE gated
-- write RPC. A row stores ONLY (profile_id, customer_request_id, seen_at):
-- no copied demand facts (the surfaces re-read live truth through the gated
-- worker RPC). "New opportunities" = recommendable demands with NO row here;
-- rendering a recommendation (dashboard card, board, journal block) marks it
-- seen, so visiting IS the read event.
--
--   RLS: SELECT for the owning profile only (or is_admin()). The demand
--   owner NEVER sees who saw their demand — a seen marker is private
--   anti-spam state, not an interest signal (interest stays
--   demand_interest_signals, consent-gated).
--   Writes RPC-only: mark_worker_opportunities_seen_v1(uuid[]).
--   ABUSE BOUNDS: pk (profile_id, customer_request_id); <=100 ids per call;
--   only ids that exist as non-draft customer_requests are inserted;
--   5000-row cap per profile (best-effort no-op past the cap — the caller
--   is fire-and-forget); seen_at is first-seen (conflict = no-op, never
--   bumped).
--
-- COMPATIBILITY / BACKFILL: none — new table, ships empty. Until applied,
-- every consumer feature-detects (42P01/42883/PGRST202) and degrades
-- honestly: the "new matches" spine count stays 0 (never a badge that
-- cannot clear) and the card's "Nauja" chip falls back to the 7-day
-- created_at window only.
-- ROLLBACK: paired supabase/rollbacks/20260714170000_worker_opportunity_seen_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   As a worker: select mark_worker_opportunities_seen_v1(array['<open request uuid>']::uuid[]);
--   select * from worker_opportunity_seen;              -- 1 own row
--   repeat the call                                     -- still 1 row, seen_at unchanged
--   As another user: select * from worker_opportunity_seen;  -- 0 rows
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + SECURITY DEFINER
-- function + grants = RED-class; annotation downgrades the CI finding only —
-- the OWNER still applies manually).
-- ============================================================================

begin;

create table if not exists public.worker_opportunity_seen (
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  customer_request_id uuid not null references public.customer_requests(id) on delete cascade,
  seen_at             timestamptz not null default now(),
  primary key (profile_id, customer_request_id)
);

create index if not exists worker_opportunity_seen_profile_idx
  on public.worker_opportunity_seen (profile_id, seen_at desc);

alter table public.worker_opportunity_seen enable row level security;

-- Owner-only read: the profile that saw the demand (and admin). The demand
-- owner never learns who saw it.
drop policy if exists worker_opportunity_seen_select on public.worker_opportunity_seen;
create policy worker_opportunity_seen_select
  on public.worker_opportunity_seen for select
  using (profile_id = auth.uid() or public.is_admin());

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.mark_worker_opportunities_seen_v1(
  p_request_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  inserted  integer := 0;
  existing  integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_request_ids is null or array_length(p_request_ids, 1) is null then
    return 0;
  end if;
  if array_length(p_request_ids, 1) > 100 then
    raise exception 'Too many ids' using errcode = '22023';
  end if;

  -- Best-effort cap: past 5000 rows the call is a quiet no-op (the caller is
  -- fire-and-forget render marking; failing it would break a page for no
  -- user benefit).
  select count(*) into existing
    from public.worker_opportunity_seen
   where profile_id = uid;
  if existing >= 5000 then
    return 0;
  end if;

  -- Only ids that exist as non-draft demands are recorded (prevents growing
  -- rows for arbitrary/private uuids; no demand facts are copied). First
  -- seen wins — a conflict never bumps seen_at.
  insert into public.worker_opportunity_seen (profile_id, customer_request_id)
  select distinct uid, cr.id
    from unnest(p_request_ids) as rid
    join public.customer_requests cr on cr.id = rid
   where cr.status <> 'draft'
  on conflict (profile_id, customer_request_id) do nothing;
  get diagnostics inserted = row_count;

  return inserted;
end;
$$;

grant select on public.worker_opportunity_seen to authenticated;
revoke insert, update, delete on public.worker_opportunity_seen from authenticated;

revoke all on function public.mark_worker_opportunities_seen_v1(uuid[]) from public;
grant execute on function public.mark_worker_opportunities_seen_v1(uuid[]) to authenticated;

commit;

-- DOWN (paired rollback file — supabase/rollbacks/
-- 20260714170000_worker_opportunity_seen_v1.down.sql):
--   drop function if exists public.mark_worker_opportunities_seen_v1(uuid[]);
--   drop policy if exists worker_opportunity_seen_select on public.worker_opportunity_seen;
--   drop index if exists worker_opportunity_seen_profile_idx;
--   drop table if exists public.worker_opportunity_seen;
