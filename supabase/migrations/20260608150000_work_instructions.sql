-- ─────────────────────────────────────────────────────────────────────────
-- Work Instructions v1 (multilingual instruction channel) — slice
-- work-instructions-v1.
--
-- WHY: managers/foremen and workers often do not share a language, but work
-- instructions must be understandable, traceable and safe. This slice lets a
-- manager write an instruction in their OWN language; the worker reads it (a
-- real translation lands in a later reviewed slice — there is NO translation
-- service yet, so v1 honestly shows the original + a "translation not ready"
-- state). The ORIGINAL is always the source of truth and is always viewable.
--
-- DESIGN: instructions REUSE the existing, already-secure communication tables
-- (0021). An instruction is a `conversation_messages` row flagged
-- `is_instruction = true` with `original_language`. Because instructions are
-- messages, the existing participant-scoped RLS applies UNCHANGED — a worker
-- sees an instruction ONLY in a conversation they participate in (no cross-
-- thread / cross-company leakage), and a manager sees only threads they are in.
--
-- WHAT THIS ADDS (additive + reversible; no drops, no RLS loosening):
--   1. conversation_messages: is_instruction, original_language, target_language,
--      translated_text, translation_status, is_clarification_request
--      (all nullable/defaulted; translated_text/target_language/translation_status
--      are forward-looking for the reviewed translation slice — v1 leaves them
--      null / 'unavailable'). The ORIGINAL `body` is never overwritten.
--   2. send_work_instruction(...) — SECURITY DEFINER, owner-scoped
--      (caller = auth.uid()), RELATIONSHIP-GATED: a manager may instruct a worker
--      ONLY when an ACTIVE company_workers/agency_workers row links that worker to
--      a company/agency the caller owns (owns_company / owns_agency), or admin.
--      It atomically finds/creates the direct conversation, adds both
--      participants, and inserts the instruction message. Never PUBLIC/anon.
--
-- HONESTY/SAFETY: no fake translation, no fake delivered/read state (0021 keeps
--   only the honest last_read_at), no fake AI. The clarification request is a
--   real worker-authored message (is_clarification_request = true), inserted
--   through the existing participant-scoped message INSERT policy — no new RPC.
--
-- ROLLBACK (reversible):
--   drop function if exists public.send_work_instruction(uuid, text, text);
--   alter table public.conversation_messages
--     drop column if exists is_clarification_request,
--     drop column if exists translation_status,
--     drop column if exists translated_text,
--     drop column if exists target_language,
--     drop column if exists original_language,
--     drop column if exists is_instruction;
-- ─────────────────────────────────────────────────────────────────────────

alter table public.conversation_messages
  add column if not exists is_instruction          boolean not null default false,
  add column if not exists original_language        text,
  add column if not exists target_language          text,
  add column if not exists translated_text          text,
  add column if not exists translation_status       text not null default 'unavailable'
      check (translation_status in ('unavailable','pending','available')),
  add column if not exists is_clarification_request boolean not null default false;

-- Relationship-gated, owner-scoped instruction sender. SECURITY DEFINER so it can
-- create the conversation + participants + message atomically AFTER the manager↔
-- worker relationship check. Writes only the caller's own author_id.
create or replace function public.send_work_instruction(
  p_worker_profile_id text,
  p_body              text,
  p_original_language text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  worker_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id      uuid;
  conv_id   uuid;
  msg_id    uuid;
  cleaned   text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if worker_pid is null then
    raise exception 'Worker is required' using errcode = '22023';
  end if;
  if cleaned is null then
    raise exception 'Instruction text is required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = worker_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  -- Relationship gate: the caller must MANAGE this worker (active roster link to
  -- a company/agency the caller owns), or be an admin. Prevents instructing an
  -- unrelated worker.
  if not (
    exists (
      select 1 from public.company_workers cw
       where cw.worker_id = w_id and cw.status = 'active'
         and public.owns_company(cw.company_id)
    )
    or exists (
      select 1 from public.agency_workers aw
       where aw.worker_id = w_id and aw.status = 'active'
         and public.owns_agency(aw.agency_id)
    )
    or public.is_admin()
  ) then
    raise exception 'Not authorized to instruct this worker' using errcode = '42501';
  end if;

  -- Find an existing direct conversation that already has BOTH the caller and
  -- the worker as participants; otherwise create one and add both.
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
    (conversation_id, author_id, body, is_instruction, original_language, translation_status)
    values (conv_id, uid, left(cleaned, 10000), true,
            nullif(trim(coalesce(p_original_language, '')), ''), 'unavailable')
    returning id into msg_id;

  update public.conversations set updated_at = now() where id = conv_id;
  return msg_id;
end;
$$;

revoke all     on function public.send_work_instruction(text, text, text) from public;
grant execute  on function public.send_work_instruction(text, text, text) to authenticated;
