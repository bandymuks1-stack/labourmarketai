-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260705235000 — internal follow-up task queue for operators (product-tree
-- branch 24, train §8.13 — the last RED branch).
--
-- PROBLEM (reality-map 2026-07-05 §branch 24, RED): the platform has honest
-- notification FRAGMENTS (pending-booking count badge, unread message badges,
-- service_requests_seen, customer_requests.needs_followup) but NO follow-up
-- engine: nothing remembers "the next action" about a worker or a company,
-- and the operator has no queue. The map's minimum PR: "follow_up_tasks
-- additive migration + operator queue in admin".
--
-- SOLUTION (smallest honest slice, INTERNAL ONLY): ONE new table + TWO new
-- gated write RPCs, surfaced on the EXISTING admin control room:
--
--   1. follow_up_tasks — an internal operator task row. A task optionally
--      points at ONE subject (a profile OR a company — ids only, never a
--      copied name/email/phone: the six-point privacy gate) and carries a
--      bounded operator note. Status is an HONEST lifecycle enum:
--      pending / done / dismissed — deliberately NO priority column, NO
--      urgency score, NO fake "contacted" state (§8.13: no AI pretending
--      to contact people; the framing guard's no-fake-urgency rule).
--   2. RLS SELECT is ADMIN-ONLY (is_admin()). Operator free text never
--      crosses to any non-admin user class — no worker/company/anon read
--      path, no cross-user leak.
--   3. create_follow_up_task_v1 + set_follow_up_task_status_v1 are the ONLY
--      write paths (direct insert/update/delete REVOKEd, no write policies).
--      SECURITY DEFINER, both re-check is_admin() server-side, validate the
--      enum and note bounds, verify the subject row exists, and cap open
--      tasks. The status RPC updates ONLY status + resolved_at on ONE row.
--
-- NO EXTERNAL SENDING — BY CONSTRUCTION: this layer is an internal task
-- queue only. No email, no SMS, no push, no Telegram, no webhook, no
-- outbound call of any kind exists in this migration or in the app code
-- that consumes it (guard-pinned in follow-up-tasks.test.ts). External
-- channels remain a separate future owner decision.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO notifications table / no user-facing notification feed — the
--     header NotificationPanel has no real data feed today and this wagon
--     does NOT fake one (notifications stay [] in the dashboard layout);
--   - NO scheduler, NO reminders, NO due-date automation;
--   - NO priority / urgency / score column (not honest without a real
--     signal source);
--   - NO copied subject PII — subject columns are foreign-key ids only;
--   - NO recreate of ANY existing RPC/trigger/table — both functions and
--     the table are NEW names (rollback-chain rule: nothing to restore
--     verbatim);
--   - NO change to any existing table, policy, grant, or constraint.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing table are RED-class). Ships as a needs-human-gate
-- DRAFT with the exact SQL; prod apply stays manual via Supabase MCP after
-- owner approval — never db push. Until applied, the app degrades honestly:
-- the read probe sees 42P01 and the admin control room shows the queue's
-- "not yet available" state (nothing faked, no fake tasks).
--
-- ROLLBACK: supabase/rollbacks/20260705235000_follow_up_tasks.down.sql
-- restores the prior state exactly: drops ONLY the two NEW functions and the
-- one NEW table (feature-created rows live ONLY in that table, so dropping
-- it removes only feature-created rows). No existing RPC was recreated, so
-- no RPC body needs restoring and the down file contains no create-function.
-- ============================================================================

begin;

-- ── 1. follow_up_tasks — internal operator next-action queue ────────────────
create table if not exists public.follow_up_tasks (
  id                 uuid primary key default gen_random_uuid(),
  -- Optional subject: at most ONE of profile / company. Ids only — the row
  -- never copies a name, email or phone (no PII beyond the ids needed).
  subject_profile_id uuid references public.profiles(id) on delete cascade,
  subject_company_id uuid references public.companies(id) on delete cascade,
  note               text not null check (
                       char_length(note) <= 500
                       and char_length(trim(note)) > 0
                     ),
  -- HONEST lifecycle only: pending / done / dismissed. Deliberately no
  -- priority, no urgency score, no 'contacted' claim.
  status             text not null default 'pending'
                       check (status in ('pending','done','dismissed')),
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  constraint fut_one_subject check (
    subject_profile_id is null or subject_company_id is null
  ),
  constraint fut_resolved_shape check (
    (status = 'pending' and resolved_at is null)
    or
    (status in ('done','dismissed') and resolved_at is not null)
  )
);
create index if not exists fut_status_created_idx
  on public.follow_up_tasks (status, created_at);

