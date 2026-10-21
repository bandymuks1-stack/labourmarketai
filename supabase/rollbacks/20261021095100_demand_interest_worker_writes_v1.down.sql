-- Rollback of 20261021095100_demand_interest_worker_writes_v1.
-- Drops the three worker policies, the write guard trigger and its function,
-- and re-creates the 20260704230000 FOR ALL worker policy verbatim. No data is
-- touched. Apply via Supabase MCP apply_migration.

begin;

drop trigger if exists demand_interest_signals_worker_write_guard
  on public.demand_interest_signals;
drop function if exists public.demand_interest_signals_worker_write_guard_v1();

drop policy if exists demand_interest_signals_worker_select
  on public.demand_interest_signals;
drop policy if exists demand_interest_signals_worker_insert
  on public.demand_interest_signals;
drop policy if exists demand_interest_signals_worker_update
  on public.demand_interest_signals;

drop policy if exists demand_interest_signals_worker_all
  on public.demand_interest_signals;
-- The worker fully controls their OWN interest rows.
create policy demand_interest_signals_worker_all
  on public.demand_interest_signals for all
  using (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  )
  with check (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  );

commit;
