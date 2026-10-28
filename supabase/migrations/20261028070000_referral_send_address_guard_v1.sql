-- 20261028070000_referral_send_address_guard_v1
-- @human-gate-approved (owner, 2026-10-28, in chat: APPROVED #2855 at commit 35e749fc3 — apply + merge; covers this migration only)
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
--   * `external_referral_reprocess_candidates_v3()` — v2's columns plus the
--     row's `delivery_reserved_at` and `address_reserved`, so the runner leaves
--     a reserved address out BEFORE it picks the control row or the batch of
--     20 (a stuck reservation must never occupy a slot). v2 stays as it is.
--   * `resolve_external_referral_reservation_v1(id, ledger_hash)` — recovery of
--     a reservation a stopped run left behind, never a second mail. The send
--     ledger row is written BEFORE the provider call (reserve_email_send_v1,
--     then send), so under the same address lock:
--       ledger row for that recipient at/after the reservation → the mail may
--         have gone: mark the row `sent` ('resolved_sent'), never re-mailed;
--       no ledger row and the reservation is older than 15 minutes → the send
--         never started: clear the reservation ('released');
--       younger than 15 minutes → may still be in flight: nothing ('in_flight').
--     The caller passes the ledger hash of the row's own address (the salt
--     lives in the app); service_role only. "No ledger row" proves "no provider
--     call" because partner referral sends fail CLOSED when the ledger cannot be
--     written (`requireLedger` in lib/email/send-ledger-store.ts).
--   * `external_referral_reserved_rows_v1()` — EVERY partner row holding a
--     reservation, whatever its status (a person may accept or decline before
--     recovery runs), so recovery never misses one.
--   * All six functions pin `search_path = public, pg_temp` (pg_temp last).
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

create or replace function public.external_referral_reprocess_candidates_v3()
returns table (
  id uuid,
  invited_email text,
  locale text,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  delivery_status text,
  consent_given boolean,
  external_source_slug text,
  has_account boolean,
  address_already_sent boolean,
  delivery_reserved_at timestamptz,
  address_reserved boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.invited_email, i.locale, i.created_at, i.expires_at, i.status,
         i.delivery_status,
         coalesce((i.consent_record ->> 'given')::boolean, false),
         i.external_source_slug,
         exists (select 1 from auth.users u
                  where lower(u.email) = lower(trim(i.invited_email))),
         exists (select 1 from public.invitations s
                  where s.external_source_slug is not null
                    and s.delivery_status = 'sent'
                    and s.id <> i.id
                    and lower(trim(s.invited_email)) = lower(trim(i.invited_email))),
         i.delivery_reserved_at,
         exists (select 1 from public.invitations r
                  where r.external_source_slug is not null
                    and r.delivery_reserved_at is not null
                    and lower(trim(r.invited_email)) = lower(trim(i.invited_email)))
    from public.invitations i
   where i.external_source_slug is not null
     and i.status = 'pending'
     and i.delivery_status <> 'sent';
$$;

revoke all on function public.external_referral_reprocess_candidates_v3()
  from public, anon, authenticated;
grant execute on function public.external_referral_reprocess_candidates_v3()
  to service_role;

create or replace function public.external_referral_reserved_rows_v1()
returns table (
  id uuid,
  invited_email text,
  status text,
  delivery_status text,
  delivery_reserved_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.invited_email, i.status, i.delivery_status, i.delivery_reserved_at
    from public.invitations i
   where i.external_source_slug is not null
     and i.delivery_reserved_at is not null;
$$;

revoke all on function public.external_referral_reserved_rows_v1()
  from public, anon, authenticated;
grant execute on function public.external_referral_reserved_rows_v1()
  to service_role;

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
