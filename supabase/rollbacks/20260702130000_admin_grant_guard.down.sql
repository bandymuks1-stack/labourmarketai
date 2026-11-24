-- Rollback for 20260702130000_admin_grant_guard.sql
-- Removes the self-promotion guard triggers and their function.
-- WARNING: rolling this back re-opens finding F-S1 (any authenticated user
-- can self-promote to admin). Only roll back if the triggers themselves
-- break a legitimate write path, and re-guard immediately after.

drop trigger if exists trg_profiles_admin_grant_guard on public.profiles;
drop trigger if exists trg_profile_roles_admin_grant_guard on public.profile_roles;
drop function if exists public.enforce_admin_grant_guard();
