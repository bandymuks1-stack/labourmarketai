-- @human-gate-approved
-- ============================================================================
-- 20260919130000_update_project_facts_v1
-- RED — owner gate (R-3 of the 2026-09-19 completion audit).
-- APPLIED 2026-09-19 14:57 UTC (ledger 20260919145731) under the owner's verbatim
-- approval sentence; the seven-case contract run on the LIVE function and rolled
-- back (see docs/APPLIED_LEDGER.md).
--
-- Finding: `projects.title / city / country / start_date / end_date` have NO
-- valid write path after creation. Production, 2026-09-19: every one of the
-- 9 projects has country NULL, start_date NULL, end_date NULL. Consequences
-- read on the real surfaces:
--   • the calendar's project band cannot exist (planning reads start/end);
--   • the operations centre's "dates" chip is permanently "not set";
--   • the booking-overlap check never fires ("no project window");
--   • the project's location block is text-only-or-missing forever.
-- A direct client UPDATE was tried and reverted (2026-09-19 audit): the
-- admin-action guard requires gated RPCs, and `projects` UPDATE RLS is
-- owner-scoped while `can_manage_project` admits organization managers who
-- must be able to do this.
--
-- MINIMUM CHANGE: ONE SECURITY DEFINER write, `update_project_facts_v1`,
-- gated by the EXISTING `can_manage_project` (same anti-oracle shape as
-- `set_project_status_v1` / `set_project_responsible_v1`): only a caller who
-- can already see the project learns it exists. Validates title length,
-- ISO-3166 alpha-2 country, city length, `end_date >= start_date`; a
-- `completed` project is terminal and read-only (checked AFTER authority so
-- the refusal cannot probe status). Keeps `granularity` truthful to the text
-- (a city written → 'city'; otherwise 'country'); never touches
-- `location_confirmed`, coordinates, status, visibility or any other column.
-- Idempotent (no-op → 'updated' without a write or audit row). Audited.
--
-- No table, policy, grant or row change. Reversible: DOWN drops the function.
-- ============================================================================

begin;

create or replace function public.update_project_facts_v1(
  p_project_id uuid,
  p_title      text,
  p_city       text,
  p_country    text,
  p_start_date date,
  p_end_date   date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_title    text := nullif(btrim(coalesce(p_title, '')), '');
  v_city     text := nullif(btrim(coalesce(p_city, '')), '');
  v_country  text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v_status   text;
  r          record;
  v_gran     text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Validation BEFORE any read or lock, so an invalid value never reaches the
  -- row: a title is required (2..200, the create bound), a country is an
  -- ISO-3166 alpha-2 code or absent, a city is short free text or absent, and
  -- an end date never precedes its start.
  if v_title is null or char_length(v_title) < 2 or char_length(v_title) > 200 then
    return jsonb_build_object('outcome', 'invalid', 'field', 'title');
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    return jsonb_build_object('outcome', 'invalid', 'field', 'country');
  end if;
  if v_city is not null and char_length(v_city) > 120 then
    return jsonb_build_object('outcome', 'invalid', 'field', 'city');
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    return jsonb_build_object('outcome', 'invalid_dates');
  end if;

  -- ROW LOCK, then the EXISTING authority helper — no second model.
  select p.title, p.city, p.country, p.start_date, p.end_date, p.status, p.granularity
    into r
    from public.projects p
   where p.id = p_project_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Anti-oracle (the 20260804120000 shape): a caller who cannot manage the
  -- project learns it exists only if they are assigned to it.
  if not (public.can_manage_project(p_project_id) or public.is_admin()) then
    if public.is_assigned_to_project(p_project_id) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Terminal state is read-only. Checked AFTER authorization so the refusal
  -- cannot be used to probe the status of a project the caller may not manage.
  v_status := r.status;
  if v_status = 'completed' then
    return jsonb_build_object('outcome', 'completed_read_only');
  end if;

  -- Precision stays truthful to the text: COUNTRY ≠ CITY. A written city is
  -- city-granular; none written is country-granular. 'region' is never set
  -- here (no region field is written by this RPC).
  v_gran := case when v_city is not null then 'city' else 'country' end;

  -- Idempotent: same facts → no write, no audit row.
  if r.title is not distinct from v_title
     and r.city is not distinct from v_city
     and r.country is not distinct from v_country
     and r.start_date is not distinct from p_start_date
     and r.end_date is not distinct from p_end_date
     and r.granularity is not distinct from v_gran then
    return jsonb_build_object('outcome', 'updated', 'changed', false);
  end if;

  update public.projects
     set title       = v_title,
         city        = v_city,
         country     = v_country,
         start_date  = p_start_date,
         end_date    = p_end_date,
         granularity = v_gran,
         updated_at  = now()
   where id = p_project_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'update_project_facts', 'projects', p_project_id,
    jsonb_build_object(
      'from', jsonb_build_object('title', r.title, 'city', r.city, 'country', r.country,
                                 'start_date', r.start_date, 'end_date', r.end_date,
                                 'granularity', r.granularity),
      'to',   jsonb_build_object('title', v_title, 'city', v_city, 'country', v_country,
                                 'start_date', p_start_date, 'end_date', p_end_date,
                                 'granularity', v_gran)));

  return jsonb_build_object('outcome', 'updated', 'changed', true);
end $$;

-- Privilege floor: authenticated only; never anon/public (the 20260722160000
-- closure cannot reach a function created after it, so it is stated here).
revoke all on function public.update_project_facts_v1(uuid, text, text, text, date, date) from public, anon;
grant execute on function public.update_project_facts_v1(uuid, text, text, text, date, date) to authenticated;

commit;
