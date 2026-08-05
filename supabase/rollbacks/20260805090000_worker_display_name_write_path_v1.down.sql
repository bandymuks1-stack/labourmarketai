-- Rollback for 20260805090000_worker_display_name_write_path_v1.sql
--
-- Restores `public.complete_onboarding(text, text, text, jsonb, uuid)` exactly
-- as 0008_professions.sql defines it — i.e. back to
-- `on conflict (profile_id) do nothing` in the worker branch.
--
-- WHAT ROLLING BACK COSTS: the defect returns. Every account onboarded after
-- this point again has `workers.display_name` NULL, and every employer-facing
-- roster that names a worker through that column falls back — in
-- `listProjectAssignments` all the way down to a raw UUID fragment, because
-- `profiles_select` keeps `profiles.full_name` unreadable to employers. The
-- pre-migration state is not a safe resting place; it is the broken one.
--
-- WHAT ROLLING BACK DOES **NOT** DO: it does not delete or NULL any name that
-- was already written. Rows repaired while the forward migration was live keep
-- their `display_name` and `current_location_country`. This down script only
-- changes future behaviour — it touches no data. Reversing is therefore
-- lossless, and re-applying the forward migration is safe at any time.
--
-- Signature is unchanged in both directions, so there is no PostgREST 404
-- window and no client deploy has to be sequenced around this.
--
-- Only run this if the forward change caused a concrete problem.

create or replace function public.complete_onboarding(
  p_role          text,
  p_display_name  text,
  p_country       text,
  p_role_data     jsonb,
  p_profession_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  wid             uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('worker','company','agency','customer') then
    raise exception 'Invalid onboarding role: %', p_role
      using errcode = '22023';
  end if;

  -- 1. profiles core fields.
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

  -- 3. role-specific entity row.
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

    if p_profession_id is not null then
      select id into wid from public.workers where profile_id = uid;
      if wid is not null then
        insert into public.worker_professions (
          worker_id,
          profession_id,
          is_primary
        )
        values (
          wid,
          p_profession_id,
          not exists (
            select 1 from public.worker_professions
             where worker_id = wid and is_primary
          )
        )
        on conflict (worker_id, profession_id) do nothing;
      end if;
    end if;

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

comment on function public.complete_onboarding(text, text, text, jsonb, uuid) is
  'Onboarding RPC: profiles core fields, profile_roles catalogue, and the '
  'role-specific entity row (0008 shape, restored by rollback).';

revoke all on function public.complete_onboarding(text, text, text, jsonb, uuid)
  from public;
grant execute
  on function public.complete_onboarding(text, text, text, jsonb, uuid)
  to authenticated;
