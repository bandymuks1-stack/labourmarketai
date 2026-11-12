-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261112180000_decline_invitation_by_id_v1
--
-- A person can ACCEPT an invitation from their own list (accept_invitation_by_id_v2) but can only
-- DECLINE it from the invitation link (decline_invitation_v2 takes the link's token, and the list
-- holds ids, not tokens). An invitation that reached someone without its e-mail could therefore be
-- accepted in one click and never refused.
--
-- ONE new function, the by-id twin of decline_invitation_v2:
--
--   decline_invitation_by_id_v1(p_invitation_id uuid) returns jsonb
--
-- GATE: copied from accept_invitation_by_id_v2, unchanged. The caller must be signed in, hold a
-- VERIFIED mailbox (session_email_verified_v1), and that mailbox must equal the invitation's
-- invited_email. Anything else answers 'not_found', so the function cannot be used to learn whether
-- an invitation id exists.
--
-- BODY: copied from decline_invitation_v2, unchanged: an earlier acceptance by this person wins;
-- a non-pending or expired invitation answers its own state; otherwise the person's decision row is
-- written as 'declined', a single-use invitation is closed, and one audit_logs row is written.
--
-- NOT TOUCHED: no table, column, policy, trigger or existing function changes. decline_invitation_v2
-- and both accept doors keep their bodies and grants.
--
-- SAFETY CLASS: RED (SECURITY DEFINER function, GRANT/REVOKE). ZERO existing rows change at apply
-- time. Rollback: supabase/rollbacks/20261112180000_decline_invitation_by_id_v1.down.sql.
-- ============================================================================

create or replace function public.decline_invitation_by_id_v1(p_invitation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- The by-id door is the EMAIL-asserted door: only a VERIFIED mailbox may use it.
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_unverified');
  end if;
  select * into v_row from public.invitations
   where id = p_invitation_id
   for update;
  -- A stranger learns nothing: a missing id and someone else's invitation answer the same.
  if not found or v_row.invited_email is null or v_email = ''
     or lower(v_row.invited_email) <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if exists (select 1 from public.invitation_acceptances
              where invitation_id = v_row.id and profile_id = uid
                and decision = 'accepted') then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  insert into public.invitation_acceptances (invitation_id, profile_id, decision)
  values (v_row.id, uid, 'declined')
  on conflict (invitation_id, profile_id) do update
    set decision = 'declined', decided_at = now();

  if v_row.max_uses = 1 then
    update public.invitations
       set status = 'declined', declined_at = now()
     where id = v_row.id;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'decline_invitation_by_id_v1', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'max_uses', v_row.max_uses));

  return jsonb_build_object('outcome', 'declined',
    'invitation_type', v_row.invitation_type);
end $function$;

revoke all on function public.decline_invitation_by_id_v1(uuid) from public, anon;
grant execute on function public.decline_invitation_by_id_v1(uuid) to authenticated;
