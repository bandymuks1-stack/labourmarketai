-- Rollback 20260928190000: remove the delegated-demand functions, the
-- share-scoped read policy and the placement read. The two provenance
-- columns are dropped last; export drafted rows first if any must be kept:
--   select id, drafted_by, drafted_via_connection_id from public.customer_requests
--    where drafted_via_connection_id is not null;
drop function if exists public.list_agency_placements_v1();
drop policy if exists customer_requests_select_agency_share on public.customer_requests;
drop function if exists public.agency_can_read_shared_request(uuid);
drop function if exists public.list_agency_drafted_needs_v1();
drop function if exists public.confirm_agency_drafted_need_v1(uuid);
drop function if exists public.draft_client_need_v1(uuid, text, text, text, text, text, integer);
alter table public.customer_requests drop column if exists drafted_via_connection_id;
alter table public.customer_requests drop column if exists drafted_by;
