-- @human-gate-approved
-- 20261106090000_cv_rows_one_statement_once
--
-- RED: a new constraint on tables holding real people's rows, plus a SECURITY DEFINER
-- replace and dynamic SQL. Owner approval first. Apply via Supabase MCP `apply_migration`,
-- never `supabase db push`. No row is changed or removed.
--
-- WHY: `confirmCvEducationAction` and `insertAchievement` read the person's rows, then
-- insert. Two requests at once both read nothing and both insert: 2 x 201 in every
-- parallel round of walk 42098444964. `save_self_declared_work_history_v1` has the same
-- gap inside its body. The code cannot close this; only the database can.
--
-- FIX:
--   1. worker_education and worker_achievements: a unique index on what the app already
--      calls the same statement (`findSameEducation`, `findSameAchievement`).
--      The second insert gets 23505, and the app answers it as saved (#3110).
--   2. Self-declared work history: a per-person lock in its only door, the RPC. There an
--      index would also bind every other writer of engagement_contexts.
--
-- EXISTING DUPLICATES stay as they are, and they would make a full unique index fail.
-- So each index covers only rows created from this migration on (`created_at >= cutover`).
-- `created_at` is not in the insert grant, so a request cannot date itself around it.
-- Two new rows can't collide; a new repeat of an OLD row is stopped by the action's read,
-- as it is today. Removing the old duplicates is a separate owner decision. After it the
-- predicate can go.
--
-- description is hashed: up to 2000 characters don't fit a btree entry.
-- Lock: the indexes take a SHARE lock until commit: writes to these two tables wait, reads don't.
-- The build reads a small table and indexes no existing row. A writer stuck in an open
-- transaction would make everyone queue behind this migration, so it gives up after 5 s
-- (55P03), changes nothing, and can simply be run again.
-- @plan-cache-proof: n/a uniqueness constraints that no RPC or read filters by; the columns stay served by the existing profile_id index
-- Rollback: supabase/rollbacks/20261106090000_cv_rows_one_statement_once.down.sql
-- PROOF: scripts/db-proof/cv-rows-one-statement-once.sh and cv-rows-one-statement-once-pg17.sh

do $migration$
declare
  v_cutover text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00';
begin
  perform set_config('lock_timeout', '5s', true);

  execute format(
    $sql$
    create unique index worker_education_one_statement_once
      on public.worker_education (
        profile_id,
        lower(btrim(institution_name)),
        lower(btrim(coalesce(program_or_field, ''))),
        education_type_slug,
        start_year,
        end_year,
        is_current
      ) nulls not distinct
      where created_at >= %L::timestamptz
    $sql$, v_cutover);

  execute format(
    $sql$
    create unique index worker_achievements_one_statement_once
      on public.worker_achievements (
        profile_id,
        lower(btrim(title)),
        md5(lower(btrim(coalesce(description, '')))),
        achieved_at,
        achievement_type_slug
      ) nulls not distinct
      where created_at >= %L::timestamptz
    $sql$, v_cutover);
end;
$migration$;

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

  -- One save per person at a time, until this transaction ends: the second of two
  -- at once reads what the first stored. Nobody else waits.
  perform pg_advisory_xact_lock(hashtextextended('self_declared_work_history:' || uid::text, 0));

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

-- The grants production already has, stated: authenticated only.
revoke execute on function public.save_self_declared_work_history_v1(text, text, date, date) from public, anon;
grant execute on function public.save_self_declared_work_history_v1(text, text, date, date) to authenticated;

-- ROLLBACK (the sibling file is the runnable one):
--   drop index if exists public.worker_education_one_statement_once;
--   drop index if exists public.worker_achievements_one_statement_once;
--   create or replace function public.save_self_declared_work_history_v1 ... (body without the lock)
