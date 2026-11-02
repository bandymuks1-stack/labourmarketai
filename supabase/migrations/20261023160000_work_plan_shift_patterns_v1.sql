-- ============================================================================
-- 20261023160000 — work_plan_shift_patterns_v1  (CAL-8: shifts / rotas)
--
-- @human-gate-approved
--   Acknowledged RED by route, NOT an approval to auto-merge: one SECURITY
--   DEFINER command (create_work_plan_entry_v2), one SECURITY DEFINER
--   redefinition (commitment_override_validate_collisions_v1 — plan branch
--   only), GRANT/REVOKE on the new functions and dynamic SQL carried over
--   verbatim from the validator. Ships as a DRAFT + needs-human-gate PR and
--   is applied ONLY through Supabase MCP apply_migration after explicit owner
--   approval — never `supabase db push`.
--
-- ----------------------------------------------------------------------------
-- CANONICAL CHECK (doctrine §2 — is there an equivalent already?)
-- ----------------------------------------------------------------------------
--   work_plan_entries (20261003150200, applied) already IS "worker W works on
--   project P / object O from D1 to D2, optionally HH:MM–HH:MM", owned by the
--   planning organization, written only through manages_organization-checked
--   RPCs, cancelled by status. A shift pattern is that same plan with ONE more
--   fact: which days inside the window are worked. So this migration EXTENDS
--   that table with one nullable column; it creates NO new table, no second
--   plan store and no per-shift rows.
--     · booking_requests          — plans EXTERNAL workers; not a rota.
--     · project_worker_assignments— membership, no days.
--     · worker_absences           — the negative plan (conflict source).
--     · team_details / availability columns — a person's/team's STATE.
--     · timesheets / work_hour_allocations — FACT (hours worked), never plan.
--   Re-traced 2026-10-23 across every migration: no shift, rota or recurrence
--   object exists (timesheets_v1 says so in its own header).
--
-- TIME IS A PROJECTION, NOT A STORE. Only the RULE is stored. Individual shift
-- days are computed on read — in the app by lib/planning/shift-pattern.ts and,
-- where the database must verify a claimed shift day, by
-- work_plan_is_shift_day_v1 below, which encodes the identical rule.
--
-- COMMITMENT ≠ PROHIBITION (SEP-2). Nothing here refuses a plan because it
-- overlaps leave, a booking or another plan. Overlap is detected afterwards by
-- the one reservation rule and shown as a warning. The only refusals are
-- shape refusals (a malformed pattern; a pattern with no working day inside
-- its own window) and the unchanged authority checks of v1.
--
-- ----------------------------------------------------------------------------
-- WHAT CHANGES
-- ----------------------------------------------------------------------------
--   1. work_plan_recurrence_valid_v1(jsonb)   IMMUTABLE, pure. The closed shape:
--        {"kind":"weekly","days":[1..7 distinct ISO weekdays, 1–7 of them]}
--        {"kind":"cycle","on":1–28,"off":1–28,"offset":0..on+off−1 (optional)}
--   2. work_plan_is_shift_day_v1(start, day, jsonb)  IMMUTABLE, pure.
--   3. work_plan_entries.recurrence jsonb NULL + CHECK (valid_v1(recurrence)).
--      NULL = today's one-off window; every existing row stays NULL and valid.
--   4. create_work_plan_entry_v2(... , p_recurrence jsonb) — v1's body and
--      authority VERBATIM (manages_organization, work_plan_worker_in_scope_v1,
--      project/object in organization) plus the pattern checks. v1 is NOT
--      touched: one-off windows keep using it.
--   5. commitment_override_validate_collisions_v1 — redefined with the ONLY
--      change in its 'plan' branch: a plan WITH a pattern validates a claimed
--      overlap against the run of consecutive shift days it falls in (the
--      same intersection the app's reserveCapacity computes for that run).
--      The NULL-pattern arm is the previous predicate, character for
--      character; every other branch is verbatim (body verified identical to
--      production by md5 on 2026-10-23 before this file was written).
--
-- AUTHORITY / RLS: no policy changes. work_plan_entries_select is unchanged
-- (planning org managers + the planned worker); direct writes stay revoked
-- from authenticated; the new command re-checks exactly what v1 checks.
--
-- ROLLBACK: supabase/rollbacks/20261023160000_work_plan_shift_patterns_v1.down.sql
--   (refuses while any row carries a pattern; restores the validator verbatim)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Shape of a stored pattern (mirrors parseShiftPattern in shift-pattern.ts).
-- ----------------------------------------------------------------------------
create or replace function public.work_plan_recurrence_valid_v1(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n        int;
  v_distinct int;
  v_bad      int;
  v_on       int;
  v_off      int;
  v_offset   int;
begin
  if p is null then
    return true;
  end if;
  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  if p->>'kind' = 'weekly' then
    if exists (select 1 from jsonb_object_keys(p) k where k not in ('kind', 'days')) then
      return false;
    end if;
    if jsonb_typeof(p->'days') is distinct from 'array' then
      return false;
    end if;
    select count(*),
           count(distinct e::text),
           count(*) filter (where jsonb_typeof(e) <> 'number' or e::text !~ '^[1-7]$')
      into v_n, v_distinct, v_bad
      from jsonb_array_elements(p->'days') e;
    return v_n between 1 and 7 and v_distinct = v_n and v_bad = 0;
  end if;

  if p->>'kind' = 'cycle' then
    if exists (select 1 from jsonb_object_keys(p) k where k not in ('kind', 'on', 'off', 'offset')) then
      return false;
    end if;
    if jsonb_typeof(p->'on') is distinct from 'number'
       or jsonb_typeof(p->'off') is distinct from 'number'
       or (p ? 'offset' and jsonb_typeof(p->'offset') is distinct from 'number') then
      return false;
    end if;
    if (p->>'on') !~ '^[0-9]{1,2}$'
       or (p->>'off') !~ '^[0-9]{1,2}$'
       or coalesce(p->>'offset', '0') !~ '^[0-9]{1,2}$' then
      return false;
    end if;
    v_on := (p->>'on')::int;
    v_off := (p->>'off')::int;
    v_offset := coalesce((p->>'offset')::int, 0);
    return v_on between 1 and 28
       and v_off between 1 and 28
       and v_offset between 0 and v_on + v_off - 1;
  end if;

  return false;
end;
$$;

revoke all on function public.work_plan_recurrence_valid_v1(jsonb) from public;
revoke all on function public.work_plan_recurrence_valid_v1(jsonb) from anon;
grant execute on function public.work_plan_recurrence_valid_v1(jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Is a day a shift day (mirrors isShiftDay in shift-pattern.ts).
--    The pattern is anchored on the window's first day; days before it are
--    never shift days. NULL pattern = every day of the window (one-off).
-- ----------------------------------------------------------------------------
create or replace function public.work_plan_is_shift_day_v1(
  p_start      date,
  p_day        date,
  p_recurrence jsonb
) returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_start is null or p_day is null or p_day < p_start then false
    when p_recurrence is null then true
    when p_recurrence->>'kind' = 'weekly' then
      (p_recurrence->'days') @> jsonb_build_array(extract(isodow from p_day)::int)
    when p_recurrence->>'kind' = 'cycle' then
      ((p_day - p_start) + coalesce((p_recurrence->>'offset')::int, 0))
        % ((p_recurrence->>'on')::int + (p_recurrence->>'off')::int)
        < (p_recurrence->>'on')::int
    else false
  end;
$$;

revoke all on function public.work_plan_is_shift_day_v1(date, date, jsonb) from public;
revoke all on function public.work_plan_is_shift_day_v1(date, date, jsonb) from anon;
grant execute on function public.work_plan_is_shift_day_v1(date, date, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. The one new column (nullable; existing rows untouched and valid).
-- ----------------------------------------------------------------------------
alter table public.work_plan_entries
  add column if not exists recurrence jsonb;

alter table public.work_plan_entries
  drop constraint if exists work_plan_entries_recurrence_valid;
alter table public.work_plan_entries
  add constraint work_plan_entries_recurrence_valid
  check (public.work_plan_recurrence_valid_v1(recurrence));

comment on column public.work_plan_entries.recurrence is
  'CAL-8 shift pattern inside [start_date, end_date]: {"kind":"weekly","days":[ISO weekdays]} or {"kind":"cycle","on":N,"off":M,"offset":K}. NULL = a one-off window holding every day. Only the rule is stored; shift days are projected on read (TIME is a projection, not a store).';

-- ----------------------------------------------------------------------------
-- 4. Command: plan a window WITH a shift pattern. v1 body + pattern checks.
-- ----------------------------------------------------------------------------
create or replace function public.create_work_plan_entry_v2(
  p_organization_id uuid,
  p_worker_id uuid,
  p_start_date date,
  p_end_date date,
  p_project_id uuid default null,
  p_work_object_id uuid default null,
  p_start_time time default null,
  p_end_time time default null,
  p_note text default null,
  p_recurrence jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not coalesce(public.manages_organization(p_organization_id), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not coalesce(public.work_plan_worker_in_scope_v1(p_organization_id, p_worker_id), false) then
    raise exception 'worker_not_in_scope' using errcode = '42501';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects p
     where p.id = p_project_id and p.organization_id = p_organization_id
  ) then
    raise exception 'project_not_in_organization' using errcode = '22023';
  end if;
  if p_work_object_id is not null and not exists (
    select 1 from public.work_objects o
     where o.id = p_work_object_id and o.organization_id = p_organization_id
  ) then
    raise exception 'work_object_not_in_organization' using errcode = '22023';
  end if;
  -- Shape only — never an overlap refusal (SEP-2).
  if p_recurrence is not null then
    if not public.work_plan_recurrence_valid_v1(p_recurrence) then
      raise exception 'invalid_recurrence' using errcode = '22023';
    end if;
    if p_start_date is null or p_end_date is null or p_end_date < p_start_date
       or not exists (
         select 1
           from generate_series(p_start_date, p_end_date, interval '1 day') g
          where public.work_plan_is_shift_day_v1(p_start_date, g::date, p_recurrence)
       ) then
      raise exception 'recurrence_without_shift' using errcode = '22023';
    end if;
  end if;

  insert into public.work_plan_entries
    (organization_id, worker_id, project_id, work_object_id,
     start_date, end_date, start_time, end_time, note, recurrence, created_by)
  values
    (p_organization_id, p_worker_id, p_project_id, p_work_object_id,
     p_start_date, p_end_date, p_start_time, p_end_time,
     nullif(trim(coalesce(p_note, '')), ''), p_recurrence, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_work_plan_entry_v2(uuid, uuid, date, date, uuid, uuid, time, time, text, jsonb) from public;
revoke all on function public.create_work_plan_entry_v2(uuid, uuid, date, date, uuid, uuid, time, time, text, jsonb) from anon;
grant execute on function public.create_work_plan_entry_v2(uuid, uuid, date, date, uuid, uuid, time, time, text, jsonb) to authenticated;

comment on function public.create_work_plan_entry_v2(uuid, uuid, date, date, uuid, uuid, time, time, text, jsonb) is
  'CAL-8: create_work_plan_entry_v1 plus an optional shift pattern. Same authority (manages_organization + roster scope). Refuses only a malformed pattern or one with no working day in its window; never refuses an overlap (SEP-2).';

-- ----------------------------------------------------------------------------
-- 5. Override-receipt validator: the 'plan' branch learns shift patterns.
--    Everything except that branch is verbatim from 20261003150950.
-- ----------------------------------------------------------------------------
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
        -- CAL-8: a plan WITH a shift pattern holds only its runs of
        -- consecutive shift days; the claimed overlap must be the window's
        -- intersection with exactly one such run: every day in it is a shift
        -- day, and each end either is the window/plan edge or borders a rest
        -- day. A plan WITHOUT a pattern keeps the previous predicate.
        if to_regclass('public.work_plan_entries') is not null then
          execute $q$
            select exists (
              select 1 from public.work_plan_entries e
               where e.id = $1 and e.worker_id = $2 and e.status = 'planned'
                 and e.start_date is not null
                 and (
                   (e.recurrence is null
                     and greatest($3, e.start_date) = $5
                     and least($4, case when e.end_date is not null and e.end_date >= e.start_date
                                        then e.end_date else e.start_date end) = $6)
                   or
                   (e.recurrence is not null
                     and e.end_date is not null
                     and $5 >= e.start_date and $6 <= e.end_date
                     and not exists (
                       select 1 from generate_series($5, $6, interval '1 day') g
                        where not public.work_plan_is_shift_day_v1(e.start_date, g::date, e.recurrence)
                     )
                     and ($5 = $3 or $5 = e.start_date
                          or not public.work_plan_is_shift_day_v1(e.start_date, $5 - 1, e.recurrence))
                     and ($6 = $4 or $6 = e.end_date
                          or not public.work_plan_is_shift_day_v1(e.start_date, $6 + 1, e.recurrence)))
                 )
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
  'INTERNAL (no grants; called only by record_commitment_override_v1). Verifies each collision against its real source row with the reserveCapacity overlap rule: overlap = intersection of the project window and the source effective range. Absence is verified by an approved worker_absences row, never by id. CAL-8: a plan with a shift pattern is verified against the run of shift days the overlap falls in.';

-- ROLLBACK
--   supabase/rollbacks/20261023160000_work_plan_shift_patterns_v1.down.sql:
--   refuses while any work_plan_entries row carries a pattern; otherwise
--   restores commitment_override_validate_collisions_v1 verbatim from
--   20261003150950, then
--   drop function if exists public.create_work_plan_entry_v2(uuid, uuid, date, date, uuid, uuid, time, time, text, jsonb);
--   alter table public.work_plan_entries drop constraint if exists work_plan_entries_recurrence_valid;
--   alter table public.work_plan_entries drop column if exists recurrence;
--   drop function if exists public.work_plan_is_shift_day_v1(date, date, jsonb);
--   drop function if exists public.work_plan_recurrence_valid_v1(jsonb);
