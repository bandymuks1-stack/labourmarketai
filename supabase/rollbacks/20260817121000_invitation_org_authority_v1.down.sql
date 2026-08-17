-- Rollback for 20260817121000_invitation_org_authority_v1.sql
-- Restores the exact live 2026-08-17 (pre-migration) definitions captured
-- from production pg_get_functiondef / pg_policy before the change, then
-- drops the helper. Manual apply via Supabase MCP only.

begin;

-- ── Policy: back to inviter-or-admin (role public, as before) ──────────────
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select
  using (inviter_profile_id = auth.uid() or public.is_admin());

-- ── revoke_invitation_v1: original inviter-or-admin body ───────────────────
create or replace function public.revoke_invitation_v1(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select inviter_profile_id, status into v_inviter, v_status
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter <> uid and not public.is_admin() then return 'not_authorized'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;

  update public.invitations
     set status = 'revoked', revoked_at = now()
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'revoke_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'revoked'));
  return 'revoked';
end $$;

-- ── resend_invitation_v1: original inviter-only body ───────────────────────
create or replace function public.resend_invitation_v1(p_invitation_id uuid, p_new_token_hash text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
  v_resends int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_token_hash';
  end if;
  select inviter_profile_id, status, resend_count
    into v_inviter, v_status, v_resends
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter <> uid then return 'not_authorized'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_resends >= 10 then return 'resend_limit'; end if;

  update public.invitations
     set token_hash = p_new_token_hash,
         expires_at = now() + interval '14 days',
         last_sent_at = null,
         delivery_status = 'not_sent',
         resend_count = resend_count + 1
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'resend_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'token_rotated', 'resend_count', v_resends + 1));
  return 'ok';
end $$;

-- ── mark_invitation_delivery_v1: original inviter-only body ────────────────
create or replace function public.mark_invitation_delivery_v1(p_invitation_id uuid, p_outcome text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_outcome not in ('sent','delivery_failed') then return 'invalid_outcome'; end if;
  select inviter_profile_id into v_inviter
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter <> uid then return 'not_authorized'; end if;

  update public.invitations
     set delivery_status = p_outcome,
         last_sent_at = case when p_outcome = 'sent' then now() else last_sent_at end
   where id = p_invitation_id;
  return 'ok';
end $$;

-- ── Helper removal (nothing references it after the restores above) ────────
drop function if exists public.invitation_org_authority_v1(uuid);


-- Re-state grants for every REDEFINED SECURITY DEFINER function above:
-- `create or replace` preserves live grants in production, but a fresh local
-- reset replays this file into default privileges (PUBLIC EXECUTE). The
-- secdef-local-reset-reproducibility guard requires file-local revokes.
revoke all on function public.revoke_invitation_v1(uuid) from public;
revoke all on function public.revoke_invitation_v1(uuid) from anon;
grant execute on function public.revoke_invitation_v1(uuid) to authenticated;
revoke all on function public.resend_invitation_v1(uuid, text) from public;
revoke all on function public.resend_invitation_v1(uuid, text) from anon;
grant execute on function public.resend_invitation_v1(uuid, text) to authenticated;
revoke all on function public.mark_invitation_delivery_v1(uuid, text) from public;
revoke all on function public.mark_invitation_delivery_v1(uuid, text) from anon;
grant execute on function public.mark_invitation_delivery_v1(uuid, text) to authenticated;

commit;
