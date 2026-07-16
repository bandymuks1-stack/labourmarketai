-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- DO NOT APPLY automatically. Apply ONLY via Supabase MCP apply_migration
-- after explicit owner approval. Never `db push`.
-- APPLY ORDER: this file BEFORE 20260716131000_team_enquiries_v1.sql (the
-- enquiry read model there projects the availability snapshot stored here).
-- INDEPENDENCE: applies cleanly against current main alone — FKs reference
-- ONLY the applied organizations table; no wagon-1/4/5 tables are touched.
--
-- 20260716130000 — team profile details v1 (Trust Connect Teams wagon, gap 2
-- + the canonical team-match-input contract fields, integration addendum).
--
-- PROBLEM: a team/brigade (organizations row, organization_type='team',
-- migration 20260705220000) has no team-scoped availability / accommodation /
-- transport facts. Workers carry per-person flags (workers.team_available,
-- needs_accommodation, has_transport, …) but a brigade that travels together
-- has ONE shared answer to "when can you start, how many people can deploy,
-- where can you go, do you need housing, do you bring transport" — today
-- that answer has nowhere to live.
--
-- SOLUTION (smallest honest slice): ONE 1:1 details table keyed by the team
-- org id + ONE gated writer. All ADDITIVE; no existing table, column, policy
-- or function is touched. The columns cover the TeamMatchInputV1 contract
-- (docs/launch/team-match-input-contract-v1.md): availability status/date,
-- deployable size min/max, destination countries, accommodation, transport,
-- trip length. Every column is nullable-or-defaulted: "not stated" stays an
-- honest NULL, never an invented value.
--
-- Security model:
--   * RLS default-closed: SELECT only for admins, the team owner and
--     organization managers (manages_organization). Employers NEVER read this
--     table raw — the only employer-visible projection is the bounded
--     availability snapshot inside the enquiry read model
--     (20260716131000, list_my_team_enquiries_v1), and only for teams the
--     employer has a real enquiry with. The free-text note stays
--     manager-only and is never projected.
--   * Writes are RPC-only (no INSERT/UPDATE/DELETE policies):
--     save_team_details_v1 is SECURITY DEFINER, gated to admin / team owner /
--     org manager, validated server-side (closed status vocabulary, bounded
--     sizes, ISO-shaped country codes, bounded note).
--   * Every save appends an audit_logs row.
--   * Grants: authenticated only — never anon.
--
-- ROLLBACK: supabase/rollbacks/20260716130000_team_profile_details_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER + grants =
-- RED-class; the annotation downgrades the CI finding only — the OWNER still
-- applies manually).
-- ============================================================================

begin;

-- ── 1. Table: 1:1 team-scoped operational details ─────────────────────────
create table if not exists public.team_details (
  org_id                uuid primary key references public.organizations(id) on delete cascade,
  availability_status   text not null default 'not_available'
                          check (availability_status in
                            ('available_now','available_from','not_available')),
  available_from        date,
  deployable_size_min   integer check (deployable_size_min is null
                                        or deployable_size_min between 1 and 200),
  deployable_size_max   integer check (deployable_size_max is null
                                        or deployable_size_max between 1 and 200),
  destination_countries text[] check (destination_countries is null
                                       or array_length(destination_countries, 1) <= 30),
  accommodation_needed  boolean not null default false,
  transport_own         boolean not null default false,
  max_trip_days         integer check (max_trip_days is null
                                        or max_trip_days between 1 and 365),
  note                  text check (note is null or char_length(note) <= 500),
  updated_at            timestamptz not null default now(),
  constraint team_details_available_from_chk
    check (availability_status <> 'available_from' or available_from is not null),
  constraint team_details_size_order_chk
    check (deployable_size_min is null or deployable_size_max is null
           or deployable_size_max >= deployable_size_min)
);

-- ── 2. RLS: default-closed; manager-side read only; RPC-only writes ───────
alter table public.team_details enable row level security;

drop policy if exists team_details_select on public.team_details;
create policy team_details_select on public.team_details
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.organizations o
                where o.id = org_id and o.owner_profile_id = auth.uid())
    or public.manages_organization(org_id)
  );
