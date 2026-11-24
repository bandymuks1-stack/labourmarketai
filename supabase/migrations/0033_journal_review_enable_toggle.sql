-- 0033 — Journal-review enable toggle + per-row engagement read (additive).
--
-- WHY: migration 0032 added the owner/admin provisioning RPCs that create the
-- employment -> journal `engagement_context` bridge link, but it deliberately
-- left journal review OFF and provided no safe WRITE to turn it on, and no
-- per-row READ the UI can trust to know which relationship is actually bridged
-- (the user-client read of engagement_contexts depends on the owner holding an
-- `owner` engagement row, which brand-new mirror orgs may lack). This slice
-- (feat/journal-review-enable-toggle-v1) closes both gaps with FOUR additive
-- SECURITY DEFINER functions — no schema/table/RLS/grant change to any table.
--
-- WHAT (additive only — four functions; the only grant changes are EXECUTE on
-- the four new functions, revoked from public, granted to authenticated):
--   public.set_company_worker_journal_review(p_company_id, p_worker_id, p_enabled)
--   public.set_agency_worker_journal_review (p_agency_id,  p_worker_id, p_enabled)
--   public.company_worker_engagement_links(p_company_id)  -> setof uuid
--   public.agency_worker_engagement_links (p_agency_id)   -> setof uuid
--
-- set_*_worker_journal_review return text outcome (no exceptions for expected
-- states):
--   'enabled'                  — review just turned ON (preconditions all met).
--   'already_enabled'          — review was already on (idempotent no-op).
--   'disabled'                 — review just turned OFF.
--   'already_disabled'         — review was already off (idempotent no-op).
--   'not_owner'                — caller does not own the org and is not admin.
--   'not_linked'               — no such employment relationship row.
--   'role_not_assigned'        — operations_role is null (assign a role first).
--   'role_not_allowed'         — operations_role is not reviewer-eligible
--                                (only company_admin / agency_admin; a label is
--                                never a permission).
--   'profile_missing'          — the worker has no profile link.
--   'organization_missing'     — no organizations row mirrors this company/agency.
--   'engagement_context_missing' — review cannot be enabled because no active
--                                'employee' engagement_context links the worker
--                                to the org yet (run the 0032 provisioning RPC
--                                first). THIS is the core safety gate: review is
--                                NEVER enabled from a stored label — a real
--                                engagement context must exist.
--
-- company/agency_worker_engagement_links return the set of worker_ids in the
-- org that have an active 'employee' engagement_context — the owner/admin-scoped
-- per-row read the UI uses to flip a row from missing_engagement_context to
-- review_not_enabled ("ready for review setup"). They return nothing for a
-- non-owner / non-admin caller (owner-gated, not RLS-dependent).
--
-- SAFETY / honesty rules baked into the functions:
--   - Owner/admin scoped (owns_company / owns_agency OR is_admin), re-validated
--     inside every function — same gate as the relationship write policy. A
--     worker can never enable review on themselves.
--   - Enabling review requires BOTH a reviewer-eligible role AND a real active
--     'employee' engagement_context for the worker<->org. No engagement context
--     -> 'engagement_context_missing' (never enabled). This is the one true
--     difference from the 0031 assign RPC, which can never enable review at all.
--   - Disabling review is always safe and allowed (turn it off regardless of
--     role/context); it only ever sets journal_review_enabled = false.
--   - Idempotent: already-on -> 'already_enabled', already-off -> 'already_disabled'
--     (no duplicate write, no mutation).
--   - Approves/rejects NOTHING. It only flips the per-relationship
--     journal_review_enabled boolean on company_workers / agency_workers; it
--     creates no confirmation, journal entry, worker, project or org, and never
--     backfills. No fake data, no fake reviewer, no fake foreman/PM permission.
--   - Audit trail: every successful flip appends one row to the existing
--     append-only public.audit_logs (migration 0001) with the real actor.
--   - No RLS change, no table grant change, no DROP/RENAME/backfill, no fake
--     data, no email/outbound, no payment/marketplace.
--
-- Application status: file ships in this PR. Application to prod is
-- OWNER-GATED (CLAUDE.md: agents never apply production migrations). The app
-- wrappers degrade gracefully via 42883 (function missing) until applied, so
-- the UI keeps showing the honest "connect the journal context first" state.

