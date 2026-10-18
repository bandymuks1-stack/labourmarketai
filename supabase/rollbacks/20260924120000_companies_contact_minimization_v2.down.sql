-- ============================================================================
-- ROLLBACK for 20260924120000_companies_contact_minimization_v2
--
-- Restores the pre-migration state exactly: the whole-table SELECT grant for
-- `authenticated` (which is what re-exposes the private contact columns —
-- a deliberate reversal, not a fix) and removes the private reader. The app
-- falls back to the direct table reads automatically (42883 / PGRST202
-- fallback in apps/web/lib/company/company-private-read.ts).
-- ============================================================================

grant select on public.companies to authenticated;
drop function if exists public.read_companies_private_v1();
