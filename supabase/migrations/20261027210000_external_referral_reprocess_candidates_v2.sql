-- 20261027210000_external_referral_reprocess_candidates_v2
-- @human-gate-approved (owner, 2026-10-28, in chat: apply + merge #2843)
--
-- RED tier: a new read-only SECURITY DEFINER function, service_role only.
-- Owner approval required before it is applied. No table, column, RLS policy,
-- row or existing function is changed (v1 stays as it is).
--
-- WHY (production, 2026-10-27 reprocess run): v1 lists only partner referrals
-- that were never sent. Once the newest referral of an address was sent, it
-- left the list, and an OLDER duplicate row of the same address became an
-- eligible candidate — the next run would have mailed that person a second
-- invitation. The send ledger's per-recipient ceiling (5/day) does not stop
-- that. The run was stopped before it happened.
--
-- WHAT: v2 returns the same rows as v1 plus `address_already_sent`: true when
-- ANY partner referral to the same address (case- and space-insensitive) is
-- already `delivery_status = 'sent'`. The caller excludes those rows
-- (`already_mailed_address`). Read-only: nothing is written.
--
-- ROLLBACK:
--   drop function if exists public.external_referral_reprocess_candidates_v2();
--   (rollback file: supabase/rollbacks/20261027210000_external_referral_reprocess_candidates_v2.down.sql)

create or replace function public.external_referral_reprocess_candidates_v2()
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
  address_already_sent boolean
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
                  where lower(u.email) = lower(trim(i.invited_email))),
         exists (select 1 from public.invitations s
                  where s.external_source_slug is not null
                    and s.delivery_status = 'sent'
                    and s.id <> i.id
                    and lower(trim(s.invited_email)) = lower(trim(i.invited_email)))
    from public.invitations i
   where i.external_source_slug is not null
     and i.status = 'pending'
     and i.delivery_status <> 'sent';
$$;

revoke all on function public.external_referral_reprocess_candidates_v2()
  from public, anon, authenticated;
grant execute on function public.external_referral_reprocess_candidates_v2()
  to service_role;
