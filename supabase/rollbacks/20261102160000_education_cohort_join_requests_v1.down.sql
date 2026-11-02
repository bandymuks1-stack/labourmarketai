-- Rollback for 20261102160000_education_cohort_join_requests_v1
-- GUARDED: refuses while any membership row was ever a request
-- (requested_at set) or any group is open. Restoring the two-state CHECK would
-- fail on request-state rows, and dropping request_label would erase the only
-- name an institution has for a member who joined by request — both are data
-- loss. The student engagement contexts the accept command created are the
-- accepted relationship (the same rows an invitation creates) and are kept.

begin;

do $$
begin
  if exists (select 1 from public.education_cohort_members where requested_at is not null)
     or exists (select 1 from public.education_cohorts where join_requests_open) then
    raise exception 'rollback refused: cohort join-request rows exist. Decide or export them first.'
      using errcode = 'P0004';
  end if;
end;
$$;

drop function if exists public.decide_education_cohort_join_v1(uuid, uuid, text);
drop function if exists public.withdraw_education_cohort_join_v1(uuid);
drop function if exists public.request_education_cohort_join_v1(uuid, text, text);
drop function if exists public.list_open_education_cohorts_v1();
drop function if exists public.set_education_cohort_join_requests_v1(uuid, boolean);

alter table public.education_cohort_members drop constraint if exists education_cohort_members_status_check;
alter table public.education_cohort_members
  add constraint education_cohort_members_status_check check (status in ('active', 'left'));

alter table public.education_cohort_members
  drop column if exists decided_at,
  drop column if exists request_note,
  drop column if exists request_label,
  drop column if exists requested_at;

alter table public.education_cohorts drop column if exists join_requests_open;

commit;
