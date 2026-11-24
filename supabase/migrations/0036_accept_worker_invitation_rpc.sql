-- 0036 — Accept worker invitation RPCs (the missing link-creation path).
--
-- WHY: invite_company_worker / invite_agency_worker (0027 / 0025) create a
-- PENDING invitation row, but nothing ever turns a pending invitation into a
-- real company_workers / agency_workers link — there is no acceptance RPC,
-- trigger, or app write path, and the link tables' write RLS is owner/admin
-- only (a worker cannot self-insert). So the very first step of the work-
-- journal chain (Company/Agency → Worker) was unreachable. This migration adds
-- the explicit, worker-initiated acceptance: the invited worker accepts their
-- own pending invitation, which creates the link under SECURITY DEFINER.
--
-- WHAT (additive — two functions; the only grant changes are EXECUTE on the two
-- new functions):
--   public.accept_company_worker_invitation(p_company_id) -> text
--   public.accept_agency_worker_invitation (p_agency_id)  -> text
--
-- Text outcomes (no exceptions for expected states):
--   'linked'            — a new active link was created + invitation accepted.
--   'already_linked'    — the link already exists (invitation marked accepted).
--   'no_invitation'     — no PENDING invitation for this caller's email + org.
--   'no_worker_profile' — the caller has no public.workers row to link.
--
-- SAFETY / honesty:
--   - Worker-scoped: acts ONLY on the authenticated caller's own worker row and
--     ONLY on a pending invitation addressed to the caller's own email. A user
--     can never link someone else, and cannot link without a real invitation
--     the owner created.
--   - Idempotent: an existing link returns 'already_linked' (no duplicate; the
--     PK (company_id/agency_id, worker_id) also prevents dupes).
--   - Creates ONLY the link row + flips the invitation to 'accepted'. It never
--     creates a worker, company, agency, journal entry, engagement, or role; no
--     fake data; review stays off; no email/outbound, no payment.
--   - Audit trail: every successful link appends one row to public.audit_logs.
--   - No RLS change, no table grant change, no DROP/RENAME/DELETE, no backfill.
--
-- Application status: file ships in this PR. Application to prod is owner-gated.

-- ── company: accept_company_worker_invitation ───────────────────────────
create or replace function public.accept_company_worker_invitation(
  p_company_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_email  text;
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.email, w.id
    into v_email, v_worker
  from public.profiles p
  left join public.workers w on w.profile_id = p.id
  where p.id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;

  -- A PENDING invitation addressed to the caller's own email must exist.
  select i.id into v_inv
  from public.company_worker_invitations i
  where i.company_id = p_company_id
    and lower(i.invited_email) = lower(v_email)
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;

  select exists (
    select 1 from public.company_workers cw
    where cw.company_id = p_company_id and cw.worker_id = v_worker
  ) into v_linked;
  if v_linked then
    update public.company_worker_invitations
       set status = 'accepted', accepted_at = now()
     where id = v_inv;
    return 'already_linked';
  end if;

  insert into public.company_workers (company_id, worker_id, status)
  values (p_company_id, v_worker, 'active')
  on conflict (company_id, worker_id) do nothing;

  update public.company_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_company_worker_invitation', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));

  return 'linked';
end $$;

revoke all on function
  public.accept_company_worker_invitation(uuid) from public;
grant execute on function
  public.accept_company_worker_invitation(uuid) to authenticated;

-- ── agency: accept_agency_worker_invitation ─────────────────────────────
create or replace function public.accept_agency_worker_invitation(
  p_agency_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_email  text;
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.email, w.id
    into v_email, v_worker
  from public.profiles p
  left join public.workers w on w.profile_id = p.id
  where p.id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;

  select i.id into v_inv
  from public.agency_worker_invitations i
  where i.agency_id = p_agency_id
    and lower(i.invited_email) = lower(v_email)
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;

  select exists (
    select 1 from public.agency_workers aw
    where aw.agency_id = p_agency_id and aw.worker_id = v_worker
  ) into v_linked;
  if v_linked then
    update public.agency_worker_invitations
       set status = 'accepted', accepted_at = now()
     where id = v_inv;
    return 'already_linked';
  end if;

  insert into public.agency_workers (agency_id, worker_id, status)
  values (p_agency_id, v_worker, 'active')
  on conflict (agency_id, worker_id) do nothing;

  update public.agency_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_agency_worker_invitation', 'agency_workers',
    jsonb_build_object(
      'agency_id', p_agency_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));

  return 'linked';
end $$;

revoke all on function
  public.accept_agency_worker_invitation(uuid) from public;
grant execute on function
  public.accept_agency_worker_invitation(uuid) to authenticated;
