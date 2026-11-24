-- ============================================================================
-- 20260924120000 — companies_contact_minimization_v2
--
-- K2-1 v2 — company data minimization. Supersedes the UNAPPLIED draft
-- 20260902210000_companies_contact_minimization_v1 (PR #1430), which no
-- longer fits `main` (see below). RED by rule (privilege change + SECURITY
-- DEFINER). Ships DRAFT + needs-human-gate; the app half in the same PR falls
-- back to today's direct read until this is applied. The analysis behind it
-- lives in the owner channel (AGENTS.md: this repository is public).
--
-- @human-gate-approved
--   Acknowledged RED by route (REVOKE/GRANT + SECURITY DEFINER). NOT an
--   approval. Changes no data.
--
-- ----------------------------------------------------------------------------
-- WHY v1 CANNOT BE APPLIED AS DRAFTED
-- ----------------------------------------------------------------------------
--   Since #1859, lib/company/company-setup.ts `readCompanyByIdForAccess` (the
--   company doors, the agency workspace, the starter signals) reads the full
--   company row for the creator AND for every active membership in
--   ROLES_THAT_OPEN. v1's owner-only reader would break those reads and drop
--   managers and members; v1's app half no longer matches main.
--
-- ----------------------------------------------------------------------------
-- THE CHANGE — the same people keep the same rows
-- ----------------------------------------------------------------------------
--   1. `authenticated` keeps SELECT on the discovery columns (the ones the
--      joins `companies(display_name, legal_name)`, the start page, the market
--      map and the engagement invariants read). Row visibility for discovery
--      is unchanged.
--   2. ONE SECURITY DEFINER reader returns full rows to exactly the people the
--      app already shows them to: the creator (profile_id = auth.uid()), an
--      ACTIVE membership in ROLES_THAT_OPEN (owner, admin, manager,
--      external_manager, member — lib/company/organization-authority.ts) of
--      the organization bound to the company (organizations.legacy_company_id),
--      or a platform admin (is_admin()). The app keeps its own finer checks
--      (govern vs open) on top.
--   3. Writes untouched: the setup RPCs are SECURITY DEFINER and the UPDATE /
--      DELETE policies only reference columns that stay granted.
--
-- ORDER OF OPERATIONS (binding): the app half of this PR is merged and
--   DEPLOYED first (it falls back to the direct read while this function is
--   absent), THEN this file is applied via Supabase MCP apply_migration.
--   Applied before the deploy, the current app's reads of the full row fail.
--
-- ROLLBACK: supabase/rollbacks/20260924120000_companies_contact_minimization_v2.down.sql
--   (restores the whole-table SELECT grant, drops the reader).
-- ============================================================================

-- 1. Narrow the authenticated SELECT grant to the discovery columns. The
--    column-level revoke makes the result independent of any column grant a
--    later migration might have added.
revoke select on public.companies from authenticated;
revoke select (
  contact_email, contact_phone, address, registration_code, vat_number,
  requester_role, verification_note, requested_at
) on public.companies from authenticated;
grant select (
  id, profile_id, legal_name, display_name, company_type, country, website,
  description, verification_status, trust_score, created_at, updated_at
) on public.companies to authenticated;

-- 2. The one private reader: the rows the caller may already open.
create or replace function public.read_companies_private_v1()
returns setof public.companies
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.*
    from public.companies c
   where c.profile_id = auth.uid()
      or public.is_admin()
      or exists (
           select 1
             from public.organizations o
             join public.company_memberships m on m.organization_id = o.id
            where o.legacy_company_id = c.id
              and m.profile_id = auth.uid()
              and m.status = 'active'
              and m.role in ('owner', 'admin', 'manager', 'external_manager', 'member')
         );
$$;
revoke all on function public.read_companies_private_v1() from public;
revoke all on function public.read_companies_private_v1() from anon;
grant execute on function public.read_companies_private_v1() to authenticated;

comment on function public.read_companies_private_v1() is
  'K2-1 v2: company rows with the private contact columns, for the creator, an active ROLES_THAT_OPEN member of the bound organization, or a platform admin (the authenticated column grant no longer includes them).';

-- ROLLBACK
--   grant select on public.companies to authenticated;
--   drop function if exists public.read_companies_private_v1();
