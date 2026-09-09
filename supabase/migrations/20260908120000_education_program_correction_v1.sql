-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. One new SECURITY DEFINER function. Draft PR +
-- `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval. Never `supabase db push`.
--
-- NO OWNER DECISION EXISTS FOR THIS FILE YET. The marker above is the risk
-- ACKNOWLEDGEMENT the static gate reads (doctrine: "an acknowledgement, not an
-- auto-merge pass"). It is not an approval and it is not self-approval.
--
-- 20260908120000 — an institution can CORRECT a programme it created.
--
-- ── THE DEFECT, MEASURED ON PRODUCTION 2026-09-08 ─────────────────────────
--
-- `education_programs` carries exactly ONE policy, a SELECT. Every write goes
-- through `create_education_program_v1`, and `pg_proc` holds NO update
-- function. A programme is therefore IMMUTABLE from the moment it is created:
-- its name, target profession, education type and description are fixed
-- forever.
--
-- That is not a cosmetic limit. The target profession is what activates the
-- employer-demand signal: `readInstitutionPrograms` composes
-- `count_public_vacancies_by_profession_v1` (live, 39 professions, EXECUTE to
-- `authenticated` only) and the surface renders it per programme. When the slug
-- is null the surface honestly renders `demandUnknown` rather than 0 — and
-- production's ONE programme has a null slug, so it will read `demandUnknown`
-- permanently. The institution can see that the market signal is missing and
-- has no act available to turn it on.
--
-- The whole point of the education chain is that an institution can AIM at the
-- labour market. Today it can miss once, at creation, and never re-aim.
--
-- ── THE CHANGE ────────────────────────────────────────────────────────────
--
-- `update_education_program_v1` — the exact counterpart of
-- `create_education_program_v1`, with its authorization COPIED rather than
-- re-invented:
--
--   · authenticated, else 42501;
--   · `manages_organization` of the programme's OWN organization, else 42501
--     ('not_manager') — the organization is read FROM the row, never taken from
--     the caller, so a caller cannot name someone else's organization;
--   · that organization still holds the `training_provider` role, else 42501
--     ('not_education_institution');
--   · a non-null profession slug must exist and be active in `professions`,
--     else 22023 ('unknown_profession');
--   · a non-null education-type slug must exist and be active in
--     `education_types`, else 22023 ('unknown_education_type').
--
-- REPLACE, NOT PATCH. All four editable fields are written from the arguments,
-- so passing null CLEARS a field. The caller is a prefilled edit form that
-- always sends the current values, and a sentinel convention for "leave this
-- one alone" would be a second meaning for null in the same signature. Stated
-- here because it is the kind of thing that is guessed wrong later.
--
-- ── WHAT IT DOES NOT TOUCH ────────────────────────────────────────────────
--
-- `organization_id`, `created_by`, `created_at` and `id` are NOT updatable —
-- a programme cannot be moved to another organization or re-attributed. No
-- policy, table, column or grant on an existing object is altered, and no
-- existing function is replaced. Cohorts, members and outcomes are untouched:
-- correcting a programme's own fields cannot detach a learner.
--
-- Archival/deletion is deliberately NOT in this migration. Removing a
-- programme that has cohorts and members under it is a different decision with
-- a different blast radius, and it should be its own gate.
--
-- `authenticated` only; `public` and `anon` revoked BY NAME, because on a clean
-- local reset the environment's default privileges can hand `anon` EXECUTE.
--
-- ── NOT DESTRUCTIVE ───────────────────────────────────────────────────────
--
-- No DROP TABLE, no DROP COLUMN, no DELETE, no RLS change. Production holds 1
-- programme. Rollback:
-- supabase/rollbacks/20260908120000_education_program_correction_v1.down.sql

create or replace function public.update_education_program_v1(
  p_program_id             uuid,
  p_name                   text,
  p_target_profession_slug text default null,
  p_education_type_slug    text default null,
  p_description            text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The organization comes FROM THE ROW. A caller never names it, so they
  -- cannot borrow authority over an organization they do manage to edit a
  -- programme belonging to one they do not.
  select organization_id into v_org
    from public.education_programs
   where id = p_program_id;

  -- One refusal for "no such programme" and "not yours": a caller must not
  -- learn a programme exists by receiving a different error for it.
  if v_org is null or not public.manages_organization(v_org) then
    raise exception 'not_manager' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_roles r
     where r.organization_id = v_org and r.role_slug = 'training_provider'
  ) then
    raise exception 'not_education_institution' using errcode = '42501';
  end if;

  if btrim(coalesce(p_name, '')) = '' or char_length(btrim(p_name)) > 160 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_target_profession_slug is not null
     and not exists (
       select 1 from public.professions p
        where p.slug = p_target_profession_slug and p.is_active
     ) then
    raise exception 'unknown_profession' using errcode = '22023';
  end if;

  if p_education_type_slug is not null
     and not exists (
       select 1 from public.education_types e
        where e.slug = p_education_type_slug and e.is_active
     ) then
    raise exception 'unknown_education_type' using errcode = '22023';
  end if;

  update public.education_programs
     set name                   = btrim(p_name),
         target_profession_slug = p_target_profession_slug,
         education_type_slug    = p_education_type_slug,
         description            = nullif(btrim(coalesce(p_description, '')), '')
   where id = p_program_id;

  return p_program_id;
end;
$fn$;

revoke all on function public.update_education_program_v1(uuid, text, text, text, text) from public;
revoke all on function public.update_education_program_v1(uuid, text, text, text, text) from anon;
grant execute on function public.update_education_program_v1(uuid, text, text, text, text) to authenticated;

comment on function public.update_education_program_v1(uuid, text, text, text, text) is
  'Correct a programme an institution already created. The exact counterpart of create_education_program_v1, with the same authorization: a manager of the programme OWN organization, which must still hold the training_provider role, and slugs validated against the active professions / education_types catalogues. Replaces all four editable fields, so null clears one. organization_id, created_by and id are not updatable, so a programme cannot be moved or re-attributed.';
