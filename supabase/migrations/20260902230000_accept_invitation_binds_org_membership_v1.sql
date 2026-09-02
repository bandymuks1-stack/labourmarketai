-- @human-gate-approved
-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL COMPLETION finding F4-1 (2026-09-02, gate G-15): accepting a company
-- worker invitation linked the worker to the COMPANY (company_workers) but
-- never to its ORGANIZATION (engagement_contexts), so the worker's timesheet
-- form listed no organisation until a manager ran add_org_member by hand.
-- Proven on production with two bounded identities (evidence file
-- docs/audits/evidence/final-completion/f4-company-work-chain-prod-proof-2026-09-02.md).
--
-- Change (RED by rule — SECURITY DEFINER body): after the existing link, the
-- RPC also creates the 'employee' engagement context for the organisation
-- whose legacy_company_id is the invited company — the SAME row shape
-- add_org_member() writes (20260530140000), so nothing downstream changes.
-- Idempotent: an existing active employee context is left alone. If the
-- company has no organisation row yet (legacy backfill not run) the accept
-- still succeeds exactly as before — the binding is best-effort, never a
-- refusal. No data is rewritten; rollback = the 20260829120000 body verbatim.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_company_worker_invitation(
  p_company_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_email   text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_worker  uuid;
  v_inv     uuid;
  v_linked  boolean;
  v_org     uuid;
  v_ctx     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select w.id into v_worker
  from public.workers w
  where w.profile_id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;

  -- A PENDING invitation addressed to the SESSION's verified email must exist.
  -- profiles.email is never consulted: it is user-writable history, not identity.
  if v_email is null then
    return 'no_invitation';
  end if;
  select i.id into v_inv
  from public.company_worker_invitations i
  where i.company_id = p_company_id
    and lower(i.invited_email) = v_email
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;

  select exists (
    select 1 from public.company_workers cw
    where cw.company_id = p_company_id and cw.worker_id = v_worker
  ) into v_linked;

  if not v_linked then
    insert into public.company_workers (company_id, worker_id, status)
    values (p_company_id, v_worker, 'active')
    on conflict (company_id, worker_id) do nothing;
  end if;

  update public.company_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  -- F4-1: bind the organisation membership too (best-effort, idempotent).
  select o.id into v_org
  from public.organizations o
  where o.legacy_company_id = p_company_id
  limit 1;
  if v_org is not null then
    select id into v_ctx from public.engagement_contexts
     where profile_id = uid and organization_id = v_org
       and relationship_slug = 'employee' and status = 'active'
     limit 1;
    if v_ctx is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
      values
        (uid, v_org, 'employee', 'active', false,
         encode(extensions.digest(uid::text || ':employee:' || v_org::text, 'sha256'), 'hex'))
      returning id into v_ctx;
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (uid, 'accept_company_worker_invitation', 'engagement_contexts', v_ctx,
        jsonb_build_object('organization_id', v_org, 'worker_id', v_worker,
          'company_id', p_company_id, 'relationship_slug', 'employee', 'result', 'org_bound'));
    end if;
  end if;

  if v_linked then
    return 'already_linked';
  end if;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_company_worker_invitation', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));

  return 'linked';
end $$;

revoke all on function
  public.accept_company_worker_invitation(uuid) from public;
revoke all on function
  public.accept_company_worker_invitation(uuid) from anon;
grant execute on function
  public.accept_company_worker_invitation(uuid) to authenticated;
