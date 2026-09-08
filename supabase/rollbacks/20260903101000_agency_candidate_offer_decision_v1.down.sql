-- Rollback for 20260903101000_agency_candidate_offer_decision_v1
-- GUARDED: refuses while any offer carries a decision, so no client decision
-- (and no booking link) is silently lost. Clear or migrate those rows first.

do $$
begin
  if exists (select 1 from public.agency_candidate_offers where status in ('accepted', 'declined')) then
    raise exception 'rollback refused: decided agency candidate offers exist (status accepted/declined). Migrate or clear them first.'
      using errcode = 'P0004';
  end if;
end;
$$;

drop function if exists public.list_agency_offered_candidates_for_request_v2(uuid);
drop function if exists public.respond_agency_candidate_offer_v1(uuid, text, text);

alter table public.agency_candidate_offers
  drop constraint if exists agency_candidate_offers_status_check;
alter table public.agency_candidate_offers
  add constraint agency_candidate_offers_status_check
  check (status in ('offered', 'withdrawn'));

alter table public.agency_candidate_offers
  drop constraint if exists agency_candidate_offers_decision_note_check;

alter table public.agency_candidate_offers
  drop column if exists booking_id,
  drop column if exists decision_note,
  drop column if exists decided_by,
  drop column if exists decided_at;
