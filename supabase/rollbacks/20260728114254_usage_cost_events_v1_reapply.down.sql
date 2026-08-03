-- ============================================================================
-- RECONSTRUCTED AFTER PRODUCTION APPLY — NOT PART OF THE ORIGINAL HISTORY.
--
-- The production ledger row 20260728114254 (usage_cost_events_v1_reapply)
-- stored NO rollback statements. This file was written on 2026-08-03, during
-- the history-parity reconciliation, to satisfy the repo's paired-rollback
-- rule and to support LOCAL development resets. For any production incident
-- the documented path is forward-fix, not this file.
--
-- What the reapply changed over 20260728114008, and what this reverses:
-- the table COMMENT gained "/truncate" and the SELECT policy was re-created
-- via drop-if-exists (no semantic policy change). Reversing restores the
-- 20260728114008 comment text. Nothing else needs reversing: every other
-- statement in the reapply was an idempotent re-run of 114008.
-- ============================================================================

begin;

comment on table public.usage_cost_events is
  'Canonical append-only usage & cost event ledger. Contract: docs/architecture/usage-cost-event-model-v1.md. INSERT-only: update/delete are revoked and trigger-blocked. Identity is server-resolved; there is no INSERT policy for authenticated callers.';

commit;
