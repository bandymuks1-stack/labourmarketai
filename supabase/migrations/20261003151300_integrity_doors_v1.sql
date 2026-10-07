-- ============================================================================
-- @human-gate-approved
--
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. This file is RED by construction
-- (SECURITY DEFINER trigger function, ALTER POLICY on three existing policies,
-- REVOKE, new triggers on four live tables). The annotation above states the
-- ROUTE (draft PR + needs-human-gate, owner-channel apply via Supabase MCP
-- apply_migration). NO OWNER APPROVAL EXISTS FOR THIS FILE YET. It must not be
-- applied to production, and CI must not auto-merge it.
--
-- 20261003151300 - INTEGRITY DOORS v1: close four database-level doors that let
-- an authenticated user bypass the application layer by calling PostgREST
-- directly. Every defect below was reproduced on a scratch PostgreSQL built
-- from the LIVE production definitions (read-only pg_policy / pg_get_
-- functiondef / role_column_grants / pg_trigger, 2026-10-05) BEFORE the fix, and
-- re-measured AFTER it: scripts/db-proof/integrity-doors.sh.
--
--   G-1  journal_entries: a worker could attribute an entry to ANOTHER
--        organisation's engagement context (and to any project): the INSERT
--        policy checks only owns_worker(worker_id) AND visibility 'closed'; the
--        FK checks only that the context EXISTS; create_journal_entry_full is
--        SECURITY INVOKER and never checked that the context is the worker's.
--        The select policy then lets manages_organization(ec.organization_id)
--        read the entry => a worker could push content into a foreign
--        organisation's reading surface.
--        FIX: a BEFORE INSERT/UPDATE trigger enforces, for every end-user
--        write, (a) the context belongs to the WORKER'S OWN profile and (b) a
--        non-null project_id satisfies the same assignability rule the RPC
--        enforces, composed (dynamic lookup, both apply orders proven) with the
--        team / independent contexts of the UNAPPLIED lane 20261003150700.
--
--   G-4  organization_people: organization_people_manager_update lets a MANAGER
--        set link_state='linked' with link_method='manager_link' (legal under
--        the CHECK); the consent trigger guards only 'worker_confirmed'; the
--        evidence RLS SUBJECT branches and the app readers treat
--        link_state='linked' as the person's own => imported history attached
--        to an employee WITHOUT the employee's consent.
--        FIX: (1) a trigger forbids an end-user write that leaves a row
--        link_state='linked' with any method other than 'worker_confirmed'
--        (the value 'manager_link' stays legal in the CHECK, it just can no
--        longer produce a subject-visible link); (2) the subject branch of the
--        records / events / competency-signal select policies, the subject-
--        dispute insert policy and the definer readers additionally require link_method='worker_confirmed' (defence in depth:
--        a future writer that forgets the trigger still cannot publish history
--        to a person who did not accept). The app readers are narrowed in the
--        same PR.
--
--   G-5  worker_skills: worker_skills_write is owns_worker OR is_admin with no
--        column guard and authenticated holds UPDATE/INSERT on verified,
--        verified_by, verified_at, source, confidence_bin, confidence_score =>
--        a worker could self-verify a skill (verified=true, 'manager_confirmed',
--        green) through PostgREST.
--        FIX: a BEFORE INSERT/UPDATE trigger (SECURITY INVOKER, so current_user
--        is the real caller) lets the end-user roles `authenticated`/`anon`
--        write only the self-declared surface: verified=false, no verifier,
--        source in (self_declared, work_journal), confidence_score 0, bin
--        red/yellow. The SECURITY DEFINER pipelines (confirm_entry_and_verify_
--        skills, apply_learning_auto_confirmation) run as their owner, and the
--        service role, so they are untouched. Column privileges are NOT revoked:
--        the app upserts payloads that NAME verified/source/confidence_bin
--        ('false' / 'self_declared' / 'yellow'), a column REVOKE would break
--        them. is_admin() keeps its existing authority.
--
--   F-5  organization_evidence_events: AUDITED, NOT CHANGED (see below).
--
-- HONEST LIMITS
--   * The trigger bypass for auth.uid() IS NULL (G-1) and for non-end-user
--     roles (G-4, G-5) is deliberate: it is the service role / owner-run
--     definer pipelines / migrations, which are the legitimate privileged
--     writers. A SECURITY DEFINER function added LATER that writes these tables
--     on behalf of a user bypasses G-4/G-5 and must enforce its own rule.
--   * G-1 grandfathers a project the worker already journals under in the SAME
--     context (so editing / correcting an entry after an assignment ended keeps
--     working). Production holds 0 foreign-context rows and 0 org-mismatched
--     project rows (read-only count, 2026-10-05), so there is nothing to
--     grandfather that was planted.
--   * G-4 narrows EVERY live surface that reads a bare link_state='linked'
--     (found by scanning pg_policies / pg_proc.prosrc / pg_views on production):
--     the records / events / competency-signal select policies, the subject-
--     dispute insert policy, is_evidence_record_subject (called by the parties
--     select policy), privacy_export_evidence_import_rows_v1 and
--     withdraw_organization_evidence_dispute_v1. The three definer functions
--     are replaced with their LIVE bodies plus ONE added term; a later lane that
--     replaces any of them must carry that term. Production holds 0 rows this
--     narrows (1 worker_confirmed, 1 manager_offer, 41 unlinked).
--   * F-5: nothing to tighten (audit result below).
--
-- F-5 AUDIT (live policies, proven on scratch PG, matrix in the proof script):
--   hist_p4_events_insert is RESTRICTIVE (ANDed), not permissive. A direct
--   insert needs one PERMISSIVE policy (attest = org manager, never
--   independently_verified; verify = a PARTY organisation's manager with a
--   party row, never the record's own org or the subject; subject_dispute =
--   the linked subject, 'disputed' only) AND the restrictive filter. Result:
--     attested / attestation_withdrawn / withdrawn / reinstated / corrected /
--       source_preserved   record-org manager only (attested bound to the
--                          record's supplier_role + own org; source_preserved
--                          owner/admin + a classified source document)
--     independently_verified  party-org manager only, never the record's org,
--                          never the subject
--     disputed             linked subject only
--     dispute_withdrawn / verification_withdrawn  NO direct door (RPC / nobody)
--   No manager can write an independently_verified event; no stranger can write
--   anything. No bypass of an RPC-enforced rule exists, so no policy is
--   tightened. (One observation, NOT changed: a 'corrected' event's
--   replacement_record_id is only an FK, not org-scoped.)
--
-- WHO LOSES WHAT
--   worker   : cannot write another person's / organisation's engagement
--              context into journal_entries; cannot attach a project they are
--              not assignable to; cannot set verified / manager_confirmed /
--              green / confidence_score / verified_by / verified_at on
--              worker_skills. Everything the product UI does is unchanged.
--   manager  : cannot make a roster link 'linked' except by the subject's own
--              acceptance; sees no change otherwise.
--   employee : imported history becomes theirs only after THEY accept.
--   admin    : unchanged (is_admin() keeps its policy authority).
--
-- ORDER: independent of 20261003150600 / 20261003150700. If 150700 is applied
-- first the trigger finds team_work_context_v1 / independent_journal_context_v1
-- and honours them; if it is applied later the same trigger starts honouring
-- them at that moment (no re-apply). Both orders proven.
--
-- ROLLBACK: supabase/rollbacks/20261003151300_integrity_doors_v1.down.sql
-- ============================================================================

