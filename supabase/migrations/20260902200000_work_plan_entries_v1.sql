-- ============================================================================
-- 20260902200000 — work_plan_entries_v1
--
-- FINAL COMPLETION Train F1 (2026-09-02): the PLAN primitive the calendar
-- contract never had. CALENDAR = PLAN, JOURNAL = FACT (canonical-calendar-
-- contract-v1). The calendar is a pure projection over real source objects —
-- bookings, project bands, task due dates, absences, journal facts — and until
-- now an ORGANIZATION had no object that says "this person is planned to work
-- here on these days". Managers planned in their heads or in a spreadsheet.
--
-- @human-gate-approved
--   Acknowledged RED by route: SECURITY DEFINER RPCs + GRANT/REVOKE + a
--   trigger (migration-safety rules). Ships as a DRAFT + needs-human-gate PR;
--   the code degrades honestly while the table is unapplied (the calendar
--   source reports "unavailable", the form does not render).
--
-- ----------------------------------------------------------------------------
-- CANONICAL CHECK (doctrine §2 — is there an equivalent already?)
-- ----------------------------------------------------------------------------
--   booking_requests      plan between an ORGANIZATION and an EXTERNAL worker
--                         (start/expected_end) — the marketplace plan object.
--                         Not for an organization's own people.
--   project_worker_assignments  membership of a person in a project — no dates
--                         beyond assigned_at/ended_at; not a day plan.
--   tasks                 carry a due date only — a deadline, not a work window.
--   worker_absences       the NEGATIVE plan (leave) — the conflict source.
--   project_stages        project-level date bands — not per person.
--   None says "worker W works on project P / object O from D1 to D2". This
--   table does, and only that. It is ADDITIVE: no existing object changes.
--
-- ----------------------------------------------------------------------------
-- WHAT IT IS
-- ----------------------------------------------------------------------------
--   One row = one planned work window for one worker, owned by the
--   organization that plans it. Optional project and work object. Date-only
--   windows (UTC calendar days, inclusive) — the same semantics the booking
--   guard and the calendar use; optional start/end times for the day view.
--   Status: planned | cancelled (append a cancellation, never delete — a
--   cancelled plan is still a fact about what was planned).
--
--   Conflicts with approved leave are NOT refused by the database: a manager
--   may knowingly plan over a pending request. The calendar renders the
--   overlap through the EXISTING unavailability predicate
--   (lib/planning/employer-availability.ts) — one overlap truth.
--
-- ----------------------------------------------------------------------------
-- AUTHORITY
-- ----------------------------------------------------------------------------
--   Read:  the planning organization's managers (manages_organization) and
--          the planned worker themself (workers.profile_id = auth.uid()).
--   Write: managers only, through two SECURITY DEFINER commands that re-check
--          manages_organization and that the worker is actually engaged with
--          that organization (is_org_member_or_engaged is the org side; the
--          worker side is company_worker_engagements / company_memberships /
--          agency_workers — the same three the roster reads). Direct table
--          writes are revoked from authenticated.
--
-- ROLLBACK: supabase/rollbacks/20260902200000_work_plan_entries_v1.down.sql
-- ============================================================================

create table if not exists public.work_plan_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id       uuid not null references public.workers(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  work_object_id  uuid references public.work_objects(id) on delete set null,
  start_date      date not null,
  end_date        date not null,
  start_time      time,
  end_time        time,
  note            text check (note is null or char_length(note) <= 500),
  status          text not null default 'planned' check (status in ('planned', 'cancelled')),
  created_by      uuid not null references public.profiles(id),
  cancelled_by    uuid references public.profiles(id),
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint work_plan_entries_window_ordered check (end_date >= start_date),
  constraint work_plan_entries_times_ordered check (
    start_time is null or end_time is null or end_time > start_time
  ),
  constraint work_plan_entries_window_bounded check (end_date - start_date <= 366)
);

create index if not exists work_plan_entries_org_date_idx
  on public.work_plan_entries (organization_id, start_date);
create index if not exists work_plan_entries_worker_date_idx
  on public.work_plan_entries (worker_id, start_date);
create index if not exists work_plan_entries_project_idx
  on public.work_plan_entries (project_id) where project_id is not null;

