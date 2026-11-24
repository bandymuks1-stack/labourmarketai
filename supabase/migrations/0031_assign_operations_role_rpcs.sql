-- 0031 — Operations role assignment RPCs (owner/admin-scoped write path).
--
-- WHY: migration 0030 added the additive bridge columns (operations_role /
-- operations_title / journal_review_enabled / journal_review_scope) on
-- public.company_workers + public.agency_workers, but there was NO safe
-- write path to set them. The contract
-- (docs/contracts/operations-role-assignment-v1.md) requires assignment to
-- go through a SECURITY DEFINER RPC that re-validates ownership — never a
-- direct client UPDATE. This migration adds exactly that, mirroring the
-- invite_company_worker / invite_agency_worker shape (migrations 0027 / 0001).
--
-- WHAT (additive only — two functions, no schema/table/RLS/grant change to
-- any table):
--   public.assign_company_worker_role(p_company_id, p_worker_id,
--     p_operations_role, p_operations_title, p_journal_review_enabled)
--   public.assign_agency_worker_role(p_agency_id, p_worker_id,
--     p_operations_role, p_operations_title, p_journal_review_enabled)
--
-- Return text outcome (no exceptions for expected states):
--   'assigned'           — role (+ optional title) written.
--   'cleared'            — role + title cleared (NULL/blank role).
--   'not_owner'          — caller does not own the org and is not admin.
--   'not_linked'         — no such relationship row (assignment never
--                          creates a link; the worker must be linked first).
--   'invalid_role'       — role not in the conservative allowed set.
--   'review_not_allowed' — caller tried to enable journal review (blocked,
--                          see below).
--
-- SAFETY / honesty rules baked into the functions:
--   - Owner/admin scoped: owns_company / owns_agency OR is_admin, the SAME
--     gate as the existing relationship write policy. A worker can never
--     self-assign an operations role.
--   - operations_role is validated against the conservative set
--     ('worker','foreman','project_manager','company_admin','agency_admin')
--     — the same values the 0030 CHECK + role-capabilities map allow.
--   - Clearing is safe: a NULL/blank role wipes role + title and leaves
--     review off.
--   - journal_review_enabled is NEVER turned on here. The employment↔journal
--     engagement-context bridge does not exist yet, so review rights can
--     never come from a stored label (label != permission). The parameter
--     exists only so a caller's attempt to enable review is REJECTED
--     explicitly ('review_not_allowed') rather than silently honoured.
--     Every write forces journal_review_enabled = false. Enabling review is
--     a separate future decision requiring a real reviewer<->worker scope
--     RPC + journal-org linkage (see the contract + decision doc).
--   - storing operations_role = 'foreman' / 'project_manager' records intent
--     only; the role-capabilities map keeps them not_enabled, so no fake
--     foreman/PM active state is created.
--   - Audit trail: every successful write appends one row to the existing
--     append-only public.audit_logs table (migration 0001) with the real
--     actor (auth.uid()), action, entity and a payload. No silent mutation.
--   - No RLS change, no table grant change, no DROP/RENAME, no backfill, no
--     fake data, no email/outbound, no payment/marketplace touch. The only
--     grant changes are EXECUTE on the two new functions (revoke from public,
--     grant to authenticated) — standard for SECURITY DEFINER RPCs.
--
-- Application status: file ships in this PR. Application to prod is
-- OWNER-GATED (CLAUDE.md: agents never apply production migrations). The app
-- wrappers degrade gracefully via 42883 (function missing) until applied.