begin;

-- ── G-1. journal_entries attribution guard ──────────────────────────────────
create or replace function public.journal_entries_attribution_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_ec_org  uuid;
  v_ok      boolean := false;
begin
  -- No end-user identity (service role, owner-run pipelines, migrations):
  -- these are the privileged writers, not the PostgREST door under repair.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.engagement_context_id is not distinct from old.engagement_context_id
     and new.project_id is not distinct from old.project_id then
    return new;
  end if;

  select w.profile_id into v_profile from public.workers w where w.id = new.worker_id;

  -- (a) the context must be the WORKER'S OWN (a team member's context in the
  -- team's organisation, an independent provider's personal / own-workspace
  -- context and an employee's employer context are all rows of the worker's
  -- own profile).
  select ec.organization_id into v_ec_org
    from public.engagement_contexts ec
   where ec.id = new.engagement_context_id
     and ec.profile_id = v_profile
     and v_profile is not null;
  if not found then
    raise exception 'engagement_context_not_own' using errcode = '42501';
  end if;

  -- (b) a project must be one this worker may attribute to, by the SAME rule
  -- create_journal_entry_full enforces.
  if new.project_id is not null
     and (tg_op = 'INSERT'
          or new.project_id is distinct from old.project_id
          or new.engagement_context_id is distinct from old.engagement_context_id) then
    -- person assignment on a project of the context's organisation
    select true into v_ok
      from public.project_worker_assignments pwa
      join public.projects p on p.id = pwa.project_id
     where pwa.worker_id = new.worker_id
       and pwa.project_id = new.project_id
       and pwa.status = 'active'
       and p.organization_id = v_ec_org
     limit 1;
    -- continuation: the worker already journals under this (context, project)
    -- (supersede / correction after an assignment ended)
    if not coalesce(v_ok, false) then
      select true into v_ok
        from public.journal_entries j
       where j.worker_id = new.worker_id
         and j.engagement_context_id = new.engagement_context_id
         and j.project_id = new.project_id
         and j.id <> new.id
       limit 1;
    end if;
    -- active team context (lane 20261003150700), only if installed
    if not coalesce(v_ok, false)
       and v_ec_org is not null
       and to_regprocedure('public.team_work_context_v1(uuid,uuid,uuid,uuid,timestamptz)') is not null then
      execute 'select coalesce(public.team_work_context_v1($1, $2, null::uuid, $3), false)'
        into v_ok using v_profile, new.project_id, v_ec_org;
    end if;
    -- independent provider with a person assignment on a client's project
    -- (lane 20261003150700), only if installed
    if not coalesce(v_ok, false)
       and to_regprocedure('public.independent_journal_context_v1(uuid,uuid,uuid)') is not null then
      execute 'select coalesce(public.independent_journal_context_v1($1, $2, $3), false)'
        into v_ok using new.worker_id, new.project_id, new.engagement_context_id;
    end if;
    if not coalesce(v_ok, false) then
      raise exception 'project_not_assignable' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.journal_entries_attribution_guard_v1() from public, anon, authenticated;

