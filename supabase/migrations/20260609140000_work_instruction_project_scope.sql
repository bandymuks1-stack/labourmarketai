-- ─────────────────────────────────────────────────────────────────────────
-- F5 — Project-scoped work instructions (slice f5-project-scoped-instructions-v1)
--
-- WHY: F4 made worker→project assignment real (project_worker_assignments). A
-- manager can now scope an instruction to a worker ON A SPECIFIC PROJECT — the
-- precise on-site control F3 deferred.
--
-- WHAT (purely ADDITIVE + reversible; no drop, no RLS policy change):
--   1. conversation_messages.project_id (nullable; null = team/roster-level).
--   2. NEW send_work_instruction_to_project(...) — the PROJECT-scoped sender:
--      a STRICT gate — the worker must be ACTIVELY assigned to THAT project
--      (project_worker_assignments status='active') AND the caller must
--      can_manage_project it (or admin). An ended assignment / different project /
--      unrelated manager all fail (42501). Records project_id on the message.
--   The existing team-level send_work_instruction(text,text,text) (migration
--   20260608150000) is LEFT UNTOUCHED — the app calls it for team-level and the
--   new function for project-level. No signature change, so nothing is dropped.
--
-- Unchanged: SECURITY DEFINER + search_path; EXECUTE authenticated-only; original
-- body never overwritten; conversation_messages participant-scoped RLS (a worker
-- still sees only instructions in their own conversations → no cross-project /
-- cross-company leakage). No anon/PUBLIC execute. No broad manager-to-any-worker.
--
-- ROLLBACK (reversible):
--   drop function if exists public.send_work_instruction_to_project(text, text, text, text);
--   alter table public.conversation_messages drop column if exists project_id;
-- ─────────────────────────────────────────────────────────────────────────

alter table public.conversation_messages
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create or replace function public.send_work_instruction_to_project(
  p_worker_profile_id text,
  p_body              text,
  p_original_language text default null,
  p_project_id        text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  -- PROJECT/SITE SCOPE: the worker must be ACTIVELY assigned to THIS project AND
  -- the caller must manage it. An ended assignment / different project / unrelated
  -- manager all fail here (no cross-project, no cross-company).
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

  -- Find an existing direct conversation with BOTH participants; else create one.
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
$$;

revoke all     on function public.send_work_instruction_to_project(text, text, text, text) from public;
grant execute  on function public.send_work_instruction_to_project(text, text, text, text) to authenticated;
