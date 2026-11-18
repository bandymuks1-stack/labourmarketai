-- ROLLBACK of 20261003151300_integrity_doors_v1.
-- Re-opens the four doors (G-1, G-4, G-5 triggers dropped) and restores the
-- three policies to their LIVE production definitions (read-only
-- pg_policies, 2026-10-05). No dependency on lane 20261003150700.
begin;

drop trigger if exists organization_people_linked_requires_consent_guard_v1 on public.organization_people;
drop function if exists public.organization_people_linked_requires_consent_guard_v1();

drop trigger if exists worker_skills_integrity_guard_v1 on public.worker_skills;
drop function if exists public.worker_skills_integrity_guard_v1();

drop trigger if exists journal_entries_attribution_guard_v1 on public.journal_entries;
drop function if exists public.journal_entries_attribution_guard_v1();

alter policy organization_evidence_records_select on public.organization_evidence_records
  using (
    manages_organization(organization_id)
    or (exists (
      select 1 from public.organization_people op
       where op.id = organization_evidence_records.organization_person_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'))
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
         and op.link_state = 'linked'))
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
         and op.link_state = 'linked')
  );

-- the definer / policy surfaces: LIVE bodies restored (no link_method term)
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
     and op.link_state = 'linked';

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

alter policy organization_evidence_competency_signals_select on public.organization_evidence_competency_signals
  using (
    manages_organization(organization_id)
    or (exists (
      select 1
        from public.organization_evidence_records r
        join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_competency_signals.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'))
    or is_admin()
  );

commit;
