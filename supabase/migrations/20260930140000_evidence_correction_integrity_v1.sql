-- ============================================================================
-- 20260930140000 — EVIDENCE CORRECTION INTEGRITY: at most ONE correction per
-- record, and a `corrected` event always names its replacement.
--
-- RED by rule (adds a CHECK constraint to an existing table — the classifier
-- fails closed on any constraint change). OWNER-APPROVED 2026-09-30 ("Proceed
-- with the separate RED correction writer. Do not ask again whether it may be
-- developed."). Apply only via Supabase MCP apply_migration, after review of
-- the exact SQL below.
-- @human-gate-approved
--
-- WHAT THE WRITER DOES (code, no schema): a correction is INSERT-only — one new
-- organization_evidence_records row whose `correction_of` names the record it
-- replaces, plus one `corrected` event on the original carrying
-- `replacement_record_id`. The original is never edited or deleted. The columns,
-- the `corrected` event type and the INSERT policies for both tables already
-- exist (20260907114500 + hist_p1 / hist_p4).
--
-- WHAT THIS MIGRATION ADDS — three additive guards the writer relies on, so the
-- guarantees hold in the database and not only in application code:
--
--   1. organization_evidence_records_one_correction — UNIQUE (correction_of)
--      WHERE correction_of IS NOT NULL. A record has at most ONE correcting
--      record, so chains are linear (A -> B -> C) and two concurrent
--      corrections of the same record cannot both win: an effective reading
--      that counts only the leaf can never see two leaves.
--   2. organization_evidence_events_one_correction — UNIQUE (record_id)
--      WHERE event_type = 'corrected'. A record is marked corrected once.
--   3. organization_evidence_events_correction_pair — CHECK
--      ((event_type = 'corrected') = (replacement_record_id IS NOT NULL)). A
--      `corrected` event names its replacement, and nothing else carries one.
--
-- EXISTING DATA: 0 records have correction_of; 0 `corrected` events exist;
-- every event with a replacement_record_id is a `corrected` one (none exist) —
-- so all three guards are satisfied by every current row. The CHECK is added
-- NOT VALID and validated in the same transaction after the data proof.
--
-- NO SECURITY DEFINER, NO GRANT, NO POLICY CHANGE, NO DATA WRITE.
--
-- ROLLBACK: supabase/rollbacks/20260930140000_evidence_correction_integrity_v1.down.sql
-- ============================================================================

begin;

create unique index if not exists organization_evidence_records_one_correction
  on public.organization_evidence_records (correction_of)
  where correction_of is not null;

create unique index if not exists organization_evidence_events_one_correction
  on public.organization_evidence_events (record_id)
  where event_type = 'corrected';

do $evidence_correction_pair$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.organization_evidence_events'::regclass
                    and conname = 'organization_evidence_events_correction_pair') then
    alter table public.organization_evidence_events
      add constraint organization_evidence_events_correction_pair
      check ((event_type = 'corrected') = (replacement_record_id is not null)) not valid;
  end if;
end
$evidence_correction_pair$;

alter table public.organization_evidence_events
  validate constraint organization_evidence_events_correction_pair;

comment on index public.organization_evidence_records_one_correction is
  'A record has at most one correcting record: chains are linear (A -> B -> C) and only the leaf counts in an effective reading.';

commit;
