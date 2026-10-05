-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval,
-- and ONLY AFTER 20261003150600_brigade_work_assignment_v1.
-- Never `db push`.
--
-- @human-gate-approved — RED by construction: SECURITY DEFINER functions,
-- GRANT/REVOKE, ALTER POLICY on two existing tables, and CREATE OR REPLACE of
-- five EXISTING functions (listed below). The annotation states the ROUTE, not
-- the decision.
--
-- 20261003150700 — A TEAM ASSIGNMENT IS AN ACTIVE JOURNAL / WORK CONTEXT.
--
-- OWNER REQUIREMENT (binding): a member of a team that is ACTIVELY assigned to
-- a project / work object / task must be able to work in that context exactly
-- like a person who is assigned to it — write a journal entry attributed to the
-- project, link the entry to the task, see the project / task, see the stages.
-- The first migration (20261003150600) created the relation and the resolver
-- but wired it to NOTHING: every precondition below still asked only
-- `project_worker_assignments`.
--
-- WHAT STAYS TRUE (and is proven in scripts/db-proof/team-assignment-journal-
-- context.sh):
--   * the AUTHOR of an entry is the ACTUAL person (journal_entries.worker_id is
--     never the team); the team is context, not the author.
--   * NO project_worker_assignments row is ever written. Members RESOLVE through
--     team_assignments / team_member_at_v1 at the instant asked.
--   * ending / replacing the team assignment withdraws the context for FUTURE
--     entries; past entries are never rewritten (this migration writes no
--     journal row and updates no journal row).
--   * a member who LEFT the team (or joined after) is not credited; a project
--     that is `completed` withdraws the context (as completing it already ends
--     the person roster).
--
-- SCOPE SEMANTICS (one place, team_work_context_v1):
--   project context  (journal attribution, project / stage visibility,
--                     work instruction): ANY active scope of the team on that
--                     project — project-wide, work-object or task.
--   task-level       (see the task, link evidence to it): only a team assigned
--                     to THAT task, or to the work object the task belongs to.
--                     A project-wide team assignment does NOT make every member
--                     an assignee of every task — same as a person on the
--                     project roster, who is also not the assignee of every
--                     task.
--
-- WHAT IS ADDED (3 new functions; the header counts 2 team functions + 1 independent)
--   fn  team_work_context_v1(uuid, uuid, uuid, uuid, timestamptz)  authenticated
--       boolean over team_assignments_for_work_v1 (the resolver) — same caller
--       guard as the resolver (the person, a manager of the project, admin).
--   fn  my_team_work_contexts_v1()                                 authenticated
--       the caller's OWN current team contexts (project, team name, scope) — the
--       worker's "my projects via team" reader. Self only.
--   fn  list_team_members_now_v1(uuid)                             authenticated
--       the current members of a team (same single source, team_member_at_v1) for the
--       caller who manages that team - lets the assistant draft name each member's
--       calendar verdict before any assignment row exists. Reads only.
--   fn  independent_journal_context_v1(uuid, uuid, uuid)           authenticated
--       an INDEPENDENT person (personal / own-workspace context) with an active
--       PERSON assignment on a CLIENT organisation's project may journal against
--       it; the entry organisation then differs from the client organisation, as
--       the #2143 counterparty resolver (journal_entry_review_authority_v1)
--       requires, so the client representative can review the work. Needs the
--       active assignment; employees of the project's organisation keep the
--       employer path; no resolver change is needed.
--
-- WHAT IS REPLACED (live production body + the minimal team branch)
--   fn  create_journal_entry_full(12 args)   explicit project / auto-link
--   fn  link_journal_entry_to_task_v1        task authority + project + org
--   fn  is_assigned_to_project               -> projects_select, status RPCs
--   fn  send_work_instruction_to_project     manager -> team member
--   policy project_stages_select             worker stage read (via the fn)
--   policy wt_select                         task visibility (task-level)
--
-- DELIBERATELY NOT CHANGED (reason in the PR body): can_view_worker /
-- worker_avatar_path_v1 (manager -> worker visibility; members are resolved by
-- list_team_assignment_members_v1), project_position_salary_avg (a peer salary
-- aggregate — a team must not widen it), set_worker_operational_status /
-- upsert_worker_readiness_item (per-person manager records), work-task
-- status/assignee RPCs (a team is not an assignee; assign_work_task_v1 still
-- names a person), work_hour_allocations (no assignment precondition exists).
--
-- OVERLAP with other open lanes: none. fix/cc/evid2-self-confirmation-v1
-- (20261003150500) replaces review_journal_entry / reviewable_journal_entry_ids
-- / journal_entry_confirmations_guard — untouched here. ai-retention-classes-v2
-- (150800) and worker-registration-friction-v1 (151000) replace none of the
-- functions or policies above.
--
-- ROLLBACK: supabase/rollbacks/20261003150700_brigade_journal_context_v1.down.sql
-- restores the live bodies/policies and drops the two new functions. Run it
-- BEFORE the rollback of 20261003150600.
-- ============================================================================

