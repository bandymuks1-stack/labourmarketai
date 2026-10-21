-- ============================================================================
-- work_hours_corrections_atomic_v1 — an hour record changes only by an
-- attributable correction, written in ONE step (audit 2026-10-20, HIGH;
-- owner-approved programme 2026-10-21, item "hours integrity").
--
-- Two defects on work_hour_allocations (the organization's hour records that
-- feed the hours page, the project page and the person's CV):
--   1. A worker could rewrite the hours of their own rows — including rows a
--      manager entered: the UPDATE policy admits owns_worker, and the integrity
--      guard (20261006100000) froze only status / organization / worker /
--      entered_by. A direct API update to hours_numeric or work_date silently
--      changed every total.
--   2. A correction was three separate writes from the app (insert the new
--      row, set its correction_of, set the original's superseded_by); a failed
--      supersede was only logged and the action still answered "saved", so
--      the original AND the correction both counted.
--
-- Change:
--   1. correct_work_hour_allocation_v1(original, hours, day, site, note):
--      locks the LIVE original, checks the caller may correct it — a manager
--      of its organization, or the worker who entered it themselves while it
--      is still 'recorded' —, checks the site is an active site of the same
--      organization, inserts the correction (same organization and worker,
--      entered_by = caller, status 'recorded', correction_of = original) and
--      supersedes the original, all in one transaction. SECURITY DEFINER,
--      search_path public, auth.uid() required, EXECUTE authenticated only.
--   2. The integrity guard (v2) refuses EVERY end-user UPDATE of a row except
--      the updated_at stamp: a recorded hour is changed only by a correction
--      (the function above runs as its owner, which the guard does not
--      restrict, exactly as before for the timesheet decision functions).
-- No data is changed. Apply ONLY after the app that calls the function is
-- deployed (the app falls back to the old path while the function is absent).
--
-- Rollback: supabase/rollbacks/20261021090000_work_hours_corrections_atomic_v1.down.sql
-- ============================================================================

create or replace function public.correct_work_hour_allocation_v1(
  p_original_id uuid,
  p_hours numeric,
  p_work_date date,
  p_work_object_id uuid,
  p_note text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  o record;
  v_new uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id, a.organization_id, a.worker_id, a.entered_by, a.status, a.superseded_by
    into o
    from public.work_hour_allocations a
   where a.id = p_original_id
   for update;
  if not found then
    raise exception 'Not authorized to correct this record' using errcode = '42501';
  end if;
  -- null-safe: a NULL anywhere denies (coalesce), never lets the caller through
  if not coalesce((
    public.manages_organization(o.organization_id)
    or (o.entered_by = uid and o.status = 'recorded' and public.owns_worker(o.worker_id))
  ), false) then
    raise exception 'Not authorized to correct this record' using errcode = '42501';
  end if;
  if o.superseded_by is not null then
    raise exception 'already_corrected' using errcode = '22023';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;
  if p_work_date is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.work_objects w
     where w.id = p_work_object_id and w.organization_id = o.organization_id and w.status = 'active'
  ) then
    raise exception 'invalid_object' using errcode = '22023';
  end if;
  insert into public.work_hour_allocations
    (organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, note, source, status, correction_of)
  values
    (o.organization_id, o.worker_id, uid, p_work_date, p_work_object_id, p_hours,
     nullif(btrim(coalesce(p_note, '')), ''), 'manual', 'recorded', o.id)
  returning id into v_new;
  update public.work_hour_allocations set superseded_by = v_new where id = o.id;
  return v_new;
end;
$function$;

revoke all on function public.correct_work_hour_allocation_v1(uuid, numeric, date, uuid, text) from public, anon;
grant execute on function public.correct_work_hour_allocation_v1(uuid, numeric, date, uuid, text) to authenticated;

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

  -- A recorded hour is changed ONLY by a correction
  -- (correct_work_hour_allocation_v1), never edited in place by a person.
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'work_hour_allocations: a recorded hour is changed only by a correction'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
