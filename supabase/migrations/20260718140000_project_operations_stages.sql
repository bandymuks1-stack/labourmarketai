-- @human-gate-approved
-- Wagon 6 — Project Operations Core (slice 1: Project Stages).
--
-- Additive, default-closed. Introduces ONE new canonical structure — ordered
-- project stages — over the existing `projects` truth. No canonical stage
-- equivalent exists: `projects.status` is the whole-project lifecycle,
-- `project_handover_entries.status_value` is the handover declaration timeline,
-- and `project_worker_operational_statuses` is per-worker readiness — none model
-- ordered sub-phases with their own dates/dependencies. Kanban rides the
-- existing `work_tasks` table (a later slice adds `work_tasks.stage_id`); Gantt
-- is a projection over this table, never a stored event set.
--
-- RED class (SECURITY DEFINER RPCs + GRANTs). Ships under the owner's explicit
-- standing authorization for this train (bounded, one wagon, reversible,
-- independently validated, applied via Supabase MCP). Rollback:
-- supabase/rollbacks/20260718140000_project_operations_stages.down.sql
--
-- Progress is NEVER a stored fabricated percentage (doctrine §18 / §7): a stage
-- carries only real facts (status + real dates). Any progress shown is derived
-- downstream from real task/journal facts, not written here.

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  stage_order integer not null default 0,
  status text not null default 'planned'
    check (status in ('planned','in_progress','blocked','done','cancelled')),
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  responsible_engagement_id uuid references public.engagement_contexts(id) on delete set null,
  completion_criteria text,
  blocked_reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_stages_name_len check (char_length(name) between 1 and 160),
  constraint project_stages_order_nonneg check (stage_order >= 0),
  constraint project_stages_blocked_reason check (status <> 'blocked' or blocked_reason is not null)
);

create index if not exists project_stages_project_order_idx
  on public.project_stages (project_id, stage_order);

alter table public.project_stages enable row level security;

-- Default-closed SELECT: project managers (canonical can_manage_project) and
-- workers actively assigned to the project. Writes are RPC-only (no direct
-- insert/update/delete policy exists → default-deny).
drop policy if exists project_stages_select on public.project_stages;
create policy project_stages_select on public.project_stages
  for select
  using (
    public.can_manage_project(project_id)
    or exists (
      select 1
        from public.project_worker_assignments a
        join public.workers w on w.id = a.worker_id
       where a.project_id = project_stages.project_id
         and a.status = 'active'
         and w.profile_id = auth.uid()
    )
  );

grant select on public.project_stages to authenticated;

-- ── Manager-gated write RPCs (SECURITY DEFINER, pinned search_path) ──────────

create or replace function public.add_project_stage_v1(
  p_project_id uuid,
  p_name text,
  p_stage_order integer default 0,
  p_planned_start date default null,
  p_planned_end date default null,
  p_completion_criteria text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'not authorized to manage this project';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'stage name required';
  end if;
  insert into public.project_stages
    (project_id, name, stage_order, planned_start, planned_end, completion_criteria, created_by)
  values
    (p_project_id, left(trim(p_name), 160), greatest(coalesce(p_stage_order, 0), 0),
     p_planned_start, p_planned_end,
     nullif(left(coalesce(p_completion_criteria, ''), 2000), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_project_stage_v1(
  p_stage_id uuid,
  p_name text default null,
  p_status text default null,
  p_stage_order integer default null,
  p_planned_start date default null,
  p_planned_end date default null,
  p_actual_start date default null,
  p_actual_end date default null,
  p_blocked_reason text default null,
  p_completion_criteria text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.project_stages where id = p_stage_id;
  if v_project is null then
    raise exception 'stage not found';
  end if;
  if not public.can_manage_project(v_project) then
    raise exception 'not authorized to manage this project';
  end if;
  if p_status is not null and p_status not in ('planned','in_progress','blocked','done','cancelled') then
    raise exception 'invalid status';
  end if;
  if p_status = 'blocked' and coalesce(nullif(trim(p_blocked_reason), ''),
        (select blocked_reason from public.project_stages where id = p_stage_id)) is null then
    raise exception 'blocked_reason required when status is blocked';
  end if;
  update public.project_stages set
    name = coalesce(left(nullif(trim(p_name), ''), 160), name),
    status = coalesce(p_status, status),
    stage_order = coalesce(greatest(p_stage_order, 0), stage_order),
    planned_start = coalesce(p_planned_start, planned_start),
    planned_end = coalesce(p_planned_end, planned_end),
    actual_start = coalesce(p_actual_start, actual_start),
    actual_end = coalesce(p_actual_end, actual_end),
    blocked_reason = case when p_status = 'blocked'
                         then coalesce(nullif(trim(p_blocked_reason), ''), blocked_reason)
                         when p_status is not null then null
                         else coalesce(nullif(trim(p_blocked_reason), ''), blocked_reason) end,
    completion_criteria = coalesce(nullif(left(p_completion_criteria, 2000), ''), completion_criteria),
    updated_at = now()
  where id = p_stage_id;
end;
$$;

create or replace function public.delete_project_stage_v1(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.project_stages where id = p_stage_id;
  if v_project is null then
    return;
  end if;
  if not public.can_manage_project(v_project) then
    raise exception 'not authorized to manage this project';
  end if;
  delete from public.project_stages where id = p_stage_id;
end;
$$;

grant execute on function public.add_project_stage_v1(uuid, text, integer, date, date, text) to authenticated;
grant execute on function public.update_project_stage_v1(uuid, text, text, integer, date, date, date, date, text, text) to authenticated;
grant execute on function public.delete_project_stage_v1(uuid) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718140000_project_operations_stages.down.sql
-- (drops the three RPCs and the project_stages table; brand-new objects, no data
-- migration to reverse).
