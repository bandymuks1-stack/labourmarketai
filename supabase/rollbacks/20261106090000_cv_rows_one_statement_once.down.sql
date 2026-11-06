-- Rollback for 20261106090000_cv_rows_one_statement_once.sql: production as it was.
-- Drops the two indexes and restores the RPC body without the lock. No row is touched:
-- what was stored while the indexes stood stays, and two new requests at once can again
-- store a row twice.
begin;

drop index if exists public.worker_education_one_statement_once;
drop index if exists public.worker_achievements_one_statement_once;

create or replace function public.save_self_declared_work_history_v1(
  p_title text,
  p_relationship_slug text,
  p_started_at date default null::date,
  p_ended_at date default null::date)
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
  -- Closed relationship set (subset of relationship_types; the FK would also
  -- enforce existence, this enforces the PERSON'S-OWN-WORK subset).
  -- WIDENED 20260826182421: 'student' and 'volunteer' are real ways a person
  -- works. They are kept distinct from employment on every read surface, so
  -- widening this list does not let a placement be claimed as a job.
  -- 'manager' stays out — an administrative relationship, not own work.
  if p_relationship_slug is null or p_relationship_slug not in
       ('employee','freelancer','consultant','collaborator',
        'student','volunteer') then
    raise exception 'Invalid relationship' using errcode = '22023';
  end if;
  if p_started_at is not null and p_ended_at is not null
     and p_ended_at < p_started_at then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  -- Idempotent: an identical self-declared row already exists → return it.
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

  -- Abuse bound: at most 60 organization-less rows per profile (includes the
  -- trigger-provisioned personal engagement).
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

commit;
