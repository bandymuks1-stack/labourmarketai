-- 20261027120000_reissue_external_referral_v1
-- @human-gate-approved (owner, 2026-10-27, in chat: apply + merge #2841)
--
-- RED tier: a new SECURITY DEFINER function. Owner approval required before
-- it is applied. No table, column, RLS policy, row or existing function is
-- changed.
--
-- WHY (production, read-only, 2026-10-27): partner referrals (Nonstop) were
-- stored while no e-mail provider was configured, so their invitation was
-- never sent (`delivery_status = 'not_sent'`). The raw token existed only in
-- the partner's API response; the database keeps sha256(token), so the
-- original link cannot be re-sent. These rows have no inviter, which means
-- `resend_invitation_v1` (inviter or organization authority) refuses them.
--
-- WHAT: one service_role-only function that rotates the token of ONE such
-- referral so the platform can e-mail a fresh link — and only when every
-- condition the owner set holds:
--   * a partner referral (`external_source_slug` present), still `pending`;
--   * never delivered (`delivery_status <> 'sent'`);
--   * a consent record that says `given = true`;
--   * NOT expired — the expiry is kept as it is, never extended;
--   * fewer than 3 reissues (a hard ceiling against loops);
--   * the address has no account yet.
-- A second, read-only function lists the partner referrals with an
-- `has_account` flag so the caller's dry run counts exactly what would be
-- sent (it returns rows only to service_role; nothing is written).
-- The caller (lib/invitations/external-referral-reprocess.ts) deduplicates by
-- address, skips people who already have an account, caps each run and sends
-- through the existing ledgered provider path.
--
-- ROLLBACK:
--   drop function if exists public.reissue_external_referral_v1(uuid, text);
--   drop function if exists public.external_referral_reprocess_candidates_v1();

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

create or replace function public.external_referral_reprocess_candidates_v1()
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
  has_account boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.invited_email, i.locale, i.created_at, i.expires_at, i.status,
         i.delivery_status,
         coalesce((i.consent_record ->> 'given')::boolean, false),
         i.external_source_slug,
         exists (select 1 from auth.users u
                  where lower(u.email) = lower(trim(i.invited_email)))
    from public.invitations i
   where i.external_source_slug is not null
     and i.status = 'pending'
     and i.delivery_status <> 'sent';
$$;

revoke all on function public.external_referral_reprocess_candidates_v1()
  from public, anon, authenticated;
grant execute on function public.external_referral_reprocess_candidates_v1()
  to service_role;
