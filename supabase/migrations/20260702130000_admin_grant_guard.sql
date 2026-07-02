-- @human-gate-approved
-- 20260702130000 — Block self-promotion to admin (P0, full-project audit 2026-07-02).
--
-- Problem (finding F-S1, runtime/audits/full-project-findings-2026-07-02.md):
--   * profiles_update (0001) lets a user update their OWN row with no column
--     restriction, and 0003's CHECK constraint permits active_role='admin'.
--   * profile_roles_insert (0009) lets a user insert ANY role for themselves.
--   * is_admin() (0024) trusts BOTH self-writable signals.
--   Net effect: any authenticated user could run
--     update profiles set active_role='admin' where id = auth.uid()
--   (or insert an admin profile_roles row) from the anon-key browser client
--   and gain full is_admin() RLS bypass plus admin UI access.
--
-- Fix: BEFORE triggers on both tables RAISE when the admin value is being
-- set by a caller that carries a user JWT (auth.uid() is not null) and is
-- not already an admin. The legitimate grant path —
-- scripts/admin-grant-superadmin.ts via the service-role client — carries no
-- user JWT (auth.uid() is null) and passes, as do migration/bootstrap
-- contexts. Existing admins may still manage roles.
--
-- Demotion (clearing the admin value) is intentionally NOT blocked.
--
-- NOT applied to production by the automated session. Owner applies after
-- review (supabase db push / MCP apply_migration).

create or replace function public.enforce_admin_grant_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  wants_admin boolean := false;
begin
  if tg_table_name = 'profiles' then
    wants_admin := (new.active_role = 'admin')
      and (tg_op = 'INSERT' or old.active_role is distinct from 'admin');
  elsif tg_table_name = 'profile_roles' then
    wants_admin := (new.role = 'admin')
      and (tg_op = 'INSERT' or old.role is distinct from 'admin');
  end if;

  if wants_admin
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'admin role can only be granted by an existing admin or the owner service-role script'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_admin_grant_guard on public.profiles;
create trigger trg_profiles_admin_grant_guard
  before insert or update of active_role on public.profiles
  for each row execute function public.enforce_admin_grant_guard();

drop trigger if exists trg_profile_roles_admin_grant_guard on public.profile_roles;
create trigger trg_profile_roles_admin_grant_guard
  before insert or update of role on public.profile_roles
  for each row execute function public.enforce_admin_grant_guard();

-- ROLLBACK (down):
--   drop trigger if exists trg_profiles_admin_grant_guard on public.profiles;
--   drop trigger if exists trg_profile_roles_admin_grant_guard on public.profile_roles;
--   drop function if exists public.enforce_admin_grant_guard();
