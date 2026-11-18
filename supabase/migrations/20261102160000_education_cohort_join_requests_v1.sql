-- @human-gate-approved — RED draft J-12 (owner decision 2026-11-02); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261102160000_education_cohort_join_requests_v1
--
-- ██ RED CLASS — human gate (eight new SECURITY DEFINER functions + GRANT, a TIGHTENED
-- ██ select policy on the membership table, a widened
-- ██ status CHECK on a membership table, and one command creates a `student`
-- ██ engagement context). Draft; owner-channel apply only, never auto-merged.
--
-- J-12 / EDU-2 (owner decision 2026-11-02, ARCH-3 resolved): a learner may ASK
-- to join a learning group; the institution's authorised person accepts or
-- declines. Until then — and with no institution at all — the learner keeps
-- filling their own history, which reads as their own declaration.
--
-- REUSE, NOT A SECOND STORE (decision 0016). The membership pair already lives
-- in `education_cohort_members` (20260903120000); a request is that same row in
-- an earlier state:
--     requested → active   (accepted by the institution)
--     requested → declined (declined by the institution)
--     requested → withdrawn (withdrawn by the learner)
--   withdrawn | left → requested (asked again, while still open)
--   declined → requested only 30 days after the decline (no re-asking loop)
-- Every existing reader already filters `status = 'active'` (the two RLS
-- membership helpers, the learning compass, the institution report), so a
-- request grants nothing: a requester reads no programme and no cohort through
-- RLS, and counts nowhere as a member.
--
-- WHO MAY SEE A GROUP. A cohort is findable only after the institution opens it
-- (`join_requests_open`, default false — nothing changes for existing
-- cohorts). The finder is a definer read that returns the institution's display
-- name and the group's own name, programme and dates: what the institution
-- chose to publish by opening it, nothing about other learners.
--
-- WHO DECIDES (owner decision 2026-11-03). Only the institution's OWN owner,
-- admin or manager: `education_cohort_decider_basis_v1` below. It is narrower
-- than `manages_organization`, which also admits `external_manager`. An
-- external manager or agency may decide only under an explicit, limited and
-- revocable per-group delegation from the institution — a separate, later PR;
-- until then they get no access by default. Nobody decides their own request.
-- Administering a group never confirms practice, hours, competences or a
-- qualification: accept writes the membership, the student relationship and
-- an audit row, nothing else. Every decision's actor and authority basis is
-- in `audit_logs` (admin-read).
--
-- THE RELATIONSHIP. Assigning a member requires an accepted student relationship
-- (membership never creates a relationship the learner did not accept). Here the
-- learner's own request IS that acceptance, so the accept command creates the
-- `student` engagement context exactly as an accepted invitation does
-- (20261021094000, same columns and hash), or reuses an active one. Journal
-- entries attributed to it become reviewable by the institution
-- (20260919210000); until confirmed they stay the learner's declared record.
--
-- WHAT THE INSTITUTION SEES. Only the name the learner typed on the request
-- and an optional note — the learner's profile, journal and skills stay under
-- the least-privilege ruling (2026-08-27). The name is typed by the learner and
-- NOT verified; the institution UI says so. No new reference to profiles is
-- added, so the erasure registry is unchanged.
--
-- WHAT THE LEARNER SEES. Their own row is readable to them (existing RLS), so
-- the decider is NOT written into it: a request-path row keeps `added_by` null
-- (the learner added themselves by asking). Who decided is recorded in
-- `audit_logs` (admin-read only), never returned to the learner.
--
-- Reversible: supabase/rollbacks/20261102160000_education_cohort_join_requests_v1.down.sql
-- (guarded — refuses while any non-active/left row exists).

-- ── 1. Columns ───────────────────────────────────────────────────────────────

alter table public.education_cohorts
  add column if not exists join_requests_open boolean not null default false;
comment on column public.education_cohorts.join_requests_open is
  'The institution lets learners find this group and ask to join it (J-12). Default false.';

alter table public.education_cohort_members
  add column if not exists requested_at  timestamptz,
  add column if not exists request_label text check (request_label is null or char_length(request_label) between 2 and 120),
  add column if not exists request_note  text check (request_note is null or char_length(request_note) <= 500),
  add column if not exists decided_at    timestamptz;

