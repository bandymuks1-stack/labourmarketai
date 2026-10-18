-- Rollback for 20261003140000_subject_contest_withdraw_constraint_reconcile_v1.sql
-- Restores the exact pre-#2138 production state: ONLY `_chk`, the 9-value set
-- including source_preserved, no dispute_withdrawn. Refuses (and changes
-- nothing) while any dispute_withdrawn row exists.
begin;

do $$
declare v bigint;
begin
  select count(*) into v from public.organization_evidence_events
   where event_type = 'dispute_withdrawn';
  if v > 0 then
    raise exception 'cannot roll back: % dispute_withdrawn row(s) exist', v
      using errcode = 'P0001';
  end if;
end $$;

alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;
alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_chk;
alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_chk
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','corrected',
    'source_preserved'));

commit;
