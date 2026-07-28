-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- 20260728140000 — usage_cost_events: TRUNCATE guard.
--
-- FOUND BY THE PRODUCTION PROOF RUN of 20260728120000. The append-only
-- guarantee was enforced by a row-level BEFORE UPDATE OR DELETE trigger, and a
-- row-level trigger does NOT fire on TRUNCATE. `service_role` and
-- `authenticated` never had TRUNCATE, but the table OWNER did — so the ledger
-- could still be emptied in one statement, and "append-only" was not yet true
-- for every caller.
--
-- A STATEMENT-level BEFORE TRUNCATE trigger closes the last path. After this,
-- UPDATE, DELETE and TRUNCATE are all refused for every role including the
-- owner; DROP remains possible and is the documented rollback.
--
-- Additive, reversible, no data change.
-- ROLLBACK: supabase/rollbacks/20260728140000_usage_cost_events_truncate_guard_v1.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

create or replace function public.usage_cost_events_forbid_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'usage_cost_events is append-only: TRUNCATE is not permitted'
    using errcode = '42501';
end;
$$;

drop trigger if exists usage_cost_events_no_truncate on public.usage_cost_events;
create trigger usage_cost_events_no_truncate
  before truncate on public.usage_cost_events
  for each statement execute function public.usage_cost_events_forbid_truncate();

commit;

-- ROLLBACK:
--   drop trigger usage_cost_events_no_truncate on public.usage_cost_events;
--   drop function public.usage_cost_events_forbid_truncate();
