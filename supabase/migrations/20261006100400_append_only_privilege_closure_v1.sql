-- 20261006100400_append_only_privilege_closure_v1
--
-- BLOCKER A (owner decision 2026-10-06). 20261003150500 (counterparty authority)
-- creates two append-only tables but ends its revoke list at `anon`:
--
--     revoke all on public.work_counterparty_links, ... from public, anon;
--
-- The Supabase bootstrap default ACL grants every new `public` table
-- `arwdDxt` (including TRUNCATE, REFERENCES, TRIGGER) to anon, authenticated and
-- service_role, so `authenticated` silently kept all seven privileges. RLS and
-- the row triggers cover row writes only; TRUNCATE is outside both, so any
-- authenticated database session could wipe an append-only legal-proof table
-- (measured locally: TRUNCATE succeeded, no trigger fired, RLS not consulted).
-- Production holds 0/216 authenticated|anon TRUNCATE today; this migration
-- makes the chain reproduce that invariant instead of depending on an
-- out-of-ledger state.
--
-- APPLY AFTER 20261003150200 (creates work_plan_entries) and after the 150500
-- group. This is a pure TIGHTENING. Every legitimate writer is a SECURITY DEFINER
-- function owned by postgres (privileges of the owner are unaffected by
-- revoking named roles); nothing in the app writes these tables directly.
-- Owner TRUNCATE is refused too (statement trigger), because the table owner is
-- also not a legitimate truncator of a legal-proof ledger.
--
-- @human-gate-approved  (acknowledgement of RED-class content: REVOKE and
-- CREATE TRIGGER; NOT an approval - see CLAUDE.md "Merge model")

begin;

-- 1. The two append-only tables: nothing inherited from the default ACL.
revoke all on public.work_counterparty_links, public.journal_entry_review_submissions
  from public, anon, authenticated, service_role;
grant select on public.work_counterparty_links, public.journal_entry_review_submissions
  to authenticated, service_role;

-- A row trigger does not fire on TRUNCATE (same defect found on usage_cost_events
-- 2026-07-28 and closed on commitment_override_receipts in 150100).
create or replace function public.work_counterparty_no_truncate_v1()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  raise exception '% is append-only (TRUNCATE refused)', tg_table_name using errcode = '42501';
end $$;
revoke all on function public.work_counterparty_no_truncate_v1() from public, anon, authenticated;

drop trigger if exists work_counterparty_links_no_truncate on public.work_counterparty_links;
create trigger work_counterparty_links_no_truncate
  before truncate on public.work_counterparty_links
  for each statement execute function public.work_counterparty_no_truncate_v1();

drop trigger if exists journal_entry_review_submissions_no_truncate on public.journal_entry_review_submissions;
create trigger journal_entry_review_submissions_no_truncate
  before truncate on public.journal_entry_review_submissions
  for each statement execute function public.work_counterparty_no_truncate_v1();

-- 2. The one other table the apply chain creates (150200). The remaining tables
--    the local replay flags (journal_entry_photos, company_locations,
--    worker_external_profiles, talent_source_records, identity_resolution_events,
--    dashboard_preferences, demand_interest_seen) come from the OLD drafts that
--    are superseded, retired or still undecided and are NEVER applied through
--    this chain; production already holds 0 TRUNCATE-class privileges (read-only
--    check 2026-10-06). Naming them here would make this migration fail in
--    production (company_locations does not exist there).
revoke truncate, references, trigger on public.work_plan_entries
  from public, anon, authenticated;
revoke all on public.work_plan_entries from anon;

commit;