alter table public.education_cohort_members drop constraint if exists education_cohort_members_status_check;
alter table public.education_cohort_members
  add constraint education_cohort_members_status_check
  check (status in ('active', 'left', 'requested', 'declined', 'withdrawn'));

comment on column public.education_cohort_members.request_label is
  'The name the learner typed when asking to join — the only thing about the learner the institution reads.';

-- ── 2. Who may administer a group: the institution's own people only ───────
-- Returns the authority basis ('membership:owner|admin|manager' or
-- 'engagement:owner|manager') or null. `external_manager` — by engagement or
-- by membership — never qualifies (owner decision 2026-11-03). Internal helper:
-- callable only from the definer commands below, not by any client role.
create or replace function public.education_cohort_decider_basis_v1(p_org uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select 'membership:' || m.role from public.company_memberships m
      where m.profile_id = auth.uid() and m.organization_id = p_org
        and m.status = 'active' and m.role in ('owner', 'admin', 'manager')
      order by array_position(array['owner', 'admin', 'manager'], m.role) limit 1),
    (select 'engagement:' || ec.relationship_slug from public.engagement_contexts ec
      where ec.profile_id = auth.uid() and ec.organization_id = p_org
        and ec.status = 'active' and ec.relationship_slug in ('owner', 'manager')
      order by array_position(array['owner', 'manager'], ec.relationship_slug) limit 1))
   where p_org is not null and auth.uid() is not null;
$$;
revoke all on function public.education_cohort_decider_basis_v1(uuid) from public, anon, authenticated;