begin;

-- ── 1. team_work_context_v1 — the one predicate ─────────────────────────────
create or replace function public.team_work_context_v1(
  p_profile uuid,
  p_project uuid,
  p_task    uuid default null,
  p_ec_org  uuid default null,
  p_at      timestamptz default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_profile is null or p_project is null then
    return false;
  end if;
  return coalesce((
    select true
      from public.team_assignments_for_work_v1(p_profile, p_project, coalesce(p_at, now())) r
      join public.projects pr on pr.id = p_project
     where pr.status is distinct from 'completed'
       and (
            p_task is null
         or r.task_id = p_task
         or (r.work_object_id is not null and exists (
               select 1 from public.work_tasks t
                where t.id = p_task and t.project_id = p_project
                  and t.object_id = r.work_object_id))
       )
       and (p_ec_org is null
            or p_ec_org is not distinct from pr.organization_id
            or p_ec_org = r.team_org_id)
     limit 1
  ), false);
end;
$$;
revoke all on function public.team_work_context_v1(uuid, uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.team_work_context_v1(uuid, uuid, uuid, uuid, timestamptz) to authenticated;

-- ── 2. my_team_work_contexts_v1 — the worker's own team projects ────────────
create or replace function public.my_team_work_contexts_v1()
returns table (
  assignment_id  uuid,
  team_org_id    uuid,
  team_name      text,
  project_id     uuid,
  project_title  text,
  project_org_id uuid,
  work_object_id uuid,
  task_id        uuid,
  assigned_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ta.id, ta.team_org_id,
         coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), '')),
         pr.id, pr.title, pr.organization_id, ta.work_object_id, ta.task_id, ta.assigned_at
    from public.team_assignments ta
    join public.projects pr on pr.id = ta.project_id
    join public.organizations o on o.id = ta.team_org_id
   where auth.uid() is not null
     and ta.ended_at is null
     and pr.status is distinct from 'completed'
     and public.team_member_at_v1(ta.team_org_id, auth.uid(), now())
   order by pr.title nulls last, ta.assigned_at, ta.id
   limit 200;
$$;
revoke all on function public.my_team_work_contexts_v1() from public, anon;
grant execute on function public.my_team_work_contexts_v1() to authenticated;

