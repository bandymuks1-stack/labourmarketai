-- 0032 — Engagement-context provisioning RPCs (employment → journal bridge).
--
-- WHY: the work-journal review chain is real on the journal ORG model
-- (migration 0013: organizations + engagement_contexts + manages_organization
-- RLS), but the employment link tables (company_workers / agency_workers) are
-- NOT connected to it — the M1 backfill left worker `employee` engagement
-- contexts with organization_id = NULL, so no employment relationship is
-- org-scoped for review. PR #141 shipped the read-only readiness classifier
-- (computeEngagementBridgeReadiness) which reports `missing_engagement_context`
-- for every reviewer-eligible relationship. This migration adds the safe
-- WRITE that closes the gap: an owner/admin-scoped SECURITY DEFINER RPC that
-- provisions (idempotently) an active `employee` engagement_context linking the
-- relationship's worker to the company/agency organization.
--
-- WHAT (additive — two functions only; no schema/table/RLS/grant change to
-- any table):
--   public.provision_company_worker_engagement_context(p_company_id, p_worker_id)
--   public.provision_agency_worker_engagement_context (p_agency_id,  p_worker_id)
--
-- Return text outcome (no exceptions for expected states):
--   'connected'           — a new engagement_context was created + linked.
--   'already_connected'   — an active link already exists (idempotent no-op).
--   'not_owner'           — caller does not own the org and is not admin.
--   'not_linked'          — no such employment relationship row.
--   'profile_missing'     — the worker has no profile link.
--   'role_not_assigned'   — operations_role is null (assign a role first).
--   'role_not_allowed'    — operations_role is not reviewer-eligible
--                           (only company_admin / agency_admin may be set up
--                           for review; foreman / project_manager / worker
--                           are NOT — a label is never a permission).
--   'organization_missing'— no organizations row mirrors this company/agency.
--
-- SAFETY / honesty rules:
--   - Owner/admin scoped (owns_company / owns_agency OR is_admin), re-validated
--     inside the function — same gate as the relationship write policy.
--   - Idempotent: an existing active `employee` link → 'already_connected'
--     (no duplicate row, no mutation).
--   - Creates ONLY an engagement_context row for the worker's own profile,
--     linking it to the EXISTING mirrored organization. It never creates an
--     organization, worker, project, journal entry, or confirmation, and never
--     backfills. No fake data.
--   - relationship_slug = 'employee' (NOT manager/owner) → the worker gains NO
--     management rights; this only makes the worker's future journal entries
--     org-scoped so the org's existing managers (the owner, via the 0013
--     'owner' engagement + manages_organization) can later review them.
--   - It does NOT set journal_review_enabled = true and approves/rejects
--     nothing. Review stays OFF. The relationship becomes bridge-ready only;
--     enabling review is a separate, later, owner-gated decision.
--   - Audit trail: every successful create appends one row to the existing
--     append-only public.audit_logs (migration 0001) with the real actor.
--   - No RLS change, no table grant change, no DROP/RENAME/backfill, no fake
--     data, no email/outbound, no payment/marketplace. The only grant changes
--     are EXECUTE on the two new functions (revoke from public, grant to
--     authenticated) — standard for SECURITY DEFINER RPCs.
--
-- Application status: file ships in this PR. Application to prod is
-- OWNER-GATED (CLAUDE.md: agents never apply production migrations). The app
-- degrades gracefully via 42883 (function missing) until applied, and the
-- read path stays `missing_engagement_context` until a later slice wires a
-- per-row engagement read + the provisioning UI.

