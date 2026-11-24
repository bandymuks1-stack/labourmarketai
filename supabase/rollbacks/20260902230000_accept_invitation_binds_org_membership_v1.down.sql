-- ROLLBACK for 20260902230000_accept_invitation_binds_org_membership_v1.sql
--
-- Restores `accept_company_worker_invitation` EXACTLY as production carried it
-- on 2026-09-08, captured from `pg_get_functiondef` before the forward
-- migration was written — not reconstructed from the 2026-09-02 branch, whose
-- copy was already 227 commits stale.
--
-- WARNING, stated plainly: running this REINTRODUCES the defect. An accepted
-- company worker is linked into `company_workers` and gets no
-- `engagement_contexts` row, so `belongs_to_organization` stays false for them
-- and six RLS policies keep them out of their own employer's data — including
-- the `organizations` row itself.
--
-- It exists because a migration must be reversible, not because reversing it is
-- a good idea. Prefer fixing forward.
--
-- No data is touched in either direction: no row this function previously wrote
-- is deleted, and any `engagement_contexts` row the forward version created
-- REMAINS after a rollback. That is deliberate — those rows record a true
-- relationship the person actually accepted, and deleting them would remove
-- real evidence to undo a code change. It also means rollback is not a clean
-- inverse of state, only of behaviour, and that is the honest description.

create or replace function public.accept_company_worker_invitation(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
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
end $function$;

-- The forward migration closes anon reach explicitly; the rollback must
-- close it too, or reverting would re-open this SECURITY DEFINER function
-- to anon on any database whose default privileges grant EXECUTE.
revoke all on function public.accept_company_worker_invitation(uuid) from anon;
revoke all on function public.accept_company_worker_invitation(uuid) from public;
grant execute on function public.accept_company_worker_invitation(uuid) to authenticated;
