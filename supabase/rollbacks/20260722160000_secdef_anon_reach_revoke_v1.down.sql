-- =====================================================================
-- PAIRED ROLLBACK for 20260722160000_secdef_anon_reach_revoke_v1.sql
--
-- THIS FILE DELIBERATELY DOES NOT REVERSE THE SECURITY CHANGE.
--
-- Owner directive, 2026-07-22 (`OWNER GATE DECISION — APPROVED WITH STRICT
-- SCOPE`), verbatim in effect:
--
--     An automatic rollback may NOT re-grant PUBLIC, may NOT re-grant anon,
--     and may NOT restore the 47 anon-reachable functions. If a legitimate
--     authenticated path breaks, the fix is a targeted
--     `GRANT ... TO authenticated` on the specific approved signature —
--     never restoring PUBLIC.
--
-- That directive is correct and is encoded here rather than merely documented.
-- Restoring the default PUBLIC EXECUTE grant is precisely the mechanism that
-- made the 2026-07-22 P0 exploitable; a rollback script that quietly re-opened
-- it during an incident would be the worst possible failure mode, because it
-- would run under time pressure and look routine.
--
-- WHAT THE FORWARD MIGRATION ACTUALLY DID
--   * removed PUBLIC + anon EXECUTE on 43 SECURITY DEFINER functions;
--   * added an explicit `GRANT ... TO authenticated` on 8 of them whose
--     `proacl` was NULL (previously inheriting from PUBLIC).
--
-- It created nothing, dropped nothing, altered no table, policy, trigger or
-- function body, and wrote no data. There is therefore NO state to restore —
-- only privileges, and the removed privileges are the fix itself.
--
-- THE ONLY SUPPORTED REMEDIATION
-- ------------------------------
-- If a legitimate logged-in path returns `42501 permission denied for function`,
-- identify the exact signature from the error and grant that one signature:
--
--     grant execute on function public.<name>(<exact identity args>) to authenticated;
--
-- Use `pg_get_function_identity_arguments` to obtain the signature; do not
-- guess, and do not widen the grant to PUBLIC or anon to make an error go away.
--
-- Running this file is idempotent and safe: it re-asserts the `authenticated`
-- grants the forward migration added, which repairs the single realistic
-- failure mode (a lost helper grant) without re-opening anonymous access.
-- =====================================================================

begin;

-- Re-assert the 8 authenticated grants added by the forward migration.
-- Idempotent. These are the only functions whose `authenticated` access
-- depends on that migration; the other 25 authenticated-only functions hold
-- their own direct grants and are unaffected either way.
grant execute on function public.can_access_match(m uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_employer() to authenticated;
grant execute on function public.manages_organization(org uuid) to authenticated;
grant execute on function public.owns_agency(a uuid) to authenticated;
grant execute on function public.owns_company(c uuid) to authenticated;
grant execute on function public.owns_worker(w uuid) to authenticated;
grant execute on function public.profile_role() to authenticated;

-- Deliberately absent, and must stay absent:
--   grant execute on function ... to public;   -- re-opens the P0 mechanism
--   grant execute on function ... to anon;     -- re-opens anonymous access

commit;