-- Policy-side twin of the basis: a boolean the members_select policy can call
-- as the querying role (it reveals only whether the CALLER may decide).
create or replace function public.is_education_cohort_internal_decider_v1(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.education_cohort_decider_basis_v1(p_org) is not null;
$$;
revoke all on function public.is_education_cohort_internal_decider_v1(uuid) from public, anon;
grant execute on function public.is_education_cohort_internal_decider_v1(uuid) to authenticated;

-- ── 2a. Who may READ a request row (TIGHTENING, owner decision 2026-11-03) ──
-- Until now every row was readable by the learner, by `manages_organization`
-- of the cohort's organisation (which admits external_manager) and by admin.
-- Active / left rows keep exactly that. A request-state row (requested /
-- declined / withdrawn, carrying the learner-typed label and note) is readable
-- only by the learner, the institution's own owner/admin/manager, and admin —
-- never by an external manager by default. Rollback restores the 20260903150000
-- policy text exactly.
drop policy if exists education_cohort_members_select on public.education_cohort_members;
create policy education_cohort_members_select on public.education_cohort_members for select
  using (
    profile_id = auth.uid()
    or (status in ('active', 'left')
        and public.manages_organization(public.education_cohort_organization_v1(cohort_id)))
    or (status not in ('active', 'left')
        and public.is_education_cohort_internal_decider_v1(public.education_cohort_organization_v1(cohort_id)))
    or public.is_admin()
  );

-- ── 2b. Institution opens / closes a group for requests ───────────────────────

create or replace function public.set_education_cohort_join_requests_v1(
  p_cohort_id uuid,
  p_open boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_basis text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  v_basis := public.education_cohort_decider_basis_v1(v_org);
  if v_basis is null then raise exception 'not_manager' using errcode = '42501'; end if;
  update public.education_cohorts
     set join_requests_open = coalesce(p_open, false), updated_at = now()
   where id = p_cohort_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'education_cohort_join_requests_set_v1', 'education_cohorts', p_cohort_id,
    jsonb_build_object('open', coalesce(p_open, false), 'authority_basis', v_basis));
end;
$$;

-- An institution archives a group it no longer runs (the cohort table has had
-- `archived_at` since 20260903120000, but no command set it). Archiving closes
-- the group for requests and declines any request still pending, so no learner
-- is left waiting on a group nobody reads; members' rows are kept as history.
create or replace function public.archive_education_cohort_v1(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_basis text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  v_basis := public.education_cohort_decider_basis_v1(v_org);
  if v_basis is null then raise exception 'not_manager' using errcode = '42501'; end if;
  update public.education_cohort_members
     set status = 'declined', decided_at = now()
   where cohort_id = p_cohort_id and status = 'requested';
  update public.education_cohorts
     set archived_at = now(), join_requests_open = false, updated_at = now()
   where id = p_cohort_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'education_cohort_archived_v1', 'education_cohorts', p_cohort_id,
    jsonb_build_object('authority_basis', v_basis));
end;
$$;

-- ── 3. Learner finds open groups (and their own requests) ────────────────────

create or replace function public.list_open_education_cohorts_v1()
returns table (
  cohort_id              uuid,
  cohort_name            text,
  program_name           text,
  institution_name       text,
  target_profession_slug text,
  starts_on              date,
  ends_on                date,
  join_requests_open     boolean,
  my_status              text
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.name, p.name,
         coalesce(nullif(btrim(o.display_name), ''), o.legal_name),
         p.target_profession_slug, c.starts_on, c.ends_on,
         c.join_requests_open, m.status
    from public.education_cohorts c
    join public.education_programs p on p.id = c.program_id and p.archived_at is null
    join public.organizations o on o.id = c.organization_id and o.archived_at is null
    left join public.education_cohort_members m on m.cohort_id = c.id and m.profile_id = auth.uid()
   where auth.uid() is not null
     and c.archived_at is null
     and m.status is distinct from 'active'
     and (c.join_requests_open or m.status in ('requested', 'declined'))
   order by (m.status is null), c.starts_on nulls last, c.name
   limit 100;
$$;

-- ── 4. Learner asks / withdraws ──────────────────────────────────────────────

create or replace function public.request_education_cohort_join_v1(
  p_cohort_id uuid,
  p_label text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_open   boolean;
  v_status text;
  v_decided timestamptz;
  v_label  text := btrim(coalesce(p_label, ''));
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if char_length(v_label) < 2 or char_length(v_label) > 120 or char_length(coalesce(v_note, '')) > 500 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select c.join_requests_open into v_open
    from public.education_cohorts c
    join public.education_programs p on p.id = c.program_id and p.archived_at is null
    join public.organizations o on o.id = c.organization_id and o.archived_at is null
   where c.id = p_cohort_id and c.archived_at is null;
  if v_open is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;

  select status, decided_at into v_status, v_decided from public.education_cohort_members
   where cohort_id = p_cohort_id and profile_id = v_uid;
  if v_status = 'active' then return 'already_member'; end if;
  if not v_open then raise exception 'join_requests_closed' using errcode = '42501'; end if;
  -- A declined learner may ask again only 30 days after the decline, so a
  -- decline is not answered by an endless re-asking loop.
  if v_status = 'declined' and v_decided > now() - interval '30 days' then
    raise exception 'request_cooldown' using errcode = '42501';
  end if;

  insert into public.education_cohort_members
    (cohort_id, profile_id, status, added_by, added_at, requested_at, request_label, request_note, decided_at, left_at)
  values
    (p_cohort_id, v_uid, 'requested', null, now(), now(), v_label, v_note, null, null)
  on conflict (cohort_id, profile_id) do update
    set status        = 'requested',
        added_by      = null,
        requested_at  = now(),
        request_label = excluded.request_label,
        request_note  = excluded.request_note,
        decided_at    = null
  where public.education_cohort_members.status <> 'active';
  return 'requested';
end;
$$;

create or replace function public.withdraw_education_cohort_join_v1(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  update public.education_cohort_members
     set status = 'withdrawn', decided_at = now()
   where cohort_id = p_cohort_id and profile_id = v_uid and status = 'requested';
  if not found then raise exception 'no_pending_request' using errcode = '42501'; end if;
end;
$$;

-- ── 5. Institution's authorised person decides ───────────────────────────────

create or replace function public.decide_education_cohort_join_v1(
  p_cohort_id uuid,
  p_profile_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_org      uuid;
  v_basis    text;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('accept', 'decline') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  v_basis := public.education_cohort_decider_basis_v1(v_org);
  if v_basis is null then raise exception 'not_manager' using errcode = '42501'; end if;
  -- Nobody decides their own request (the decision-0028 rule, applied here).
  if p_profile_id = v_uid then raise exception 'self_decision_not_allowed' using errcode = '42501'; end if;
  perform 1 from public.education_cohort_members
   where cohort_id = p_cohort_id and profile_id = p_profile_id and status = 'requested'
   for update;
  if not found then raise exception 'no_pending_request' using errcode = '42501'; end if;

  if p_decision = 'decline' then
    update public.education_cohort_members
       set status = 'declined', decided_at = now()
     where cohort_id = p_cohort_id and profile_id = p_profile_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (v_uid, 'education_cohort_join_declined_v1', 'education_cohorts', p_cohort_id,
      jsonb_build_object('profile_id', p_profile_id, 'authority_basis', v_basis));
    return 'declined';
  end if;

  -- The learner's request is their acceptance of the student relationship:
  -- reuse an active one, else create it exactly as an accepted invitation does.
  select id into v_existing from public.engagement_contexts
   where profile_id = p_profile_id and organization_id = v_org
     and relationship_slug = 'student' and status = 'active' limit 1;
  if v_existing is null then
    insert into public.engagement_contexts
      (profile_id, organization_id, relationship_slug, status, is_primary, title, hash_self)
    values
      (p_profile_id, v_org, 'student', 'active', false, null,
       encode(extensions.digest(p_profile_id::text || ':student:' || v_org::text, 'sha256'), 'hex'));
  end if;

  update public.education_cohort_members
     set status = 'active', added_by = null, added_at = now(), decided_at = now(), left_at = null,
         -- Request content ends with the request: an active row is visible to
         -- external managers (unchanged rule), so it carries no learner-typed text.
         request_label = null, request_note = null
   where cohort_id = p_cohort_id and profile_id = p_profile_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'education_cohort_join_accepted_v1', 'education_cohorts', p_cohort_id,
    jsonb_build_object('profile_id', p_profile_id, 'authority_basis', v_basis));
  return 'accepted';
end;
$$;

revoke execute on function public.set_education_cohort_join_requests_v1(uuid, boolean) from public, anon;
revoke execute on function public.archive_education_cohort_v1(uuid) from public, anon;
revoke execute on function public.list_open_education_cohorts_v1() from public, anon;
revoke execute on function public.request_education_cohort_join_v1(uuid, text, text) from public, anon;
revoke execute on function public.withdraw_education_cohort_join_v1(uuid) from public, anon;
revoke execute on function public.decide_education_cohort_join_v1(uuid, uuid, text) from public, anon;
grant execute on function public.set_education_cohort_join_requests_v1(uuid, boolean) to authenticated;
grant execute on function public.archive_education_cohort_v1(uuid) to authenticated;
grant execute on function public.list_open_education_cohorts_v1() to authenticated;
grant execute on function public.request_education_cohort_join_v1(uuid, text, text) to authenticated;
grant execute on function public.withdraw_education_cohort_join_v1(uuid) to authenticated;
grant execute on function public.decide_education_cohort_join_v1(uuid, uuid, text) to authenticated;

-- ROLLBACK
-- (see supabase/rollbacks/20261102160000_education_cohort_join_requests_v1.down.sql — guarded)
-- drop function if exists public.decide_education_cohort_join_v1(uuid, uuid, text);
-- drop function if exists public.withdraw_education_cohort_join_v1(uuid);
-- drop function if exists public.request_education_cohort_join_v1(uuid, text, text);
-- drop function if exists public.list_open_education_cohorts_v1();
-- drop function if exists public.set_education_cohort_join_requests_v1(uuid, boolean);
-- drop function if exists public.archive_education_cohort_v1(uuid);
-- restore the 20260903150000 education_cohort_members_select policy;
-- drop function if exists public.is_education_cohort_internal_decider_v1(uuid);
-- drop function if exists public.education_cohort_decider_basis_v1(uuid);
-- restore the two-state CHECK; drop the four request columns and join_requests_open.
