-- @human-gate-approved
-- Wagon 9 — Assets & Logistics.
--
-- Additive, default-closed. Two new tables over the canonical organization /
-- project / worker spine (no duplication of those): `assets` (tools, equipment,
-- vehicles, safety equipment owned by an organization) and `asset_assignments`
-- (issue → acknowledge → transfer → return, with condition at issue/return).
-- Organization-scoped: managers of the owning org (canonical manages_organization)
-- mutate; an assigned worker reads + acknowledges their own. No location
-- tracking and no precise worker-location collection of any kind.
--
-- RED class (SECURITY DEFINER RPCs + GRANTs). Applied under the owner's standing
-- authorization for this train, via Supabase MCP.
-- Rollback: supabase/rollbacks/20260718170000_assets_logistics.down.sql

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_type text not null check (asset_type in ('tool','equipment','vehicle','safety_equipment')),
  name text not null,
  serial_or_reg text,
  condition text not null default 'unknown'
    check (condition in ('new','good','fair','poor','damaged','unknown')),
  availability text not null default 'available'
    check (availability in ('available','assigned','maintenance','retired')),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_name_len check (char_length(name) between 1 and 160),
  constraint assets_serial_len check (serial_or_reg is null or char_length(serial_or_reg) <= 120),
  constraint assets_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists assets_org_idx on public.assets (organization_id, availability);

create table if not exists public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  status text not null default 'issued'
    check (status in ('issued','acknowledged','transferred','returned')),
  condition_at_issue text not null default 'unknown'
    check (condition_at_issue in ('new','good','fair','poor','damaged','unknown')),
  condition_at_return text
    check (condition_at_return is null or condition_at_return in ('new','good','fair','poor','damaged','unknown')),
  note text check (note is null or char_length(note) <= 500),
  issued_by uuid not null references public.profiles(id),
  issued_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_assignments_target check (project_id is not null or worker_id is not null)
);

create index if not exists asset_assignments_asset_idx on public.asset_assignments (asset_id, status);
create index if not exists asset_assignments_project_idx on public.asset_assignments (project_id);

alter table public.assets enable row level security;
alter table public.asset_assignments enable row level security;

-- assets: org managers, admin, or a worker with an OPEN assignment of the asset.
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select
  using (
    public.manages_organization(organization_id)
    or public.is_admin()
    or exists (
      select 1 from public.asset_assignments aa
        join public.workers w on w.id = aa.worker_id
       where aa.asset_id = assets.id and aa.status in ('issued','acknowledged')
         and w.profile_id = auth.uid()
    )
  );

-- asset_assignments: managers of the asset's org, admin, or the assigned worker.
drop policy if exists asset_assignments_select on public.asset_assignments;
create policy asset_assignments_select on public.asset_assignments
  for select
  using (
    exists (select 1 from public.assets a where a.id = asset_assignments.asset_id and public.manages_organization(a.organization_id))
    or public.is_admin()
    or exists (select 1 from public.workers w where w.id = asset_assignments.worker_id and w.profile_id = auth.uid())
  );

grant select on public.assets to authenticated;
grant select on public.asset_assignments to authenticated;

-- ── Write RPCs (SECURITY DEFINER, pinned search_path) ───────────────────────

