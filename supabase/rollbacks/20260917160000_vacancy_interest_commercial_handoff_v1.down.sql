-- ROLLBACK of 20260917160000_vacancy_interest_commercial_handoff_v1
-- Reverses in the opposite order. The interest column is dropped only when
-- no vacancy-interest row exists; `request_id` is restored NOT NULL only
-- when no row would violate it. Otherwise the rollback stops loudly — a row
-- somebody wrote is not something a rollback silently deletes.

begin;

drop trigger if exists demand_interest_signals_close_handoff on public.demand_interest_signals;
drop function if exists public.commercial_handoff_follow_withdrawal();

drop function if exists public.list_queued_commercial_handoffs_v1(integer);
drop function if exists public.create_commercial_handoff_v1(uuid, jsonb);

drop policy if exists commercial_handoffs_worker_select on public.commercial_handoffs;
drop index if exists public.commercial_handoffs_queue_idx;
drop index if exists public.commercial_handoffs_worker_idx;
drop index if exists public.commercial_handoffs_employer_idx;
drop table if exists public.commercial_handoffs;

do $$
begin
  if exists (select 1 from public.demand_interest_signals where public_vacancy_id is not null) then
    raise exception 'rollback refused: demand_interest_signals holds vacancy-interest rows';
  end if;
  if exists (select 1 from public.demand_interest_signals where request_id is null) then
    raise exception 'rollback refused: demand_interest_signals holds rows without request_id';
  end if;
end $$;

drop index if exists public.demand_interest_signals_vacancy_idx;
alter table public.demand_interest_signals
  drop constraint if exists demand_interest_signals_worker_vacancy_key;
alter table public.demand_interest_signals
  drop constraint if exists demand_interest_signals_exactly_one_source;
alter table public.demand_interest_signals
  alter column request_id set not null;
alter table public.demand_interest_signals
  drop column if exists public_vacancy_id;

commit;
