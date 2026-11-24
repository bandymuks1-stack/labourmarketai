-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260826182421 — practice work history v1 (education pilot P0).
--
-- PROBLEM (measured, not theoretical):
--   `relationship_types` has shipped `student` (category 'education') and
--   `volunteer` since 0002. NOTHING can create an engagement with either one.
--   The only self-service write path into the canonical work-history table,
--   save_self_declared_work_history_v1 (20260714161000), rejects both:
--
--     if p_relationship_slug not in
--          ('employee','freelancer','consultant','collaborator') then
--       raise exception 'Invalid relationship' ...
--
--   Production confirms the consequence — every one of the 53 rows in
--   engagement_contexts is `employee` (40) or `owner` (13). Zero placements.
--
--   So a student who completed a real placement at a real organization has
--   exactly two options: record it as `employee` (a false statement about an
--   employment relationship) or not record it at all. The application layer
--   compounded this by hard-coding p_relationship_slug => 'employee' for
--   every self-declared row (lib/profile/cv-section-import-actions.ts).
--
--   For the education pilot this is the blocking defect: the product's claim
--   is that a student with a placement is NOT "a person with no experience",
--   and the database cannot currently express the placement.
--
-- SOLUTION (smallest honest change): widen the closed relationship set of the
--   EXISTING function by exactly two slugs that already exist in
--   relationship_types — `student` and `volunteer`. No new table, no new
--   function, no new grant, no RLS change, no signature change.
--
--   `manager` deliberately stays OUT: it is an administrative relationship to
--   an organization, not the person's own work, and every history surface
--   omits it.
--
--   The read side keeps the two kinds apart (lib/player-card/work-history-model.ts
--   PRACTICE_RELATIONSHIPS): a placement prints under its own CV heading and
--   can never be rendered as employment.
--
-- BODY PROVENANCE: this is the CURRENT production definition, read back with
--   pg_get_functiondef on 2026-08-26, with ONE line changed (the allowlist).
--   Everything else — the auth check, the title bounds, the date-range check,
--   the idempotency lookup, the 60-row abuse bound, the status derivation and
--   the hash — is byte-for-byte what is already deployed.
--
-- DATA: no row is created, altered or deleted by this migration.
--
-- ROLLBACK: supabase/rollbacks/20260826182421_practice_work_history_v1.down.sql
--   restores the 4-slug allowlist. Placement rows created in the meantime are
--   the worker's own data and are LEFT IN PLACE (same convention as
--   20260714161000) — reverting a validation rule must not delete history a
--   person entered. After a rollback those rows remain readable and remain
--   removable through remove_self_declared_work_history_v1.
--
-- POST-APPLY VERIFICATION:
--   -- as an authenticated worker:
--   select save_self_declared_work_history_v1(
--     'UAB Statyba — praktika', 'student', '2026-02-01', '2026-05-31');  -- uuid
--   select save_self_declared_work_history_v1(
--     'UAB Statyba — praktika', 'student', '2026-02-01', '2026-05-31');  -- SAME uuid
--   select save_self_declared_work_history_v1('X', 'manager');           -- raises 22023
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (CREATE OR REPLACE of a SECURITY
-- DEFINER function is RED by the migration-safety classifier; the OWNER
-- applies it manually after review).
-- ============================================================================

begin;

create or replace function public.save_self_declared_work_history_v1(
  p_title             text,
  p_relationship_slug text,
  p_started_at        date default null,
  p_ended_at          date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_title  text := btrim(coalesce(p_title, ''));
  v_status text;
  v_id     uuid;
  v_count  int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  -- Closed relationship set (subset of relationship_types; the FK would also
  -- enforce existence, this enforces the PERSON'S-OWN-WORK subset).
  -- WIDENED 20260826182421: 'student' and 'volunteer' are real ways a person
  -- works. They are kept distinct from employment on every read surface, so
  -- widening this list does not let a placement be claimed as a job.
  -- 'manager' stays out — an administrative relationship, not own work.
  if p_relationship_slug is null or p_relationship_slug not in
       ('employee','freelancer','consultant','collaborator',
        'student','volunteer') then
    raise exception 'Invalid relationship' using errcode = '22023';
  end if;
  if p_started_at is not null and p_ended_at is not null
     and p_ended_at < p_started_at then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  -- Idempotent: an identical self-declared row already exists → return it.
  select ec.id into v_id
  from public.engagement_contexts ec
  where ec.profile_id = uid
    and ec.organization_id is null
    and lower(coalesce(ec.title, '')) = lower(v_title)
    and ec.relationship_slug = p_relationship_slug
    and ec.started_at is not distinct from p_started_at
    and ec.ended_at   is not distinct from p_ended_at
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Abuse bound: at most 60 organization-less rows per profile (includes the
  -- trigger-provisioned personal engagement).
  select count(*) into v_count
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id is null;
  if v_count >= 60 then
    raise exception 'Too many self-declared entries' using errcode = '54000';
  end if;

  v_status := case when p_ended_at is not null then 'ended' else 'active' end;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary,
     title, started_at, ended_at, hash_self)
  values
    (uid, null, p_relationship_slug, v_status, false,
     v_title, p_started_at, p_ended_at,
     encode(extensions.digest(
       uid::text || ':' || p_relationship_slug || ':' || v_title || ':'
         || coalesce(p_started_at::text, '') || ':' || coalesce(p_ended_at::text, ''),
       'sha256'), 'hex'))
  returning id into v_id;

  return v_id;
end;
$function$;

-- Privilege floor, restated explicitly.
--
-- `create or replace` does NOT reset an existing ACL, so in production this
-- pair is a no-op: the function already carries {postgres=X, authenticated=X}
-- and `anon` was never granted (verified 2026-08-26). It matters on a CLEAN
-- database reset, where the environment's default privileges DO hand EXECUTE
-- to anon and the 20260722160000 secdef closure — which ran long before this
-- file exists — cannot reach this function. Stating the floor here is what
-- keeps a local reset and production identical
-- (lib/guards/secdef-local-reset-reproducibility.test.ts).
revoke all on function
  public.save_self_declared_work_history_v1(text, text, date, date)
  from public, anon;
grant execute on function
  public.save_self_declared_work_history_v1(text, text, date, date)
  to authenticated;

commit;
