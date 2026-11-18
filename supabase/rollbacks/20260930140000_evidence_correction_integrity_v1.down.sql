-- Rollback 20260930140000: removes the three correction-integrity guards.
-- Refuses while any correction exists — dropping the uniqueness guards under
-- live corrections would let a second leaf appear and double count work.
do $$
begin
  if exists (select 1 from public.organization_evidence_records where correction_of is not null)
     or exists (select 1 from public.organization_evidence_events where event_type = 'corrected') then
    raise exception 'corrections exist — the guards must stay while a correction chain exists';
  end if;
end $$;
alter table public.organization_evidence_events drop constraint if exists organization_evidence_events_correction_pair;
drop index if exists public.organization_evidence_events_one_correction;
drop index if exists public.organization_evidence_records_one_correction;
