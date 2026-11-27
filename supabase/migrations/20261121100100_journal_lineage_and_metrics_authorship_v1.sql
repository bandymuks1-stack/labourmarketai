-- @human-gate-approved
-- 20261121100100 — journal lineage belongs to the entry's own person; a
-- manager's metric is labelled as a manager's (owner P0 security directive
-- 2026-11-21). RED: a new guard trigger + a policy change.
--
-- 1. journal_entries_lineage_guard_v1 (BEFORE INSERT): a new entry may only
--    correct an entry of the SAME worker, and is never inserted already
--    superseded or deleted. Every existing writer already behaves this way
--    (the supersede / correction RPCs check owns_worker).
-- 2. journal_entry_metrics_write: the manager arm of WITH CHECK now requires
--    source = 'manager_corrected', so a manager's value is always labelled as
--    a manager's. The owner and admin arms are unchanged.
--
-- No rows are changed. Rollback: supabase/rollbacks/20261121100100_journal_lineage_and_metrics_authorship_v1.down.sql

begin;

-- ── 1. lineage guard ──────────────────────────────────────────────────────
create or replace function public.journal_entries_lineage_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.superseded_by is not null or new.deleted_at is not null then
    raise exception 'journal_lineage_invalid: a new entry is never born superseded or deleted'
      using errcode = '42501';
  end if;
  if new.correction_of is not null
     and not exists (select 1 from public.journal_entries o
                      where o.id = new.correction_of
                        and o.worker_id = new.worker_id) then
    raise exception 'journal_lineage_invalid: an entry corrects only an entry of the same person'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.journal_entries_lineage_guard_v1() from public, anon, authenticated;

drop trigger if exists journal_entries_lineage_guard_v1 on public.journal_entries;
create trigger journal_entries_lineage_guard_v1
  before insert on public.journal_entries
  for each row execute function public.journal_entries_lineage_guard_v1();

-- ── 2. metrics: a manager's write is labelled as a manager's ──────────────
drop policy if exists journal_entry_metrics_write on public.journal_entry_metrics;
create policy journal_entry_metrics_write on public.journal_entry_metrics for all
  using (exists (select 1 from public.journal_entries je
                  where je.id = journal_entry_metrics.entry_id
                    and (owns_worker(je.worker_id) or is_admin())))
  with check (exists (select 1 from public.journal_entries je
                       where je.id = journal_entry_metrics.entry_id
                         and (owns_worker(je.worker_id) or is_admin()
                              or (journal_entry_metrics.source = 'manager_corrected'
                                  and exists (select 1 from public.engagement_contexts ec
                                               where ec.id = je.engagement_context_id
                                                 and ec.status in ('active', 'paused')
                                                 and manages_organization(ec.organization_id))))));

commit;
