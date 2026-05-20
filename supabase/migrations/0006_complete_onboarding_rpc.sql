-- ════════════════════════════════════════════════════════════════════════
-- 0006_complete_onboarding_rpc.sql — Onboarding entity-creation RPC
--
-- Fixes the M1 audit blocker: `completeOnboarding` previously updated
-- `profiles` + upserted `profile_roles` but never created the matching
-- `workers` / `companies` / `agencies` row, so a fresh worker had no
-- entity to attach `worker_skills` to. This RPC bundles all three steps
-- into one transaction.
--
-- SECURITY DEFINER on purpose: it runs as the function owner, so the
-- writes bypass per-table RLS and per-table grants. Safety is enforced
-- inside the function — every write keys off `auth.uid()`, and only
-- the four user-pickable roles are accepted.
--
-- Idempotent at the SQL layer (CREATE OR REPLACE; ON CONFLICT DO NOTHING
-- on the unique `workers.profile_id`; explicit existence check on the
-- non-unique `companies.profile_id` / `agencies.profile_id`).
--
-- Re-running the function is safe — the per-role entity is created only
-- if it does not already exist, so retries / re-submissions are no-ops.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.complete_onboarding(
  p_role          text,
  p_display_name  text,
  p_country       text,
  p_role_data     jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('worker','company','agency','customer') then
    raise exception 'Invalid onboarding role: %', p_role
      using errcode = '22023';
  end if;

  -- 1. profiles core fields. set_updated_at trigger bumps updated_at.
  update public.profiles
     set full_name    = nullif(trim(coalesce(p_display_name, '')), ''),
         country      = nullif(trim(coalesce(p_country, '')), ''),
         active_role  = p_role,
         onboarded_at = coalesce(onboarded_at, now()),
         onboarded    = true
   where id = uid;

  -- 2. profile_roles catalogue (idempotent: re-submit replaces role_data).
  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, p_role, true, coalesce(p_role_data, '{}'::jsonb))
  on conflict (profile_id, role) do update
     set is_active = true,
         role_data = excluded.role_data;

  -- 3. role-specific entity row. customer has no entity in M1 (B2C
  --    service_requests land in M3 — docs/DATA_MODEL.md "Architectural
  --    sketches"). Each branch is no-op if a row already exists.
  if p_role = 'worker' then
    insert into public.workers (
      profile_id,
      display_name,
      current_location_country
    )
    values (
      uid,
      nullif(trim(coalesce(p_display_name, '')), ''),
      nullif(trim(coalesce(p_country, '')), '')
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
        nullif(trim(coalesce(p_country, '')), '')
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
        nullif(trim(coalesce(p_country, '')), '')
      );
    end if;
  end if;
end $$;

-- Lock down: revoke from PUBLIC, allow only signed-in users to call it.
revoke all on function public.complete_onboarding(text, text, text, jsonb)
  from public;
grant execute on function public.complete_onboarding(text, text, text, jsonb)
  to authenticated;
