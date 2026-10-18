-- ROLLBACK of 20261006100000_work_hour_allocations_integrity_guard_v1.
-- Restores the two policies to the APPLIED 20260829140000 definitions and drops
-- the guard. No row is touched; rows written while the guard was live stay valid.
begin;

drop trigger if exists work_hour_allocations_integrity_guard on public.work_hour_allocations;
drop function if exists public.work_hour_allocations_integrity_guard_v1();

alter policy work_hour_allocations_insert
  on public.work_hour_allocations
  with check (
    entered_by = auth.uid()
    and (
      public.manages_organization(organization_id)
      or public.owns_worker(worker_id)
    )
  );

alter policy work_hour_allocations_update
  on public.work_hour_allocations
  using (
    public.manages_organization(organization_id)
    or public.owns_worker(worker_id)
  )
  with check (
    public.manages_organization(organization_id)
    or public.owns_worker(worker_id)
  );

commit;
