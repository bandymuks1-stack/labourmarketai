-- ============================================================================
-- ROLLBACK for 20260727120000_secdef_public_grant_hygiene_v1
-- Security audit 2026-07-27, findings L-01 and L-08.
--
-- @human-gate-approved
--   Acknowledged RED: this file deliberately RE-GRANTS to PUBLIC, which is the
--   RLS/grant-loosening pattern the safety gate exists to flag. That is the
--   whole point of a rollback for a revoke — it must restore the prior, weaker
--   state. Applying it is an explicit owner decision, never automatic.
--
-- WHEN TO USE THIS. Only if revoking the implicit PUBLIC EXECUTE grant somehow
-- broke a caller. That should be impossible — the forward migration keeps the
-- EXPLICIT `anon` and `authenticated` grants, and PUBLIC is a superset of anon,
-- so nothing that worked before can lose access. If the public business-profile
-- page does break, the cause is far more likely a missing explicit grant than
-- the absent PUBLIC one; check `has_function_privilege('anon', ...)` FIRST and
-- prefer re-granting to `anon` over re-opening PUBLIC.
--
-- Restoring PUBLIC EXECUTE reinstates the exact idiom behind the 2026-07-22 P0.
-- Do not leave the database in this state.
-- ============================================================================

begin;

-- Undo L-01: restore the implicit PUBLIC EXECUTE grant.
grant execute on function public.get_public_business_profile_v1(text) to public;
grant execute on function public.get_public_business_listings_v1(uuid) to public;
grant execute on function public.get_public_business_services_v1(uuid) to public;

-- Undo L-08: return the trigger guard to a role-mutable search_path.
-- (Harmless in itself — the function is SECURITY INVOKER and all of its calls
-- are schema-qualified — but a rollback must be complete, not selective.)
alter function public.customer_requests_status_transition_guard()
  reset search_path;

commit;

-- ============================================================================
-- POST-ROLLBACK VERIFICATION (read-only)
--
--   -- Expect: each acl string again begins with '=X' (the PUBLIC grant).
--   select p.proname, array_to_string(p.proacl, ' | ') as acl
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('get_public_business_profile_v1',
--                        'get_public_business_listings_v1',
--                        'get_public_business_services_v1')
--    order by p.proname;
--
--   -- Expect: proconfig is null.
--   select p.proname, p.proconfig
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'customer_requests_status_transition_guard';
-- ============================================================================
