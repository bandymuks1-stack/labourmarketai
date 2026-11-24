-- Rollback for 20260823160000_notification_preferences_v1.
--
-- Preferences are user-editable settings, not evidence (§3 append-only does
-- not apply). Dropping the table removes explicit choices; the system then
-- behaves as before the migration: in-app on, email off (the consent-first
-- default), so no email can be sent to anyone by rolling back.

drop policy if exists notification_preferences_select_own on public.notification_preferences;
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
drop policy if exists notification_preferences_update_own on public.notification_preferences;
drop policy if exists notification_preferences_delete_own on public.notification_preferences;

drop table if exists public.notification_preferences;
