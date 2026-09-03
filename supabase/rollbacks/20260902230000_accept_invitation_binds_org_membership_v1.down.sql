-- Rollback of 20260902230000_accept_invitation_binds_org_membership_v1: restores the
-- 20260829120000 body verbatim (no organisation binding). Engagement contexts already
-- created by the forward migration are ordinary add_org_member-shaped rows and stay.

create or replace function public.accept_company_worker_invitation(
  p_company_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_email  text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
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
revoke all on function
  public.accept_company_worker_invitation(uuid) from anon;
grant execute on function
  public.accept_company_worker_invitation(uuid) to authenticated;