-- ── company_workers: assign_company_worker_role ─────────────────────────
create or replace function public.assign_company_worker_role(
  p_company_id             uuid,
  p_worker_id              uuid,
  p_operations_role        text default null,
  p_operations_title       text default null,
  p_journal_review_enabled boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_role    text := nullif(trim(coalesce(p_operations_role, '')), '');
  v_title   text := nullif(trim(coalesce(p_operations_title, '')), '');
  v_exists  boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Owner/admin scope (same gate as company_workers write policy).
  if not (public.owns_company(p_company_id) or public.is_admin()) then
    return 'not_owner';
  end if;

  -- Assignment never creates a link — the relationship must already exist.
  select exists (
    select 1 from public.company_workers
    where company_id = p_company_id and worker_id = p_worker_id
  ) into v_exists;
  if not v_exists then
    return 'not_linked';
  end if;

  -- Review-enable is not permitted in this slice: review rights can never
  -- come from a stored label (no engagement-context bridge yet).
  if p_journal_review_enabled is true then
    return 'review_not_allowed';
  end if;

  -- Clearing: blank role wipes role + title, review stays off.
  if v_role is null then
    update public.company_workers
       set operations_role        = null,
           operations_title       = null,
           journal_review_enabled = false
     where company_id = p_company_id and worker_id = p_worker_id;

    insert into public.audit_logs (actor_id, action, entity, payload)
    values (uid, 'assign_company_worker_role', 'company_workers',
      jsonb_build_object(
        'company_id', p_company_id, 'worker_id', p_worker_id,
        'operations_role', null, 'journal_review_enabled', false,
        'result', 'cleared'));
    return 'cleared';
  end if;

  -- Validate against the conservative allowed set.
  if v_role not in
     ('worker','foreman','project_manager','company_admin','agency_admin') then
    return 'invalid_role';
  end if;

  update public.company_workers
     set operations_role        = v_role,
         operations_title       = v_title,
         journal_review_enabled = false
   where company_id = p_company_id and worker_id = p_worker_id;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'assign_company_worker_role', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', p_worker_id,
      'operations_role', v_role, 'operations_title', v_title,
      'journal_review_enabled', false, 'result', 'assigned'));
  return 'assigned';
end $$;

revoke all on function
  public.assign_company_worker_role(uuid, uuid, text, text, boolean) from public;
grant execute on function
  public.assign_company_worker_role(uuid, uuid, text, text, boolean)
  to authenticated;

-- ── agency_workers: assign_agency_worker_role ───────────────────────────
create or replace function public.assign_agency_worker_role(
  p_agency_id              uuid,
  p_worker_id              uuid,
  p_operations_role        text default null,
  p_operations_title       text default null,
  p_journal_review_enabled boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_role    text := nullif(trim(coalesce(p_operations_role, '')), '');
  v_title   text := nullif(trim(coalesce(p_operations_title, '')), '');
  v_exists  boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Owner/admin scope (same gate as agency_workers write policy).
  if not (public.owns_agency(p_agency_id) or public.is_admin()) then
    return 'not_owner';
  end if;

  -- Assignment never creates a link — the relationship must already exist.
  select exists (
    select 1 from public.agency_workers
    where agency_id = p_agency_id and worker_id = p_worker_id
  ) into v_exists;
  if not v_exists then
    return 'not_linked';
  end if;

  -- Review-enable is not permitted in this slice: review rights can never
  -- come from a stored label (no engagement-context bridge yet).
  if p_journal_review_enabled is true then
    return 'review_not_allowed';
  end if;

  -- Clearing: blank role wipes role + title, review stays off.
  if v_role is null then
    update public.agency_workers
       set operations_role        = null,
           operations_title       = null,
           journal_review_enabled = false
     where agency_id = p_agency_id and worker_id = p_worker_id;

    insert into public.audit_logs (actor_id, action, entity, payload)
    values (uid, 'assign_agency_worker_role', 'agency_workers',
      jsonb_build_object(
        'agency_id', p_agency_id, 'worker_id', p_worker_id,
        'operations_role', null, 'journal_review_enabled', false,
        'result', 'cleared'));
    return 'cleared';
  end if;

  -- Validate against the conservative allowed set.
  if v_role not in
     ('worker','foreman','project_manager','company_admin','agency_admin') then
    return 'invalid_role';
  end if;

  update public.agency_workers
     set operations_role        = v_role,
         operations_title       = v_title,
         journal_review_enabled = false
   where agency_id = p_agency_id and worker_id = p_worker_id;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'assign_agency_worker_role', 'agency_workers',
    jsonb_build_object(
      'agency_id', p_agency_id, 'worker_id', p_worker_id,
      'operations_role', v_role, 'operations_title', v_title,
      'journal_review_enabled', false, 'result', 'assigned'));
  return 'assigned';
end $$;

revoke all on function
  public.assign_agency_worker_role(uuid, uuid, text, text, boolean) from public;
grant execute on function
  public.assign_agency_worker_role(uuid, uuid, text, text, boolean)
  to authenticated;