-- ── 2a. list_team_members_now_v1 — who a team's members are, BEFORE it is assigned ─
-- The assistant's draft (and any pre-write check) must name each member's
-- calendar verdict before a team_assignments row exists, so
-- list_team_assignment_members_v1 (which needs an assignment) cannot answer.
-- Same single membership source (team_member_at_v1), same authority as assigning
-- (the caller manages the team organisation, or is admin); anyone else gets no
-- rows. Reads only.
create or replace function public.list_team_members_now_v1(p_team_org_id uuid)
returns table (
  profile_id uuid,
  worker_id  uuid,
  full_name  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(public.manages_organization(p_team_org_id) or public.is_admin(), false) then
    return;
  end if;
  return query
  select ec.profile_id, w.id, pr.full_name
    from public.engagement_contexts ec
    left join public.workers w   on w.profile_id = ec.profile_id
    left join public.profiles pr on pr.id = ec.profile_id
   where ec.organization_id = p_team_org_id
     and ec.relationship_slug = 'employee'
     and public.team_member_at_v1(p_team_org_id, ec.profile_id, now())
   group by ec.profile_id, w.id, pr.full_name
   order by pr.full_name nulls last, ec.profile_id
   limit 200;
end;
$$;
revoke all on function public.list_team_members_now_v1(uuid) from public, anon;
grant execute on function public.list_team_members_now_v1(uuid) to authenticated;

-- ── 2b. independent_journal_context_v1 — a PERSON assignment on a CLIENT's project ─
-- An independent person (freelancer / sole trader / individual provider) has a
-- personal engagement context (organization_id NULL — the real shape of the 73
-- personal 'employee' rows on production) or their OWN workspace (an active
-- 'owner' engagement of an organization other than the project's). When such a
-- person has an ACTIVE project_worker_assignments row on a project of a
-- DIFFERENT organisation (the client), they may journal against it. The entry's
-- organisation then differs from the client organisation — exactly what the
-- counterparty resolver (journal_entry_review_authority_v1, #2143) requires, so
-- the client representative can review it.
--   * needs the active PERSON assignment (no assignment, ended assignment: false)
--   * the context must be the person's OWN, active
--   * a person who is an active member of the project's organisation is that
--     organisation's employee: employer semantics apply, not this path
--   * caller must be the person (or a manager of the project / admin)
create or replace function public.independent_journal_context_v1(
  p_worker uuid, p_project uuid, p_ec uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select true
      from public.workers w
      join public.project_worker_assignments a
        on a.worker_id = w.id and a.project_id = p_project and a.status = 'active'
      join public.projects pr on pr.id = p_project
      join public.engagement_contexts ec
        on ec.id = p_ec and ec.profile_id = w.profile_id and ec.status = 'active'
     where w.id = p_worker
       and w.profile_id is not null
       and auth.uid() is not null
       and (w.profile_id = auth.uid() or public.can_manage_project(p_project) or public.is_admin())
       and pr.organization_id is not null
       and (
            ec.organization_id is null
         or (ec.organization_id <> pr.organization_id
             and exists (select 1 from public.engagement_contexts o
                          where o.profile_id = w.profile_id
                            and o.organization_id = ec.organization_id
                            and o.status = 'active'
                            and o.relationship_slug = 'owner'))
       )
       and not exists (select 1 from public.engagement_contexts m
                        where m.profile_id = w.profile_id
                          and m.organization_id = pr.organization_id
                          and m.status = 'active')
       and not exists (select 1 from public.company_memberships cm
                        where cm.profile_id = w.profile_id
                          and cm.organization_id = pr.organization_id
                          and cm.status = 'active')
     limit 1
  ), false);
$$;
revoke all on function public.independent_journal_context_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.independent_journal_context_v1(uuid, uuid, uuid) to authenticated;

-- ── 3. is_assigned_to_project — person roster OR active team context ────────
create or replace function public.is_assigned_to_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.project_worker_assignments a
      join public.workers w on w.id = a.worker_id
     where a.project_id = p_project_id
       and a.status = 'active'
       and w.profile_id = auth.uid()
  )
  or exists (
    select 1
      from public.team_assignments ta
      join public.projects pr on pr.id = ta.project_id
     where ta.project_id = p_project_id
       and ta.ended_at is null
       and pr.status is distinct from 'completed'
       and auth.uid() is not null
       and public.team_member_at_v1(ta.team_org_id, auth.uid(), now())
  )
$function$;

-- ── 4. create_journal_entry_full — explicit attribution + auto-link ─────────
-- Live body (20261002120000) with ONE addition per branch. The author stays
-- p_worker_id (the person); the team branch applies only when that worker is
-- the caller. An entry context may be the project's organization (as before)
-- OR the team's own organization (the member's employment context).
create or replace function public.create_journal_entry_full(
  p_worker_id uuid, p_engagement_context_id uuid, p_entry_type_slug text,
  p_profession_id uuid, p_original_text text, p_original_language character,
  p_hash_prev text, p_hash_self text, p_visibility_scope text, p_metrics jsonb,
  p_project_id uuid, p_project_explicit boolean
) returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_entry_id      uuid;
  v_row           jsonb;
  v_project_id    uuid;
  v_project_count int;
  v_profile       uuid;
  v_ec_org        uuid;
