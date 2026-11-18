-- ROLLBACK for 20261003150700_brigade_journal_context_v1.sql
--
-- Restores the LIVE production bodies (read with pg_get_functiondef on
-- 2026-10-04) of the five replaced functions and the two altered policies, then
-- drops the two functions the migration added. Writes no journal row and
-- rewrites no past entry. Run this BEFORE the rollback of 20261003150600.
--
-- Order matters: the policies stop referencing team_work_context_v1 first, and
-- the restored function bodies stop referencing it, before it is dropped.

begin;

alter policy wt_select on public.work_tasks
  using (
    (created_by = auth.uid())
    or (assignee_profile_id = auth.uid())
    or public.is_admin()
    or ((project_id is not null) and public.can_manage_project(project_id))
  );

alter policy project_stages_select on public.project_stages
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
$function$;

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
begin
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
      ) then
        raise exception 'project_not_assignable' using errcode = '42501';
      end if;
    end if;
    v_project_id := p_project_id;
  else
    select count(*), min(pwa.project_id::text)::uuid
      into v_project_count, v_project_id
      from public.project_worker_assignments pwa
      join public.projects p on p.id = pwa.project_id
      join public.engagement_contexts ec on ec.id = p_engagement_context_id
     where pwa.worker_id = p_worker_id
       and pwa.status = 'active'
       and p.organization_id = ec.organization_id;
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

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id, wt.status
    into t
    from public.work_tasks wt
   where wt.id = v_task;
  if not found or not coalesce((
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
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
    ) then
      return 'project_mismatch';
    end if;
  end if;

  if t.project_id is not null then
    select pr.organization_id into v_task_org
      from public.projects pr where pr.id = t.project_id;
    select ec.organization_id into v_entry_org
      from public.engagement_contexts ec where ec.id = e.engagement_context_id;
    if v_task_org is not null and v_entry_org is distinct from v_task_org then
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
      exists (
        select 1 from public.project_worker_assignments pwa
         where pwa.project_id = pid and pwa.worker_id = w_id and pwa.status = 'active'
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

drop function if exists public.independent_journal_context_v1(uuid, uuid, uuid);
drop function if exists public.list_team_members_now_v1(uuid);
drop function if exists public.my_team_work_contexts_v1();
drop function if exists public.team_work_context_v1(uuid, uuid, uuid, uuid, timestamptz);

commit;