create or replace function public.create_asset_v1(
  p_organization_id uuid,
  p_asset_type text,
  p_name text,
  p_serial_or_reg text default null,
  p_condition text default 'unknown',
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.manages_organization(p_organization_id) then
    raise exception 'not authorized to manage this organization';
  end if;
  if p_asset_type not in ('tool','equipment','vehicle','safety_equipment') then
    raise exception 'invalid asset_type';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;
  insert into public.assets (organization_id, asset_type, name, serial_or_reg, condition, note, created_by)
  values (p_organization_id, p_asset_type, left(trim(p_name),160), nullif(left(coalesce(p_serial_or_reg,''),120),''),
          coalesce(nullif(p_condition,''),'unknown'), nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

-- helper: caller manages the asset's owning org
create or replace function public.caller_manages_asset(p_asset_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assets a where a.id = p_asset_id and public.manages_organization(a.organization_id));
$$;

create or replace function public.issue_asset_v1(
  p_asset_id uuid,
  p_project_id uuid default null,
  p_worker_id uuid default null,
  p_condition_at_issue text default 'unknown',
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.caller_manages_asset(p_asset_id) then
    raise exception 'not authorized to manage this asset';
  end if;
  if p_project_id is null and p_worker_id is null then
    raise exception 'assignment target required (project or worker)';
  end if;
  if p_condition_at_issue not in ('new','good','fair','poor','damaged','unknown') then
    raise exception 'invalid condition';
  end if;
  insert into public.asset_assignments (asset_id, project_id, worker_id, status, condition_at_issue, note, issued_by)
  values (p_asset_id, p_project_id, p_worker_id, 'issued', p_condition_at_issue, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_id;
  update public.assets set availability = 'assigned', updated_at = now() where id = p_asset_id;
  return v_id;
end; $$;

create or replace function public.acknowledge_asset_assignment_v1(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_worker uuid; v_status text;
begin
  select worker_id, status into v_worker, v_status from public.asset_assignments where id = p_assignment_id;
  if v_worker is null then raise exception 'assignment not found or has no worker'; end if;
  if not exists (select 1 from public.workers w where w.id = v_worker and w.profile_id = auth.uid()) then
    raise exception 'not authorized: only the assigned worker can acknowledge';
  end if;
  if v_status <> 'issued' then raise exception 'only an issued assignment can be acknowledged'; end if;
  update public.asset_assignments set status = 'acknowledged', acknowledged_at = now(), updated_at = now()
   where id = p_assignment_id;
end; $$;

create or replace function public.transfer_asset_assignment_v1(
  p_assignment_id uuid,
  p_new_project_id uuid default null,
  p_new_worker_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_status text; v_cond text; v_new uuid;
begin
  select asset_id, status, condition_at_issue into v_asset, v_status, v_cond
    from public.asset_assignments where id = p_assignment_id;
  if v_asset is null then raise exception 'assignment not found'; end if;
  if not public.caller_manages_asset(v_asset) then raise exception 'not authorized to manage this asset'; end if;
  if v_status not in ('issued','acknowledged') then raise exception 'only an active assignment can be transferred'; end if;
  if p_new_project_id is null and p_new_worker_id is null then raise exception 'transfer target required'; end if;
  update public.asset_assignments set status = 'transferred', updated_at = now() where id = p_assignment_id;
  insert into public.asset_assignments (asset_id, project_id, worker_id, status, condition_at_issue, note, issued_by)
  values (v_asset, p_new_project_id, p_new_worker_id, 'issued', v_cond, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_new;
  return v_new;
end; $$;

create or replace function public.return_asset_v1(
  p_assignment_id uuid,
  p_condition_at_return text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_status text;
begin
  select asset_id, status into v_asset, v_status from public.asset_assignments where id = p_assignment_id;
  if v_asset is null then raise exception 'assignment not found'; end if;
  if not public.caller_manages_asset(v_asset) then raise exception 'not authorized to manage this asset'; end if;
  if v_status not in ('issued','acknowledged') then raise exception 'only an active assignment can be returned'; end if;
  if p_condition_at_return not in ('new','good','fair','poor','damaged','unknown') then raise exception 'invalid condition'; end if;
  update public.asset_assignments
     set status = 'returned', returned_at = now(), condition_at_return = p_condition_at_return,
         note = coalesce(nullif(left(coalesce(p_note,''),500),''), note), updated_at = now()
   where id = p_assignment_id;
  update public.assets set availability = 'available', condition = p_condition_at_return, updated_at = now()
   where id = v_asset;
end; $$;

grant execute on function public.create_asset_v1(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.caller_manages_asset(uuid) to authenticated;
grant execute on function public.issue_asset_v1(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.acknowledge_asset_assignment_v1(uuid) to authenticated;
grant execute on function public.transfer_asset_assignment_v1(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.return_asset_v1(uuid, text, text) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718170000_assets_logistics.down.sql
