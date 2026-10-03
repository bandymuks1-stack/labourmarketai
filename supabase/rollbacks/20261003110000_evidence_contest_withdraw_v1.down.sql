-- Rollback for 20261003110000_evidence_contest_withdraw_v1.sql
--
-- A faithful inverse ONLY while (a) no 'dispute_withdrawn' row exists (the
-- restored CHECK would reject it) and (b) no actor has more than one
-- 'disputed' row on a record (the restored unique index would reject it, and
-- that is exactly what a re-contest after a withdrawal produces). The
-- rollback ASSERTS both first and refuses rather than failing halfway.
-- It never deletes a person's contest. Prefer fixing forward.

begin;

do $$
declare
  v_withdrawn bigint;
  v_repeat    bigint;
begin
  select count(*) into v_withdrawn
    from public.organization_evidence_events
   where event_type = 'dispute_withdrawn';

  select count(*) into v_repeat from (
    select 1
      from public.organization_evidence_events
     where event_type = 'disputed'
     group by record_id, actor_profile_id
    having count(*) > 1
  ) d;

  if v_withdrawn > 0 or v_repeat > 0 then
    raise exception
      'cannot roll back: % dispute_withdrawn row(s) and % repeat-contest group(s) exist. Decide what happens to that history before rolling back.',
      v_withdrawn, v_repeat
      using errcode = 'P0001';
  end if;
end;
$$;

drop function if exists public.withdraw_organization_evidence_dispute_v1(uuid, text);
drop trigger if exists organization_evidence_events_dispute_state_guard
  on public.organization_evidence_events;
drop function if exists public.organization_evidence_dispute_state_guard();

alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;
alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_check
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','corrected'));

create unique index if not exists organization_evidence_events_one_dispute_per_actor
  on public.organization_evidence_events (record_id, actor_profile_id)
  where event_type = 'disputed';

commit;
