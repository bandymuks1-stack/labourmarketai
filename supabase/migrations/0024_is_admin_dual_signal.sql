-- 0024 — Decouple public.is_admin() from profiles.active_role.
--
-- Owner-approved P0 fix 2026-05-28. Before this migration the helper
-- read only `profiles.active_role = 'admin'`. After a workspace switch
-- (switchActiveRole overwriting active_role) the DB-level RLS check
-- would silently fall back to `id = auth.uid()` even though the
-- application gate at requireSuperadmin still admitted the user via
-- profile_roles[role='admin']. Symptom: admin saw only own row.
--
-- The new body honours the dual signal the app layer already uses:
-- active_role='admin' OR a profile_roles row with role='admin'. Every
-- existing RLS policy that calls is_admin() picks up the new behaviour
-- on the next evaluation. No policy edits required.
--
-- Already applied to prod via Supabase MCP apply_migration prior to this
-- commit (project ref gorgitwvdzxbnaxhrsrw, name
-- 0024_is_admin_dual_signal). This file is the source-of-truth copy so
-- local + future-bootstrap installs match prod.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active_role = 'admin'
  )
  or exists (
    select 1 from public.profile_roles
    where profile_id = auth.uid() and role = 'admin'
  )
$$;
