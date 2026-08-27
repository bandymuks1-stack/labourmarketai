-- ============================================================================
-- ROLLBACK for 20260826182421_practice_work_history_v1.sql
--
-- Restores the pre-widening allowlist ('employee','freelancer','consultant',
-- 'collaborator'). The function body is otherwise identical.
--
-- DATA IS NOT TOUCHED. Placement rows (relationship_slug 'student' /
-- 'volunteer') created while the widening was live are the worker's own
-- history and stay exactly where they are: reverting a validation rule must
-- never delete something a person entered about themselves. After this
-- rollback those rows remain readable, remain filtered into their own CV
-- section by the read layer, and remain removable through
-- remove_self_declared_work_history_v1.
--
-- Consequence of running this: no NEW placement can be recorded.
-- ============================================================================

begin;

create or replace function public.save_self_declared_work_history_v1(
  p_title             text,
  p_relationship_slug text,
  p_started_at        date default null,
  p_ended_at          date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_title  text := btrim(coalesce(p_title, ''));
  v_status text;
  v_id     uuid;
  v_count  int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if p_relationship_slug is null or p_relationship_slug not in
       ('employee','freelancer','consultant','collaborator') then
    raise exception 'Invalid relationship' using errcode = '22023';
  end if;
  if p_started_at is not null and p_ended_at is not null
     and p_ended_at < p_started_at then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  select ec.id into v_id
  from public.engagement_contexts ec
  where ec.profile_id = uid
    and ec.organization_id is null
    and lower(coalesce(ec.title, '')) = lower(v_title)
    and ec.relationship_slug = p_relationship_slug
    and ec.started_at is not distinct from p_started_at
    and ec.ended_at   is not distinct from p_ended_at
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select count(*) into v_count
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id is null;
  if v_count >= 60 then
    raise exception 'Too many self-declared entries' using errcode = '54000';
  end if;

  v_status := case when p_ended_at is not null then 'ended' else 'active' end;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary,
     title, started_at, ended_at, hash_self)
  values
    (uid, null, p_relationship_slug, v_status, false,
     v_title, p_started_at, p_ended_at,
     encode(extensions.digest(
       uid::text || ':' || p_relationship_slug || ':' || v_title || ':'
         || coalesce(p_started_at::text, '') || ':' || coalesce(p_ended_at::text, ''),
       'sha256'), 'hex'))
  returning id into v_id;

  return v_id;
end;
$function$;

-- Same privilege floor as the forward migration — a rollback must not leave
-- the function reachable by anon on a freshly reset database.
revoke all on function
  public.save_self_declared_work_history_v1(text, text, date, date)
  from public, anon;
grant execute on function
  public.save_self_declared_work_history_v1(text, text, date, date)
  to authenticated;

commit;
