-- Rollback 20261003150950: back to the writer of 20261003150900 (no collision verification).
-- Nothing is lost: receipts are untouched; only the validator and the stricter writer go.
create or replace function public.record_commitment_override_v1(
  p_project_id        uuid,
  p_worker_profile_id uuid,
  p_collisions        jsonb,
  p_reason_code       text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_worker  uuid;
  v_assign  uuid;
  v_team    uuid;
  v_start   date;
  v_end     date;
  v_item    jsonb;
  v_kind    text;
  v_os      date;
  v_oe      date;
  v_sid     text;
  v_clean   jsonb := '[]'::jsonb;
  v_reason  text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_fp      text;
  v_id      uuid;
  v_n       integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null or p_worker_profile_id is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;
  -- Authority first, so a refusal cannot be used to probe another
  -- organization's project or roster. NULL operand => denied.
  if not coalesce(public.can_manage_project(p_project_id), false) then
    raise exception 'Not authorized to record an override on this project'
      using errcode = '42501';
  end if;
  if v_reason is not null
     and v_reason not in ('agreed_with_worker', 'agreed_with_client', 'partial_overlap',
                          'urgent_need', 'other') then
    raise exception 'Unknown reason code' using errcode = '22023';
  end if;

  select w.id into v_worker from public.workers w where w.id is not null and w.profile_id = p_worker_profile_id;
  if v_worker is null then
    raise exception 'Unknown worker' using errcode = '22023';
  end if;
  select a.id into v_assign
    from public.project_worker_assignments a
   where a.project_id = p_project_id and a.worker_id = v_worker and a.status = 'active';
  if v_assign is null then
    -- No person assignment: the TEAM basis. A team assignment is one canonical
    -- relationship (team_assignments, #2149) that writes no per-person rows, so
    -- the worker must be a member of an ACTIVE team assignment on this project
    -- AS OF NOW (team_member_at_v1 - a member who has left is not covered).
    select ta.id into v_team
      from public.team_assignments ta
     where ta.project_id = p_project_id
       and ta.status = 'active' and ta.ended_at is null
       and public.team_member_at_v1(ta.team_org_id, p_worker_profile_id, now())
     order by ta.assigned_at, ta.id
     limit 1;
    if v_team is null then
      raise exception 'No active assignment or active team membership for this worker on this project'
        using errcode = '22023';
    end if;
  end if;

  if p_collisions is null or jsonb_typeof(p_collisions) <> 'array'
     or jsonb_array_length(p_collisions) < 1 or jsonb_array_length(p_collisions) > 20 then
    raise exception 'collisions must be an array of 1..20 entries' using errcode = '22023';
  end if;

  -- Whitelist rebuild: nothing the caller adds beyond these fields is stored.
  for v_item in select e from jsonb_array_elements(p_collisions) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid collision entry' using errcode = '22023';
    end if;
    v_kind := v_item->>'kind';
    if v_kind is null or v_kind not in ('project', 'booking', 'trip', 'absence', 'plan') then
      raise exception 'invalid collision kind' using errcode = '22023';
    end if;
    begin
      v_os := (v_item->>'overlapStart')::date;
      v_oe := (v_item->>'overlapEnd')::date;
    exception when others then
      raise exception 'invalid collision dates' using errcode = '22023';
    end;
    if v_os is null or v_oe is null or v_oe < v_os then
      raise exception 'invalid collision dates' using errcode = '22023';
    end if;
    if v_kind = 'absence' then
      -- kind + dates ONLY. No id, no category, no reason, no label.
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'kind', v_kind, 'overlapStart', v_os, 'overlapEnd', v_oe));
    else
      v_sid := v_item->>'sourceId';
      if v_sid is null or v_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid collision source' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'kind', v_kind, 'sourceId', lower(v_sid), 'overlapStart', v_os, 'overlapEnd', v_oe));
    end if;
  end loop;

  -- Deterministic order, so a replay with the same facts has the same fingerprint.
  select jsonb_agg(x order by x->>'kind', x->>'overlapStart', x->>'overlapEnd', coalesce(x->>'sourceId', ''))
    into v_clean
    from jsonb_array_elements(v_clean) x;

  -- The window is the PROJECT's, read here, never taken from the caller.
  select p.start_date, p.end_date into v_start, v_end from public.projects p where p.id = p_project_id;

  -- The basis (and, for a team, the worker - one team basis covers many members) is part of the fingerprint. The person basis keeps the exact
  -- formula of 20261003150100, so its fingerprints are unchanged.
  if v_assign is not null then
    v_fp := md5(v_assign::text || '|' || v_uid::text || '|kept|' || coalesce(v_reason, '') || '|' || v_clean::text);
  else
    v_fp := md5('team:' || v_team::text || '|' || v_worker::text || '|' || v_uid::text || '|kept|' || coalesce(v_reason, '') || '|' || v_clean::text);
  end if;

  select r.id into v_id from public.commitment_override_receipts r
   where r.assignment_id is not distinct from v_assign
     and r.team_assignment_id is not distinct from v_team
     and r.fingerprint = v_fp;
  if v_id is not null then
    return v_id;  -- idempotent replay: nothing written
  end if;

  select count(*) into v_n from public.commitment_override_receipts r
   where r.assignment_id is not distinct from v_assign
     and r.team_assignment_id is not distinct from v_team;
  if v_n >= 50 then
    raise exception 'Receipt limit reached for this assignment' using errcode = '22023';
  end if;

  insert into public.commitment_override_receipts
    (assignment_id, team_assignment_id, project_id, worker_id, decided_by, decision,
     window_start, window_end, collisions, reason_code, fingerprint)
  values
    (v_assign, v_team, p_project_id, v_worker, v_uid, 'kept', v_start, v_end, v_clean, v_reason, v_fp)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.commitment_override_receipts r
     where r.assignment_id is not distinct from v_assign
       and r.team_assignment_id is not distinct from v_team
       and r.fingerprint = v_fp;
  end if;
  return v_id;
end
$$;

revoke all on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) to authenticated;

comment on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) is
  'J-TIME-FREEDOM step 5. The ONLY writer of commitment_override_receipts. Caller must manage the project and the worker must hold an ACTIVE person assignment OR be a member (as of now) of an ACTIVE team assignment on it (basis stored on the receipt). Rebuilds the collisions list from a field whitelist (absence = kind + dates only), snapshots the window from projects, stores a closed reason_code, no free text. Idempotent. Authenticated only.';

drop function if exists public.commitment_override_validate_collisions_v1(uuid, uuid, uuid, date, date, jsonb);