alter table public.follow_up_tasks enable row level security;

-- SELECT: ADMIN-ONLY. Operator notes are internal — no worker/company/anon
-- read path, no cross-user leak (six-point privacy gate).
drop policy if exists fut_select on public.follow_up_tasks;
create policy fut_select on public.follow_up_tasks
  for select to authenticated
  using (public.is_admin());
-- No insert/update/delete policy: the two gated RPCs below are the ONLY
-- write paths (direct writes are REVOKEd further down).

-- ── 2. create_follow_up_task_v1 — the ONLY insert path ─────────────────────
create or replace function public.create_follow_up_task_v1(
  p_note               text,
  p_subject_profile_id text,
  p_subject_company_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_profile  uuid := nullif(trim(coalesce(p_subject_profile_id, '')), '')::uuid;
  v_company  uuid := nullif(trim(coalesce(p_subject_company_id, '')), '')::uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Server-side gate: operators only (admin), re-checked inside the definer.
  if not public.is_admin() then
    return 'not_allowed';
  end if;

  if v_note is null or char_length(v_note) > 500 then
    return 'invalid_task';
  end if;

  -- At most ONE subject; when given, the subject row must actually exist
  -- (an id-only pointer — the task never copies subject PII).
  if v_profile is not null and v_company is not null then
    return 'invalid_task';
  end if;
  if v_profile is not null
     and not exists (select 1 from public.profiles pr where pr.id = v_profile) then
    return 'invalid_task';
  end if;
  if v_company is not null
     and not exists (select 1 from public.companies c where c.id = v_company) then
    return 'invalid_task';
  end if;

  -- Abuse cap: an operator queue is a short list, not a data dump.
  if (select count(*) from public.follow_up_tasks ft
       where ft.status = 'pending') >= 500 then
    return 'task_limit_reached';
  end if;

  insert into public.follow_up_tasks
    (subject_profile_id, subject_company_id, note, status, created_by)
  values
    (v_profile, v_company, v_note, 'pending', uid);

  return 'created';
exception
  when invalid_text_representation then
    return 'invalid_task';
end $$;

revoke all on function public.create_follow_up_task_v1(text, text, text) from public;
grant execute on function public.create_follow_up_task_v1(text, text, text) to authenticated;

-- ── 3. set_follow_up_task_status_v1 — the ONLY status transition path ──────
create or replace function public.set_follow_up_task_status_v1(
  p_task_id text,
  p_status  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_task   uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_admin() then
    return 'not_allowed';
  end if;

  if v_task is null
     or v_status is null
     or v_status not in ('pending','done','dismissed') then
    return 'invalid_task';
  end if;

  -- ONE row, ONLY status + resolved_at ever change. Reopening (back to
  -- pending) clears resolved_at; resolving stamps the honest timestamp.
  update public.follow_up_tasks ft
     set status      = v_status,
         resolved_at = case when v_status = 'pending' then null else now() end
   where ft.id = v_task;

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid_task';
end $$;

revoke all on function public.set_follow_up_task_status_v1(text, text) from public;
grant execute on function public.set_follow_up_task_status_v1(text, text) to authenticated;

-- ── 4. Grants — SELECT only to authenticated; writes are RPC-only ──────────
grant select on public.follow_up_tasks to authenticated;
revoke insert, update, delete on public.follow_up_tasks from authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260705235000_follow_up_tasks.down.sql
-- restores the prior state exactly (drops the two NEW functions and the one
-- NEW table; feature-created rows live only in that table).
