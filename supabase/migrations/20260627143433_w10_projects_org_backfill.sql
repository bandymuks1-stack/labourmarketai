-- ============================================================================
-- W10 stale-data backfill — projects.organization_id (owner-approved, APPLIED).
--
-- APPLIED to production on 2026-06-27 via Supabase MCP apply_migration
-- (ledger name `w10_projects_org_backfill`). This file is the repo record +
-- migration-safety coverage. Re-running is safe: the WHERE clause only touches
-- rows still org-less, so it is a no-op once applied. Never `db push`.
--
-- What it does: reroutes legacy DRAFT projects to the canonical organization via
-- the legacy bridge (organizations.legacy_company_id = projects.company_id),
-- ONLY for companies that map to EXACTLY ONE organization (ambiguity-guarded —
-- no guessing). Additive (sets a NULL column), non-destructive, reversible.
-- No other table or row is touched. Verified before/after: 4 rows updated, 0
-- remaining (projects with company_id set and organization_id NULL where a
-- deterministic 1:1 mapping exists).
--
-- ROLLBACK: supabase/rollbacks/20260627143433_w10_projects_org_backfill.down.sql
-- (scoped to exactly the 4 backfilled project ids).
--
-- @human-gate-approved   -- data-DML, owner-approved; applied via MCP, not auto-merge.
-- ============================================================================

update public.projects p
   set organization_id = o.id, updated_at = now()
  from public.organizations o
 where p.organization_id is null
   and p.company_id is not null
   and o.legacy_company_id = p.company_id
   and (select count(*) from public.organizations o2
         where o2.legacy_company_id = p.company_id) = 1;