-- ── company_workers: set_company_worker_journal_review ──────────────────
create or replace function public.set_company_worker_journal_review(
  p_company_id uuid,
  p_worker_id  uuid,
  p_enabled    boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_role     text;
  v_profile  uuid;
  v_current  boolean;
  v_org      uuid;
  v_linked   boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not (public.owns_company(p_company_id) or public.is_admin()) then
    return 'not_owner';
  end if;

  -- Relationship must exist; read role, current flag, worker profile.
  select cw.operations_role, cw.journal_review_enabled, w.profile_id
    into v_role, v_current, v_profile
  from public.company_workers cw
  join public.workers w on w.id = cw.worker_id
  where cw.company_id = p_company_id and cw.worker_id = p_worker_id;
  if not found then
    return 'not_linked';
  end if;

  -- Disabling review is always safe and allowed (turn it off regardless).
  if p_enabled is not true then
    if v_current is not true then
      return 'already_disabled';
    end if;
    update public.company_workers
       set journal_review_enabled = false
     where company_id = p_company_id and worker_id = p_worker_id;
    insert into public.audit_logs (actor_id, action, entity, payload)
    values (uid, 'set_company_worker_journal_review', 'company_workers',
      jsonb_build_object(
        'company_id', p_company_id, 'worker_id', p_worker_id,
        'journal_review_enabled', false, 'result', 'disabled'));
    return 'disabled';
  end if;

  -- Enabling: a reviewer-eligible role must be assigned (label != permission).
  if v_role is null or btrim(v_role) = '' then
    return 'role_not_assigned';
  end if;
  if v_role not in ('company_admin','agency_admin') then
    return 'role_not_allowed';
  end if;
  if v_profile is null then
    return 'profile_missing';
  end if;

  -- The company's mirrored organization must exist (created in 0013).
  select o.id into v_org
  from public.organizations o
  where o.legacy_company_id = p_company_id
  limit 1;
  if v_org is null then
    return 'organization_missing';
  end if;

  -- CORE GATE: a real active 'employee' engagement_context must link this
  -- worker to the org. Review is NEVER enabled from a label alone.
  select exists (
    select 1 from public.engagement_contexts ec
    where ec.profile_id = v_profile
      and ec.organization_id = v_org
      and ec.relationship_slug = 'employee'
      and ec.status = 'active'
  ) into v_linked;
  if not v_linked then
    return 'engagement_context_missing';
  end if;

  if v_current is true then
    return 'already_enabled';
  end if;

  update public.company_workers
     set journal_review_enabled = true
   where company_id = p_company_id and worker_id = p_worker_id;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'set_company_worker_journal_review', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', p_worker_id,
      'organization_id', v_org, 'profile_id', v_profile,
      'journal_review_enabled', true, 'result', 'enabled'));
  return 'enabled';
end $$;

revoke all on function
  public.set_company_worker_journal_review(uuid, uuid, boolean) from public;
grant execute on function
  public.set_company_worker_journal_review(uuid, uuid, boolean) to authenticated;

