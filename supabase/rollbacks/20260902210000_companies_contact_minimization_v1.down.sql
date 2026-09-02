-- ============================================================================
-- ROLLBACK for 20260902210000_companies_contact_minimization_v1
--
-- Restores the pre-migration state exactly: the full table SELECT grant for
-- `authenticated` (which is what re-exposes the contact columns — this is a
-- deliberate reversal, not a fix) and removes the two definer readers. The
-- app falls back to the direct table reads automatically (42883 / PGRST202
-- fallback in lib/company/company-private-read.ts).
-- ============================================================================

grant select on public.companies to authenticated;
drop function if exists public.admin_list_companies_private_v1();
drop function if exists public.list_own_companies_private_v1();
