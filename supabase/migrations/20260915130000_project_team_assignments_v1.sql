-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY. PREPARED FOR REVIEW ONLY.
--
-- This file carries NO approval annotation on purpose: the owner has not
-- approved it, and the annotation would assert an approval that does not
-- exist. migration-safety is RED on this file BY DESIGN.
--
-- 20260915130000 — project_team_assignments v1
-- J-COMPANY-EXECUTION step 4 (WRK-6): "It assigns a whole team or brigade" —
-- the UNIT half. Prerequisite for J-AGENCY-SUPPLY step 6 (DEM-6, a brigade
-- matched as a unit), which needs a team↔project object to point at.
--
-- THE GAP, MEASURED. Since 2026-09-15 a manager can assign a whole team from
-- the team panel: every member goes through the ONE existing per-person
-- write (`assign_worker_to_project`) and gets their own calendar verdict.
-- What the product then knows is N assignments. It does NOT know that they
-- were one act: nothing can end the brigade's assignment as a unit, nothing
-- can show "this brigade is on this project", and a brigade match has no
-- object to produce. Checked 2026-09-15: no relation links an organization
-- of type `team` to a project; `project_worker_assignments` has no team
-- column; `team_enquiries` is organization-scoped consent, not assignment.
--
-- WHAT THIS ADDS. ONE link table and TWO commands, both riding the EXISTING
-- per-person writes rather than replacing them.
--
--   project_team_assignments
--     which team (an `organizations` row of type `team`), which project, who
--     did it, when, and whether it is still active. The per-person rows stay
--     the truth about people; this row is the truth about the act.
--
--   assign_team_to_project_v1(p_project_id, p_team_id) → uuid
--     SECURITY DEFINER. Admits ONLY a caller who `can_manage_project` AND who
--     OWNS the team (`organizations.owner_profile_id = auth.uid()`, the same
--     rule the team panel reads by). Records the unit row, then assigns each
--     active member through `assign_worker_to_project` — so each person is
--     still admitted or refused by that RPC's own gates. A refused member
--     does NOT abort the unit: the act happened for the others, and the
--     caller is told who was refused (returned as the unit id; the per-
--     member outcome is read back from `project_worker_assignments`).
--     Idempotent on (project, team) while active.
--
--   end_team_project_assignment_v1(p_assignment_id) → void
--     Ends the unit row and, for every member currently assigned to the
--     project THROUGH this brigade, ends their assignment through the
--     existing `end_worker_project_assignment`. A member assigned to the
--     same project individually before the brigade is NOT ended — the unit
--     only takes back what it gave.
--
-- RLS, STATED EXPLICITLY.
--   anon:          nothing.
--   authenticated: SELECT for the project's managers (`can_manage_project`),
--                  the team's owner, and the team's MEMBERS
--                  (`belongs_to_organization(team_organization_id)`) — a
--                  person may see that their brigade was put on a project.
--                  No INSERT / UPDATE / DELETE policy: the two RPCs write.
--
-- WHAT IS DELIBERATELY NOT BUILT. No external brigade path: a team owned by
-- ANOTHER organization cannot be assigned here, because that needs demand-
-- scoped consent that does not exist (owner-blocked E6, J-AGENCY-SUPPLY).
-- No matching, no offer object, no notification.
--
-- RISK / REVERSIBILITY. Additive: one table, two functions, grants on the
-- functions only. Nothing existing is altered.
-- ROLLBACK: supabase/rollbacks/20260915130000_project_team_assignments_v1.down.sql
-- (guarded — refuses while active unit rows exist).
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.project_worker_assignments') is null then
    raise exception 'project_worker_assignments missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'assign_worker_to_project') then
    raise exception 'assign_worker_to_project missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'end_worker_project_assignment') then
    raise exception 'end_worker_project_assignment missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'belongs_to_organization') then
    raise exception 'belongs_to_organization missing';
  end if;
end $$;

-- ── 1. The unit ────────────────────────────────────────────────────────────
create table if not exists public.project_team_assignments (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  team_organization_id  uuid not null references public.organizations(id) on delete cascade,
  assigned_by           uuid not null references public.profiles(id) on delete cascade,
  status                text not null default 'active' check (status in ('active', 'ended')),
  assigned_at           timestamptz not null default now(),
  ended_at              timestamptz,
  constraint project_team_assignments_ended_shape check (
    (status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null)
  )
);

create unique index if not exists project_team_assignments_active_uq
  on public.project_team_assignments (project_id, team_organization_id)
  where status = 'active';
create index if not exists project_team_assignments_team_idx
  on public.project_team_assignments (team_organization_id, status);

comment on table public.project_team_assignments is
  'WRK-6. The ACT of assigning a whole team (an organizations row of type team) to a project. The per-person truth stays in project_worker_assignments; this row lets the brigade be seen, and ended, as one unit. Written only by assign_team_to_project_v1 / end_team_project_assignment_v1.';

-- ── 2. Which members the unit gave — so ending it takes back only those ────
create table if not exists public.project_team_assignment_members (
  team_assignment_id  uuid not null references public.project_team_assignments(id) on delete cascade,
  worker_id           uuid not null references public.workers(id) on delete cascade,
  primary key (team_assignment_id, worker_id)
);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.project_team_assignments enable row level security;
alter table public.project_team_assignments force row level security;
alter table public.project_team_assignment_members enable row level security;
alter table public.project_team_assignment_members force row level security;

