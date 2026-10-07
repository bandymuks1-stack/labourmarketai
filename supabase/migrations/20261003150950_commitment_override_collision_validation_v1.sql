-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. One new INTERNAL SECURITY DEFINER validator (no grants) and a
-- replacement of the SECURITY DEFINER writer record_commitment_override_v1. Draft PR
-- + `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after explicit
-- owner approval. Never `supabase db push`. NO OWNER APPROVAL EXISTS FOR THIS FILE:
-- the marker above is the risk acknowledgement the static gate reads.
--
-- 20261003150950 — the receipt's collision list is VERIFIED against the real source
-- rows, not trusted from the caller.  (Audit G-9.)
--
-- ── DEPENDENCIES (applied, in this order) ──────────────────────────────────
--   20261003150100_commitment_override_receipts_v1          (#2146)
--   20261003150600_brigade_work_assignment_v1               (#2149)
--   20261003150900_commitment_override_receipt_brigade_basis_v1  (#2146)
--
-- ── THE GAP ────────────────────────────────────────────────────────────────
-- The application recomputes the collisions server-side and hands them to the
-- writer, but the database could not recompute the calendar, so a caller with
-- project authority could write ARBITRARY collision content (invented ids,
-- windows that overlap nothing) into an "immutable receipt of a knowing override".
--
-- ── WHAT IS VERIFIED (semantically exact: the SAME rules lib/workforce/
--    commitment-reservation.ts reserveCapacity applies) ─────────────────────
-- window  = the project's own dates (start_date required; end collapses to start
--           when null or before start - effectiveEndDay).
-- Every collision's overlapStart/overlapEnd must EQUAL the intersection of that
-- window with the source's effective range, and the source must be a REAL row that
-- involves the worker:
--   project  sourceId = a project (NOT the project being decided) on which the worker
--            holds an ACTIVE assignment and which has a start date
--   booking  booking_requests row of the worker, status 'accepted', dated
--   trip     business_trips row of the worker's profile, status approved|completed
--   plan     work_plan_entries row of the worker, status 'planned', dated
--            (#2086; if that table does not exist no plan window can exist, so a
--            'plan' collision is refused)
--   absence  carries no id by design; instead an APPROVED worker_absences row of
--            the worker must produce exactly that intersection. Nothing about the
--            absence is stored or returned; a refusal only says "invalid collision".
-- An undated project window refuses every collision (nothing to verify against).
-- All refusals are 22023 with the generic word 'collision not verified'; the message
-- never names which source or why, so the validator is no probe of a worker's calendar
-- beyond what an employer already reads (approved absence DATES, never a reason).
--
-- LIMITATIONS (stated, not hidden): the check is point-in-time - sources can change
-- after the receipt, which is what a receipt is for; a COMPLETE list is not enforced
-- (the DB does not require every real clash to be listed, only that each listed clash
-- is real); 'plan' validates only once #2086's table exists.
--
-- ROLLBACK: supabase/rollbacks/20261003150950_commitment_override_collision_validation_v1.down.sql
-- restores the writer of 20261003150900 verbatim and drops the validator.

do $$
begin
  if to_regprocedure('public.record_commitment_override_v1(uuid,uuid,jsonb,text)') is null then
    raise exception 'record_commitment_override_v1 missing (apply 20261003150100 first)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'commitment_override_receipts'
                    and column_name = 'team_assignment_id') then
    raise exception 'receipt basis column missing (apply 20261003150900 first)';
  end if;
  if to_regclass('public.worker_absences') is null
     or to_regclass('public.business_trips') is null
     or to_regclass('public.booking_requests') is null then
    raise exception 'calendar source tables missing';
  end if;
end $$;

create or replace function public.commitment_override_validate_collisions_v1(
  p_project_id        uuid,
  p_worker_id         uuid,
  p_worker_profile_id uuid,
  p_window_start      date,
  p_window_end        date,
  p_collisions        jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ws   date := p_window_start;
  v_we   date;
  v_item jsonb;
  v_kind text;
  v_sid  uuid;
  v_os   date;
  v_oe   date;
  v_ok   boolean;
begin
  if v_ws is null then
    raise exception 'collision not verified' using errcode = '22023';
  end if;
  v_we := case when p_window_end is not null and p_window_end >= v_ws then p_window_end else v_ws end;

  for v_item in select e from jsonb_array_elements(p_collisions) e loop
    v_kind := v_item->>'kind';
    v_os := (v_item->>'overlapStart')::date;
    v_oe := (v_item->>'overlapEnd')::date;
    v_ok := false;
    if v_os is null or v_oe is null or v_oe < v_os or v_os < v_ws or v_oe > v_we then
      raise exception 'collision not verified' using errcode = '22023';
    end if;

    if v_kind = 'absence' then
      select exists (
        select 1 from public.worker_absences a
         where a.worker_id = p_worker_id and a.status = 'approved'
           and greatest(v_ws, a.start_date) = v_os
           and least(v_we, case when a.end_date >= a.start_date then a.end_date else a.start_date end) = v_oe
      ) into v_ok;
    else
      v_sid := (v_item->>'sourceId')::uuid;
      if v_kind = 'project' then
        select exists (
          select 1
            from public.project_worker_assignments a
            join public.projects pr on pr.id = a.project_id
           where a.project_id = v_sid and a.worker_id = p_worker_id and a.status = 'active'
             and a.project_id <> p_project_id and pr.start_date is not null
             and greatest(v_ws, pr.start_date) = v_os
             and least(v_we, case when pr.end_date is not null and pr.end_date >= pr.start_date
                                  then pr.end_date else pr.start_date end) = v_oe
        ) into v_ok;
      elsif v_kind = 'booking' then
        select exists (
          select 1 from public.booking_requests b
           where b.id = v_sid and b.worker_id = p_worker_id and b.status = 'accepted'
             and b.start_date is not null
             and greatest(v_ws, b.start_date) = v_os
             and least(v_we, case when b.expected_end_date is not null and b.expected_end_date >= b.start_date
                                  then b.expected_end_date else b.start_date end) = v_oe
        ) into v_ok;
      elsif v_kind = 'trip' then
        select exists (
          select 1 from public.business_trips t
           where t.id = v_sid and t.profile_id = p_worker_profile_id
             and t.status in ('approved', 'completed')
             and greatest(v_ws, t.date_from) = v_os
             and least(v_we, case when t.date_to >= t.date_from then t.date_to else t.date_from end) = v_oe
        ) into v_ok;
      elsif v_kind = 'plan' then
        -- #2086's table; absent => no plan window can exist => refuse.
        if to_regclass('public.work_plan_entries') is not null then
          execute $q$
            select exists (
              select 1 from public.work_plan_entries e
               where e.id = $1 and e.worker_id = $2 and e.status = 'planned'
                 and e.start_date is not null
                 and greatest($3, e.start_date) = $5
                 and least($4, case when e.end_date is not null and e.end_date >= e.start_date
                                    then e.end_date else e.start_date end) = $6
            )
          $q$ into v_ok using v_sid, p_worker_id, v_ws, v_we, v_os, v_oe;
        end if;
      end if;
    end if;

    if not coalesce(v_ok, false) then
      raise exception 'collision not verified' using errcode = '22023';
    end if;
  end loop;
end
$$;

revoke all on function public.commitment_override_validate_collisions_v1(uuid, uuid, uuid, date, date, jsonb) from public, anon, authenticated;

comment on function public.commitment_override_validate_collisions_v1(uuid, uuid, uuid, date, date, jsonb) is
  'INTERNAL (no grants; called only by record_commitment_override_v1). Verifies each collision against its real source row with the reserveCapacity overlap rule: overlap = intersection of the project window and the source effective range. Absence is verified by an approved worker_absences row, never by id.';

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

  -- DB-side validation (20261003150950): the collision list is supplied by the
  -- application, so every entry is checked against the real source row.
  perform public.commitment_override_validate_collisions_v1(
    p_project_id, v_worker, p_worker_profile_id, v_start, v_end, v_clean);

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
