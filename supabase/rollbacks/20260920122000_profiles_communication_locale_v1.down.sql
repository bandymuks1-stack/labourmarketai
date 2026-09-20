-- DOWN for 20260920122000_profiles_communication_locale_v1
-- The migration added ONE nullable column on public.profiles and changed no
-- policy, grant, trigger, function or row. Dropping the column restores the
-- prior state exactly. A stored reading-language preference is lost (the
-- person can choose again after a re-apply); every page falls back to the UI
-- locale — the behaviour before this migration — and the app's read / write
-- paths degrade on 42703 without an error surface.

alter table public.profiles drop column if exists communication_locale;