begin
  select w.profile_id into v_profile
    from public.workers w
   where w.id = p_worker_id and w.profile_id = auth.uid();
  select ec.organization_id into v_ec_org
    from public.engagement_contexts ec where ec.id = p_engagement_context_id;

  if coalesce(p_project_explicit, false) then
    if p_project_id is not null then
      if not exists (
        select 1
          from public.project_worker_assignments pwa
          join public.projects p on p.id = pwa.project_id
          join public.engagement_contexts ec on ec.id = p_engagement_context_id
         where pwa.worker_id = p_worker_id
           and pwa.project_id = p_project_id
           and pwa.status = 'active'
           and p.organization_id = ec.organization_id
      ) and not coalesce(
        v_ec_org is not null
        and public.team_work_context_v1(v_profile, p_project_id, null, v_ec_org), false
      ) and not coalesce(
        public.independent_journal_context_v1(p_worker_id, p_project_id, p_engagement_context_id), false
      ) then
        raise exception 'project_not_assignable' using errcode = '42501';
      end if;
    end if;
    v_project_id := p_project_id;
  else
    select count(*), min(c.project_id::text)::uuid
      into v_project_count, v_project_id
      from (
        select pwa.project_id
          from public.project_worker_assignments pwa
          join public.projects p on p.id = pwa.project_id
          join public.engagement_contexts ec on ec.id = p_engagement_context_id
         where pwa.worker_id = p_worker_id
           and pwa.status = 'active'
           and p.organization_id = ec.organization_id
        union
        select t.project_id
          from public.my_team_work_contexts_v1() t
         where v_profile is not null
           and v_ec_org is not null
           and (t.project_org_id = v_ec_org or t.team_org_id = v_ec_org)
        union
        -- an INDEPENDENT person (personal / own-workspace context) with an active
        -- PERSON assignment on a client organisation's project
        select pwa.project_id
          from public.project_worker_assignments pwa
         where pwa.worker_id = p_worker_id
           and pwa.status = 'active'
           and public.independent_journal_context_v1(p_worker_id, pwa.project_id, p_engagement_context_id)
      ) c;
    if v_project_count is distinct from 1 then
      v_project_id := null;
    end if;
  end if;

  insert into public.journal_entries (
    worker_id, engagement_context_id, entry_type_slug, profession_id,
    original_text, original_language, hash_prev, hash_self,
    visibility_scope, project_id
  )
  values (
    p_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id,
    p_original_text, p_original_language, p_hash_prev, p_hash_self,
    p_visibility_scope, v_project_id
  )
  returning id into v_entry_id;

  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id, metric_slug, value_text, value_numeric, unit_slug, source
      )
      values (
        v_entry_id,
        v_row->>'metric_slug',
        nullif(v_row->>'value_text', ''),
        case
          when v_row ? 'value_numeric' and v_row->>'value_numeric' is not null
            then (v_row->>'value_numeric')::numeric
          else null
        end,
        nullif(v_row->>'unit_slug', ''),
        coalesce(v_row->>'source', 'worker_input')
      );
    end loop;
  end if;

  return v_entry_id;
end;
$function$;

-- ── 5. link_journal_entry_to_task_v1 — evidence link ────────────────────────
-- Live body with three additions: (a) a team assigned to THIS task (or to its
-- work object) is task authority, like the assignee; (b) an entry without a
-- project may be linked when its author is on an active team context of the
-- task's project; (c) the organization check accepts the team's organization
-- as the entry's context.
create or replace function public.link_journal_entry_to_task_v1(p_entry_id text, p_task_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_entry  uuid := nullif(trim(coalesce(p_entry_id, '')), '')::uuid;
  v_task   uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  e        record;
  t        record;
  v_active int;
  v_task_org uuid;
  v_entry_org uuid;
  v_author uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_entry is null or v_task is null then
    return 'invalid';
  end if;

  select je.id, je.worker_id, je.engagement_context_id, je.deleted_at,
         je.superseded_by, je.project_id
    into e
    from public.journal_entries je
   where je.id = v_entry;
  if not found or not public.can_read_journal_entry_v1(v_entry) then
    return 'not_found';
  end if;
  if e.deleted_at is not null or e.superseded_by is not null then
    return 'entry_not_current';
  end if;

  select w.profile_id into v_author from public.workers w where w.id = e.worker_id;

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id, wt.status
    into t
    from public.work_tasks wt
   where wt.id = v_task;
  if not found or not coalesce((
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
    or (t.project_id is not null
        and public.team_work_context_v1(uid, t.project_id, v_task))
  ), false) then
    return 'not_found';
  end if;

  if e.project_id is not null then
    if t.project_id is distinct from e.project_id then
      return 'project_mismatch';
    end if;
  elsif t.project_id is not null then
    if not exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = e.worker_id
         and pwa.project_id = t.project_id
         and pwa.status = 'active'
    ) and not coalesce(
      public.team_work_context_v1(v_author, t.project_id), false
    ) and not coalesce(
      public.independent_journal_context_v1(e.worker_id, t.project_id, e.engagement_context_id), false
    ) then
      return 'project_mismatch';
    end if;
  end if;

  if t.project_id is not null then
    select pr.organization_id into v_task_org
      from public.projects pr where pr.id = t.project_id;
    select ec.organization_id into v_entry_org
      from public.engagement_contexts ec where ec.id = e.engagement_context_id;
    if v_task_org is not null and v_entry_org is distinct from v_task_org
       and not coalesce(
         v_entry_org is not null
         and public.team_work_context_v1(v_author, t.project_id, null, v_entry_org), false
       )
       and not coalesce(
         public.independent_journal_context_v1(e.worker_id, t.project_id, e.engagement_context_id), false
       ) then
      return 'organization_mismatch';
    end if;
  end if;

  select count(*) into v_active
    from public.journal_entry_tasks jet
   where jet.task_id = v_task and jet.unlinked_at is null;
  if v_active >= 200 then
    return 'limit_reached';
  end if;

  select count(*) into v_active
    from public.journal_entry_tasks jet
   where jet.entry_id = v_entry and jet.unlinked_at is null;
  if v_active >= 20 then
    return 'limit_reached';
  end if;

  insert into public.journal_entry_tasks (entry_id, task_id, linked_by)
  values (v_entry, v_task, uid)
  on conflict do nothing;

  if not found then
    return 'already_linked';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'journal_entry_task_linked', 'journal_entry_tasks', v_entry,
          jsonb_build_object('task_id', v_task));

  return 'ok';
