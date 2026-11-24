-- Rollback for 20260918070000_roster_link_subject_consent_guard_v1
-- Removes the subject-consent trigger and its function. No data is touched;
-- the policies this migration never changed stay exactly as they were.
drop trigger if exists organization_people_subject_consent_guard on public.organization_people;
drop function if exists public.organization_people_guard_subject_consent();