create or replace function public.work_plan_entries_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_work_plan_entries_updated_at on public.work_plan_entries;
create trigger trg_work_plan_entries_updated_at
  before update on public.work_plan_entries
  for each row execute function public.work_plan_entries_touch_updated_at();

alter table public.work_plan_entries enable row level security;

-- Read: the planning organization's managers, and the planned worker.
create policy work_plan_entries_select on public.work_plan_entries
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.workers w
       where w.id = work_plan_entries.worker_id
         and w.profile_id = auth.uid()
    )
  );

grant select on public.work_plan_entries to authenticated;
revoke insert, update, delete on public.work_plan_entries from authenticated;
revoke all on public.work_plan_entries from anon;

-- ----------------------------------------------------------------------------
-- Is this worker actually one the organization can plan for?
-- The three roster truths the product already uses; nothing invented.
-- ----------------------------------------------------------------------------
create or replace function public.work_plan_worker_in_scope_v1(
  p_organization_id uuid,
  p_worker_id uuid
) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.company_worker_engagements e
      join public.companies c on c.id = e.company_id
     where e.worker_id = p_worker_id
       and e.status = 'active'
       and c.organization_id = p_organization_id
  )
  or exists (
    select 1
      from public.company_memberships m
      join public.workers w on w.profile_id = m.profile_id
     where w.id = p_worker_id
       and m.organization_id = p_organization_id
       and m.status = 'active'
  )
  or exists (
    select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
     where aw.worker_id = p_worker_id
       and aw.status = 'active'
       and a.organization_id = p_organization_id
  );
$$;

revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from public;
revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from anon;
grant execute on function public.work_plan_worker_in_scope_v1(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Command: plan a work window.
-- ----------------------------------------------------------------------------
create or replace function public.create_work_plan_entry_v1(
  p_organization_id uuid,
  p_worker_id uuid,
  p_start_date date,
  p_end_date date,
  p_project_id uuid default null,
  p_work_object_id uuid default null,
  p_start_time time default null,
  p_end_time time default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.manages_organization(p_organization_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not public.work_plan_worker_in_scope_v1(p_organization_id, p_worker_id) then
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

  insert into public.work_plan_entries
    (organization_id, worker_id, project_id, work_object_id,
     start_date, end_date, start_time, end_time, note, created_by)
  values
    (p_organization_id, p_worker_id, p_project_id, p_work_object_id,
     p_start_date, p_end_date, p_start_time, p_end_time,
     nullif(trim(coalesce(p_note, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_work_plan_entry_v1(uuid, uuid, date, date, uuid, uuid, time, time, text) from public;
revoke all on function public.create_work_plan_entry_v1(uuid, uuid, date, date, uuid, uuid, time, time, text) from anon;
grant execute on function public.create_work_plan_entry_v1(uuid, uuid, date, date, uuid, uuid, time, time, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Command: cancel a planned window (append the cancellation; never delete).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_work_plan_entry_v1(p_entry_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select organization_id into v_org from public.work_plan_entries where id = p_entry_id;
  if v_org is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.manages_organization(v_org) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.work_plan_entries
     set status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now()
   where id = p_entry_id
     and status = 'planned';
end;
$$;

revoke all on function public.cancel_work_plan_entry_v1(uuid) from public;
revoke all on function public.cancel_work_plan_entry_v1(uuid) from anon;
grant execute on function public.cancel_work_plan_entry_v1(uuid) to authenticated;

comment on table public.work_plan_entries is
  'PLAN primitive (Train F1): one planned work window per worker, owned by the planning organization. Date-only inclusive windows; cancel = status change, never delete. Calendar = PLAN, Journal = FACT.';

-- ROLLBACK
--   drop function if exists public.cancel_work_plan_entry_v1(uuid);
--   drop function if exists public.create_work_plan_entry_v1(uuid, uuid, date, date, uuid, uuid, time, time, text);
--   drop function if exists public.work_plan_worker_in_scope_v1(uuid, uuid);
--   drop table if exists public.work_plan_entries;   -- zero rows until first use
--   drop function if exists public.work_plan_entries_touch_updated_at();
