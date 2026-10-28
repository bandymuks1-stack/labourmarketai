-- Rollback for 20261028070000_referral_send_address_guard_v1
-- Restores BOTH functions verbatim as they are in production before this
-- migration (bodies verified 2026-10-28: md5(prosrc) c6e48da2… / 041f7a45…),
-- then drops the reservation column. The column holds only transient
-- reservations; the drop refuses while any reservation is set (an unknown
-- send outcome must be resolved first, never erased).
-- Apply via Supabase MCP apply_migration.

begin;

create or replace function public.reissue_external_referral_v1(
  p_invitation_id  uuid,
  p_new_token_hash text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
begin
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_token_hash';
  end if;

  select * into v_row from public.invitations where id = p_invitation_id for update;
  if not found or v_row.external_source_slug is null then
    return 'not_found';
  end if;
  if v_row.status <> 'pending' then
    return 'not_pending';
  end if;
  if v_row.delivery_status = 'sent' then
    return 'already_sent';
  end if;
  if v_row.consent_record is null
     or coalesce((v_row.consent_record ->> 'given')::boolean, false) is not true then
    return 'consent_required';
  end if;
  if v_row.expires_at is null or v_row.expires_at <= now() then
    return 'expired';
  end if;
  if coalesce(v_row.resend_count, 0) >= 3 then
    return 'resend_limit';
  end if;
  -- A "join the platform" mail to someone who already has an account is wrong.
  if exists (select 1 from auth.users u
              where lower(u.email) = lower(trim(v_row.invited_email))) then
    return 'has_account';
  end if;

  update public.invitations
     set token_hash   = p_new_token_hash,
         resend_count = coalesce(resend_count, 0) + 1
   where id = p_invitation_id;
  return 'ok';
end $$;

revoke all on function public.reissue_external_referral_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reissue_external_referral_v1(uuid, text)
  to service_role;

create or replace function public.mark_external_referral_delivery_v1(
  p_invitation_id uuid,
  p_outcome       text
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outcome not in ('sent','delivery_failed') then
    return 'invalid_outcome';
  end if;
  update public.invitations
     set delivery_status = p_outcome,
         last_sent_at = case when p_outcome = 'sent' then now() else last_sent_at end
   where id = p_invitation_id and external_source_slug is not null;
  if not found then
    return 'not_found';
  end if;
  return 'ok';
end $$;

revoke all on function public.mark_external_referral_delivery_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_external_referral_delivery_v1(uuid, text)
  to service_role;

drop function if exists public.reserve_external_referral_send_v1(uuid);

do $$
begin
  if exists (select 1 from public.invitations where delivery_reserved_at is not null) then
    raise exception 'delivery_reserved_at still set on some rows: resolve those send outcomes before rollback';
  end if;
end $$;

alter table public.invitations drop column if exists delivery_reserved_at;

commit;
