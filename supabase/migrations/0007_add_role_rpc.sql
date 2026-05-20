-- ════════════════════════════════════════════════════════════════════════
-- 0007_add_role_rpc.sql — Add-role entity-creation RPC
--
-- Parallel of 0006: `addRole` (called from RoleSwitcher) previously only
-- upserted `profile_roles` and switched `profiles.active_role`, but never
-- created the matching `workers` / `companies` / `agencies` row. That left
-- a user with the new role in catalogue but no entity to attach
-- role-specific data to.
--
-- Differences from `complete_onboarding`:
--   • No display_name / country params — the user already onboarded;
--     the entity inherits `profiles.country` for location.
--   • profiles.full_name / onboarded_at are NOT touched.
--   • Catalogue upsert + entity insert happen in one transaction.
--
-- SECURITY DEFINER for the same reasons as 0006: writes bypass per-table
-- RLS / grants; safety is enforced inside the function via auth.uid()
-- and a strict role allowlist.
--
-- Idempotent (CREATE OR REPLACE; ON CONFLICT / IF NOT EXISTS on entity
-- inserts) — calling twice with the same role is a no-op.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.add_role(
  p_role      text,
  p_role_data jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  profile_country text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('worker','company','agency','customer') then
    raise exception 'Invalid role: %', p_role
      using errcode = '22023';
  end if;

  -- pick up the user's existing country (set during onboarding) so the
  -- entity row gets a sensible default location.
  select country into profile_country
    from public.profiles
   where id = uid;

  -- switch the workspace into the new role.
  update public.profiles
     set active_role = p_role
   where id = uid;

  -- catalogue entry (idempotent — second call replaces role_data).
  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, p_role, true, coalesce(p_role_data, '{}'::jsonb))
  on conflict (profile_id, role) do update
     set is_active = true,
         role_data = excluded.role_data;

  -- entity row (idempotent — same guards as 0006).
  if p_role = 'worker' then
    insert into public.workers (
      profile_id,
      current_location_country
    )
    values (
      uid,
      nullif(trim(coalesce(profile_country, '')), '')
    )
    on conflict (profile_id) do nothing;

  elsif p_role = 'company' then
    if not exists (
      select 1 from public.companies where profile_id = uid
    ) then
      insert into public.companies (
        profile_id, legal_name, display_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(profile_country, '')), '')
      );
    end if;

  elsif p_role = 'agency' then
    if not exists (
      select 1 from public.agencies where profile_id = uid
    ) then
      insert into public.agencies (
        profile_id, legal_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(profile_country, '')), '')
      );
    end if;
  end if;
  -- customer: no entity in M1 (B2C service_requests land in M3).
end $$;

revoke all on function public.add_role(text, jsonb) from public;
grant execute on function public.add_role(text, jsonb) to authenticated;
