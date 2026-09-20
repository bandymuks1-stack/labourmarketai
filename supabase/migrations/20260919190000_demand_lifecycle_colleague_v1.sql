-- @human-gate-approved
-- ============================================================================
-- 20260919190000_demand_lifecycle_colleague_v1
-- RED — owner gate (R-15 of the 2026-09-19 completion audit).
-- APPLIED 2026-09-20 05:16 UTC (ledger 20260920051619) under the owner's
-- verbatim sentence "Apply R-15: close_demand_v1 / reopen_demand_v1 for
-- creator, admin and has_org_demand_access colleagues — status only, UPDATE
-- policy unchanged, with rollback." Hostile + legitimate contract run on the
-- LIVE functions and rolled back (see docs/APPLIED_LEDGER.md).
--
-- FINDING (traced on production 2026-09-19): `customer_requests_update` is
-- `profile_id = auth.uid() or is_admin()` — unchanged since 0028. The SELECT
-- policy was widened to `has_org_demand_access(organization_id)` in
-- 20260806200000, so a colleague with an active owner/admin/manager/
-- external_manager membership can READ the organization's need but cannot
-- close it, reopen it, confirm its recognized skills or edit a field. There
-- is no close/reopen RPC at all: the only status writers are the owner-only
-- `save_customer_request` and the raw table UPDATE the app issues under the
-- owner's own RLS. Two production organizations have more than one active
-- member today; eight needs sit in such organizations.
--
-- WHY NOT "widen UPDATE to has_org_demand_access": the grant is whole-row
-- `update`, `customer_requests_status_transition_guard` branches only on
-- `is_admin()`, and `demand_org_attribution_guard` protects only
-- `organization_id`. A widened policy would hand every manager blanket PATCH
-- over `payload` (estimate, compensation cents, deductions, accommodation
-- pricing), `agency_client_id` (which end client the need belongs to),
-- `notes` and the full requirement set — a commercial-data widening
-- disguised as a lifecycle fix.
--
-- MINIMUM CHANGE: two SECURITY DEFINER writes with a field/action boundary.
--   close_demand_v1(p_request_id)   submitted → closed
--   reopen_demand_v1(p_request_id)  closed   → submitted
-- Authority ladder: admin · the creating profile ("owner") · a colleague with
-- `has_org_demand_access(organization_id)`. Anything else → `not_found`
-- (anti-oracle: no standing is indistinguishable from no row). Each writes
-- ONLY `status` and `updated_at`. The status-transition trigger still fires
-- (auth.uid() is the caller inside SECURITY DEFINER) and still whitelists
-- exactly these two moves for non-admins. Idempotent (`already_closed` /
-- `already_open`). Audited with the actor's capacity.
--
-- NOT changed, on purpose: the UPDATE policy stays owner-only, so requirement
-- edits, `payload` (all commercial fields), `agency_client_id` and the §19
-- confirm act remain the creator's; `manual_review_note` stays admin's;
-- `organization_id` stays trigger-immutable. The open-needs ceiling (owner
-- launch pricing 2026-09-05) is an APP gate today for the owner too — this
-- migration neither adds nor removes DB enforcement of it; the app applies
-- the same gate before calling reopen_demand_v1 for owner and colleague alike.
--
-- HOSTILE CONTRACT (run and roll back before apply, as in #1795/#1798):
--   outsider (no membership)        → not_found, row untouched
--   member with role 'member'       → not_found (has_org_demand_access is
--                                     owner/admin/manager/external_manager)
--   colleague on a 'draft' row      → invalid_transition, row untouched
--   colleague close on 'submitted'  → closed; only status/updated_at differ
--   colleague reopen on 'closed'    → submitted
--   owner, same four                → identical outcomes
--   payload / agency_client_id      → byte-identical before and after
-- BLAST RADIUS: two new functions; zero table, policy, grant-on-table, row
-- or trigger changes. DOWN drops both functions.
-- ============================================================================

begin;

create or replace function public.close_demand_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_status   text;
  v_profile  uuid;
  v_org      uuid;
  v_capacity text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_request_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select cr.status, cr.profile_id, cr.organization_id
    into v_status, v_profile, v_org
    from public.customer_requests cr
   where cr.id = p_request_id
     for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Authority ladder ──────────────────────────────────────────────────────
  if public.is_admin() then
    v_capacity := 'admin';
  elsif v_profile = uid then
    v_capacity := 'owner';
  elsif public.has_org_demand_access(v_org) then
    v_capacity := 'colleague';
  else
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Transition: submitted → closed only ───────────────────────────────────
  if v_status = 'closed' then
    return jsonb_build_object('outcome', 'already_closed');
  end if;
  if v_status <> 'submitted' then
    return jsonb_build_object('outcome', 'invalid_transition', 'from_status', v_status);
  end if;

  update public.customer_requests
     set status = 'closed', updated_at = now()
   where id = p_request_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'close_demand', 'customer_requests', p_request_id,
          jsonb_build_object(
            'organization_id', v_org,
            'owner_profile_id', v_profile,
            'from_status', v_status,
            'to_status', 'closed',
            'actor_capacity', v_capacity));

  return jsonb_build_object('outcome', 'closed', 'actor_capacity', v_capacity);
end $$;

create or replace function public.reopen_demand_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_status   text;
  v_profile  uuid;
  v_org      uuid;
  v_capacity text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_request_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select cr.status, cr.profile_id, cr.organization_id
    into v_status, v_profile, v_org
    from public.customer_requests cr
   where cr.id = p_request_id
     for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if public.is_admin() then
    v_capacity := 'admin';
  elsif v_profile = uid then
    v_capacity := 'owner';
  elsif public.has_org_demand_access(v_org) then
    v_capacity := 'colleague';
  else
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Transition: closed → submitted only ───────────────────────────────────
  if v_status = 'submitted' then
    return jsonb_build_object('outcome', 'already_open');
  end if;
  if v_status <> 'closed' then
    return jsonb_build_object('outcome', 'invalid_transition', 'from_status', v_status);
  end if;

  update public.customer_requests
     set status = 'submitted', updated_at = now()
   where id = p_request_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'reopen_demand', 'customer_requests', p_request_id,
          jsonb_build_object(
            'organization_id', v_org,
            'owner_profile_id', v_profile,
            'from_status', v_status,
            'to_status', 'submitted',
            'actor_capacity', v_capacity));

  return jsonb_build_object('outcome', 'submitted', 'actor_capacity', v_capacity);
end $$;

revoke all on function public.close_demand_v1(uuid) from public, anon;
grant execute on function public.close_demand_v1(uuid) to authenticated;
revoke all on function public.reopen_demand_v1(uuid) from public, anon;
grant execute on function public.reopen_demand_v1(uuid) to authenticated;

commit;
