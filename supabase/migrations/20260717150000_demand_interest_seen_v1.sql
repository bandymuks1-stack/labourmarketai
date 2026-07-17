-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260717150000 — demand_interest_seen v1 (Canonical Ideas Integration v1;
-- REQUIRES_OWNER_DECISION).
--
-- PROBLEM: the notification spine (lib/notifications/spine-signals.ts)
-- explicitly DEFERS an "interest response" signal for workers — when a
-- company acknowledges a worker's interest (demand_interest_signals status →
-- 'reviewed'/'contacted'), the worker gets no bell row, because no
-- seen-model exists for interest signals. A count that could never clear by
-- visiting would be permanent noise, which the spine doctrine forbids.
--
-- SOLUTION (smallest honest slice, STRUCTURAL MIRROR of
-- worker_opportunity_seen, 20260714170000): ONE seen-marker table + ONE
-- gated write RPC. A row stores ONLY (profile_id, signal_id, seen_status,
-- seen_at) — no copied demand or company facts (surfaces re-read live truth
-- through the worker's own RLS rows). "New interest responses" = own
-- signals with status 'reviewed'/'contacted' and NO seen row for that
-- status; rendering the "Mano susidomėjimai" section marks them seen, so
-- visiting IS the read event. seen_status is part of the pk so a later
-- 'reviewed' → 'contacted' progression can notify ONCE more — never a
-- re-notify loop.
--
--   RLS: SELECT for the owning profile only (or is_admin()). The demand
--   owner NEVER sees whether the worker noticed the acknowledgement — a
--   seen marker is private anti-noise state, not a read receipt.
--   Writes RPC-only: mark_demand_interest_seen_v1(uuid[]).
--   ABUSE BOUNDS: pk (profile_id, signal_id, seen_status); <=100 ids per
--   call; only signals belonging to the CALLER'S OWN worker row and
--   currently in an acknowledged status ('reviewed'/'contacted') are
--   recorded; 5000-row cap per profile (best-effort no-op past the cap —
--   the caller is fire-and-forget); seen_at is first-seen (conflict =
--   no-op, never bumped).
--
-- NOT WIRED IN THIS PR: the spine signal itself is deliberately NOT added
-- to SPINE_SIGNALS yet — without this table applied it could never clear.
-- Wiring lands in a follow-up slice AFTER the owner applies this migration.
--
-- COMPATIBILITY / BACKFILL: none — new table, ships empty. Until applied,
-- every consumer feature-detects (42P01/42883/PGRST202/PGRST205) and
-- degrades honestly (no count, no badge, no fake state).
-- ROLLBACK: paired supabase/rollbacks/20260717150000_demand_interest_seen_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   As a worker whose signal was acknowledged:
--     select mark_demand_interest_seen_v1(array['<own signal uuid>']::uuid[]);
--     select * from demand_interest_seen;                 -- 1 own row
--     repeat the call                                     -- still 1 row, seen_at unchanged
--   As another user: select * from demand_interest_seen;  -- 0 rows
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + SECURITY DEFINER
-- function + grants = RED-class; annotation downgrades the CI finding only —
-- the OWNER still applies manually).
-- ============================================================================

begin;

create table if not exists public.demand_interest_seen (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  signal_id   uuid not null references public.demand_interest_signals(id) on delete cascade,
  -- The acknowledged status the worker has seen. Part of the pk: a later
  -- reviewed → contacted progression may notify once more, never loop.
  seen_status text not null check (seen_status in ('reviewed','contacted')),
  seen_at     timestamptz not null default now(),
  primary key (profile_id, signal_id, seen_status)
);

create index if not exists demand_interest_seen_profile_idx
  on public.demand_interest_seen (profile_id, seen_at desc);

alter table public.demand_interest_seen enable row level security;

-- Owner-only read: the worker profile that saw the acknowledgement (and
-- admin). The demand owner never learns whether the worker noticed.
drop policy if exists demand_interest_seen_select on public.demand_interest_seen;
create policy demand_interest_seen_select
  on public.demand_interest_seen for select
  using (profile_id = auth.uid() or public.is_admin());

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.mark_demand_interest_seen_v1(
  p_signal_ids uuid[]
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
  if p_signal_ids is null or array_length(p_signal_ids, 1) is null then
    return 0;
  end if;
  if array_length(p_signal_ids, 1) > 100 then
    raise exception 'Too many ids' using errcode = '22023';
  end if;

  -- Best-effort cap: past 5000 rows the call is a quiet no-op (the caller is
  -- fire-and-forget render marking; failing it would break a page for no
  -- user benefit).
  select count(*) into existing
    from public.demand_interest_seen
   where profile_id = uid;
  if existing >= 5000 then
    return 0;
  end if;

  -- Only the caller's OWN signals, and only those currently carrying a
  -- company acknowledgement, are recorded — with the CURRENT status, so the
  -- marker states exactly what was seen. First seen wins — a conflict never
  -- bumps seen_at.
  insert into public.demand_interest_seen (profile_id, signal_id, seen_status)
  select distinct uid, s.id, s.status
    from unnest(p_signal_ids) as sid
    join public.demand_interest_signals s on s.id = sid
    join public.workers w on w.id = s.worker_id
   where w.profile_id = uid
     and s.status in ('reviewed','contacted')
  on conflict (profile_id, signal_id, seen_status) do nothing;
  get diagnostics inserted = row_count;

  return inserted;
end;
$$;

grant select on public.demand_interest_seen to authenticated;
revoke insert, update, delete on public.demand_interest_seen from authenticated;

revoke all on function public.mark_demand_interest_seen_v1(uuid[]) from public;
grant execute on function public.mark_demand_interest_seen_v1(uuid[]) to authenticated;

commit;

-- DOWN (paired rollback file — supabase/rollbacks/
-- 20260717150000_demand_interest_seen_v1.down.sql):
--   drop function if exists public.mark_demand_interest_seen_v1(uuid[]);
--   drop policy if exists demand_interest_seen_select on public.demand_interest_seen;
--   drop index if exists demand_interest_seen_profile_idx;
--   drop table if exists public.demand_interest_seen;
