-- Rollback of 20261121100100_journal_lineage_and_metrics_authorship_v1.
-- Drops the lineage guard trigger and function, and restores
-- journal_entry_metrics_write exactly as 20261118164500_former_employer_limited_access_v1
-- defines it (copied verbatim). No rows change.

begin;

drop trigger if exists journal_entries_lineage_guard_v1 on public.journal_entries;
drop function if exists public.journal_entries_lineage_guard_v1();

-- 20261118164500_former_employer_limited_access_v1
drop policy if exists journal_entry_metrics_write on public.journal_entry_metrics;
create policy journal_entry_metrics_write on public.journal_entry_metrics for all
  using (exists (select 1 from public.journal_entries je
                  where je.id = journal_entry_metrics.entry_id
                    and (owns_worker(je.worker_id) or is_admin())))
  with check (exists (select 1 from public.journal_entries je
                       where je.id = journal_entry_metrics.entry_id
                         and (owns_worker(je.worker_id) or is_admin()
                              or exists (select 1 from public.engagement_contexts ec
                                          where ec.id = je.engagement_context_id
                                            and ec.status in ('active', 'paused')
                                            and manages_organization(ec.organization_id)))));

commit;
