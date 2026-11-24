-- Rollback for supabase/migrations/20260829120000_profile_email_identity_binding_v1.sql
--
-- READ THIS BEFORE RUNNING IT. Rolling back REOPENS the defect the migration
-- closes: any signed-in user can again set their own profiles.email to any
-- address, and the two legacy accept RPCs + the two invitee-side SELECT
-- policies go back to trusting that user-written value as identity. Run it
-- only to restore the exact pre-migration state (e.g. an unexpected product
-- regression), and re-apply the migration as soon as the cause is known.
--
-- What it restores, verbatim:
--   • drops trg_profiles_email_binding + enforce_profile_email_binding();
--   • accept_company_worker_invitation / accept_agency_worker_invitation as
--     defined in 0036_accept_worker_invitation_rpc.sql (profiles.email read);
--   • company_worker_invitations_select (0027) and
--     agency_worker_invitations_select (0025) with the profiles subselect.
-- ACLs on the two accept functions are re-stated exactly as 0036 stated them.
-- No table, column, grant on a table, or auth-schema object is touched in
-- either direction.

begin;

drop trigger if exists trg_profiles_email_binding on public.profiles;
drop function if exists public.enforce_profile_email_binding();

-- ── 0036 accept_company_worker_invitation, verbatim ────────────────────────
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

-- ── 0036 accept_agency_worker_invitation, verbatim ─────────────────────────
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

-- ── 0027 / 0025 invitee-side SELECT policies, verbatim ─────────────────────
drop policy if exists company_worker_invitations_select
  on public.company_worker_invitations;
create policy company_worker_invitations_select
  on public.company_worker_invitations for select
  using (
    public.owns_company(company_id)
    or invited_email = (select email from public.profiles where id = auth.uid())
    or public.is_admin()
  );

drop policy if exists agency_worker_invitations_select
  on public.agency_worker_invitations;
create policy agency_worker_invitations_select
  on public.agency_worker_invitations for select
  using (
    public.owns_agency(agency_id)
    or invited_email = (select email from public.profiles where id = auth.uid())
    or public.is_admin()
  );

commit;
