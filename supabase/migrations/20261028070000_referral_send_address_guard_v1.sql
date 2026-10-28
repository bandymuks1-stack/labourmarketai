-- 20261028070000_referral_send_address_guard_v1
--
-- RED tier (needs-human-gate): adds one nullable column and replaces two
-- service_role-only SECURITY DEFINER functions (same signatures, same grants).
-- NOT applied — production apply requires the owner's approval naming this PR.
-- No RLS policy, row or other function changes.
--
-- WHY (coordination register D-3, 2026-10-28): the partner referral reprocess
-- mailed 48 distinct addresses with no duplicate, but the protection against a
-- second mail to ONE address lived outside the database: the candidate list
-- (`external_referral_reprocess_candidates_v2`) and TypeScript dedupe by
-- normalized address, and `flock` on the VPS serializes runs. Inside
-- `reissue_external_referral_v1` only the ROW was locked, and the row is
-- marked `sent` only AFTER the mail leaves. Two overlapping runs — or one run
-- over two duplicate rows of the same address — could therefore each reissue
-- and mail the same person.
--
-- WHAT:
--   * `invitations.delivery_reserved_at` (nullable): set by a successful
--     reissue = "a mail for this row is being sent now"; cleared by
--     `mark_external_referral_delivery_v1` (sent or delivery_failed).
--   * `reissue_external_referral_v1` takes a transaction advisory lock on the
--     NORMALIZED address (lower(trim())) before it locks the row, then refuses:
--       'address_already_sent' — any partner row of that address is `sent`;
--       'address_reserved'     — any partner row of that address holds a
--                                reservation. A reservation that was never
--                                cleared means a run stopped mid-send and the
--                                outcome is UNKNOWN; it is never retried
--                                automatically (an operator checks the send
--                                ledger and clears it by hand).
--     Every earlier refusal (not_pending, already_sent, consent, expiry,
--     resend limit, has_account) stays as it was.
--   * `reserve_external_referral_send_v1(id)` — the SAME address lock and the
--     same two refusals for the partner INTAKE path
--     (lib/invitations/external-referral-receive.ts), which creates a row per
--     partner lead id and mails it at once. Without it, a partner sending the
--     same person under a new lead id would mail that address again (74 rows
--     held 72 addresses on 2026-10-28). Intake now mails only after 'ok'.
--   * All three functions pin `search_path = public, pg_temp` (pg_temp last).
--
-- HISTORY: no existing row is updated. The 48 sent rows keep their
-- delivery_status, last_sent_at, resend_count and token_hash; the new column
-- starts NULL everywhere.
--
-- ROLLBACK: supabase/rollbacks/20261028070000_referral_send_address_guard_v1.down.sql

begin;

alter table public.invitations
  add column if not exists delivery_reserved_at timestamptz;

comment on column public.invitations.delivery_reserved_at is
  'Partner referral reprocess: set when a fresh link is reserved for sending, cleared when the outcome is marked. Non-null after a run = outcome unknown; never auto-retried.';

create or replace function public.reissue_external_referral_v1(
  p_invitation_id  uuid,
  p_new_token_hash text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_row public.invitations%rowtype;
begin
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_token_hash';
  end if;

  -- The address lock comes BEFORE the row lock, so every caller takes the two
  -- in the same order (no deadlock between two rows of one address).
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
  if v_row.status <> 'pending' then
    return 'not_pending';
  end if;
  if v_row.delivery_status = 'sent' then
    return 'already_sent';
  end if;
  if exists (select 1 from public.invitations o
              where o.external_source_slug is not null
                and lower(trim(o.invited_email)) = v_email
                and o.delivery_status = 'sent') then
    return 'address_already_sent';
  end if;
  if exists (select 1 from public.invitations o
              where o.external_source_slug is not null
                and lower(trim(o.invited_email)) = v_email
                and o.delivery_reserved_at is not null) then
    return 'address_reserved';
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
              where lower(u.email) = v_email) then
    return 'has_account';
  end if;

  update public.invitations
     set token_hash           = p_new_token_hash,
         resend_count         = coalesce(resend_count, 0) + 1,
         delivery_reserved_at = now()
   where id = p_invitation_id;
  return 'ok';
end $$;

revoke all on function public.reissue_external_referral_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reissue_external_referral_v1(uuid, text)
  to service_role;

create or replace function public.reserve_external_referral_send_v1(
  p_invitation_id uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_row public.invitations%rowtype;
begin
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
  if v_row.delivery_status = 'sent' then
    return 'already_sent';
  end if;
  if exists (select 1 from public.invitations o
              where o.external_source_slug is not null
                and lower(trim(o.invited_email)) = v_email
                and o.delivery_status = 'sent') then
    return 'address_already_sent';
  end if;
  if exists (select 1 from public.invitations o
              where o.external_source_slug is not null
                and lower(trim(o.invited_email)) = v_email
                and o.delivery_reserved_at is not null) then
    return 'address_reserved';
  end if;

  update public.invitations
     set delivery_reserved_at = now()
   where id = p_invitation_id;
  return 'ok';
end $$;

revoke all on function public.reserve_external_referral_send_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_external_referral_send_v1(uuid)
  to service_role;

create or replace function public.mark_external_referral_delivery_v1(
  p_invitation_id uuid,
  p_outcome       text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_outcome not in ('sent','delivery_failed') then
    return 'invalid_outcome';
  end if;
  update public.invitations
     set delivery_status      = p_outcome,
         last_sent_at         = case when p_outcome = 'sent' then now() else last_sent_at end,
         delivery_reserved_at = null
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

commit;
