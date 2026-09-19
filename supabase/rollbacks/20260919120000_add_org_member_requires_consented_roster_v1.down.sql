-- DOWN for 20260919120000_add_org_member_requires_consented_roster_v1
-- Restores the 20260824130000_null_safe_owner_guards_v2 body of
-- public.add_org_member verbatim (no roster precondition). Grants unchanged.

begin;

create or replace function public.add_org_member(p_org_id uuid, p_worker_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); v_profile uuid; v_owner uuid; v_existing uuid; v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or (v_owner is not null and v_owner = uid) or public.manages_organization(p_org_id)) then return 'not_authorized'; end if;
  select profile_id into v_profile from public.workers where id = p_worker_id;
  if v_profile is null then return 'worker_not_found'; end if;
  select id into v_existing from public.engagement_contexts
   where profile_id = v_profile and organization_id = p_org_id and relationship_slug = 'employee' and status = 'active' limit 1;
  if v_existing is not null then return 'already_member'; end if;
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values (v_profile, p_org_id, 'employee', 'active', false,
     encode(extensions.digest(v_profile::text || ':employee:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'add_org_member', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'worker_id', p_worker_id, 'profile_id', v_profile, 'relationship_slug', 'employee', 'result', 'added'));
  return 'added';
end $function$;

revoke execute on function public.add_org_member(uuid, uuid) from public, anon;
grant execute on function public.add_org_member(uuid, uuid) to authenticated;

commit;