end;
$function$;

-- ── 6. send_work_instruction_to_project — manager -> team member ────────────
create or replace function public.send_work_instruction_to_project(
  p_worker_profile_id text, p_body text,
  p_original_language text default null, p_project_id text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid        uuid := auth.uid();
  worker_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  pid        uuid := nullif(p_project_id, '')::uuid;
  w_id       uuid;
  conv_id    uuid;
  msg_id     uuid;
  cleaned    text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if worker_pid is null then
    raise exception 'Worker is required' using errcode = '22023';
  end if;
  if pid is null then
    raise exception 'Project is required' using errcode = '22023';
  end if;
  if cleaned is null then
    raise exception 'Instruction text is required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = worker_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (
      (
        exists (
          select 1 from public.project_worker_assignments pwa
           where pwa.project_id = pid and pwa.worker_id = w_id and pwa.status = 'active'
        )
        or coalesce(public.team_work_context_v1(worker_pid, pid), false)
      )
      and public.can_manage_project(pid)
    )
    or public.is_admin()
  ) then
    raise exception 'Not authorized to instruct this worker on this project'
      using errcode = '42501';
  end if;

  select c.id into conv_id
    from public.conversations c
    join public.conversation_participants p1
      on p1.conversation_id = c.id and p1.profile_id = uid
    join public.conversation_participants p2
      on p2.conversation_id = c.id and p2.profile_id = worker_pid
   where c.kind = 'direct'
   order by c.created_at asc
   limit 1;

  if conv_id is null then
    insert into public.conversations (subject, kind, created_by)
      values (null, 'direct', uid)
      returning id into conv_id;
    insert into public.conversation_participants (conversation_id, profile_id, added_by)
      values (conv_id, uid, uid), (conv_id, worker_pid, uid);
  end if;

  insert into public.conversation_messages
    (conversation_id, author_id, body, is_instruction, original_language, translation_status, project_id)
    values (conv_id, uid, left(cleaned, 10000), true,
            nullif(trim(coalesce(p_original_language, '')), ''), 'unavailable', pid)
    returning id into msg_id;

  update public.conversations set updated_at = now() where id = conv_id;
  return msg_id;
end;
$function$;

-- Explicit ACL restatement for the replaced SECURITY DEFINER functions: the live
-- ACL is already {postgres, authenticated} (anon has NO execute - verified by a
-- read-only SELECT on production 2026-10-04); this states it in the file so a
-- local reset reproduces it and the secdef reproducibility guard stays green.
revoke all on function public.is_assigned_to_project(uuid) from public, anon;
grant execute on function public.is_assigned_to_project(uuid) to authenticated;
revoke all on function public.link_journal_entry_to_task_v1(text, text) from public, anon;
grant execute on function public.link_journal_entry_to_task_v1(text, text) to authenticated;
revoke all on function public.send_work_instruction_to_project(text, text, text, text) from public, anon;
grant execute on function public.send_work_instruction_to_project(text, text, text, text) to authenticated;

-- ── 7. Policies ─────────────────────────────────────────────────────────────
-- Worker stage read: identical for a person on the roster (is_assigned_to_project
-- is the same predicate), plus an active team context.
alter policy project_stages_select on public.project_stages
  using (
    public.can_manage_project(project_id)
    or public.is_assigned_to_project(project_id)
  );

-- Task visibility: the live predicate + a team assigned to THIS task (or the
-- task's work object). Last in the OR so the cheap terms short-circuit first.
alter policy wt_select on public.work_tasks
  using (
    (created_by = auth.uid())
    or (assignee_profile_id = auth.uid())
    or public.is_admin()
    or ((project_id is not null) and public.can_manage_project(project_id))
    or ((project_id is not null) and public.team_work_context_v1(auth.uid(), project_id, id))
  );

commit;
