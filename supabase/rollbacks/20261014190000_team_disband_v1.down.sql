-- ROLLBACK for 20261014190000_team_disband_v1.sql
--
-- Restores create_team_v1 to its previous body (the cap of 20 counts every
-- team the owner ever created, archived or not) and removes disband_team_v1.
--
-- DATA IS NOT TOUCHED. Brigades already disbanded stay archived and their
-- ended memberships stay ended: un-disbanding is not a rollback of code, it
-- would be a new write that rewrites history, and the owner decides it per
-- brigade. Under the restored create_team_v1 an owner whose archived +
-- active brigades reach 20 is again refused a new one (the pre-v1 behaviour).

begin;

drop function if exists public.disband_team_v1(uuid);

create or replace function public.create_team_v1(p_team_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid          uuid := auth.uid();
  cleaned_name text := nullif(trim(coalesce(p_team_name, '')), '');
  v_new        uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations o
     where o.owner_profile_id = uid
       and o.organization_type <> 'team'
  ) and not public.is_admin() then
    return 'not_allowed';
  end if;

  if cleaned_name is null
     or char_length(cleaned_name) < 2
     or char_length(cleaned_name) > 80 then
    return 'invalid_team_name';
  end if;

  if (select count(*) from public.organizations o
       where o.owner_profile_id = uid
         and o.organization_type = 'team') >= 20 then
    return 'team_limit_reached';
  end if;

  insert into public.organizations
    (owner_profile_id, organization_type, display_name)
  values
    (uid, 'team', cleaned_name)
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_team_v1', 'organizations', v_new,
    jsonb_build_object(
      'organization_type', 'team',
      'display_name', cleaned_name,
      'result', 'created'));

  return 'created';
end $function$;

commit;
