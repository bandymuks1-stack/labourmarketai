-- @human-gate-approved
-- ============================================================================
-- 20260919150000_end_roster_link_v1
-- RED — owner gate (R-9 of the 2026-09-19 completion audit + the "roster
-- removal UI" gap of §F).
-- APPLIED 2026-09-19 15:19 UTC (ledger 20260919151920) under the owner's verbatim
-- approval sentence; the full contract run on the LIVE function and rolled back
-- (see docs/APPLIED_LEDGER.md).
--
-- Finding: a roster relationship (`company_workers` / `agency_workers`) can
-- be created only through the worker's own acceptance (R-1, applied
-- 2026-09-19) — and then NOBODY can end it. The worker cannot withdraw the
-- relationship they consented to (consent that cannot be withdrawn is not
-- consent — the same rule the 2026-09-17 roster-link withdrawal applied to
-- `organization_people`). The owner cannot remove a person from the roster
-- either: since R-1 the only writers are the accept/assign RPCs, none of
-- which sets `status = 'removed'` (the value the 0027 CHECK has carried since
-- day one and nothing has ever written).
--
-- MINIMUM CHANGE: ONE SECURITY DEFINER write, `end_roster_link_v1`, with the
-- authority ladder `end_org_membership_v1` already uses: admin, the owner of
-- the company/agency, or the SUBJECT WORKER themselves. Sets the roster row
-- to `status = 'removed'` and clears `journal_review_enabled` — never a
-- DELETE. In the same transaction it ends the matching ACTIVE `employee`
-- engagement context in the organization that mirrors that company/agency
-- (the row `accept_company_worker_invitation` provisioned), with the same
-- statement shape as `end_org_membership_v1`, so the relationship does not
-- linger half-ended. Anti-oracle: a caller with no standing gets
-- `not_found`. Idempotent (`already_removed`). Audited with capacity and
-- `self_initiated`.
--
-- Downstream, by the EXISTING readers: `caller_manages_worker_by_roster`,
-- the roster branch of `can_view_worker`, the agency offer roster check and
-- the members panel's `addable` list all read `status = 'active'` and stop
-- recognising the link the moment this runs. Project assignments are NOT
-- touched (they have their own end path, `end_worker_project_assignment`).
--
-- No table, policy, grant or row change. Reversible: DOWN drops the function.
-- ============================================================================

begin;

create or replace function public.end_roster_link_v1(
  p_kind          text,
  p_org_legacy_id uuid,
  p_worker_id     uuid,
  p_reason        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status       text;
  v_profile      uuid;
  v_capacity     text;
  v_org          uuid;
  v_engagement   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('company', 'agency') then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if p_org_legacy_id is null or p_worker_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    v_reason := left(v_reason, 500);
  end if;

  -- The subject: the worker row's own profile.
  select w.profile_id into v_profile from public.workers w where w.id = p_worker_id;

  -- ROW LOCK on the link, per kind.
  if p_kind = 'company' then
    select cw.status into v_status
      from public.company_workers cw
     where cw.company_id = p_org_legacy_id and cw.worker_id = p_worker_id
       for update;
  else
    select aw.status into v_status
      from public.agency_workers aw
     where aw.agency_id = p_org_legacy_id and aw.worker_id = p_worker_id
       for update;
  end if;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Authority ladder (the end_org_membership_v1 shape) ────────────────────
  if public.is_admin() then
    v_capacity := 'admin';
  elsif (p_kind = 'company' and public.owns_company(p_org_legacy_id))
     or (p_kind = 'agency'  and public.owns_agency(p_org_legacy_id)) then
    v_capacity := 'owner';
  elsif v_profile is not null and v_profile = uid then
    v_capacity := 'self';
  else
    -- No standing: indistinguishable from a link that does not exist.
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Idempotency ───────────────────────────────────────────────────────────
  if v_status = 'removed' then
    return jsonb_build_object('outcome', 'already_removed');
  end if;

  -- ── The state change. Never a DELETE. ─────────────────────────────────────
  if p_kind = 'company' then
    update public.company_workers
       set status = 'removed', journal_review_enabled = false, updated_at = now()
     where company_id = p_org_legacy_id and worker_id = p_worker_id;
    select o.id into v_org from public.organizations o where o.legacy_company_id = p_org_legacy_id limit 1;
  else
    update public.agency_workers
       set status = 'removed', journal_review_enabled = false, updated_at = now()
     where agency_id = p_org_legacy_id and worker_id = p_worker_id;
    select o.id into v_org from public.organizations o where o.legacy_agency_id = p_org_legacy_id limit 1;
  end if;

  -- The membership the acceptance provisioned ends with the link it came from.
  if v_org is not null and v_profile is not null then
    update public.engagement_contexts
       set status = 'ended',
           ended_at = coalesce(ended_at, current_date),
           journal_review_enabled = false,
           is_primary = false,
           updated_at = now()
     where profile_id = v_profile
       and organization_id = v_org
       and relationship_slug = 'employee'
       and status = 'active'
    returning id into v_engagement;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'end_roster_link',
          case when p_kind = 'company' then 'company_workers' else 'agency_workers' end,
          p_worker_id,
          jsonb_build_object(
            'kind', p_kind,
            'org_legacy_id', p_org_legacy_id,
            'worker_id', p_worker_id,
            'profile_id', v_profile,
            'from_status', v_status,
            'to_status', 'removed',
            'actor_capacity', v_capacity,
            'self_initiated', (v_profile = uid),
            'engagement_ended', v_engagement,
            'reason', v_reason));

  return jsonb_build_object(
    'outcome', 'removed',
    'actor_capacity', v_capacity,
    'engagement_ended', v_engagement is not null);
end $$;

revoke all on function public.end_roster_link_v1(text, uuid, uuid, text) from public, anon;
grant execute on function public.end_roster_link_v1(text, uuid, uuid, text) to authenticated;

commit;
