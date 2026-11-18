-- Rollback of 20261024090000 (market lifecycle closed outcome v1).
-- Refuses while the new facts exist: rewriting a person's closed offering or
-- erasing why a need was closed is not a rollback step.
begin;
do $$
begin
  if exists (select 1 from public.service_offerings where status = 'closed') then
    raise exception 'rollback refused: service_offerings holds closed rows';
  end if;
  if exists (select 1 from public.service_offerings where closed_outcome is not null)
     or exists (select 1 from public.customer_requests where closed_outcome is not null) then
    raise exception 'rollback refused: a closed_outcome has been recorded';
  end if;
end $$;

alter table public.service_offerings
  drop constraint service_offerings_status_check;
alter table public.service_offerings
  add constraint service_offerings_status_check
  check (status in ('draft', 'active', 'paused'));

alter table public.service_offerings
  drop constraint if exists service_offerings_closed_outcome_check;
alter table public.service_offerings
  drop column if exists closed_outcome;

alter table public.customer_requests
  drop constraint if exists customer_requests_closed_outcome_check;
alter table public.customer_requests
  drop column if exists closed_outcome;

commit;
