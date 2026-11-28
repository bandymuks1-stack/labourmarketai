-- Rollback of 20261121100000_signup_role_admin_guard_manager_consent_v1.
-- Restores the three bodies exactly as their previous definitions, copied
-- verbatim: handle_new_user() from 0003_multi_role, enforce_admin_grant_guard()
-- from 20260702130000_admin_grant_guard, grant_org_manager() from
-- 20260824130000_null_safe_owner_guards_v2. No rows change.

begin;

-- 0003_multi_role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := nullif(new.raw_user_meta_data->>'role', '');
  loc text := coalesce(nullif(new.raw_user_meta_data->>'locale',''), 'lt');
begin
  insert into public.profiles (id, email, active_role, locale)
  values (new.id, new.email, r, loc)
  on conflict (id) do nothing;

  if r is not null then
    insert into public.profile_roles (profile_id, role)
    values (new.id, r)
    on conflict (profile_id, role) do nothing;
  end if;

  return new;
end $$;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

-- 20260702130000_admin_grant_guard
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

-- 20260824130000_null_safe_owner_guards_v2
CREATE OR REPLACE FUNCTION public.grant_org_manager(p_org_id uuid, p_profile_id uuid, p_operations_role text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); v_owner uuid; v_existing uuid; v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_operations_role is not null and p_operations_role not in ('foreman','project_manager','site_manager','hr','company_admin') then return 'invalid_operations_role'; end if;
  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or (v_owner is not null and v_owner = uid)) then return 'not_owner'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then return 'profile_not_found'; end if;
  select id into v_existing from public.engagement_contexts
   where profile_id = p_profile_id and organization_id = p_org_id and relationship_slug = 'manager' and status = 'active' limit 1;
  if v_existing is not null then
    update public.engagement_contexts set operations_role = coalesce(p_operations_role, operations_role), updated_at = now() where id = v_existing;
    return 'already_manager';
  end if;
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, is_primary, operations_role, hash_self)
  values (p_profile_id, p_org_id, 'manager', 'active', false, p_operations_role,
     encode(extensions.digest(p_profile_id::text || ':manager:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'grant_org_manager', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'profile_id', p_profile_id, 'relationship_slug', 'manager', 'operations_role', p_operations_role, 'result', 'granted'));
  return 'granted';
end $function$;
revoke execute on function public.grant_org_manager(uuid, uuid, text) from public, anon;
grant execute on function public.grant_org_manager(uuid, uuid, text) to authenticated;

commit;
