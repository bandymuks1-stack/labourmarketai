-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply via Supabase MCP apply_migration by the lead session after review.
-- Never `db push`.
--
-- 20260817120000 — catalog least-privilege SELECT v1 (security train A, Fix B).
--
-- PROBLEM (2026-08-17 security-advisor triage). Three catalog tables carry a
-- bare `using (true)` SELECT policy addressed to `public` (all roles):
--
--   productivity_units_select      using (true)
--   profession_templates_select    using (true)
--   skill_icons_select             using (true)
--
-- Measured live before writing this file:
--   * all three tables have an `organization_id` column (nullable) — the
--     schema is built to hold ORG-OWNED rows, not only platform rows;
--   * today every row is platform-scoped (productivity_units: 10 rows all
--     scope='platform', organization_id count 0; profession_templates: 1
--     platform default, 0 org rows; skill_icons: 6 platform defaults, 0 org
--     rows);
--   * `anon` holds NO table grant on any of the three (only `authenticated`
--     has SELECT), so the practical exposure today is "every authenticated
--     user sees every row".
--
-- That is fine while only platform rows exist and silently becomes a
-- cross-tenant leak the day the first org-scoped unit/template/icon row is
-- inserted: `using (true)` would hand org A's custom catalog to org B. This
-- migration closes the gap BEFORE any org row exists, so it changes the
-- visible result set of exactly ZERO current rows.
--
-- CLASSIFICATION (per-table, from live data + code readers):
--   * productivity_units    — authenticated shared catalog + future org rows.
--   * profession_templates  — authenticated shared catalog + future org rows.
--   * skill_icons           — authenticated shared catalog + future org rows.
-- None is a genuinely-anonymous public catalog: anon has no grant, and no
-- anon-context reader exists in the app.
--
-- THE CHANGE. Per table, replace the SELECT policy with:
--   to authenticated
--   using (
--     organization_id is null            -- platform catalog: shared
--     or public.is_admin()
--     or <caller belongs to that organization>
--   )
-- "Belongs" admits BOTH membership systems the repo uses (mirroring the
-- shape of public.manages_organization, but WITHOUT the manager-role
-- restriction — catalogs must be readable by every active member/worker of
-- the org, not only managers):
--   * an active company_memberships row (any role), and
--   * an active engagement_contexts row (any relationship).
-- Revoked/removed members (status <> 'active') lose org-row visibility by
-- construction. Platform rows stay visible to all authenticated users.
--
-- Admin-only write policies (`*_write` using/check is_admin()) are correct
-- and untouched.
--
-- COMPATIBILITY. Zero behaviour change for current data: every existing row
-- has organization_id IS NULL and every existing reader is authenticated.
--
-- @human-gate-approved — policy correction (least-privilege narrowing of
-- three SELECT policies; no schema change, no data change, no new SECDEF
-- function). Pre-approved by owner mandate 2026-08-17 (autonomous functional
-- completion train V2, §4 migration authority); production apply stays with
-- the lead session via Supabase MCP.
--
-- ROLLBACK: supabase/rollbacks/20260817120000_catalog_least_privilege_v1.down.sql
-- ============================================================================

begin;

-- ── productivity_units ──────────────────────────────────────────────────────
drop policy if exists productivity_units_select on public.productivity_units;
create policy productivity_units_select on public.productivity_units
  for select
  to authenticated
  using (
    organization_id is null
    or public.is_admin()
    or exists (
      select 1 from public.company_memberships m
       where m.organization_id = productivity_units.organization_id
         and m.profile_id = auth.uid()
         and m.status = 'active'
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.organization_id = productivity_units.organization_id
         and ec.profile_id = auth.uid()
         and ec.status = 'active'
    )
  );

-- ── profession_templates ────────────────────────────────────────────────────
drop policy if exists profession_templates_select on public.profession_templates;
create policy profession_templates_select on public.profession_templates
  for select
  to authenticated
  using (
    organization_id is null
    or public.is_admin()
    or exists (
      select 1 from public.company_memberships m
       where m.organization_id = profession_templates.organization_id
         and m.profile_id = auth.uid()
         and m.status = 'active'
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.organization_id = profession_templates.organization_id
         and ec.profile_id = auth.uid()
         and ec.status = 'active'
    )
  );

-- ── skill_icons ─────────────────────────────────────────────────────────────
drop policy if exists skill_icons_select on public.skill_icons;
create policy skill_icons_select on public.skill_icons
  for select
  to authenticated
  using (
    organization_id is null
    or public.is_admin()
    or exists (
      select 1 from public.company_memberships m
       where m.organization_id = skill_icons.organization_id
         and m.profile_id = auth.uid()
         and m.status = 'active'
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.organization_id = skill_icons.organization_id
         and ec.profile_id = auth.uid()
         and ec.status = 'active'
    )
  );

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/): restore the exact
-- pre-migration policies (using (true), role public). See the .down.sql file.
-- ════════════════════════════════════════════════════════════════════════════
