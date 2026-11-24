-- ============================================================================
-- ROLLBACK for 20260627181500_service_requests_seen.sql
--
-- Guarded: refuses to drop a NON-EMPTY seen table (forces a deliberate,
-- owner-approved data-loss decision). Drops the mark-seen RPC (the only writer),
-- then the table. Touches nothing else — the seen state is self-contained.
-- The app degrades gracefully (no "new" markers) once these are gone.
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from public.service_offering_requests_seen limit 1) then
    raise exception 'service_offering_requests_seen is not empty — refusing automatic rollback (export/clear rows first)';
  end if;
end $$;

drop function if exists public.mark_service_requests_seen();
drop table if exists public.service_offering_requests_seen;

commit;
