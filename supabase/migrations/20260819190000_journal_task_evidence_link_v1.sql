-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session, AFTER
-- 20260711210000_work_tasks_v1 (work_tasks must exist). Never `db push`.
--
-- Safety class: ADDITIVE (one new RLS-bearing table, one SECURITY DEFINER
-- read helper, two SECURITY DEFINER write RPCs; NO existing table, column,
-- function, policy, grant or constraint is recreated or dropped).
-- SECURITY DEFINER + GRANT/REVOKE are RED-class by construction, so this
-- migration is human-gated by ROUTE. It carries NO `@human-gate-approved`
-- annotation: it is proposed for owner review, not pre-approved.
--
-- 20260819190000 — Work Journal ↔ work_task evidence link v1
-- (field-work operating platform audit v1, §1.2 "the single most important
-- finding" — docs/audits/field-work-operating-platform-audit-v1.md).
--
-- PROBLEM (measured on production 2026-08-19, not inferred):
--   journal_entries  = 36 rows, 8 photos, 12 manager confirmations — the ONLY
--                      execution engine on this platform with real data.
--   work_tasks       = 0 rows. work_task_events = 0. task_dependencies = 0.
--   journal_entries carries project_id — but NO task_id and NO object_id.
--   The tasks page (1015 lines) has no evidence, photo or approval surface.
--   The workflow engine's context_entity_type enum does not include
--   'work_task'.
--
--   So finishing a task produces NOTHING durable: no evidence, no hours, no
--   skill signal, no approval record. work_tasks is not unreachable and not
--   merely unadopted — it is reachable, functional and POINTLESS. That is
--   why it has zero rows, and it is why the timesheet layer, the finance
--   record layer and the capacity/gap engine downstream of it are all
--   starved of actuals.
--
-- SOLUTION (smallest honest slice): ONE append-only link table.
--   Work evidence keeps being born in the Work Journal — the central spine
--   (doctrine: skills, confidence, fit and legal proof all derive from
--   append-only journal entries, §15). This migration does NOT create a
--   second, task-native evidence store; it lets an EXISTING journal entry
--   declare which task(s) it is evidence for.
--
-- WHY A LINK TABLE AND NOT `journal_entries.task_id`:
--   1. journal_entries has NO update policy (append-only by default-deny,
--      §3.1). A column could therefore only ever be set by the worker at
--      INSERT time, inside create_journal_entry_full. A foreman could never
--      link evidence a worker already recorded — which is exactly the review
--      workflow this is for.
--   2. Adding a parameter to create_journal_entry_full means DROP + CREATE of
--      a granted function (PostgREST named-argument calls would otherwise go
--      ambiguous against the old 10-arg overload) — a strictly riskier,
--      more destructive migration than adding a table.
--   3. A day's entry legitimately evidences more than one task. N:N is the
--      honest cardinality, not a modelling convenience.
--   4. The hash chain (§3.3) is untouched: linking never rewrites an entry,
--      so hash_prev/hash_self stay valid and every existing entry verifies
--      exactly as before.
--
-- REVOCATION IS A RECORD, NOT A DELETE (§4.3): unlinking sets unlinked_at /
--   unlinked_by / unlink_reason. The row stays forever. Who asserted that
--   this evidence proves this task, when, and who withdrew it, is itself
--   legal evidence.
--
-- VISIBILITY (§4, default-closed): a link row is readable EXACTLY where the
--   underlying JOURNAL ENTRY is readable — never where only the task is.
--   This can only ever narrow, never widen, journal visibility. The read
--   predicate is a SECURITY DEFINER helper that mirrors the existing
--   journal_entries_select policy 1:1 (the is_org_member_or_engaged_v1
--   idiom), so the link table cannot recurse into journal RLS
--   (cf. 20260718180000_assets_rls_recursion_fix).
--
-- WHAT IS DELIBERATELY NOT ADDED: no task_id on journal_entries; no second
--   evidence store; no change to create_journal_entry_full or
--   journal_entry_supersede; no workflow-engine enum change (task approval
--   is a separate, later slice); no notification fan-out; no GPS, no QR;
--   no backfill of the 36 existing entries (no invented history).
--
-- ROLLBACK: supabase/rollbacks/20260819190000_journal_task_evidence_link_v1.down.sql
-- (refuses while any ACTIVE link exists; drops RPCs, helper, table).
-- ============================================================================

begin;

-- ── 1. The link ────────────────────────────────────────────────────────────
create table if not exists public.journal_entry_tasks (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.journal_entries(id) on delete cascade,
  task_id       uuid not null references public.work_tasks(id) on delete cascade,
  linked_by     uuid references public.profiles(id) on delete set null,
  linked_at     timestamptz not null default now(),
  -- §4.3 revocation is a record, never a delete.
  unlinked_by   uuid references public.profiles(id) on delete set null,
  unlinked_at   timestamptz,
  unlink_reason text check (unlink_reason is null or char_length(unlink_reason) <= 500),
  -- One ACTIVE link per (entry, task); a withdrawn link may be re-made.
  constraint jet_unlink_consistent check (
    (unlinked_at is null and unlinked_by is null and unlink_reason is null)
    or unlinked_at is not null
  )
);

-- Exactly one LIVE link per pair; withdrawn rows stay and do not block a re-link.
create unique index if not exists jet_active_pair_uq
  on public.journal_entry_tasks (entry_id, task_id)
  where unlinked_at is null;

create index if not exists jet_task_idx
  on public.journal_entry_tasks (task_id, linked_at desc)
  where unlinked_at is null;

create index if not exists jet_entry_idx
  on public.journal_entry_tasks (entry_id, linked_at desc)
  where unlinked_at is null;

comment on table public.journal_entry_tasks is
  'Append-only link: which Work Journal entries are evidence for which work_task. '
  'Revocation sets unlinked_at (never deletes). Readable exactly where the journal '
  'entry is readable (§4 default-closed).';

-- ── 2. Read helper — mirrors journal_entries_select 1:1 ────────────────────
-- SECURITY DEFINER so the link policy never re-enters journal_entries RLS.
create or replace function public.can_read_journal_entry_v1(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.journal_entries je
     where je.id = p_entry_id
       and (
         public.owns_worker(je.worker_id)
         or public.is_admin()
         or exists (
           select 1 from public.engagement_contexts ec
            where ec.id = je.engagement_context_id
              and public.manages_organization(ec.organization_id)
         )
       )
  );
$$;

revoke all on function public.can_read_journal_entry_v1(uuid) from public;
revoke all on function public.can_read_journal_entry_v1(uuid) from anon;
grant execute on function public.can_read_journal_entry_v1(uuid) to authenticated;

-- ── 3. RLS — read-only for authenticated; every write goes through an RPC ──
alter table public.journal_entry_tasks enable row level security;

create policy journal_entry_tasks_select on public.journal_entry_tasks
  for select
  using (public.can_read_journal_entry_v1(entry_id));

grant select on public.journal_entry_tasks to authenticated;
revoke insert, update, delete on public.journal_entry_tasks from authenticated;

-- ── 4. Link RPC ────────────────────────────────────────────────────────────
-- Authority: the caller must be able to read the ENTRY (its worker, or a
-- manager of the entry's organization, or admin) AND be able to read the
-- TASK under the existing wt_select predicate. Both checks answer
-- 'not_found' for invisible rows — never leaking existence.
create or replace function public.link_journal_entry_to_task_v1(
  p_entry_id text,
  p_task_id  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_entry  uuid := nullif(trim(coalesce(p_entry_id, '')), '')::uuid;
  v_task   uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  e        record;
  t        record;
  v_active int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_entry is null or v_task is null then
    return 'invalid';
  end if;

  -- The ENTRY must be visible to the caller.
  select je.id, je.worker_id, je.engagement_context_id, je.deleted_at, je.superseded_by
    into e
    from public.journal_entries je
   where je.id = v_entry;
  if not found or not public.can_read_journal_entry_v1(v_entry) then
    return 'not_found';
  end if;
  -- Withdrawn evidence cannot be presented as proof of work.
  if e.deleted_at is not null or e.superseded_by is not null then
    return 'entry_not_current';
  end if;

  -- The TASK must be visible to the caller (the v1 wt_select predicate).
  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id, wt.status
    into t
    from public.work_tasks wt
   where wt.id = v_task;
  if not found or not (
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ) then
    return 'not_found';
  end if;

  -- Bounded: a task collects a readable evidence list, not a dump.
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
    -- Already linked — idempotent, not an error.
    return 'already_linked';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'journal_entry_task_linked', 'journal_entry_tasks', v_entry,
          jsonb_build_object('task_id', v_task));

  return 'ok';
end;
$$;

revoke all on function public.link_journal_entry_to_task_v1(text, text) from public;
revoke all on function public.link_journal_entry_to_task_v1(text, text) from anon;
grant execute on function public.link_journal_entry_to_task_v1(text, text) to authenticated;

-- ── 5. Unlink RPC — revocation is a record (§4.3) ──────────────────────────
create or replace function public.unlink_journal_entry_from_task_v1(
  p_link_id text,
  p_reason  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_link  uuid := nullif(trim(coalesce(p_link_id, '')), '')::uuid;
  v_why   text := nullif(trim(coalesce(p_reason, '')), '');
  l       record;
  t       record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_link is null then
    return 'invalid';
  end if;
  if v_why is not null and char_length(v_why) > 500 then
    return 'invalid';
  end if;

  select jet.id, jet.entry_id, jet.task_id, jet.linked_by, jet.unlinked_at
    into l
    from public.journal_entry_tasks jet
   where jet.id = v_link
   for update;
  if not found or not public.can_read_journal_entry_v1(l.entry_id) then
    return 'not_found';
  end if;
  if l.unlinked_at is not null then
    return 'already_unlinked';
  end if;

  -- Who may withdraw: whoever asserted the link, an admin, or a manager of
  -- the task's project (the person accountable for the task's truth).
  select wt.project_id, wt.created_by into t
    from public.work_tasks wt where wt.id = l.task_id;
  if not (
    l.linked_by = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
    or (t.project_id is null and t.created_by = uid)
  ) then
    return 'not_allowed';
  end if;

  update public.journal_entry_tasks
     set unlinked_at = now(), unlinked_by = uid, unlink_reason = v_why
   where id = v_link;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'journal_entry_task_unlinked', 'journal_entry_tasks', l.entry_id,
          jsonb_build_object('task_id', l.task_id, 'reason', v_why));

  return 'ok';
end;
$$;

revoke all on function public.unlink_journal_entry_from_task_v1(text, text) from public;
revoke all on function public.unlink_journal_entry_from_task_v1(text, text) from anon;
grant execute on function public.unlink_journal_entry_from_task_v1(text, text) to authenticated;

commit;
