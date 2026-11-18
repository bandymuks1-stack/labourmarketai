-- Rollback of 20261021090000_work_hours_corrections_atomic_v1: the guard returns
-- to its 20261006100000 body; the correction function is dropped (the app falls
-- back to its earlier two-step path on 42883). No data was changed.
drop function if exists public.correct_work_hour_allocation_v1(uuid, numeric, date, uuid, text);

create or replace function public.work_hour_allocations_integrity_guard_v1()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'recorded' then
      raise exception
        'work_hour_allocations: an end-user write may only record hours (status recorded); approval belongs to the timesheet decision'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'work_hour_allocations: status is not an end-user field'
      using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'work_hour_allocations: a fact may never move into another organization'
      using errcode = '42501';
  end if;
  if new.worker_id is distinct from old.worker_id then
    raise exception 'work_hour_allocations: the worker a fact is about is immutable'
      using errcode = '42501';
  end if;
  if new.entered_by is distinct from old.entered_by then
    raise exception 'work_hour_allocations: entered_by is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