drop trigger if exists journal_entries_attribution_guard_v1 on public.journal_entries;
create trigger journal_entries_attribution_guard_v1
  before insert or update of worker_id, engagement_context_id, project_id
  on public.journal_entries
  for each row execute function public.journal_entries_attribution_guard_v1();

-- ── G-5. worker_skills verification is pipeline-only ────────────────────────
-- SECURITY INVOKER on purpose: current_user must be the REAL caller. The
-- definer pipelines run as their owner and the service role as service_role;
-- only the PostgREST end-user roles are held to the self-declared surface.
create or replace function public.worker_skills_integrity_guard_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verified is distinct from false
       or new.verified_by is not null
       or new.verified_at is not null
       or new.source not in ('self_declared', 'work_journal')
       or new.confidence_score is distinct from 0
       or new.confidence_bin not in ('red', 'yellow')
       or new.last_recompute_at is not null then
      raise exception 'worker_skill_verification_is_pipeline_only' using errcode = '42501';
    end if;
  else
    if new.verified is distinct from old.verified
       or new.verified_by is distinct from old.verified_by
       or new.verified_at is distinct from old.verified_at
       or new.confidence_score is distinct from old.confidence_score
       or new.last_recompute_at is distinct from old.last_recompute_at
       or (new.source is distinct from old.source
           and (old.source = 'manager_confirmed'
                or new.source not in ('self_declared', 'work_journal')))
       or (new.confidence_bin is distinct from old.confidence_bin
           and (old.confidence_bin = 'green'
                or new.confidence_bin not in ('red', 'yellow'))) then
      raise exception 'worker_skill_verification_is_pipeline_only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.worker_skills_integrity_guard_v1() from public, anon, authenticated;

drop trigger if exists worker_skills_integrity_guard_v1 on public.worker_skills;
create trigger worker_skills_integrity_guard_v1
  before insert or update on public.worker_skills
  for each row execute function public.worker_skills_integrity_guard_v1();

-- ── G-4. a roster link is 'linked' only by the subject's own acceptance ─────
create or replace function public.organization_people_linked_requires_consent_guard_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.link_state = 'linked' and new.link_method is distinct from 'worker_confirmed' then
    raise exception 'a roster link becomes linked only by the subject''s own confirmation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.organization_people_linked_requires_consent_guard_v1() from public, anon, authenticated;

drop trigger if exists organization_people_linked_requires_consent_guard_v1 on public.organization_people;
create trigger organization_people_linked_requires_consent_guard_v1
  before insert or update on public.organization_people
  for each row execute function public.organization_people_linked_requires_consent_guard_v1();

-- Defence in depth: the SUBJECT branch of the three policies that treat a link
-- as "this is mine" additionally requires the confirmed method.
alter policy organization_evidence_records_select on public.organization_evidence_records
  using (
    manages_organization(organization_id)
    or (exists (
      select 1 from public.organization_people op
       where op.id = organization_evidence_records.organization_person_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
         and op.link_method = 'worker_confirmed'))
    or (exists (
      select 1 from public.organization_evidence_parties p
       where p.record_id = organization_evidence_records.id
         and p.party_organization_id is not null
         and manages_organization(p.party_organization_id)))
    or is_admin()
  );

alter policy organization_evidence_events_select on public.organization_evidence_events
  using (
    manages_organization(organization_id)
    or (exists (
      select 1
        from public.organization_evidence_records r
        join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_events.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
         and op.link_method = 'worker_confirmed'))
    or (exists (
      select 1 from public.organization_evidence_parties p
       where p.record_id = organization_evidence_events.record_id
         and p.party_organization_id is not null
         and manages_organization(p.party_organization_id)))
    or is_admin()
  );

