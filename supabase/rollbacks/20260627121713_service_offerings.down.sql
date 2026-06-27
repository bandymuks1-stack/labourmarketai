-- ============================================================================
-- ROLLBACK for 20260627121713_service_offerings.sql
-- Guarded drop: refuses to run if service_offerings holds any rows, so a
-- rollback can never silently destroy real provider data. Because the forward
-- migration is purely additive (a NEW table), dropping an empty table affects
-- no pre-existing data.
--
-- Apply ONLY via Supabase MCP after owner approval. Never `db push`.
-- ============================================================================

do $$
begin
  if exists (select 1 from public.service_offerings limit 1) then
    raise exception
      'service_offerings is not empty — refusing automatic rollback (drop manually only after exporting/clearing rows)';
  end if;
end $$;

drop table if exists public.service_offerings;
