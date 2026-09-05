-- ============================================================================
-- 20260904120000 — workspace_pins v1 ("My Space", owner contract 2026-09-04
-- §4C: PIN · UNPIN · REORDER; a pin is ONLY a reference to an existing
-- canonical action / entity / view — never duplicated domain state).
--
-- PROBLEM: the personal desktop the owner describes ("My jobs", "Client X",
-- "Invite client", "Missing documents") had no persistence at all: no table,
-- no RPC, no storage key (verified 2026-09-04). Repeated work could not be
-- made fast, and the product could not ask "you use this often — add it to
-- My Space?".
--
-- SOLUTION (smallest honest slice): ONE table of references. A row stores
-- (profile, workspace organization or NULL for the personal space, a chip
-- reference the conversation already understands, an optional label, a
-- position). Nothing about the referenced entity is copied here; the chat
-- resolves the reference against live canonical state every time.
--
--   RLS: the owning profile only (JWT sub = profiles.id), select/insert/
--   update/delete. No admin read (a pin list is private preference state).
--   Writes are plain table writes under RLS — no definer-privileged
--   function, no grants beyond `authenticated`.
--   ABUSE BOUNDS: ref ≤ 200 chars, label ≤ 80 chars, kind in a closed set;
--   the application caps pins per workspace at 6 (PIN_CAP) before writing;
--   unique (profile, workspace, ref) — NULLS NOT DISTINCT so the personal
--   space (organization_id NULL) also de-duplicates.
--
-- COMPATIBILITY / BACKFILL: none — new table, ships empty. Until applied,
-- the consumer feature-detects (42P01/PGRST205) and degrades honestly: no
-- "My Space" row, no ask.
-- ROLLBACK: paired supabase/rollbacks/20260904120000_workspace_pins_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   As a user: insert into workspace_pins (profile_id, ref, kind, label)
--     values (auth.uid(), 'f:company.create-demand', 'action', 'Reikia darbuotojų');
--   select * from workspace_pins;                       -- 1 own row
--   As another user: select * from workspace_pins;      -- 0 rows
--   Anon: select * from workspace_pins;                 -- permission denied
--
-- @human-gate-approved — TIER: the static migration-safety rule classes ANY
-- grant as RED. Substance: one new preference table, owner-only RLS on all
-- four verbs, `grant … to authenticated` only (default privileges are
-- revoked in this schema, so a new table is unreachable without it), no
-- definer function, no anon, paired .down.sql. The annotation moves the PR to
-- the human gate; it is NOT an auto-merge pass. Apply via Supabase MCP
-- `apply_migration` after the owner's sentence "Apply My Space 2026-09-04".
-- ============================================================================

begin;

create table if not exists public.workspace_pins (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  /** NULL = the personal space; otherwise the organization the pin belongs to. */
  organization_id uuid references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('action', 'entity', 'view')),
  ref             text not null check (char_length(ref) between 1 and 200),
  label           text check (label is null or char_length(label) between 1 and 80),
  position        integer not null default 0 check (position >= 0 and position < 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists workspace_pins_owner_ref_uidx
  on public.workspace_pins (profile_id, organization_id, ref) nulls not distinct;
create index if not exists workspace_pins_profile_idx
  on public.workspace_pins (profile_id, organization_id, position);

alter table public.workspace_pins enable row level security;

create policy workspace_pins_select on public.workspace_pins
  for select using (profile_id = auth.uid());
create policy workspace_pins_insert on public.workspace_pins
  for insert with check (profile_id = auth.uid());
create policy workspace_pins_update on public.workspace_pins
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy workspace_pins_delete on public.workspace_pins
  for delete using (profile_id = auth.uid());

grant select, insert, update, delete on public.workspace_pins to authenticated;

commit;

-- ROLLBACK (paired file supabase/rollbacks/20260904120000_workspace_pins_v1.down.sql):
--   drop policy if exists workspace_pins_delete on public.workspace_pins;
--   drop policy if exists workspace_pins_update on public.workspace_pins;
--   drop policy if exists workspace_pins_insert on public.workspace_pins;
--   drop policy if exists workspace_pins_select on public.workspace_pins;
--   drop index if exists workspace_pins_profile_idx;
--   drop index if exists workspace_pins_owner_ref_uidx;
--   drop table if exists public.workspace_pins;   -- preference references only; no domain state
