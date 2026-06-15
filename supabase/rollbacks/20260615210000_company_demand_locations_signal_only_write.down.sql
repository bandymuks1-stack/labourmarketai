-- DOWN / rollback for 20260615210000_company_demand_locations_signal_only_write.sql
--
-- Reverses the signal-only write hardening: drops the dedup index and restores
-- the prior owner write policy (the #423 version — owner_id + demand ownership,
-- WITHOUT the signal-only clamp). The policy is replaced in one transaction so
-- there is no window with no write policy. No table/column/data change.
-- Apply via Supabase MCP apply_migration, never `db push`.

begin;

drop index if exists public.company_demand_locations_signal_dedup_idx;

drop policy if exists company_demand_locations_write on public.company_demand_locations;
create policy company_demand_locations_write on public.company_demand_locations
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.customer_requests cr
       where cr.id = request_id
         and cr.profile_id = auth.uid()
    )
  );

commit;
