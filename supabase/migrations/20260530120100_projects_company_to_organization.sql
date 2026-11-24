-- 20260530120100 — projects.company_id → projects.organization_id (org model).
--
-- WHY: convergence to the canonical org model (organizations +
-- engagement_contexts + relationship_types). projects previously linked to the
-- legacy companies table via company_id; the canonical link is organizations.
-- companies remains as legacy backfill source (organizations.legacy_company_id).
--
-- SAFETY (PLATFORM_DOCTRINE §16.3): additive + reversible. The legacy
-- company_id column is KEPT (nullable) — nothing is dropped, so this is fully
-- non-destructive. projects is EMPTY on prod (0 rows) and is read by no app
-- code, so no application change ships with this migration. Existing projects
-- RLS (keyed on company_id) is left as-is while the table is dormant;
-- organization-based RLS lands with the staged org reroute follow-up.
--
-- ON DELETE RESTRICT (PLATFORM_DOCTRINE audit-trail / proof-chain): projects
-- anchor journal proof via engagement_contexts. A cascade from organizations
-- would let an org deletion silently wipe proof-anchoring projects, breaking the
-- legal/audit record. RESTRICT forbids deleting an organization that still has
-- projects, so the proof chain cannot be cascade-destroyed.
--
-- Application to prod is owner-gated (committed, not auto-run).

alter table public.projects
  add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;

-- Backfill through the legacy bridge. No-op at 0 rows; correct once rows exist.
update public.projects p
   set organization_id = o.id
  from public.organizations o
 where o.legacy_company_id = p.company_id
   and p.organization_id is null;

create index if not exists projects_organization_id_idx
  on public.projects (organization_id);

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — copy-paste). Fully reversible; company_id was never
-- touched, so no data is recoverable-from-loss here. Dropping organization_id
-- also removes its ON DELETE RESTRICT FK, so the rollback needs no extra step.
-- ─────────────────────────────────────────────────────────────────────────
--
-- drop index if exists public.projects_organization_id_idx;
-- alter table public.projects drop column if exists organization_id;  -- drops the RESTRICT FK with it
