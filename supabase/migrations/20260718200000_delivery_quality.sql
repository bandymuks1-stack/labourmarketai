-- @human-gate-approved
-- Wagon 11 — Delivery & Quality (defects + corrections).
--
-- Additive, default-closed. Two new tables over the canonical project spine
-- (reusing project_stages for the optional stage link). A defect runs a real
-- lifecycle (reported → acknowledged → assigned → in_correction →
-- ready_for_review → accepted / reopened / rejected / cancelled); a correction
-- is an append record of real remediation work. Nothing is auto-accepted:
-- acceptance is an explicit manager act (doctrine §7). Photos/evidence reuse the
-- existing project gallery + journal — this wagon adds no second photo store.
--
-- RED class (SECURITY DEFINER RPCs + GRANTs). Applied under owner standing
-- authorization. Rollback: supabase/rollbacks/20260718200000_delivery_quality.down.sql

create table if not exists public.defects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  location text,
  category text not null check (category in ('workmanship','materials','safety','documentation','other')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  description text not null,
  reporter_id uuid not null references public.profiles(id),
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'reported'
    check (status in ('reported','acknowledged','assigned','in_correction','ready_for_review','accepted','reopened','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint defects_desc_len check (char_length(description) between 1 and 2000),
  constraint defects_location_len check (location is null or char_length(location) <= 200)
);
create index if not exists defects_project_idx on public.defects (project_id, status);

create table if not exists public.defect_corrections (
  id uuid primary key default gen_random_uuid(),
  defect_id uuid not null references public.defects(id) on delete cascade,
  work_performed text not null,
  materials text,
  outcome text not null default 'pending' check (outcome in ('pending','passed','failed')),
  reviewer_id uuid not null references public.profiles(id),
  completed_at date,
  created_at timestamptz not null default now(),
  constraint corrections_work_len check (char_length(work_performed) between 1 and 2000),
  constraint corrections_materials_len check (materials is null or char_length(materials) <= 1000)
);
create index if not exists defect_corrections_defect_idx on public.defect_corrections (defect_id);

alter table public.defects enable row level security;
alter table public.defect_corrections enable row level security;

-- defects: project managers, the reporter, or admin. can_manage_project is a
-- SECURITY DEFINER helper (reads projects, not defects) → no recursion.
drop policy if exists defects_select on public.defects;
create policy defects_select on public.defects
  for select using (public.can_manage_project(project_id) or reporter_id = auth.uid() or public.is_admin());

-- SECURITY DEFINER helper — caller manages the defect's project (bypasses
-- defects RLS, so the corrections policy can never recurse).
create or replace function public.caller_manages_defect(p_defect_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.defects d where d.id = p_defect_id and public.can_manage_project(d.project_id));
$$;

drop policy if exists defect_corrections_select on public.defect_corrections;
create policy defect_corrections_select on public.defect_corrections
  for select using (public.caller_manages_defect(defect_id) or public.is_admin());

grant select on public.defects to authenticated;
grant select on public.defect_corrections to authenticated;

-- ── Write RPCs (SECURITY DEFINER, pinned search_path) ───────────────────────
create or replace function public.report_defect_v1(
  p_project_id uuid, p_category text, p_description text,
  p_severity text default 'medium', p_stage_id uuid default null,
  p_location text default null, p_due_date date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can_manage_project(p_project_id) then raise exception 'not authorized to manage this project'; end if;
  if p_category not in ('workmanship','materials','safety','documentation','other') then raise exception 'invalid category'; end if;
  if p_severity not in ('low','medium','high','critical') then raise exception 'invalid severity'; end if;
  if p_description is null or char_length(trim(p_description)) = 0 then raise exception 'description required'; end if;
  insert into public.defects (project_id, stage_id, category, severity, description, location, due_date, reporter_id)
  values (p_project_id, p_stage_id, p_category, p_severity, left(trim(p_description),2000),
          nullif(left(coalesce(p_location,''),200),''), p_due_date, auth.uid())
  returning id into v_id; return v_id;
end; $$;

create or replace function public.set_defect_status_v1(
  p_defect_id uuid, p_status text, p_assignee_profile_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.caller_manages_defect(p_defect_id) then raise exception 'not authorized to manage this defect'; end if;
  if p_status not in ('reported','acknowledged','assigned','in_correction','ready_for_review','accepted','reopened','rejected','cancelled') then
    raise exception 'invalid status'; end if;
  update public.defects set
    status = p_status,
    assignee_profile_id = coalesce(p_assignee_profile_id, assignee_profile_id),
    updated_at = now()
  where id = p_defect_id;
end; $$;

create or replace function public.add_defect_correction_v1(
  p_defect_id uuid, p_work_performed text, p_materials text default null,
  p_outcome text default 'pending', p_completed_at date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.caller_manages_defect(p_defect_id) then raise exception 'not authorized to manage this defect'; end if;
  if p_work_performed is null or char_length(trim(p_work_performed)) = 0 then raise exception 'work_performed required'; end if;
  if p_outcome not in ('pending','passed','failed') then raise exception 'invalid outcome'; end if;
  insert into public.defect_corrections (defect_id, work_performed, materials, outcome, completed_at, reviewer_id)
  values (p_defect_id, left(trim(p_work_performed),2000), nullif(left(coalesce(p_materials,''),1000),''),
          p_outcome, p_completed_at, auth.uid())
  returning id into v_id;
  -- Recording a correction moves an open defect into review (not auto-accepted).
  update public.defects set status = 'in_correction', updated_at = now()
   where id = p_defect_id and status in ('reported','acknowledged','assigned','reopened');
  return v_id;
end; $$;

create or replace function public.delete_defect_v1(p_defect_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.caller_manages_defect(p_defect_id) then raise exception 'not authorized to manage this defect'; end if;
  delete from public.defects where id = p_defect_id;
end; $$;

grant execute on function public.caller_manages_defect(uuid) to authenticated;
grant execute on function public.report_defect_v1(uuid, text, text, text, uuid, text, date) to authenticated;
grant execute on function public.set_defect_status_v1(uuid, text, uuid) to authenticated;
grant execute on function public.add_defect_correction_v1(uuid, text, text, text, date) to authenticated;
grant execute on function public.delete_defect_v1(uuid) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718200000_delivery_quality.down.sql
