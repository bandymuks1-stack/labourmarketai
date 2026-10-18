-- @human-gate-approved
--
-- SAFETY CLASS: RED (event-type CHECK on a RED-class audit table). Draft PR +
-- `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval. This marker is the risk acknowledgement, not an
-- approval.
--
-- 20261003140000 — forward-fix of 20261003110000_subject_contest_withdraw_v1.
--
-- DEFECT: production's live event_type CHECK on organization_evidence_events is
-- `organization_evidence_events_event_type_chk` (installed by
-- 20260924100000_historical_timesheet_m1, step M1h; allows source_preserved).
-- 20261003110000 dropped/added `..._event_type_check`, a stale lineage name
-- that did not exist in prod, so prod carries BOTH: `_chk` (blocks
-- dispute_withdrawn) and the new `_check` (lacks source_preserved). The
-- effective set was the intersection, so the withdraw RPC failed closed with
-- 23514 and source_preserved was blocked too.
--
-- FIX: exactly ONE event_type CHECK, under the canonical live name `_chk`,
-- holding the UNION. Idempotent; rows are validated (all existing event types
-- are inside the set). No data, policy, grant or function is touched.
--
-- Rollback: supabase/rollbacks/20261003140000_subject_contest_withdraw_constraint_reconcile_v1.down.sql

begin;

alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;
alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_chk;

alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_chk
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','dispute_withdrawn','corrected',
    'source_preserved'));

commit;
