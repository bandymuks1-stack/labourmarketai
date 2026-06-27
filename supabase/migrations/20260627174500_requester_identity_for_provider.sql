-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- Requester identity for the provider inbox (Option A — enrichment RPC).
--
-- PROBLEM: the provider inbox (service_offering_requests where provider_id =
-- auth.uid()) can show the buyer's message but NOT the buyer's name, because
-- profiles RLS is own-profile-only ((id = auth.uid()) OR is_admin()) — a provider
-- cannot read the buyer's profile row. The provider needs a minimum-safe
-- requester identity to decide whether to accept / decline / respond.
--
-- SOLUTION: ONE new SECURITY DEFINER *read* function that returns, for a set of
-- request ids, ONLY the requester's display name (profiles.full_name) and ONLY
-- for requests addressed to the calling provider. It is additive: no table, no
-- column, no RLS policy, no grant on any table changes. Existing inbox reads keep
-- working under their RLS; the app enriches them with this function and degrades
-- gracefully (no name) when the function is absent.
--
-- PRIVACY BOUNDARY (the function projection IS the boundary):
--   * EXPOSES only full_name (display name), and only for requests where the
--     caller is the provider (r.provider_id = auth.uid(), re-checked at fire time).
--   * NEVER exposes email, phone, country/location, profile_text, consent flags,
--     avatar, buyer_id, or any other profile field.
--   * No broad profiles SELECT, no anon/public grant, no using(true).
--
-- ROLLBACK: supabase/rollbacks/20260627174500_requester_identity_for_provider.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

-- Minimum-safe requester identity for the provider inbox. Returns one row per
-- matching request id, carrying ONLY the display name. The WHERE clause is the
-- authority + scope check: a caller only ever receives identities for requests
-- whose provider is the caller. Unauthenticated → auth.uid() is null → 0 rows.
create or replace function public.requester_identities_for_provider(p_request_ids uuid[])
returns table (request_id uuid, display_name text)
language sql security definer set search_path = public stable as $$
  select r.id, p.full_name
  from public.service_offering_requests r
  join public.profiles p on p.id = r.buyer_id
  where r.id = any(p_request_ids)
    and r.provider_id = auth.uid();
$$;

revoke all on function public.requester_identities_for_provider(uuid[]) from public;
grant execute on function public.requester_identities_for_provider(uuid[]) to authenticated;

commit;
