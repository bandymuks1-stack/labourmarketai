-- Rollback for 20261006100400_append_only_privilege_closure_v1.
-- Removes only what the closure ADDED (the truncate triggers + function) and
-- restores service_role's grants on the two tables to the state 150500 leaves.
-- The authenticated TRUNCATE/REFERENCES/TRIGGER/DML grants were the DEFECT and
-- are deliberately NOT restored; section 2 of the closure is a pure tightening
-- (production already holds 0), so it is not reversed either.
begin;
drop trigger if exists work_counterparty_links_no_truncate on public.work_counterparty_links;
drop trigger if exists journal_entry_review_submissions_no_truncate on public.journal_entry_review_submissions;
drop function if exists public.work_counterparty_no_truncate_v1();
grant select, insert, update, delete, truncate, references, trigger
  on public.work_counterparty_links, public.journal_entry_review_submissions to service_role;
commit;
