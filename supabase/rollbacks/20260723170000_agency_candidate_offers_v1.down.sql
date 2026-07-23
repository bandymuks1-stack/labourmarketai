-- Rollback for 20260723170000_agency_candidate_offers_v1.sql
-- (agency candidate offers). Reverses everything the up migration added.
-- The customer_requests, companies, company_workers and workers rows the offer
-- REFERENCED are never touched — only the offer records + their RPCs go away.

begin;

drop function if exists public.withdraw_agency_candidate_offer_v1(uuid);
drop function if exists public.submit_agency_candidate_offer_v1(uuid, uuid, text);

drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
drop trigger if exists trg_agency_candidate_offers_updated_at on public.agency_candidate_offers;
drop index if exists public.idx_agency_candidate_offers_request;
drop index if exists public.idx_agency_candidate_offers_company;
drop table if exists public.agency_candidate_offers;

commit;
