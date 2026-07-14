-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714211000 — dashboard preferences v1 (Company Architecture Completion,
-- Sprint v2 §5: server-side dashboard preferences).
--
-- PROBLEM: the PR #751 configurable control-room card grid stores its
-- order/hidden preferences in device-local localStorage
-- (lm.dashboard.moduleCards.v1). The owner requirement is server-side
-- preferences: the same user must see the same workspace on every device,
-- and the person workspace and the company workspace must keep SEPARATE
-- layouts (privacy symmetry §20 — a company layout choice is company
-- context, never leaked into the person surface and vice versa).
--
-- SOLUTION (smallest honest slice): ONE owner-only preferences table keyed
-- by (profile_id, context) where context is a CLOSED slug — 'person' |
-- 'company'. `preferences` is bounded jsonb (<= 8 KB via pg_column_size
-- CHECK; the server action additionally validates shape and id bounds
-- before writing — ids only, never query text or PII).
--
--   RLS: default-closed owner-only CRUD (profile_id = auth.uid()); no
--   admin read — display preferences are private display state.
--   GRANTS: authenticated only (this project has NO default grants — 0004);
--   anon gets nothing.
--   Writes go through the profile-scoped server action; direct PostgREST
--   writes stay possible for the owner's OWN rows only and remain bounded
--   by the CHECKs.
--
-- COMPATIBILITY / BACKFILL: none — new table, ships empty. Until applied,
-- the app feature-detects 42P01/PGRST205 and keeps today's device-local
-- localStorage behaviour (honest fallback, nothing faked).
-- ROLLBACK: paired supabase/rollbacks/20260714211000_dashboard_preferences_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   As user A: insert own ('person') row via the dashboard "Tvarkyti" flow;
--   select * from dashboard_preferences;      -- 1 own row
--   As user B: select * from dashboard_preferences;  -- 0 rows
--   insert with 9 KB preferences payload      -- CHECK violation
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + grants = RED-class;
-- annotation downgrades the CI finding only — the OWNER still applies
-- manually).
-- ============================================================================

begin;

create table if not exists public.dashboard_preferences (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- Closed context slug: the person workspace and the company workspace keep
  -- separate layouts (§20 privacy symmetry).
  context     text not null check (context in ('person', 'company')),
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, context),
  -- Hard byte budget: display preferences are ids-only display state, never
  -- a data store. 8 KB is ~60x the expected payload.
  constraint dashboard_preferences_size_chk
    check (pg_column_size(preferences) <= 8192)
);

alter table public.dashboard_preferences enable row level security;

-- Owner-only CRUD — default-closed; no anon, no cross-profile, no admin
-- read (display preferences are private display state, not audit data).
drop policy if exists dashboard_preferences_select on public.dashboard_preferences;
create policy dashboard_preferences_select
  on public.dashboard_preferences for select
  using (profile_id = auth.uid());

drop policy if exists dashboard_preferences_insert on public.dashboard_preferences;
create policy dashboard_preferences_insert
  on public.dashboard_preferences for insert
  with check (profile_id = auth.uid());

drop policy if exists dashboard_preferences_update on public.dashboard_preferences;
create policy dashboard_preferences_update
  on public.dashboard_preferences for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists dashboard_preferences_delete on public.dashboard_preferences;
create policy dashboard_preferences_delete
  on public.dashboard_preferences for delete
  using (profile_id = auth.uid());

grant select, insert, update, delete
  on public.dashboard_preferences to authenticated;

commit;

-- DOWN (paired rollback file — supabase/rollbacks/
-- 20260714211000_dashboard_preferences_v1.down.sql):
--   drop policy if exists dashboard_preferences_select on public.dashboard_preferences;
--   drop policy if exists dashboard_preferences_insert on public.dashboard_preferences;
--   drop policy if exists dashboard_preferences_update on public.dashboard_preferences;
--   drop policy if exists dashboard_preferences_delete on public.dashboard_preferences;
--   drop table if exists public.dashboard_preferences;
