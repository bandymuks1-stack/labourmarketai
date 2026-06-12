-- ============================================================================
-- 20260612220000 — demand_shortlist: company scouting shortlist (Full Cycle
-- Sprint v1, Slice 3). ADDITIVE, owner-scoped — NO existing RLS is modified.
--
-- WHY: a company (the owner of a customer_request) needs to mark candidate
-- workers it has scouted for that demand (saved / interested / not_fit /
-- reviewed). This is the scouting/shortlist stage of the cycle.
--
-- VISIBILITY: this is a NEW table with NEW owner-scoped policies — it does NOT
-- change any existing table's RLS (command file: additive only; stop+report
-- only if EXISTING RLS must change — it does not). The worker supply the
-- company scouts is ALREADY employer-visible via the existing
-- workers_select / worker_skills_select policies (`... or is_employer()`),
-- so no new worker-visibility is introduced here. Private worker data
-- (journal content, candidate_skills, documents) stays owner-only and is NOT
-- read by scouting.
--
-- SCOPE: one table + indexes + RLS + grants. No SECURITY DEFINER, no data
-- DML, no change to any existing object.
--
-- @human-gate-approved — TIER: owner-gated. The migration is additive and
-- touches NO existing RLS, but it carries a GRANT (privilege change), which
-- the upgraded migration-safety classifier and the sprint command file both
-- route to a SEPARATE OWNER GATE ("Jokio RLS/grant/policy/SECURITY DEFINER
-- keitimo be atskiro owner gate"). So this PR ships as a needs-human-gate
-- DRAFT with the exact SQL for review; prod apply stays manual via Supabase
-- MCP after DI approval — never db push, never auto-applied. The grant is the
-- standard `to authenticated` (NOT anon/public); the table is owner-scoped.
-- ============================================================================

begin;

create table if not exists public.demand_shortlist (
  id          uuid primary key default gen_random_uuid(),
  -- The company user who scouted (owns the row). Mirrors the candidate_drafts
  -- owner-scoping pattern — the only authority on the row.
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  -- The demand being scouted for.
  request_id  uuid not null references public.customer_requests(id) on delete cascade,
  -- The scouted worker (an employer-discoverable avatar).
  worker_id   uuid not null references public.workers(id) on delete cascade,
  status      text not null default 'saved'
                check (status in ('saved','interested','not_fit','reviewed')),
  note        text check (note is null or char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, request_id, worker_id)
);

create index if not exists demand_shortlist_owner_request_idx
  on public.demand_shortlist (owner_id, request_id);
create index if not exists demand_shortlist_worker_idx
  on public.demand_shortlist (worker_id);

alter table public.demand_shortlist enable row level security;

-- Owner-scoped, mirrors candidate_drafts. Another company can NEVER see a
-- foreign shortlist (no new visibility into existing tables).
create policy demand_shortlist_select on public.demand_shortlist for select
  using (owner_id = auth.uid() or public.is_admin());
create policy demand_shortlist_write on public.demand_shortlist for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.demand_shortlist to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see supabase/rollbacks/20260612220000_demand_shortlist.down.sql).
-- Drops the table (and its policies/indexes via cascade). Guarded by a 0-row
-- assertion in the .down.sql so it never silently discards real shortlist rows.
-- ─────────────────────────────────────────────────────────────────────────
