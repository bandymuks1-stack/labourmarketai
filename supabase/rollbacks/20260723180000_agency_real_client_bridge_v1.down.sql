-- Rollback for 20260723180000_agency_real_client_bridge_v1.sql
-- (real two-subject agency→client bridge). Reverses everything the up
-- migration added. Referenced companies / customer_requests / company_workers /
-- workers / conversations / booking_requests rows are never touched — only the
-- three new tables + their functions go away.

begin;

drop function if exists public.list_agency_offered_candidates_for_request_v1(uuid);
drop function if exists public.list_agency_offer_progress_v1();
drop function if exists public.list_shared_requests_for_agency_v1();
drop function if exists public.withdraw_agency_candidate_offer_v1(uuid);
drop function if exists public.submit_agency_candidate_offer_v1(uuid, uuid, text);
drop function if exists public.unshare_request_v1(uuid);
drop function if exists public.share_request_with_agency_v1(uuid, uuid);
drop function if exists public.revoke_agency_client_connection_v1(uuid);
drop function if exists public.decline_agency_client_connection_v1(uuid);
drop function if exists public.accept_agency_client_connection_v1(uuid, uuid);
drop function if exists public.create_agency_client_connection_v1(uuid, text);

drop table if exists public.agency_candidate_offers;
drop table if exists public.agency_client_request_shares;
drop table if exists public.agency_client_connections;

commit;
