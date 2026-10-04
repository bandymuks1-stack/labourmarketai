-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- @human-gate-approved — RED by construction (SECURITY DEFINER functions,
-- GRANT/REVOKE, CREATE POLICY on a new table). Safety class: strictly
-- ADDITIVE (one new table, one partial unique index, one policy, five new
-- function names). It redefines NO existing function, trigger, policy, grant,
-- column or constraint. The annotation states the ROUTE, not the decision.
--
-- 20261003150600 — TEAM / BRIGADE ASSIGNMENT AS ONE CANONICAL RELATIONSHIP.
--
-- OWNER REQUIREMENT (binding): an assignment targets PROJECT / WORK OBJECT /
-- TASK  ->  a PERSON  or  a TEAM / BRIGADE. A team assignment is ONE
-- relationship, not N unrelated person assignments.
--
-- PROBLEM. Today a "team on a project" is a client-side FAN-OUT of N
-- `assign_worker_to_project` calls (lib/projects/team-assignment.ts, #2084).
-- Nothing records that the people were assigned AS a team: no FK ties a team
-- to a project (capability register WRK-6 PARTIAL), the project cannot show
-- "team X", and replacing/ending the team means N unrelated edits.
--
-- SOLUTION — the smallest coherent structure, REUSING what exists:
--   * the TEAM is the existing `organizations` row of organization_type =
--     'team' (20260705220000); its MEMBERS are the existing active 'employee'
--     engagement_contexts. NOTHING about teams or membership is added.
--   * the PERSON assignment (project_worker_assignments) and the task assignee
--     (work_tasks.assignee_profile_id) are UNTOUCHED and keep working.
--   * ONE new table `team_assignments` — a team bound to a project and
--     optionally to ONE work object OR ONE task of that project — with an
--     append-friendly lifecycle (rows are ENDED, never deleted; replacement is
--     recorded) and one ACTIVE row per (team, project, scope).
--   * a team assignment writes NO per-person rows. Members RESOLVE through the
--     relation, at a point in time (team_member_at_v1): membership is read
--     from engagement_contexts AS OF the instant asked, so a person who left
--     the team before the work, or joined after it, is NOT credited. Individual
--     execution, the journal, hours and capability attribution keep resolving
--     to the ACTUAL people who performed the work; the journal is never
--     written by this migration.
--
-- WHAT IS ADDED
--   table   public.team_assignments
--   index   team_assignments_one_active_v1 (unique, partial: ended_at is null)
--   policy  team_assignments_select_v1 (managers of the project or the team,
--           admin, and CURRENT members of the team); NO write policy
--   fn      team_member_at_v1(uuid, uuid, timestamptz)        INTERNAL, no grants
--   fn      assign_team_to_work_v1(uuid, uuid, uuid, uuid, uuid)  authenticated
--   fn      end_team_assignment_v1(uuid, text)                authenticated
--   fn      list_team_assignment_members_v1(uuid[], timestamptz)  authenticated
--   fn      team_assignments_for_work_v1(uuid, uuid, timestamptz) authenticated
--
-- AUTHORITY (every operand coalesce'd; NULL denies — same discipline as
-- 20261002141500):
--   assign:  can_manage_project(project) AND (manages_organization(team) OR
--            is_admin())   — OR is_admin(). Authority over BOTH ends, so a
--            manager of org A can neither pull org B's team onto A's project
--            nor put A's team on B's project.
--   end:     can_manage_project(project) OR manages_organization(team) OR admin.
--   read:    managers of either end + admin see the row and the member list;
--            a current team member sees the row and ONLY THEIR OWN member
--            row (never the co-member list). Outsiders, other-org managers,
--            ordinary workers, NULL uid, anon: nothing / 42501.
--
-- GRANTS: table: revoke all from public, anon, authenticated; grant select to
-- authenticated (writes are RPC-only). Functions: revoke all from public,
-- anon; grant execute to authenticated (team_member_at_v1: none at all).
-- No anon path anywhere.
--
-- WHAT IS DELIBERATELY NOT DONE
--   * No change to assign_worker_to_project, project_worker_assignments,
--     work_tasks, link_journal_entry_to_task_v1 or any journal function.
--     A journal entry resolves to a team assignment THROUGH
--     team_assignments_for_work_v1(person, project, entry time) — a read.
--   * No auto-fan-out, no copy of members, no "team hours" total: hours and
--     evidence stay per person.
--
-- ROLLBACK: supabase/rollbacks/20261003150600_team_assignment_canonical_v1.down.sql
-- REFUSES while any team_assignments row exists (real history — forward-fix
-- instead); with zero rows it drops everything above and nothing else.
-- ============================================================================

begin;

-- ── 1. The relation ─────────────────────────────────────────────────────────
create table if not exists public.team_assignments (
  id               uuid primary key default gen_random_uuid(),
  team_org_id      uuid not null references public.organizations(id) on delete restrict,
  project_id       uuid not null references public.projects(id) on delete cascade,
  work_object_id   uuid references public.work_objects(id) on delete cascade,
  task_id          uuid references public.work_tasks(id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'ended')),
  assigned_by      uuid references public.profiles(id) on delete set null,
  assigned_at      timestamptz not null default now(),
  ended_at         timestamptz,
  ended_by         uuid references public.profiles(id) on delete set null,
  end_reason       text check (end_reason is null or char_length(end_reason) <= 500),
  replaced_by_id   uuid references public.team_assignments(id) on delete set null,
  constraint team_assignments_one_scope check (num_nonnulls(work_object_id, task_id) <= 1),
  constraint team_assignments_lifecycle check ((status = 'active') = (ended_at is null))
);

