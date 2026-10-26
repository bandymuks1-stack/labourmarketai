-- ============================================================================
-- 20261025140000 — EMPLOYER PARTY LABEL backfill for the Vivat Rex records.
--
-- Executes the 2026-09-30 business-history-continuity model (already decided):
-- "the employer AT THE TIME was 'Vivat Rex PL'" is a per-record party LABEL
-- (organization_evidence_parties), label only, never an invented organization,
-- never a supplied_by change. Completes follow-up #1 of
-- docs/design/business-history-continuity-v1.md §7 for the records whose OWN
-- source sheet names the employer.
--
-- SCOPE — only records whose source sheet names the EMPLOYER verbatim:
--   · source_sheet = 'Vivat Rex PL'  → party_role='employer', party_label='Vivat Rex PL'  (675 records)
-- DELIBERATELY NOT WRITTEN (per the same 2026-09-30 decision / no invention):
--   · 'Nonstop-Vivat Rex PL' (125) — kept as DATASET PROVENANCE only, NOT a
--     party, until documents establish Nonstop's role. Still placed in the
--     Vivat Rex period by source-label composition.
--   · person-name sheets 'Serhii'/'Ramunas'/'Raimundas' (54) — a worker name is
--     not an employer; their employer is established by the Vivat Rex period
--     (date), not a fabricated label.
--   · records with no source sheet — employer established by period composition.
--
-- party_organization_id stays NULL (Vivat Rex is not a platform organization and
-- is never invented as one). Append-only, additive; idempotent via the existing
-- unique index organization_evidence_parties_once (record_id, party_role,
-- coalesce(org,label)). No evidence record is touched; no supplied_by changes.
--
-- RED (data write asserting the historical employer per record). Apply via
-- Supabase MCP apply_migration. ROLLBACK:
-- supabase/rollbacks/20261025140000_history_employer_party_vivatrex_v1.down.sql
-- ============================================================================

begin;

insert into public.organization_evidence_parties
  (organization_id, record_id, party_role, party_organization_id, party_label)
select r.organization_id, r.id, 'employer', null, 'Vivat Rex PL'
from public.organization_evidence_records r
where r.supplied_by_organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and (r.source_fact->>'source_sheet') = 'Vivat Rex PL'
on conflict do nothing;

commit;

-- ROLLBACK (down): supabase/rollbacks/20261025140000_history_employer_party_vivatrex_v1.down.sql
-- Deletes only the 'employer'/'Vivat Rex PL' party rows on records supplied by
-- org 19f47e78 whose source sheet is 'Vivat Rex PL'.