revoke all on public.project_team_assignments from public, anon;
revoke all on public.project_team_assignment_members from public, anon;
grant select on public.project_team_assignments to authenticated;
grant select on public.project_team_assignment_members to authenticated;

drop policy if exists project_team_assignments_select on public.project_team_assignments;
create policy project_team_assignments_select
  on public.project_team_assignments
  for select
  to authenticated
  using (
    public.can_manage_project(project_id)
    or exists (select 1 from public.organizations o
                where o.id = team_organization_id and o.owner_profile_id = auth.uid())
    or public.belongs_to_organization(team_organization_id)
    or public.is_admin()
  );

drop policy if exists project_team_assignment_members_select on public.project_team_assignment_members;
create policy project_team_assignment_members_select
  on public.project_team_assignment_members
  for select
  to authenticated
  using (
    exists (select 1 from public.project_team_assignments a
             where a.id = team_assignment_id
               and (public.can_manage_project(a.project_id)
                    or exists (select 1 from public.organizations o
                                where o.id = a.team_organization_id and o.owner_profile_id = auth.uid())
                    or public.belongs_to_organization(a.team_organization_id)
                    or public.is_admin()))
  );

-- ── 4. Assign the unit ─────────────────────────────────────────────────────
create or replace function public.assign_team_to_project_v1(
  p_project_id uuid,
  p_team_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_unit   uuid;
  v_member record;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.can_manage_project(p_project_id) or public.is_admin()) then
    raise exception 'Not authorized to staff this project' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizations o
     where o.id = p_team_id and o.organization_type = 'team'
       and (o.owner_profile_id = v_uid or public.is_admin())
  ) then
    raise exception 'Not your team' using errcode = '42501';
  end if;
  select status into v_status from public.projects where id = p_project_id;
  if v_status = 'completed' then
    raise exception 'Project is completed' using errcode = '22023';
  end if;

  select id into v_unit from public.project_team_assignments
   where project_id = p_project_id and team_organization_id = p_team_id and status = 'active';
  if v_unit is null then
    insert into public.project_team_assignments (project_id, team_organization_id, assigned_by)
    values (p_project_id, p_team_id, v_uid)
    returning id into v_unit;
  end if;

  -- Each member through the existing per-person write, which applies its own
  -- gates. A refusal is swallowed HERE so the unit act completes for the
  -- others; the caller reads the per-member truth back from
  -- project_worker_assignments. Members already on the project individually
  -- are not claimed by the unit (so ending it will not end them).
  for v_member in
    select ec.profile_id, w.id as worker_id
      from public.engagement_contexts ec
      join public.workers w on w.profile_id = ec.profile_id
     where ec.organization_id = p_team_id
       and ec.relationship_slug = 'employee'
       and ec.status = 'active'
     limit 50
  loop
    if exists (select 1 from public.project_worker_assignments a
                where a.project_id = p_project_id and a.worker_id = v_member.worker_id and a.status = 'active') then
      continue;
    end if;
    begin
      perform public.assign_worker_to_project(p_project_id::text, v_member.profile_id::text);
      insert into public.project_team_assignment_members (team_assignment_id, worker_id)
      values (v_unit, v_member.worker_id)
      on conflict do nothing;
    exception when others then
      -- refused for this person; the unit continues.
      null;
    end;
  end loop;

  return v_unit;
end $$;

-- ── 5. End the unit — take back only what it gave ──────────────────────────
create or replace function public.end_team_project_assignment_v1(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_unit record;
  v_m    record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_unit from public.project_team_assignments where id = p_assignment_id;
  if v_unit is null then
    raise exception 'No such team assignment' using errcode = '42501';
  end if;
  if not (public.can_manage_project(v_unit.project_id) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_unit.status = 'ended' then return; end if;

  for v_m in
    select w.profile_id
      from public.project_team_assignment_members m
      join public.workers w on w.id = m.worker_id
     where m.team_assignment_id = p_assignment_id
  loop
    begin
      perform public.end_worker_project_assignment(v_unit.project_id::text, v_m.profile_id::text);
    exception when others then
      null;
    end;
  end loop;

  update public.project_team_assignments
     set status = 'ended', ended_at = now()
   where id = p_assignment_id;
end $$;

revoke all on function public.assign_team_to_project_v1(uuid, uuid) from public, anon;
revoke all on function public.end_team_project_assignment_v1(uuid) from public, anon;
grant execute on function public.assign_team_to_project_v1(uuid, uuid) to authenticated;
grant execute on function public.end_team_project_assignment_v1(uuid) to authenticated;

commit;

-- ROLLBACK
-- (see supabase/rollbacks/20260915130000_project_team_assignments_v1.down.sql — guarded)
-- drop function if exists public.end_team_project_assignment_v1(uuid);
-- drop function if exists public.assign_team_to_project_v1(uuid, uuid);
-- drop table if exists public.project_team_assignment_members;
-- drop table if exists public.project_team_assignments;
