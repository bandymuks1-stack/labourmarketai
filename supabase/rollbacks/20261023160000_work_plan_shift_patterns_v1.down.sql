-- ============================================================================
-- ROLLBACK for 20261023160000_work_plan_shift_patterns_v1 (CAL-8)
--
-- Guarded: refuses while ANY work_plan_entries row carries a shift pattern
-- (planned or cancelled). Dropping the column would silently turn a rota into
-- a continuous window — a manager would see a person committed on every rest
-- day — and would erase what was planned. Cancel the patterned plans and
-- record them elsewhere first, then re-run.
--
-- Restores commitment_override_validate_collisions_v1 VERBATIM from
-- 20261003150950 (before dropping the helper it now calls), then removes the
-- v2 command, the CHECK, the column and the two pure helpers.
-- ============================================================================

do $$
declare v_rows bigint;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'work_plan_entries' and column_name = 'recurrence'
  ) then
    execute 'select count(*) from public.work_plan_entries where recurrence is not null' into v_rows;
    if v_rows > 0 then
      raise exception 'work_plan_shift_patterns rollback refused: % work plan entries carry a shift pattern', v_rows;
    end if;
  end if;
end;
$$;

create or replace function public.commitment_override_validate_collisions_v1(
  p_project_id        uuid,
  p_worker_id         uuid,
  p_worker_profile_id uuid,
  p_window_start      date,
  p_window_end        date,
  p_collisions        jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ws   date := p_window_start;
  v_we   date;
  v_item jsonb;
  v_kind text;
  v_sid  uuid;
  v_os   date;
  v_oe   date;
  v_ok   boolean;
begin
  if v_ws is null then
    raise exception 'collision not verified' using errcode = '22023';
  end if;
  v_we := case when p_window_end is not null and p_window_end >= v_ws then p_window_end else v_ws end;

  for v_item in select e from jsonb_array_elements(p_collisions) e loop
    v_kind := v_item->>'kind';
    v_os := (v_item->>'overlapStart')::date;
    v_oe := (v_item->>'overlapEnd')::date;
    v_ok := false;
    if v_os is null or v_oe is null or v_oe < v_os or v_os < v_ws or v_oe > v_we then
      raise exception 'collision not verified' using errcode = '22023';
    end if;

    if v_kind = 'absence' then
      select exists (
        select 1 from public.worker_absences a
         where a.worker_id = p_worker_id and a.status = 'approved'
           and greatest(v_ws, a.start_date) = v_os
           and least(v_we, case when a.end_date >= a.start_date then a.end_date else a.start_date end) = v_oe
      ) into v_ok;
    else
      v_sid := (v_item->>'sourceId')::uuid;
      if v_kind = 'project' then
        select exists (
          select 1
            from public.project_worker_assignments a
            join public.projects pr on pr.id = a.project_id
           where a.project_id = v_sid and a.worker_id = p_worker_id and a.status = 'active'
             and a.project_id <> p_project_id and pr.start_date is not null
             and greatest(v_ws, pr.start_date) = v_os
             and least(v_we, case when pr.end_date is not null and pr.end_date >= pr.start_date
                                  then pr.end_date else pr.start_date end) = v_oe
        ) into v_ok;
      elsif v_kind = 'booking' then
        select exists (
          select 1 from public.booking_requests b
           where b.id = v_sid and b.worker_id = p_worker_id and b.status = 'accepted'
             and b.start_date is not null
             and greatest(v_ws, b.start_date) = v_os
             and least(v_we, case when b.expected_end_date is not null and b.expected_end_date >= b.start_date
                                  then b.expected_end_date else b.start_date end) = v_oe
        ) into v_ok;
      elsif v_kind = 'trip' then
        select exists (
          select 1 from public.business_trips t
           where t.id = v_sid and t.profile_id = p_worker_profile_id
             and t.status in ('approved', 'completed')
             and greatest(v_ws, t.date_from) = v_os
             and least(v_we, case when t.date_to >= t.date_from then t.date_to else t.date_from end) = v_oe
        ) into v_ok;
      elsif v_kind = 'plan' then
        -- #2086's table; absent => no plan window can exist => refuse.
        if to_regclass('public.work_plan_entries') is not null then
          execute $q$
            select exists (
              select 1 from public.work_plan_entries e
               where e.id = $1 and e.worker_id = $2 and e.status = 'planned'
                 and e.start_date is not null
                 and greatest($3, e.start_date) = $5
                 and least($4, case when e.end_date is not null and e.end_date >= e.start_date
                                    then e.end_date else e.start_date end) = $6
            )
          $q$ into v_ok using v_sid, p_worker_id, v_ws, v_we, v_os, v_oe;
        end if;
      end if;
    end if;

    if not coalesce(v_ok, false) then
      raise exception 'collision not verified' using errcode = '22023';
    end if;
  end loop;
end
$$;

revoke all on function public.commitment_override_validate_collisions_v1(uuid, uuid, uuid, date, date, jsonb) from public, anon, authenticated;

comment on function public.commitment_override_validate_collisions_v1(uuid, uuid, uuid, date, date, jsonb) is
  'INTERNAL (no grants; called only by record_commitment_override_v1). Verifies each collision against its real source row with the reserveCapacity overlap rule: overlap = intersection of the project window and the source effective range. Absence is verified by an approved worker_absences row, never by id.';

drop function if exists public.create_work_plan_entry_v2(uuid, uuid, date, date, uuid, uuid, time, time, text, jsonb);
alter table public.work_plan_entries drop constraint if exists work_plan_entries_recurrence_valid;
alter table public.work_plan_entries drop column if exists recurrence;
drop function if exists public.work_plan_is_shift_day_v1(date, date, jsonb);
drop function if exists public.work_plan_recurrence_valid_v1(jsonb);
