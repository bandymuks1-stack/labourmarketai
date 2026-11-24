-- Rollback for 20260705240000_agency_legacy_retype.sql
--
-- Restores the three pre-apply values captured by the 2026-07-05 lead session
-- and recorded in the migration's own header. Row-scoped by id — it can only
-- touch the three rows the original UPDATE changed, and it changes nothing
-- else even if other companies later became 'staffing_agency' legitimately.
--
-- This migration is ALREADY APPLIED in production. Rolling it back is an
-- owner decision, not a routine action.
--
-- Production state read 2026-08-18: `048aa7e1-…` is ALREADY back to
-- 'construction' (changed by a later, legitimate action), so its statement
-- below is a no-op today — the `and company_type = 'staffing_agency'` guard is
-- what stops this file from re-asserting a stale value over a newer one. Only
-- `39b75887-…` and `788225e9-…` still carry the applied value.

begin;

update public.companies set company_type = 'construction'
 where id = '048aa7e1-0c77-4484-ad7d-00eb1288d7e3'
   and company_type = 'staffing_agency';

update public.companies set company_type = 'other'
 where id = '39b75887-3bdd-495a-8e47-7c9401086a47'
   and company_type = 'staffing_agency';

update public.companies set company_type = 'other'
 where id = '788225e9-035b-4ed3-9bce-bf19aab61b14'
   and company_type = 'staffing_agency';

commit;
