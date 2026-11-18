-- ============================================================================
-- 20261008210000 — five RLS-protected tables were never GRANTed to
-- `authenticated`, so every policy on them is unreachable.
--
-- RED by rule (GRANT on existing tables). Apply only via Supabase MCP
-- apply_migration, after the owner approves the exact SQL below.
-- @human-gate-approved
--
-- DEFECT (production, 2026-10-08). `public` has no default privileges for
-- `authenticated`, so a table created without an explicit GRANT is readable by
-- its owner only. These five were created on 2026-09-30 with RLS policies
-- written FOR `authenticated` but no GRANT, so Postgres refuses every read with
-- 42501 BEFORE any policy runs:
--
--   account_classifications    20260930100000  marketplace.funnel.get always
--                                              returns "The account
--                                              classification read failed."
--   organization_identifiers   20260930110000  company ingest: "The existing-
--                                              company match read failed."
--   organization_facts         20260930110000  company ingest fact read-back
--   organization_claims        20260930110000  a claimant cannot see own claim
--   platform_capability_grants 20260930110000  a person cannot see own grants
--
-- WHAT. SELECT only, to `authenticated` only. Every row stays behind the
-- policies that already exist (verified in production 2026-10-08):
--   account_classifications    is_admin() OR profile_id = auth.uid()
--   organization_identifiers   is_admin() OR has_platform_capability(...)
--   organization_facts           OR belongs_to_organization(organization_id)
--   organization_claims        claimant_profile_id = auth.uid() OR is_admin()
--                                OR has_platform_capability(...)
--   platform_capability_grants is_admin() OR profile_id = auth.uid()
-- No `(true)` predicate, nothing for anon/public, no write privilege (writes
-- stay on the SECURITY DEFINER functions / admin channel exactly as today), no
-- policy, function or data change.
--
-- ROLLBACK: supabase/rollbacks/20261008210000_rls_tables_missing_select_grant_v1.down.sql
-- ============================================================================

begin;

grant select on public.account_classifications    to authenticated;
grant select on public.organization_identifiers   to authenticated;
grant select on public.organization_facts         to authenticated;
grant select on public.organization_claims        to authenticated;
grant select on public.platform_capability_grants to authenticated;

commit;
