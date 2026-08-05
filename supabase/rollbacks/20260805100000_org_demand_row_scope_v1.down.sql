-- ============================================================================
-- ROLLBACK for 20260805100000_org_demand_row_scope_v1.sql
--
-- SAFE AT ANY TIME because the forward migration is strictly ADDITIVE to the
-- profile_id / owner_id spine: dropping the organization_id columns discards
-- only the org stamp (re-derivable at any time via the same bridge join the
-- forward backfill used — profile/owner → companies.profile_id →
-- organizations.legacy_company_id). No demand, shortlist or booking row is
-- deleted or altered beyond that column.
--
-- ORDER MATTERS:
--   1. Restore the three SELECT policies to their original text FIRST — the
--      current policies reference organization_id, and a column drop would
--      otherwise be blocked by the dependent policies.
--   2. Restore the four RPC bodies byte-exact to their owning migrations
--      (0028 / 20260530150000 / 20260613100100). Their revoke/grant pairs are
--      re-stated INCLUDING the explicit anon revokes (the post-20260722160000
--      SECURITY DEFINER hygiene is kept even on rollback — rolling back the
--      org spine must never widen anon reach).
--   3. Drop the trigger, the trigger function and the bridge resolver.
--   4. Drop the indexes and the columns last.
-- ============================================================================

begin;

-- ── 1. Restore original SELECT policies (verbatim from their migrations) ────

-- 0028_customer_requests.sql
drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests for select
  using (profile_id = auth.uid() or public.is_admin());

-- 20260612220000_demand_shortlist.sql
drop policy if exists demand_shortlist_select on public.demand_shortlist;
create policy demand_shortlist_select on public.demand_shortlist for select
  using (owner_id = auth.uid() or public.is_admin());

-- 20260613100100_booking_requests.sql
drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.workers w
                where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

-- ── 2. Restore original RPC bodies (byte-exact) ─────────────────────────────