-- ── agency_workers: set_agency_worker_journal_review ────────────────────
create or replace function public.set_agency_worker_journal_review(
  p_agency_id uuid,
  p_worker_id uuid,
  p_enabled   boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_role     text;
  v_profile  uuid;
  v_current  boolean;
  v_org      uuid;
  v_linked   boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not (public.owns_agency(p_agency_id) or public.is_admin()) then
    return 'not_owner';
  end if;

  select aw.operations_role, aw.journal_review_enabled, w.profile_id
    into v_role, v_current, v_profile
  from public.agency_workers aw
  join public.workers w on w.id = aw.worker_id
  where aw.agency_id = p_agency_id and aw.worker_id = p_worker_id;
  if not found then
    return 'not_linked';
  end if;

  if p_enabled is not true then
    if v_current is not true then
      return 'already_disabled';
    end if;
    update public.agency_workers
       set journal_review_enabled = false
     where agency_id = p_agency_id and worker_id = p_worker_id;
    insert into public.audit_logs (actor_id, action, entity, payload)
    values (uid, 'set_agency_worker_journal_review', 'agency_workers',
      jsonb_build_object(
        'agency_id', p_agency_id, 'worker_id', p_worker_id,
        'journal_review_enabled', false, 'result', 'disabled'));
    return 'disabled';
  end if;

  if v_role is null or btrim(v_role) = '' then
    return 'role_not_assigned';
  end if;
  if v_role not in ('company_admin','agency_admin') then
    return 'role_not_allowed';
  end if;
  if v_profile is null then
    return 'profile_missing';
  end if;

  select o.id into v_org
  from public.organizations o
  where o.legacy_agency_id = p_agency_id
  limit 1;
  if v_org is null then
    return 'organization_missing';
  end if;

  select exists (
    select 1 from public.engagement_contexts ec
    where ec.profile_id = v_profile
      and ec.organization_id = v_org
      and ec.relationship_slug = 'employee'
      and ec.status = 'active'
  ) into v_linked;
  if not v_linked then
    return 'engagement_context_missing';
  end if;

  if v_current is true then
    return 'already_enabled';
  end if;

  update public.agency_workers
     set journal_review_enabled = true
   where agency_id = p_agency_id and worker_id = p_worker_id;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'set_agency_worker_journal_review', 'agency_workers',
    jsonb_build_object(
      'agency_id', p_agency_id, 'worker_id', p_worker_id,
      'organization_id', v_org, 'profile_id', v_profile,
      'journal_review_enabled', true, 'result', 'enabled'));
  return 'enabled';
end $$;

revoke all on function
  public.set_agency_worker_journal_review(uuid, uuid, boolean) from public;
grant execute on function
  public.set_agency_worker_journal_review(uuid, uuid, boolean) to authenticated;

-- ── company per-row read: company_worker_engagement_links ───────────────
-- Owner/admin-scoped read (NOT RLS-dependent): returns the worker_ids in the
-- company that have an active 'employee' engagement_context linking them to the
-- company's mirrored organization. Empty for a non-owner / non-admin caller.
create or replace function public.company_worker_engagement_links(
  p_company_id uuid
) returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  if not (public.owns_company(p_company_id) or public.is_admin()) then
    return;
  end if;
  select o.id into v_org
  from public.organizations o
  where o.legacy_company_id = p_company_id
  limit 1;
  if v_org is null then
    return;
  end if;
  return query
    select cw.worker_id
    from public.company_workers cw
    join public.workers w on w.id = cw.worker_id
    join public.engagement_contexts ec on ec.profile_id = w.profile_id
    where cw.company_id = p_company_id
      and ec.organization_id = v_org
      and ec.relationship_slug = 'employee'
      and ec.status = 'active';
end $$;

revoke all on function
  public.company_worker_engagement_links(uuid) from public;
grant execute on function
  public.company_worker_engagement_links(uuid) to authenticated;

-- ── agency per-row read: agency_worker_engagement_links ─────────────────
create or replace function public.agency_worker_engagement_links(
  p_agency_id uuid
) returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  if not (public.owns_agency(p_agency_id) or public.is_admin()) then
    return;
  end if;
  select o.id into v_org
  from public.organizations o
  where o.legacy_agency_id = p_agency_id
  limit 1;
  if v_org is null then
    return;
  end if;
  return query
    select aw.worker_id
    from public.agency_workers aw
    join public.workers w on w.id = aw.worker_id
    join public.engagement_contexts ec on ec.profile_id = w.profile_id
    where aw.agency_id = p_agency_id
      and ec.organization_id = v_org
      and ec.relationship_slug = 'employee'
      and ec.status = 'active';
end $$;

revoke all on function
  public.agency_worker_engagement_links(uuid) from public;
grant execute on function
  public.agency_worker_engagement_links(uuid) to authenticated;
