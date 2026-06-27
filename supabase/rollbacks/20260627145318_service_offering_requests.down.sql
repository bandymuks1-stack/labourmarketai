-- ============================================================================
-- ROLLBACK for 20260627145318_service_offering_requests.sql
--
-- Guarded: refuses to drop a NON-EMPTY request table (forces a deliberate,
-- owner-approved data-loss decision). Drops the discovery policy and the three
-- RPCs (the only writers), then the table. Does NOT touch service_offerings data
-- (only removes the added discovery policy).
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from public.service_offering_requests limit 1) then
    raise exception 'service_offering_requests is not empty — refusing automatic rollback (export/clear rows first)';
  end if;
end $$;

-- remove the added discovery policy (service_offerings table + data untouched)
drop policy if exists service_offerings_discover_active on public.service_offerings;

-- drop the write RPCs (the only writers)
drop function if exists public.request_service_offering(uuid, text);
drop function if exists public.respond_service_offering_request(uuid, text, text);
drop function if exists public.withdraw_service_offering_request(uuid);

drop table if exists public.service_offering_requests;

commit;