-- ── company_workers: provision_company_worker_engagement_context ─────────
create or replace function public.provision_company_worker_engagement_context(
  p_company_id uuid,
  p_worker_id  uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_role     text;
  v_profile  uuid;
  v_org      uuid;
  v_existing uuid;
  v_new      uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not (public.owns_company(p_company_id) or public.is_admin()) then
    return 'not_owner';
  end if;

  -- Relationship must exist; read the assigned operations_role + worker profile.
  select cw.operations_role, w.profile_id
    into v_role, v_profile
  from public.company_workers cw
  join public.workers w on w.id = cw.worker_id
  where cw.company_id = p_company_id and cw.worker_id = p_worker_id;
  if not found then
    return 'not_linked';
  end if;
  if v_profile is null then
    return 'profile_missing';
  end if;

  -- A role must be assigned, and only a reviewer-eligible role may be set up
  -- for review (a stored label is never a permission).
  if v_role is null or btrim(v_role) = '' then
    return 'role_not_assigned';
  end if;
  if v_role not in ('company_admin','agency_admin') then
    return 'role_not_allowed';
  end if;

  -- The company's mirrored organization must exist (created in 0013).
  select o.id into v_org
  from public.organizations o
  where o.legacy_company_id = p_company_id
  limit 1;
  if v_org is null then
    return 'organization_missing';
  end if;

  -- Idempotent: an active employee link to this org already exists?
  select ec.id into v_existing
  from public.engagement_contexts ec
  where ec.profile_id = v_profile
    and ec.organization_id = v_org
    and ec.relationship_slug = 'employee'
    and ec.status = 'active'
  limit 1;
  if v_existing is not null then
    return 'already_connected';
  end if;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values
    (v_profile, v_org, 'employee', 'active', false,
     encode(extensions.digest(v_profile::text || ':employee:' || v_org::text, 'sha256'), 'hex'))
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'provision_company_worker_engagement_context', 'engagement_contexts', v_new,
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', p_worker_id,
      'organization_id', v_org, 'profile_id', v_profile,
      'relationship_slug', 'employee', 'journal_review_enabled', false,
      'result', 'connected'));

  return 'connected';
end $$;

revoke all on function
  public.provision_company_worker_engagement_context(uuid, uuid) from public;
grant execute on function
  public.provision_company_worker_engagement_context(uuid, uuid) to authenticated;

-- ── agency_workers: provision_agency_worker_engagement_context ───────────
create or replace function public.provision_agency_worker_engagement_context(
  p_agency_id uuid,
  p_worker_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_role     text;
  v_profile  uuid;
  v_org      uuid;
  v_existing uuid;
  v_new      uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not (public.owns_agency(p_agency_id) or public.is_admin()) then
    return 'not_owner';
  end if;

  select aw.operations_role, w.profile_id
    into v_role, v_profile
  from public.agency_workers aw
  join public.workers w on w.id = aw.worker_id
  where aw.agency_id = p_agency_id and aw.worker_id = p_worker_id;
  if not found then
    return 'not_linked';
  end if;
  if v_profile is null then
    return 'profile_missing';
  end if;

  if v_role is null or btrim(v_role) = '' then
    return 'role_not_assigned';
  end if;
  if v_role not in ('company_admin','agency_admin') then
    return 'role_not_allowed';
  end if;

  select o.id into v_org
  from public.organizations o
  where o.legacy_agency_id = p_agency_id
  limit 1;
  if v_org is null then
    return 'organization_missing';
  end if;

  select ec.id into v_existing
  from public.engagement_contexts ec
  where ec.profile_id = v_profile
    and ec.organization_id = v_org
    and ec.relationship_slug = 'employee'
    and ec.status = 'active'
  limit 1;
  if v_existing is not null then
    return 'already_connected';
  end if;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values
    (v_profile, v_org, 'employee', 'active', false,
     encode(extensions.digest(v_profile::text || ':employee:' || v_org::text, 'sha256'), 'hex'))
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'provision_agency_worker_engagement_context', 'engagement_contexts', v_new,
    jsonb_build_object(
      'agency_id', p_agency_id, 'worker_id', p_worker_id,
      'organization_id', v_org, 'profile_id', v_profile,
      'relationship_slug', 'employee', 'journal_review_enabled', false,
      'result', 'connected'));

  return 'connected';
end $$;

revoke all on function
  public.provision_agency_worker_engagement_context(uuid, uuid) from public;
grant execute on function
  public.provision_agency_worker_engagement_context(uuid, uuid) to authenticated;
