-- Retain the erasure decision while the settings table exists, including disabled settings.
-- No reports or preferences are deleted by this rollback.
begin;
delete from public.privacy_erasure_registry_v3
where schema_name='public' and table_name='timesheet_schedules' and column_name='profile_id'
  and not exists (select 1 from information_schema.tables where table_schema='public' and table_name='timesheet_schedules');
commit;
