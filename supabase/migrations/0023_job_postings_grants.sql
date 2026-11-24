-- ════════════════════════════════════════════════════════════════════════
-- 0023_job_postings_grants.sql — explicit GRANTs so a company-role user
-- can create + list + manage their own job postings end-to-end.
--
-- This project uses explicit grants (see 0004 header). The
-- `companies`, `projects`, and `job_demands` tables were created in
-- 0001 with RLS policies but NO grants for the `authenticated` role.
-- The pilot drafts table (0016) already showed the pattern; this
-- migration mirrors it for the job-posting tables that the company
-- dashboard wires up in PR feat/job-postings-v1.
--
-- ADDITIVE / non-destructive. Forward-only. No data changes; no
-- column changes; no policy changes — only role-level table grants.
-- The existing RLS policies (companies_*, projects_*, job_demands_*)
-- continue to gate per-row access exactly as before.
--
-- This file is COMMITTED in this PR. Production apply: per
-- CLAUDE.md "Running migrations on production — NEVER automatic.";
-- DI runs it via Supabase SQL Editor or local CLI. Safe to apply
-- before or after the code merges — the only failure mode while it
-- is not applied is that the new server actions return a tagged
-- {ok: false, code: "permission_denied"} until DI applies, and the
-- UI shows the LT/EN error message verbatim.
-- ════════════════════════════════════════════════════════════════════════

-- companies: SELECT only — needed so the server action can resolve
-- the authenticated user's company_id via
-- `SELECT id FROM companies WHERE profile_id = auth.uid()`.
-- INSERT / UPDATE / DELETE intentionally stay un-granted here; they
-- live in the onboarding / settings surfaces and will be granted in
-- the migration that ships those flows.
grant select on public.companies to authenticated;

-- projects: SELECT + INSERT + UPDATE so a company-role user can
-- create a project (one per job posting, in v1) and update its
-- status. DELETE intentionally omitted — projects are soft-closed by
-- setting status='closed', never hard-deleted by the user.
grant select, insert, update on public.projects to authenticated;

-- job_demands: full CRUD scoped by the existing RLS policy
-- `job_demands_write` (admin OR `owns_company(project.company_id)`).
-- DELETE is granted but in practice the UI soft-closes via
-- status='closed' / visibility='direct_only'; a future "permanently
-- remove" affordance can use the DELETE grant when shipped.
grant select, insert, update, delete on public.job_demands to authenticated;

-- Deliberately NOT granted: service_role. service_role would bypass
-- RLS entirely; the table is intentionally invisible to it outside
-- the matching-engine writer which lives in a separate Supabase
-- function (not this app's API surface).
