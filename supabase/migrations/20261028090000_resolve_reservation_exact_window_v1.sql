-- 20261028090000_resolve_reservation_exact_window_v1
-- @human-gate-approved (owner, 2026-10-28, in chat: APPROVED #2858 at commit d0159eb — apply + merge; covers this migration only)
--
-- RED tier (needs-human-gate): replaces ONE service_role-only SECURITY DEFINER
-- function (same signature, same grants, same search_path). NOT applied —
-- production apply requires the owner's approval naming this PR. Follow-up to
-- #2855 (20261028070000, ledger 20261028081810); that approval does not cover
-- this file.
--
-- WHY (Codex review of #2855, P2): `resolve_external_referral_reservation_v1`
-- counted a ledger row up to ONE MINUTE BEFORE the reservation as proof of
-- this send. A provider attempt that failed (its ledger row stays) followed
-- within a minute by a new reservation that stopped before its own ledger
-- write would be resolved as `sent`, and that address would never be mailed.
-- Both timestamps come from the database (`now()` / `clock_timestamp()`), so
-- the window guarded against no real skew.
--
-- WHAT: the predicate becomes `l.sent_at >= v_row.delivery_reserved_at`.
-- Nothing else changes. No row is touched (production: 0 reservations).
--
-- ROLLBACK: supabase/rollbacks/20261028090000_resolve_reservation_exact_window_v1.down.sql

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

  -- Only a ledger row written for THIS reservation counts. Both clocks are
  -- the database's (delivery_reserved_at = now() of the reserving
  -- transaction; the ledger row's sent_at = clock_timestamp() of a later
  -- one), so no backward window: an earlier, failed attempt's ledger row must
  -- never mark this reservation as sent.
  select max(l.sent_at) into v_sent_at
    from public.email_send_ledger_v1 l
   where l.kind = 'invitation'
     and l.recipient_hash = p_ledger_hash
     and l.sent_at >= v_row.delivery_reserved_at;

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
