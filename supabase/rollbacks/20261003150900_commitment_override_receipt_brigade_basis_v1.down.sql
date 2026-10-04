-- Rollback 20261003150900: back to the person-basis-only writer of 20261003150100.
-- GUARDED: refuses while any TEAM-basis receipt exists - a receipt is evidence
-- of a real decision and must never be dropped or orphaned silently.
do $$
begin
  if to_regclass('public.commitment_override_receipts') is not null
     and exists (select 1 from public.commitment_override_receipts
                  where team_assignment_id is not null) then
    raise exception 'team-basis receipts exist; refusing to drop evidence';
  end if;
end $$;

-- ── Restore the writer of 20261003150100 (verbatim) ─────────────────────────────────────────────────────────
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
    raise exception 'No active assignment for this worker on this project' using errcode = '22023';
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

  v_fp := md5(v_assign::text || '|' || v_uid::text || '|kept|' || coalesce(v_reason, '') || '|' || v_clean::text);

  select r.id into v_id from public.commitment_override_receipts r
   where r.assignment_id = v_assign and r.fingerprint = v_fp;
  if v_id is not null then
    return v_id;  -- idempotent replay: nothing written
  end if;

  select count(*) into v_n from public.commitment_override_receipts r where r.assignment_id = v_assign;
  if v_n >= 50 then
    raise exception 'Receipt limit reached for this assignment' using errcode = '22023';
  end if;

  insert into public.commitment_override_receipts
    (assignment_id, project_id, worker_id, decided_by, decision, window_start, window_end,
     collisions, reason_code, fingerprint)
  values
    (v_assign, p_project_id, v_worker, v_uid, 'kept', v_start, v_end, v_clean, v_reason, v_fp)
  on conflict (assignment_id, fingerprint) do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.commitment_override_receipts r
     where r.assignment_id = v_assign and r.fingerprint = v_fp;
  end if;
  return v_id;
end
$$;

revoke all on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) to authenticated;

comment on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) is
  'J-TIME-FREEDOM step 5. The ONLY writer of commitment_override_receipts. Caller must manage the project and the worker must hold an ACTIVE assignment. Rebuilds the collisions list from a field whitelist (absence = kind + dates only), snapshots the window from projects, stores a closed reason_code, no free text. Idempotent. Authenticated only.';

drop index if exists public.commitment_override_receipts_team_assignment_idx;
alter table public.commitment_override_receipts
  drop constraint if exists commitment_override_receipts_one_basis;
alter table public.commitment_override_receipts
  drop constraint if exists commitment_override_receipts_team_fingerprint_uq;
alter table public.commitment_override_receipts drop column if exists team_assignment_id;
alter table public.commitment_override_receipts alter column assignment_id set not null;