-- One ACTIVE assignment per (team, project, scope); history is unlimited.
create unique index if not exists team_assignments_one_active_v1
  on public.team_assignments (
    team_org_id,
    project_id,
    coalesce(work_object_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(task_id,        '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where ended_at is null;
create index if not exists team_assignments_project_idx
  on public.team_assignments (project_id) where ended_at is null;
create index if not exists team_assignments_team_idx
  on public.team_assignments (team_org_id) where ended_at is null;

alter table public.team_assignments enable row level security;

revoke all on public.team_assignments from public, anon, authenticated;
grant select on public.team_assignments to authenticated;

drop policy if exists team_assignments_select_v1 on public.team_assignments;
create policy team_assignments_select_v1 on public.team_assignments
  for select to authenticated
  using (
    coalesce(
      public.can_manage_project(project_id)
      or public.manages_organization(team_org_id)
      or public.is_admin()
      or exists (
        select 1 from public.engagement_contexts ec
         where ec.profile_id = auth.uid()
           and ec.organization_id = team_assignments.team_org_id
           and ec.relationship_slug = 'employee'
           and ec.status = 'active'
      ),
      false)
  );

-- ── 2. Membership AS OF an instant (internal; no grants) ───────────────────
-- A member at p_at is an 'employee' engagement of the team that existed at
-- p_at and had not ended on or before p_at's calendar day. A row that is
-- 'ended' with NO ended_at cannot be proven to cover any past instant, so it
-- covers none: nobody is credited on a guess.
create or replace function public.team_member_at_v1(
  p_team uuid, p_profile uuid, p_at timestamptz
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.engagement_contexts ec
     where ec.organization_id = p_team
       and ec.profile_id = p_profile
       and ec.relationship_slug = 'employee'
       and ec.created_at <= p_at
       and (ec.started_at is null or ec.started_at <= (p_at at time zone 'UTC')::date)
       and (
            (ec.status = 'active'
              and (ec.ended_at is null or ec.ended_at > (p_at at time zone 'UTC')::date))
         or (ec.status = 'ended'
              and ec.ended_at is not null
              and ec.ended_at > (p_at at time zone 'UTC')::date)
       )
  ), false);
$$;
revoke all on function public.team_member_at_v1(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ── 3. assign_team_to_work_v1 ──────────────────────────────────────────────
-- Returns jsonb {outcome, assignment_id}. outcome: created | already_assigned
-- (idempotent) | replaced. Refusals RAISE: 42501 (authority; also for a
-- missing id, so existence is not an oracle) or 22023 with a stable word.
create or replace function public.assign_team_to_work_v1(
  p_team_org_id           uuid,
  p_project_id            uuid,
  p_work_object_id        uuid default null,
  p_task_id               uuid default null,
  p_replace_assignment_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_team     record;
  v_project  record;
  v_id       uuid;
  v_existing uuid;
  v_old      record;
  v_outcome  text := 'created';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_team_org_id is null or p_project_id is null then
    raise exception 'team_and_project_required' using errcode = '22023';
  end if;

  if not coalesce((
    (public.can_manage_project(p_project_id)
       and (public.manages_organization(p_team_org_id) or public.is_admin()))
    or public.is_admin()
  ), false) then
    raise exception 'Not authorized to assign this team to this project'
      using errcode = '42501';
  end if;

  select o.id, o.organization_type into v_team
    from public.organizations o where o.id = p_team_org_id;
  if not found or v_team.organization_type is distinct from 'team' then
    raise exception 'not_a_team' using errcode = '22023';
  end if;

  select p.id, p.status, p.organization_id into v_project
    from public.projects p where p.id = p_project_id;
  if not found then
    raise exception 'Not authorized to assign this team to this project'
      using errcode = '42501';
  end if;
  if v_project.status = 'completed' then
    raise exception 'project_completed' using errcode = '22023';
  end if;

  if p_work_object_id is not null and p_task_id is not null then
    raise exception 'one_scope_only' using errcode = '22023';
  end if;
  if p_task_id is not null and not exists (
       select 1 from public.work_tasks t
        where t.id = p_task_id and t.project_id = p_project_id
          and t.status in ('todo', 'in_progress', 'blocked')) then
    raise exception 'task_not_assignable' using errcode = '22023';
  end if;
  if p_work_object_id is not null and not exists (
       select 1 from public.work_objects w
        where w.id = p_work_object_id and w.status = 'active'
          and (w.project_id = p_project_id
               or (w.project_id is null
                   and w.organization_id is not distinct from v_project.organization_id))) then
    raise exception 'object_not_assignable' using errcode = '22023';
  end if;

  -- A team with nobody in it is not a commitment of anyone.
  if not exists (
    select 1 from public.engagement_contexts ec
     where ec.organization_id = p_team_org_id
       and ec.relationship_slug = 'employee'
       and ec.status = 'active'
  ) then
    raise exception 'team_has_no_members' using errcode = '22023';
  end if;

  insert into public.team_assignments
      (team_org_id, project_id, work_object_id, task_id, assigned_by)
    values (p_team_org_id, p_project_id, p_work_object_id, p_task_id, uid)
  on conflict (
      team_org_id, project_id,
      coalesce(work_object_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(task_id,        '00000000-0000-0000-0000-000000000000'::uuid)
    ) where ended_at is null
  do nothing
  returning id into v_id;

  if v_id is null then
    select ta.id into v_existing
      from public.team_assignments ta
     where ta.team_org_id = p_team_org_id
       and ta.project_id = p_project_id
       and ta.work_object_id is not distinct from p_work_object_id
       and ta.task_id is not distinct from p_task_id
       and ta.ended_at is null;
    v_id := v_existing;
    v_outcome := 'already_assigned';
  else
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'team_assigned_v1', 'team_assignments', v_id,
      jsonb_build_object('team_org_id', p_team_org_id, 'project_id', p_project_id,
                         'work_object_id', p_work_object_id, 'task_id', p_task_id));
  end if;

  -- Replacement: end the OLD assignment in the same transaction. The old row
  -- must be active, on this project, and one the caller may manage.
  if p_replace_assignment_id is not null and p_replace_assignment_id is distinct from v_id then
    select ta.id, ta.project_id, ta.team_org_id into v_old
      from public.team_assignments ta
     where ta.id = p_replace_assignment_id and ta.ended_at is null
       for update;
    if not found or v_old.project_id <> p_project_id then
      raise exception 'replace_target_not_active' using errcode = '22023';
    end if;
    update public.team_assignments
       set status = 'ended', ended_at = now(), ended_by = uid,
           end_reason = 'replaced', replaced_by_id = v_id
     where id = v_old.id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'team_assignment_replaced_v1', 'team_assignments', v_old.id,
      jsonb_build_object('replaced_by_id', v_id, 'project_id', p_project_id));
    if v_outcome = 'created' then v_outcome := 'replaced'; end if;
  end if;

  return jsonb_build_object('outcome', v_outcome, 'assignment_id', v_id);
end;
$$;
revoke all on function public.assign_team_to_work_v1(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_team_to_work_v1(uuid, uuid, uuid, uuid, uuid) to authenticated;

-- ── 4. end_team_assignment_v1 ──────────────────────────────────────────────
create or replace function public.end_team_assignment_v1(
  p_assignment_id uuid,
  p_reason        text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a   record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select ta.id, ta.project_id, ta.team_org_id, ta.ended_at into a
    from public.team_assignments ta where ta.id = p_assignment_id for update;
  if not found or not coalesce((
       public.can_manage_project(a.project_id)
       or public.manages_organization(a.team_org_id)
       or public.is_admin()), false) then
    raise exception 'Not authorized to end this team assignment' using errcode = '42501';
  end if;
  if a.ended_at is not null then
    return 'already_ended';
  end if;
  update public.team_assignments
     set status = 'ended', ended_at = now(), ended_by = uid,
         end_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where id = a.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_assignment_ended_v1', 'team_assignments', a.id,
    jsonb_build_object('project_id', a.project_id, 'team_org_id', a.team_org_id));
  return 'ended';
end;
$$;
revoke all on function public.end_team_assignment_v1(uuid, text) from public, anon;
grant execute on function public.end_team_assignment_v1(uuid, text) to authenticated;

-- ── 5. list_team_assignment_members_v1 ─────────────────────────────────────
-- Members RESOLVED through the relation, as of p_at (default: now for an
-- active assignment; the end instant for an ended one). Managers of either
-- end (and admin) get every member; a plain current member gets only their
-- own row. Never writes anything.
create or replace function public.list_team_assignment_members_v1(
  p_assignment_ids uuid[],
  p_at             timestamptz default null
) returns table (
  assignment_id uuid,
  profile_id    uuid,
  worker_id     uuid,
  full_name     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return query
  select ta.id, ec.profile_id, w.id, pr.full_name
    from public.team_assignments ta
    join public.engagement_contexts ec
      on ec.organization_id = ta.team_org_id
     and ec.relationship_slug = 'employee'
    left join public.workers w   on w.profile_id = ec.profile_id
    left join public.profiles pr on pr.id = ec.profile_id
   where ta.id = any ((coalesce(p_assignment_ids, '{}'::uuid[]))[1:100])
     and public.team_member_at_v1(
           ta.team_org_id, ec.profile_id, coalesce(p_at, ta.ended_at, now()))
     and coalesce(
           public.can_manage_project(ta.project_id)
           or public.manages_organization(ta.team_org_id)
           or public.is_admin()
           or (ec.profile_id = uid
               and public.team_member_at_v1(ta.team_org_id, uid, now())),
           false)
   group by ta.id, ec.profile_id, w.id, pr.full_name
   order by ta.id, pr.full_name nulls last, ec.profile_id;
end;
$$;
revoke all on function public.list_team_assignment_members_v1(uuid[], timestamptz) from public, anon;
grant execute on function public.list_team_assignment_members_v1(uuid[], timestamptz) to authenticated;

-- ── 6. team_assignments_for_work_v1 — journal / evidence attribution ───────
-- "Under which team assignment did THIS person work on THIS project at THIS
-- instant?" A row is returned only if the assignment was running at p_at AND
-- the person was a member of the team at p_at. The caller must be the person,
-- a manager of the project, or an admin; anyone else gets zero rows.
create or replace function public.team_assignments_for_work_v1(
  p_profile_id uuid,
  p_project_id uuid,
  p_at         timestamptz default null
) returns table (
  assignment_id  uuid,
  team_org_id    uuid,
  work_object_id uuid,
  task_id        uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  at_ timestamptz := coalesce(p_at, now());
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(
       uid = p_profile_id
       or public.can_manage_project(p_project_id)
       or public.is_admin(), false) then
    return;
  end if;
  return query
  select ta.id, ta.team_org_id, ta.work_object_id, ta.task_id
    from public.team_assignments ta
   where ta.project_id = p_project_id
     and ta.assigned_at <= at_
     and (ta.ended_at is null or ta.ended_at > at_)
     and public.team_member_at_v1(ta.team_org_id, p_profile_id, at_)
   order by ta.assigned_at, ta.id;
end;
$$;
revoke all on function public.team_assignments_for_work_v1(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.team_assignments_for_work_v1(uuid, uuid, timestamptz) to authenticated;

commit;
