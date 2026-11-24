-- DOWN for 20260919100000_roster_writes_rpc_only_v1
-- Restores the pre-2026-09-19 state verbatim: the two FOR ALL write policies
-- (0027 company_workers_write, 0001 agency_workers_write) and the direct
-- write privilege of `authenticated`. Reads were never changed.

begin;

drop policy if exists company_workers_write on public.company_workers;
create policy company_workers_write on public.company_workers for all
  using (public.owns_company(company_id) or public.is_admin())
  with check (public.owns_company(company_id) or public.is_admin());

drop policy if exists agency_workers_write on public.agency_workers;
create policy agency_workers_write on public.agency_workers for all
  using (public.owns_agency(agency_id) or public.is_admin())
  with check (public.owns_agency(agency_id) or public.is_admin());

grant insert, update, delete on public.company_workers to authenticated;
grant insert, update, delete on public.agency_workers to authenticated;

commit;
