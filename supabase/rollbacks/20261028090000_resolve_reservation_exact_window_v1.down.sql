-- Rollback for 20261028090000_resolve_reservation_exact_window_v1
-- Restores resolve_external_referral_reservation_v1 exactly as 20261028070000
-- applied it (ledger 20261028081810, md5(prosrc) 0c653152…). No data impact.
-- Apply via Supabase MCP apply_migration.

begin;

create or replace function public.resolve_external_referral_reservation_v1(
  p_invitation_id uuid,
  p_ledger_hash   text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_row public.invitations%rowtype;
  v_sent_at timestamptz;
begin
  if p_ledger_hash is null or p_ledger_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_ledger_hash';
  end if;
  select lower(trim(invited_email)) into v_email
    from public.invitations where id = p_invitation_id;
  if v_email is null or v_email = '' then
    return 'not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('referral_send:' || v_email, 0));

  select * into v_row from public.invitations where id = p_invitation_id for update;
  if not found or v_row.external_source_slug is null then
    return 'not_found';
  end if;
  if v_row.delivery_reserved_at is null then
    return 'not_reserved';
  end if;

  -- One minute of clock skew between the app's ledger write and now().
  select max(l.sent_at) into v_sent_at
    from public.email_send_ledger_v1 l
   where l.kind = 'invitation'
     and l.recipient_hash = p_ledger_hash
     and l.sent_at >= v_row.delivery_reserved_at - interval '1 minute';

  if v_sent_at is not null then
    update public.invitations
       set delivery_status      = 'sent',
           last_sent_at         = v_sent_at,
           delivery_reserved_at = null
     where id = p_invitation_id;
    return 'resolved_sent';
  end if;
  if v_row.delivery_reserved_at > now() - interval '15 minutes' then
    return 'in_flight';
  end if;
  update public.invitations
     set delivery_reserved_at = null
   where id = p_invitation_id;
  return 'released';
end $$;

revoke all on function public.resolve_external_referral_reservation_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_external_referral_reservation_v1(uuid, text)
  to service_role;

commit;
