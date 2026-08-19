-- ROLLBACK for 20260819190000_journal_task_evidence_link_v1.sql
-- Drops the two new RPCs, the read helper and the ONE new table.
--
-- REFUSES while any ACTIVE (not withdrawn) link exists: destroying a live
-- assertion that a journal entry proves a task is an owner data decision,
-- never a rollback. Withdrawn rows alone do not block the rollback — they
-- carry no live claim.
--
-- Nothing in the forward migration touched journal_entries, work_tasks,
-- create_journal_entry_full, journal_entry_supersede or any existing policy
-- or grant, so there is nothing else to restore.

begin;

do $$
declare
  n bigint;
begin
  select count(*) into n
    from public.journal_entry_tasks
   where unlinked_at is null;
  if n > 0 then
    raise exception
      'journal task evidence rollback refused: % active evidence link(s) exist — forward-fix instead',
      n;
  end if;
end $$;

drop function if exists public.unlink_journal_entry_from_task_v1(text, text);
drop function if exists public.link_journal_entry_to_task_v1(text, text);

drop table if exists public.journal_entry_tasks;

drop function if exists public.can_read_journal_entry_v1(uuid);

commit;
