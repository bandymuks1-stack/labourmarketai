-- 0030 — Employment ↔ work-journal operations bridge (additive only).
--
-- WHY: the operations truth audit (docs/audits/company-worker-foreman-
-- operations-truth-v1.md) found the employment link tables carry ONLY a
-- `status` column — there is nowhere to record a per-relationship
-- operations role/title or whether work-journal review is enabled for
-- that worker↔company / worker↔agency relationship. Without these fields
-- the bridge between employment and the journal review model cannot
-- exist, and foreman / project-manager remain label-only. The owner
-- explicitly authorised ONE small additive migration for this bridge.
--
-- WHAT (additive, non-destructive — no drops, no renames, no backfill,
-- no RLS change, no fake data):
--   public.company_workers + public.agency_workers each gain:
--     operations_role         text     nullable  (conservative CHECK)
--     operations_title        text     nullable
--     journal_review_enabled  boolean  not null default false
--     journal_review_scope    text     nullable
--
--   NULL operations_role + journal_review_enabled=false is the safe
--   default: it means "not assigned / review not enabled" — the honest
--   current state. Nothing is auto-enabled; no relationship is granted
--   review by this migration.
--
-- Allowed operations_role values are deliberately conservative and map
-- to the operations role-capability map (apps/web/lib/operations/
-- role-capabilities.ts). foreman / project_manager are STORABLE here but
-- remain `not_enabled` in the capability map until a later sprint wires
-- real permissions + UI — storing a label does not grant any capability.
--
-- RLS: unchanged. The existing company_workers / agency_workers row
-- policies (owner OR worker OR admin select; owner/admin write) already
-- cover every column; new columns inherit them. Table grants to
-- `authenticated` already exist (migrations 0027 / 0004) and cover new
-- columns. No new policy, no new grant.
--
-- Application status: file ships in this PR. Application to prod is
-- OWNER-GATED (CLAUDE.md: agents never apply production migrations).
-- App code reads these columns with graceful column-absent fallback
-- until applied, so the live app keeps working and stays honest
-- ("not enabled") before the owner runs this.

-- ── company_workers ─────────────────────────────────────────────────
alter table public.company_workers
  add column if not exists operations_role text
    check (operations_role in
      ('worker','foreman','project_manager','company_admin','agency_admin'));
alter table public.company_workers
  add column if not exists operations_title text;
alter table public.company_workers
  add column if not exists journal_review_enabled boolean not null default false;
alter table public.company_workers
  add column if not exists journal_review_scope text;

-- ── agency_workers ──────────────────────────────────────────────────
alter table public.agency_workers
  add column if not exists operations_role text
    check (operations_role in
      ('worker','foreman','project_manager','company_admin','agency_admin'));
alter table public.agency_workers
  add column if not exists operations_title text;
alter table public.agency_workers
  add column if not exists journal_review_enabled boolean not null default false;
alter table public.agency_workers
  add column if not exists journal_review_scope text;