-- No INSERT/UPDATE/DELETE policies: every write goes through the RPC below.

grant select on public.team_details to authenticated;

-- ── 3. save_team_details_v1 — the ONLY writer ─────────────────────────────
create or replace function public.save_team_details_v1(
  p_org_id                uuid,
  p_availability_status   text,
  p_available_from        date,
  p_accommodation_needed  boolean,
  p_transport_own         boolean,
  p_max_trip_days         integer,
  p_note                  text,
  p_deployable_size_min   integer default null,
  p_deployable_size_max   integer default null,
  p_destination_countries text[] default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  v_type      text;
  v_owner     uuid;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_countries text[];
  v_code      text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select organization_type, owner_profile_id into v_type, v_owner
    from public.organizations where id = p_org_id;
  if not found then return 'not_found'; end if;
  if v_type <> 'team' then return 'not_a_team'; end if;
  if not (public.is_admin() or v_owner = uid
          or public.manages_organization(p_org_id)) then
    return 'not_allowed';
  end if;

  if p_availability_status is null or p_availability_status not in
       ('available_now','available_from','not_available') then
    return 'invalid_status';
  end if;
  if p_availability_status = 'available_from' and p_available_from is null then
    return 'date_required';
  end if;
  if p_max_trip_days is not null
     and (p_max_trip_days < 1 or p_max_trip_days > 365) then
    return 'invalid_trip_days';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    return 'note_too_long';
  end if;
  if (p_deployable_size_min is not null
      and (p_deployable_size_min < 1 or p_deployable_size_min > 200))
     or (p_deployable_size_max is not null
         and (p_deployable_size_max < 1 or p_deployable_size_max > 200))
     or (p_deployable_size_min is not null and p_deployable_size_max is not null
         and p_deployable_size_max < p_deployable_size_min) then
    return 'invalid_size';
  end if;

  -- Destination countries: uppercase ISO-alpha-2 shape only, max 30 entries.
  if p_destination_countries is not null then
    if array_length(p_destination_countries, 1) > 30 then
      return 'invalid_countries';
    end if;
    v_countries := array[]::text[];
    foreach v_code in array p_destination_countries loop
      v_code := upper(trim(coalesce(v_code, '')));
      if v_code !~ '^[A-Z]{2}$' then
        return 'invalid_countries';
      end if;
      if not (v_code = any (v_countries)) then
        v_countries := v_countries || v_code;
      end if;
    end loop;
    if array_length(v_countries, 1) = 0 then
      v_countries := null;
    end if;
  end if;

  insert into public.team_details
      (org_id, availability_status, available_from,
       deployable_size_min, deployable_size_max, destination_countries,
       accommodation_needed, transport_own, max_trip_days, note, updated_at)
    values
      (p_org_id, p_availability_status,
       case when p_availability_status = 'available_from'
            then p_available_from else null end,
       p_deployable_size_min, p_deployable_size_max, v_countries,
       coalesce(p_accommodation_needed, false),
       coalesce(p_transport_own, false),
       p_max_trip_days, v_note, now())
  on conflict (org_id) do update set
       availability_status   = excluded.availability_status,
       available_from        = excluded.available_from,
       deployable_size_min   = excluded.deployable_size_min,
       deployable_size_max   = excluded.deployable_size_max,
       destination_countries = excluded.destination_countries,
       accommodation_needed  = excluded.accommodation_needed,
       transport_own         = excluded.transport_own,
       max_trip_days         = excluded.max_trip_days,
       note                  = excluded.note,
       updated_at            = now();

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'save_team_details_v1', 'team_details', p_org_id,
    jsonb_build_object('availability_status', p_availability_status));

  return 'saved';
end;
$$;

revoke all on function public.save_team_details_v1(uuid, text, date, boolean, boolean, integer, text, integer, integer, text[]) from public;
grant execute on function public.save_team_details_v1(uuid, text, date, boolean, boolean, integer, text, integer, integer, text[]) to authenticated;

commit;

-- ROLLBACK: supabase/rollbacks/20260716130000_team_profile_details_v1.down.sql