-- 2a. save_customer_request — original: 0028_customer_requests.sql.
create or replace function public.save_customer_request(
  p_request_id           uuid,
  p_title                text,
  p_need_summary         text default null,
  p_country              text default null,
  p_location             text default null,
  p_role_or_work_type    text default null,
  p_team_size            integer default null,
  p_start_period         text default null,
  p_duration             text default null,
  p_language_requirement text default null,
  p_notes                text default null,
  p_status               text default 'draft'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  resolved_id      uuid;
  cleaned_title    text := nullif(trim(coalesce(p_title, '')), '');
  cleaned_status   text := lower(trim(coalesce(p_status, 'draft')));
  customer_uuid    uuid;
  current_status   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_title is null or char_length(cleaned_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if cleaned_status not in ('draft','submitted','in_review','needs_followup','approved','closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  -- Owner cannot self-promote to admin-only statuses.
  if cleaned_status in ('in_review','needs_followup','approved','closed') then
    if not public.is_admin() then
      cleaned_status := 'submitted';
    end if;
  end if;

  -- Resolve customer_id (optional FK).
  select id into customer_uuid
    from public.customers
   where profile_id = uid
   limit 1;

  if p_request_id is null then
    insert into public.customer_requests (
      profile_id, customer_id, title, need_summary, country, location,
      role_or_work_type, team_size, start_period, duration,
      language_requirement, notes, status
    ) values (
      uid, customer_uuid, cleaned_title,
      nullif(trim(coalesce(p_need_summary, '')), ''),
      nullif(trim(coalesce(p_country, '')), ''),
      nullif(trim(coalesce(p_location, '')), ''),
      nullif(trim(coalesce(p_role_or_work_type, '')), ''),
      p_team_size,
      nullif(trim(coalesce(p_start_period, '')), ''),
      nullif(trim(coalesce(p_duration, '')), ''),
      nullif(trim(coalesce(p_language_requirement, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      cleaned_status
    )
    returning id into resolved_id;
    return resolved_id;
  end if;

  -- Update path: must own the row.
  select status into current_status
    from public.customer_requests
   where id = p_request_id and profile_id = uid;
  if current_status is null then
    -- Either does not exist OR not owned by caller — admin can use a
    -- separate admin-only path; this RPC is owner-only updates.
    raise exception 'Request not found or not owned' using errcode = '42501';
  end if;

  -- Never let a non-admin owner demote out of submitted back to draft.
  if not public.is_admin() then
    if current_status = 'submitted' and cleaned_status = 'draft' then
      cleaned_status := 'submitted';
    end if;
  end if;

  update public.customer_requests set
    title                = cleaned_title,
    need_summary         = nullif(trim(coalesce(p_need_summary, '')), ''),
    country              = nullif(trim(coalesce(p_country, '')), ''),
    location             = nullif(trim(coalesce(p_location, '')), ''),
    role_or_work_type    = nullif(trim(coalesce(p_role_or_work_type, '')), ''),
    team_size            = p_team_size,
    start_period         = nullif(trim(coalesce(p_start_period, '')), ''),
    duration             = nullif(trim(coalesce(p_duration, '')), ''),
    language_requirement = nullif(trim(coalesce(p_language_requirement, '')), ''),
    notes                = nullif(trim(coalesce(p_notes, '')), ''),
    status               = cleaned_status,
    updated_at           = now()
   where id = p_request_id
     and (profile_id = uid or public.is_admin())
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) from public;
revoke all on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) from anon;
grant execute on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) to authenticated;

-- 2b. save_demand_draft — original: 20260530150000_demand_intake_consolidation.sql.
create or replace function public.save_demand_draft(
  p_kind text,
  p_title text,
  p_payload jsonb default '{}'::jsonb,
  p_original_language text default 'lt'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('company_request','agency_offer','buyer_request','customer_request') then
    raise exception 'invalid_kind';
  end if;

  select id into v_id from public.customer_requests
   where profile_id = uid and kind = p_kind and status = 'draft' limit 1;

  if v_id is not null then
    update public.customer_requests
       set title = coalesce(v_title, title),
           payload = coalesce(p_payload, '{}'::jsonb),
           original_language = coalesce(p_original_language, original_language),
           updated_at = now()
     where id = v_id;
  else
    insert into public.customer_requests
      (profile_id, kind, title, payload, original_language, status)
    values
      (uid, p_kind, coalesce(v_title, '—'), coalesce(p_payload, '{}'::jsonb),
       coalesce(p_original_language, 'lt'), 'draft')
    returning id into v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.save_demand_draft(text, text, jsonb, text) from public;
revoke all on function public.save_demand_draft(text, text, jsonb, text) from anon;
grant execute on function public.save_demand_draft(text, text, jsonb, text) to authenticated;

-- 2c. submit_demand_request — original: 20260530150000_demand_intake_consolidation.sql.
create or replace function public.submit_demand_request(
  p_kind text,
  p_title text,
  p_need_summary text default null,
  p_payload jsonb default '{}'::jsonb,
  p_original_language text default 'lt'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('company_request','agency_offer','buyer_request','customer_request') then
    raise exception 'invalid_kind';
  end if;

  insert into public.customer_requests
    (profile_id, kind, title, need_summary, payload, original_language, status)
  values
    (uid, p_kind, coalesce(v_title, '—'),
     nullif(btrim(coalesce(p_need_summary, '')), ''),
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_original_language, 'lt'), 'submitted')
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.submit_demand_request(text, text, text, jsonb, text) from public;
revoke all on function public.submit_demand_request(text, text, text, jsonb, text) from anon;
grant execute on function public.submit_demand_request(text, text, text, jsonb, text) to authenticated;

-- 2d. propose_booking_request — original: 20260613100100_booking_requests.sql.
create or replace function public.propose_booking_request(
  p_request_id       uuid,
  p_worker_id        uuid,
  p_start_date       text,
  p_expected_end_date text,
  p_location_country text,
  p_role_text        text,
  p_note             text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_start   date := nullif(p_start_date, '')::date;
  v_end     date := nullif(p_expected_end_date, '')::date;
  v_country char(2) := nullif(trim(coalesce(p_location_country, '')), '');
  v_snapshot jsonb;
  row_id    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- Owner must own the demand.
  if not exists (select 1 from public.customer_requests cr
                  where cr.id = p_request_id and cr.profile_id = uid) then
    raise exception 'Not your demand' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workers w where w.id = p_worker_id) then
    raise exception 'Unknown worker' using errcode = 'P0002';
  end if;
  if v_end is not null and v_start is not null and v_end < v_start then
    raise exception 'End date before start date' using errcode = '22023';
  end if;

  -- Readiness snapshot at propose time (immutable record of what was true).
  select jsonb_build_object(
           'captured_at', now(),
           'availability_status', w.availability_status,
           'available_from', w.available_from,
           'preferred_countries', w.preferred_countries,
           'verified_skill_count', (
             select count(*) from public.worker_skills ws
              where ws.worker_id = w.id and ws.verified),
           'document_count', (
             select count(*) from public.worker_documents wd
              where wd.worker_id = w.id)
         )
    into v_snapshot
    from public.workers w where w.id = p_worker_id;

  insert into public.booking_requests
      (owner_id, request_id, worker_id, status, start_date, expected_end_date,
       location_country, role_text, note, readiness_snapshot)
    values (uid, p_request_id, p_worker_id, 'proposed', v_start, v_end,
            v_country, nullif(trim(coalesce(p_role_text,'')), ''),
            nullif(trim(coalesce(p_note,'')), ''), coalesce(v_snapshot, '{}'::jsonb))
  on conflict (owner_id, request_id, worker_id)
  do update set
       status = case when public.booking_requests.status in ('withdrawn','declined','expired')
                     then 'proposed' else public.booking_requests.status end,
       start_date = excluded.start_date,
       expected_end_date = excluded.expected_end_date,
       location_country = excluded.location_country,
       role_text = excluded.role_text,
       note = excluded.note,
       readiness_snapshot = excluded.readiness_snapshot,
       updated_at = now()
  returning id into row_id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (row_id, uid, 'proposed', null, 'proposed');

  return row_id;
end;
$$;

revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) to authenticated;

-- ── 3. Drop the trigger, trigger function and bridge resolver ───────────────

drop trigger if exists demand_shortlist_stamp_org on public.demand_shortlist;
drop function if exists public.demand_shortlist_stamp_organization();
drop function if exists public.resolve_caller_organization_id();

-- ── 4. Drop the indexes and the added columns (additive → safe) ─────────────

drop index if exists public.customer_requests_organization_idx;
drop index if exists public.demand_shortlist_organization_idx;
drop index if exists public.booking_requests_organization_idx;

alter table public.customer_requests drop column if exists organization_id;
alter table public.demand_shortlist  drop column if exists organization_id;
alter table public.booking_requests  drop column if exists organization_id;

commit;
