-- Rollback for 20260908110000_evidence_subject_dispute_v1.sql
--
-- Restores the event set and removes the two subject-side write paths. It is a
-- faithful inverse ONLY while no 'dispute_withdrawn' row exists, because the
-- original CHECK constraint does not admit that value — so the rollback ASSERTS
-- that first and refuses rather than silently failing halfway through.
--
-- 'disputed' rows are NOT removed by this rollback. They were writable before
-- this migration (an organization manager could always append one through
-- organization_evidence_events_attest), they remain valid under the restored
-- constraint, and deleting a person's contest to undo a schema change would be
-- exactly the destructive act the reversibility rule exists to prevent.
--
-- Prefer fixing forward. This file exists so the change is reversible, not
-- because reversing it is the good outcome: rolling back returns the product to
-- a state where DISPUTED is computed and no actor can cause it.

do $$
declare
  v_blocking bigint;
begin
  select count(*) into v_blocking
    from public.organization_evidence_events
   where event_type = 'dispute_withdrawn';

  if v_blocking > 0 then
    raise exception
      'cannot roll back: % dispute_withdrawn row(s) exist and the restored check constraint does not admit them. Decide what happens to those events before rolling back.',
      v_blocking
      using errcode = 'P0001';
  end if;
end;
$$;

drop function if exists public.withdraw_organization_evidence_dispute_v1(uuid, text);
drop function if exists public.dispute_organization_evidence_record_v1(uuid, text);

alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;

alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_check
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','corrected'));
