-- Rollback of 20261115120000_journal_learning_access_follows_link_v1.
-- Restores journal_entries_select exactly as 0013_work_journal_m1 defined it.

begin;

drop policy if exists journal_entries_select on public.journal_entries;

create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id)
    or is_admin()
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.id = journal_entries.engagement_context_id
         and manages_organization(ec.organization_id)
    )
  );

commit;
