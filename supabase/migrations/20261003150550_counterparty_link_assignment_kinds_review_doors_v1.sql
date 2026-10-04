-- @human-gate-approved
--
-- SAFETY CLASS: RED (SECURITY DEFINER functions, GRANT/REVOKE, replacement of
-- two functions of the RED migration 20261003150500). Draft PR +
-- `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval, AFTER 20261003150500. This marker is the risk
-- ACKNOWLEDGEMENT, not an approval. NOT APPLIED to any database.
--
-- 20261003150550 - COUNTERPARTY LINK: TEAM ASSIGNMENTS + THE UI READ DOORS.
--
-- Slice 2 of the EVID-2 redesign (the product journey over the model of
-- 20261003150500). Additive in behaviour: nothing is backfilled, no row of
-- any table is written here, no policy or table grant is touched.
--
--  1. work_relationship_active_v1(project, worker): ONE internal predicate for
--     "this worker has a real, ACTIVE work relationship on this project".
--       'person' = an active project_worker_assignments row (as before);
--       'team'   = the worker is a member, AS OF NOW, of a team with an
--                  ACTIVE team_assignments row on the project
--                  (team_member_at_v1, lane feat/cc/team-assignment-canonical-v1,
--                  migration 20261003150600). It is resolved dynamically and
--                  only when that relation exists, so this file applies before,
--                  after or without that lane. NEVER fan-out: no per-person row
--                  is created; the team assignment stays ONE relationship and
--                  membership is read at the instant of use.
--  2. work_counterparty_link_valid_v1 and register_work_counterparty_link_v1
--     (same signatures, same ACLs) call that predicate instead of the
--     person-only EXISTS. Every other rule of both functions is unchanged.
--  3. list_counterparty_link_candidates_v1(project): for the project's own
--     authorized representative ONLY - the workers with a real relationship on
--     the project (person or team), and their active link. Not an enumeration
--     oracle: a non-representative gets zero rows.
--  4. counterparty_review_entry_detail_v1(entry): the counterparty
--     representative's NARROW read of ONE submitted entry (work text, labelled
--     metrics, photo metadata, decision history through the correction chain).
--     Authority = the existing resolver (basis 'counterparty'); NULL for
--     everybody else. journal_entries RLS is NOT widened.
--  5. entry_review_states_v1(entry ids): the SUBJECT's own view of the review
--     state of their entries, plus the legitimate counterparties they may
--     submit to (valid links only). Owner-scoped (owns_worker), nothing for
--     everyone else.
--
--  6. reviewable_journal_entry_ids() is employer-only again (the counterparty
--     branch added by 20261003150500 is removed): every consumer of that set
--     is an employer surface whose decision verifies skills. Client review has
--     its own queue (list_counterparty_review_queue_v1).
--
--  7. ONE additional storage SELECT policy on the private journal photo bucket
--     (counterparty_can_read_photo_v1): the counterparty opens the photos of an
--     entry submitted to it under its OWN session, so the app needs no
--     service-role signer. Same resolver; closes on revocation.
--
-- NOT DONE: no historical/reconstructed confirmation path; no change to the
-- guard trigger, the resolver, review_journal_entry; no change to any existing
-- policy (the new storage policy is purely additive).
--
-- Rollback: supabase/rollbacks/20261003150550_counterparty_link_assignment_kinds_review_doors_v1.down.sql

begin;

-- 1. The single relationship predicate (internal) --------------------------
create or replace function public.work_relationship_active_v1(p_project_id uuid, p_worker_id uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_profile uuid; v_team boolean := false;
begin
  if p_project_id is null or p_worker_id is null then return null; end if;
  if exists (select 1 from public.project_worker_assignments a
              where a.project_id = p_project_id and a.worker_id = p_worker_id
                and a.status = 'active') then
    return 'person';
  end if;
  if to_regclass('public.team_assignments') is not null
     and to_regprocedure('public.team_member_at_v1(uuid,uuid,timestamptz)') is not null then
    select w.profile_id into v_profile from public.workers w where w.id = p_worker_id;
    if v_profile is null then return null; end if;
    execute 'select exists (select 1 from public.team_assignments ta
                             where ta.project_id = $1 and ta.status = ''active'' and ta.ended_at is null
                               and public.team_member_at_v1(ta.team_org_id, $2, now()))'
       into v_team using p_project_id, v_profile;
    if coalesce(v_team, false) then return 'team'; end if;
  end if;
  return null;
end $$;

-- 2. Link validity + registration use it ------------------------------------
create or replace function public.work_counterparty_link_valid_v1(p_link_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select exists (
    select 1
      from public.work_counterparty_links l
      join public.projects p on p.id = l.project_id
      join public.workers w on w.id = l.worker_id
     where l.id = p_link_id
       and l.revoked_at is null
       and p.organization_id = l.counterparty_organization_id
       and public.work_relationship_active_v1(l.project_id, l.worker_id) is not null
       -- a member of the counterparty organization is that organization's
       -- employee, not its counterparty: employer review is their path.
       and not public.profile_is_member_of_organization_v1(w.profile_id, l.counterparty_organization_id));
$$;

create or replace function public.register_work_counterparty_link_v1(
  p_project_id uuid, p_worker_id uuid, p_party_role text default 'client')
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_subject uuid; v_id uuid; v_kind text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_party_role is null or p_party_role not in
     ('client','end_client','project_owner','customer','contracting_party') then
    return 'invalid_party_role';
  end if;
  select p.organization_id into v_org from public.projects p where p.id = p_project_id;
  if not found then return 'project_not_found'; end if;
  if v_org is null then return 'project_has_no_organization'; end if;
  if not public.profile_manages_organization_v1(uid, v_org) then return 'not_authorized'; end if;
  select w.profile_id into v_subject from public.workers w where w.id = p_worker_id;
  if not found then return 'worker_not_found'; end if;
  if v_subject is not null and v_subject = uid then return 'subject_cannot_register_own_counterparty'; end if;
  v_kind := public.work_relationship_active_v1(p_project_id, p_worker_id);
  if v_kind is null then
    return 'no_work_relationship';
  end if;
  if public.profile_is_member_of_organization_v1(v_subject, v_org) then
    return 'subject_is_member_of_counterparty';
  end if;
  if public.profiles_share_organization_v1(v_subject, uid) then
    return 'counterparty_not_independent';
  end if;

  select l.id into v_id from public.work_counterparty_links l
   where l.worker_id = p_worker_id and l.project_id = p_project_id
     and l.counterparty_organization_id = v_org and l.party_role = p_party_role
     and l.revoked_at is null;
  if found then return 'already_registered'; end if;

  insert into public.work_counterparty_links
    (worker_id, project_id, counterparty_organization_id, party_role, basis, established_by)
  values (p_worker_id, p_project_id, v_org, p_party_role, 'project_assignment', uid)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'register_work_counterparty_link', 'work_counterparty_links', v_id,
    jsonb_build_object('project_id', p_project_id, 'worker_id', p_worker_id,
                       'counterparty_organization_id', v_org, 'party_role', p_party_role,
                       'relationship_kind', v_kind));
  return 'registered';
end $$;

-- 3. Candidates for the project representative -------------------------------
create or replace function public.list_counterparty_link_candidates_v1(p_project_id uuid)
 returns table (worker_id uuid, display_name text, relationship_kind text,
                link_id uuid, party_role text, established_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare uid uuid := auth.uid(); v_org uuid; v_team uuid[] := '{}';
begin
  if uid is null then return; end if;
  select p.organization_id into v_org from public.projects p where p.id = p_project_id;
  if v_org is null or not public.profile_manages_organization_v1(uid, v_org) then return; end if;
  -- Members of teams ACTIVELY assigned to this project (one relationship, read
  -- through membership as of now - never a copied per-person row).
  if to_regclass('public.team_assignments') is not null
     and to_regprocedure('public.team_member_at_v1(uuid,uuid,timestamptz)') is not null then
    execute 'select coalesce(array_agg(distinct w.id), ''{}''::uuid[])
               from public.team_assignments ta
               join public.engagement_contexts ec
                 on ec.organization_id = ta.team_org_id and ec.relationship_slug = ''employee''
               join public.workers w on w.profile_id = ec.profile_id
              where ta.project_id = $1 and ta.status = ''active'' and ta.ended_at is null
                and public.team_member_at_v1(ta.team_org_id, ec.profile_id, now())'
       into v_team using p_project_id;
  end if;
  return query
    with cand as (
      select a.worker_id as wid from public.project_worker_assignments a
       where a.project_id = p_project_id and a.status = 'active'
      union
      select unnest(v_team))
    select c.wid, w.display_name,
           public.work_relationship_active_v1(p_project_id, c.wid),
           l.id, l.party_role, l.established_at
      from cand c
      join public.workers w on w.id = c.wid
      left join public.work_counterparty_links l
        on l.worker_id = c.wid and l.project_id = p_project_id
       and l.counterparty_organization_id = v_org and l.revoked_at is null
     where public.work_relationship_active_v1(p_project_id, c.wid) is not null
       -- only workers this representative could legitimately be the
       -- counterparty of: not their own colleagues, not a shared-organization
       -- second login of the subject (same rules as register_*).
       and not public.profile_is_member_of_organization_v1(w.profile_id, v_org)
       and not public.profiles_share_organization_v1(w.profile_id, uid)
     order by w.display_name nulls last, c.wid;
end $$;

-- 4. The counterparty's narrow read of ONE submitted entry -------------------
create or replace function public.counterparty_review_entry_detail_v1(p_entry_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid(); v_auth jsonb; v_out jsonb;
begin
  if uid is null then return null; end if;
  v_auth := public.journal_entry_review_authority_v1(p_entry_id, uid);
  if v_auth is null or (v_auth ->> 'basis') is distinct from 'counterparty' then return null; end if;
  select jsonb_build_object(
      'entry_id', je.id,
      'subject_display_name', w.display_name,
      'project_id', je.project_id,
      'project_name', pr.title,
      'party_organization_id', v_auth ->> 'party_organization_id',
      'party_role', v_auth ->> 'party_role',
      'original_text', je.original_text,
      'original_language', je.original_language::text,
      'created_at', je.created_at,
      'submitted_at', s.submitted_at,
      'resubmission_of_entry_id', s.resubmission_of_entry_id,
      'superseded', je.superseded_by is not null,
      'metrics', coalesce((select jsonb_agg(jsonb_build_object(
            'metric_slug', m.metric_slug, 'value_numeric', m.value_numeric,
            'value_text', m.value_text, 'unit_slug', m.unit_slug) order by m.created_at)
          from public.journal_entry_metrics m where m.entry_id = je.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', ph.id, 'file_name', ph.file_name, 'storage_path', ph.storage_path) order by ph.created_at)
          from public.journal_entry_photos ph
         where ph.entry_id = je.id and ph.upload_status = 'uploaded'), '[]'::jsonb),
      'history', coalesce((
          with recursive chain(eid, depth) as (
            select je.id, 0
            union all
            select e2.correction_of, c.depth + 1
              from chain c join public.journal_entries e2 on e2.id = c.eid
             where e2.correction_of is not null and c.depth < 10)
          select jsonb_agg(jsonb_build_object(
                   'entry_id', cf.entry_id,
                   'action', cf.confirmation_scope ->> 'action',
                   'decision', cf.confirmation_scope ->> 'decision',
                   'note', cf.confirmation_scope ->> 'note',
                   'at', cf.created_at) order by cf.created_at, cf.id)
            from public.journal_entry_confirmations cf
           where cf.entry_id in (select eid from chain)
             and cf.confirmation_scope #>> '{authority,basis}' = 'counterparty'), '[]'::jsonb))
    into v_out
    from public.journal_entries je
    join public.journal_entry_review_submissions s on s.entry_id = je.id
    left join public.workers w on w.id = je.worker_id
    left join public.projects pr on pr.id = je.project_id
   where je.id = p_entry_id and je.deleted_at is null;
  return v_out;
end $$;

-- 5. The SUBJECT's own review state + legitimate counterparties --------------
create or replace function public.entry_review_states_v1(p_entry_ids uuid[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid(); r record; v_out jsonb := '{}'::jsonb; v_one jsonb;
begin
  if uid is null or p_entry_ids is null then return v_out; end if;
  for r in
    select je.id, je.worker_id, je.project_id, je.superseded_by, je.correction_of
      from public.journal_entries je
     where je.id = any (p_entry_ids[1:200]) and je.deleted_at is null
       and public.owns_worker(je.worker_id)
  loop
    v_one := jsonb_build_object(
      'superseded_by', r.superseded_by,
      'correction_of', r.correction_of,
      'submission', (select jsonb_build_object(
            'link_id', s.link_id, 'submitted_at', s.submitted_at,
            'resubmission_of_entry_id', s.resubmission_of_entry_id,
            'party_name', coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), '')), 'party_role', l.party_role)
          from public.journal_entry_review_submissions s
          join public.work_counterparty_links l on l.id = s.link_id
          left join public.organizations o on o.id = l.counterparty_organization_id
         where s.entry_id = r.id),
      'latest', (select jsonb_build_object(
            'decision', c.confirmation_scope ->> 'decision', 'note', c.confirmation_scope ->> 'note',
            'at', c.created_at)
          from public.journal_entry_confirmations c
         where c.entry_id = r.id and c.confirmation_scope #>> '{authority,basis}' = 'counterparty'
         order by c.created_at desc, c.id desc limit 1),
      'candidates', case
          when r.superseded_by is not null or r.project_id is null
               or exists (select 1 from public.journal_entry_review_submissions s2 where s2.entry_id = r.id)
          then '[]'::jsonb
          else coalesce((select jsonb_agg(jsonb_build_object(
                   'link_id', l.id, 'party_name', coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), '')), 'party_role', l.party_role)
                   order by l.established_at)
                 from public.work_counterparty_links l
                 left join public.organizations o on o.id = l.counterparty_organization_id
                where l.worker_id = r.worker_id and l.project_id = r.project_id
                  and public.work_counterparty_link_valid_v1(l.id)), '[]'::jsonb) end);
    v_out := v_out || jsonb_build_object(r.id::text, v_one);
  end loop;
  return v_out;
end $$;

-- 5b. The EMPLOYER review set is employer-only again ------------------------
-- 20261003150500 also offered counterparty submissions through
-- reviewable_journal_entry_ids(). Every consumer of that set (manager inbox,
-- quick-confirm queue, confirm-pulse / dashboard counters, review report,
-- conversation confirm-work, worker readiness) is an EMPLOYER surface whose
-- only decision verifies skills (employer-only, refused for a counterparty).
-- A client's acceptance is a different claim by a different party and has its
-- own queue, list_counterparty_review_queue_v1 (journal.counterparty UI), so
-- the employer set must neither list those entries nor count them.
-- Same signature, same ACL (replaced in place); employer branch unchanged.
CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join public.workers w on w.id = je.worker_id
    where ec.organization_id is not null
      and je.superseded_by is null
      and je.deleted_at is null
      and coalesce(ec.journal_review_enabled, false) is true
      and coalesce(w.profile_id <> uid, true)
      and (public.journal_entry_review_authority_v1(je.id, uid) ->> 'basis') = 'employer'
      and not exists (select 1 from public.journal_entry_confirmations c
                       where c.entry_id = je.id
                         and c.confirmer_id is distinct from w.profile_id);
end $function$;

-- 5c. The submitted entry's PHOTO FILES, under the counterparty's own session --
-- The private bucket is owner-scoped, so a counterparty could not open the
-- photos the subject attached. Instead of a service-role signer in the app,
-- the bucket gets ONE additional SELECT policy whose predicate is the same
-- resolver as everything else: an authenticated caller may read an object only
-- when it is the 'uploaded' photo of an entry that was explicitly SUBMITTED to
-- a party the caller represents (basis 'counterparty', link still valid).
-- Revocation or an ended assignment closes it at the next request.
create or replace function public.counterparty_can_read_photo_v1(p_object_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select auth.uid() is not null and coalesce(exists (
    select 1
      from public.journal_entry_photos ph
      join public.journal_entry_review_submissions s on s.entry_id = ph.entry_id
      join public.journal_entries je on je.id = ph.entry_id
     where ph.storage_path = p_object_name
       and ph.upload_status = 'uploaded'
       and je.deleted_at is null
       and (public.journal_entry_review_authority_v1(ph.entry_id, auth.uid()) ->> 'basis') = 'counterparty'
  ), false);
$$;

drop policy if exists "journal-entry-photos counterparty select" on storage.objects;
create policy "journal-entry-photos counterparty select" on storage.objects
  for select to authenticated
  using (bucket_id = 'journal-entry-photos' and public.counterparty_can_read_photo_v1(name));

-- 6. ACLs, one explicit statement per function -------------------------------
revoke all on function public.work_relationship_active_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.work_counterparty_link_valid_v1(uuid) from public, anon, authenticated;
revoke all on function public.register_work_counterparty_link_v1(uuid, uuid, text) from public, anon;
grant execute on function public.register_work_counterparty_link_v1(uuid, uuid, text) to authenticated;
revoke all on function public.reviewable_journal_entry_ids() from public, anon;
grant execute on function public.reviewable_journal_entry_ids() to authenticated;
revoke all on function public.counterparty_can_read_photo_v1(text) from public, anon;
grant execute on function public.counterparty_can_read_photo_v1(text) to authenticated;
revoke all on function public.list_counterparty_link_candidates_v1(uuid) from public, anon;
revoke all on function public.counterparty_review_entry_detail_v1(uuid) from public, anon;
revoke all on function public.entry_review_states_v1(uuid[]) from public, anon;
grant execute on function public.list_counterparty_link_candidates_v1(uuid) to authenticated;
grant execute on function public.counterparty_review_entry_detail_v1(uuid) to authenticated;
grant execute on function public.entry_review_states_v1(uuid[]) to authenticated;

commit;
