-- @human-gate-approved: RED acknowledgement only; exact owner approval pending, NOT APPLIED.
-- Completes #3837 using the existing privacy erasure registry, without changing approved scheduling SQL.
begin;

insert into public.privacy_erasure_registry_v3
  (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
('public', 'timesheet_schedules', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
 'Personal delivery preferences; removed with the account under the existing erasure process',
 'Schedule settings only; reports, journal entries and approval history remain under their existing retention rules')
on conflict (schema_name, table_name, column_name) do nothing;

commit;
-- Rollback: supabase/rollbacks/20261127180000_timesheet_schedule_privacy_v1.down.sql