alter policy organization_evidence_events_subject_dispute on public.organization_evidence_events
  with check (
    event_type = 'disputed'
    and actor_profile_id = auth.uid()
    and actor_role is null
    and actor_organization_id is null
    and replacement_record_id is null
    and not manages_organization(organization_id)
    and exists (
      select 1
        from public.organization_evidence_records r
        join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_events.record_id
         and r.organization_id = organization_evidence_events.organization_id
         and op.organization_id = organization_evidence_events.organization_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
         and op.link_method = 'worker_confirmed')
  );

-- The surfaces that still read a bare link_state='linked' as "this is mine".
-- LIVE bodies (read-only, 2026-10-05) with ONE added term each; ACLs are
-- restated below.
create or replace function public.is_evidence_record_subject(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.organization_evidence_records r
      join public.organization_people op on op.id = r.organization_person_id
     where r.id = p_record_id
       and op.linked_profile_id = auth.uid()
       and op.link_state = 'linked'
       and op.link_method = 'worker_confirmed'
  );
$function$;

create or replace function public.privacy_export_evidence_import_rows_v1()
returns setof jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', r.id,
    'organization_id', r.organization_id,
    'organization_person_id', r.organization_person_id,
    'row_index', r.row_index,
    'person_label', case when lower(btrim(r.person_label)) = lower(btrim(op.display_name))
                         then r.person_label end,
    'activity_kind', r.activity_kind,
    'outcome_kind', r.outcome_kind,
    'activity_date', r.activity_date,
    'period_start', r.period_start,
    'period_end', r.period_end,
    'hours', r.hours,
    'status', r.status,
    'row_origin', r.row_origin,
    'work_object_id', r.work_object_id,
    'project_id', r.project_id,
    'created_at', r.created_at
  )
  from public.evidence_import_rows r
  join public.organization_people op on op.id = r.organization_person_id
  where auth.uid() is not null
    and op.linked_profile_id = auth.uid()
    and op.link_state = 'linked'
    and op.link_method = 'worker_confirmed'
  order by r.created_at, r.id
$function$;

create or replace function public.withdraw_organization_evidence_dispute_v1(
  p_record_id uuid, p_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_latest  text;
  v_event   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select r.organization_id into v_org
    from public.organization_evidence_records r
    join public.organization_people op
      on op.id = r.organization_person_id
     and op.organization_id = r.organization_id
   where r.id = p_record_id
     and op.linked_profile_id = v_uid
     and op.link_state = 'linked'
     and op.link_method = 'worker_confirmed';

  if v_org is null
     or public.manages_organization(v_org) is distinct from false then
    raise exception 'only the subject of this record may withdraw their contest'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note must be 1000 characters or fewer' using errcode = '22001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_record_id::text || ':' || v_uid::text, 0));

  select e.event_type into v_latest
    from public.organization_evidence_events e
   where e.record_id = p_record_id
     and e.actor_profile_id = v_uid
     and e.event_type in ('disputed', 'dispute_withdrawn')
   order by e.created_at desc, (e.event_type = 'dispute_withdrawn') desc
   limit 1;

  if v_latest is distinct from 'disputed' then
    return jsonb_build_object(
      'standing', false, 'withdrawn', false, 'idempotent', true, 'event_id', null);
  end if;

  insert into public.organization_evidence_events
    (organization_id, record_id, event_type, actor_profile_id, actor_role,
     actor_organization_id, replacement_record_id, note, created_at)
  values
    (v_org, p_record_id, 'dispute_withdrawn', v_uid, null, null, null, v_note,
     clock_timestamp())
  returning id into v_event;

  return jsonb_build_object(
    'standing', false, 'withdrawn', true, 'idempotent', false, 'event_id', v_event);
end;
$function$;

revoke all on function public.is_evidence_record_subject(uuid) from public, anon;
grant execute on function public.is_evidence_record_subject(uuid) to authenticated;
revoke all on function public.privacy_export_evidence_import_rows_v1() from public, anon;
grant execute on function public.privacy_export_evidence_import_rows_v1() to authenticated;
revoke all on function public.withdraw_organization_evidence_dispute_v1(uuid, text) from public, anon;
grant execute on function public.withdraw_organization_evidence_dispute_v1(uuid, text) to authenticated;

alter policy organization_evidence_competency_signals_select on public.organization_evidence_competency_signals
  using (
    manages_organization(organization_id)
    or (exists (
      select 1
        from public.organization_evidence_records r
        join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_competency_signals.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
         and op.link_method = 'worker_confirmed'))
    or is_admin()
  );

commit;
