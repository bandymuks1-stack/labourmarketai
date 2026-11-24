-- ============================================================================
-- 20260704230000 — demand_interest_signals: worker → demand "express
-- interest" signal (Worker Express Interest slice, 2026-07-04). ADDITIVE,
-- worker-owned — NO existing RLS is modified.
--
-- WHY: PR5 gave workers explainable matched opportunities but the next action
-- honestly stopped at "review match" — no worker-initiated signal existed at
-- all. This table is the INTERNAL-ONLY signal: a worker marks interest in a
-- demand they can see; the demand's owning company sees that interest on its
-- own scouting view. Nothing is sent outside the platform, no contact is
-- revealed, no application status is faked.
--
-- STRUCTURAL MIRROR of demand_shortlist (20260612220000, applied): that table
-- is the company→worker direction; this is the worker→demand direction. Same
-- ownership pattern, same process class.
--
-- VISIBILITY: new table, new policies only.
--   - The WORKER (via workers.profile_id = auth.uid()) fully controls their
--     own rows (insert/select/update). Another worker can never see them.
--   - The DEMAND OWNER (customer_requests.profile_id = auth.uid()) + admin
--     can SELECT interest rows for their own demand — worker_id is already
--     employer-visible under existing workers RLS and is rendered anonymized
--     by the scouting UI; no contact data exists in this table at all.
--   - No public/anon access of any kind.
--
-- match_snapshot: the PR4/PR5 CANONICAL match basis at the moment of the
-- click (matched/missing skill SLUGS, status band, evidence counts,
-- needSource) — §19-shaped (always a basis, never a bare score), stored so
-- the company sees what the worker saw even if profiles change later.
--
-- SCOPE: one table + indexes + RLS + grant. No SECURITY DEFINER, no data DML,
-- no change to any existing object. NO external side effects — this is a row
-- in a table, nothing more.
--
-- @human-gate-approved — TIER: owner-gated. Additive and touches NO existing
-- RLS, but it carries a GRANT (privilege change), which the migration-safety
-- classifier routes to the human gate. This PR therefore ships as a
-- needs-human-gate DRAFT with the exact SQL for review; prod apply stays
-- manual via Supabase MCP after DI approval — never db push, never
-- auto-applied. The grant is the standard `to authenticated` (NOT
-- anon/public); every row is reachable only through the owner-scoped
-- policies below.
-- ============================================================================

begin;

create table if not exists public.demand_interest_signals (
  id             uuid primary key default gen_random_uuid(),
  -- The demand the worker is interested in.
  request_id     uuid not null references public.customer_requests(id) on delete cascade,
  -- The interested worker (owns the row through workers.profile_id).
  worker_id      uuid not null references public.workers(id) on delete cascade,
  status         text not null default 'interested'
                   check (status in ('interested','withdrawn','reviewed','contacted')),
  -- Optional short worker note — internal only, never sent anywhere.
  note           text check (note is null or char_length(note) <= 500),
  -- Canonical match basis at click time (slugs + band + evidence counts).
  match_snapshot jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (worker_id, request_id)
);

create index if not exists demand_interest_signals_request_idx
  on public.demand_interest_signals (request_id);
create index if not exists demand_interest_signals_worker_idx
  on public.demand_interest_signals (worker_id);

alter table public.demand_interest_signals enable row level security;

-- The worker fully controls their OWN interest rows.
create policy demand_interest_signals_worker_all
  on public.demand_interest_signals for all
  using (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  )
  with check (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  );

-- The demand's owning company (and admin) can READ interest on their demand.
create policy demand_interest_signals_demand_owner_select
  on public.demand_interest_signals for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.customer_requests cr
       where cr.id = request_id
         and cr.profile_id = auth.uid()
    )
  );

grant select, insert, update on public.demand_interest_signals to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see
-- supabase/rollbacks/20260704230000_demand_interest_signals.down.sql).
-- Drops the table (policies/indexes cascade). Guarded by a 0-row assertion so
-- real worker interest decisions are never silently discarded (§3).
-- ─────────────────────────────────────────────────────────────────────────
