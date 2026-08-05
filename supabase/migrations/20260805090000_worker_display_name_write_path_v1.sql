-- 20260805090000 — repair the workers.display_name write path
--
-- SAFETY CLASS: RED. This migration CREATE OR REPLACEs an existing
-- SECURITY DEFINER function (`public.complete_onboarding`) and re-states its
-- REVOKE/GRANT pair. Both are human-gate classes (g) and (h) in
-- .github/scripts/migration-safety.mjs.
--
-- There is deliberately NO `-- @human-gate-approved` marker in this file.
-- That marker asserts the OWNER approved the change; no owner decision has
-- been recorded for it yet. CI staying RED is the honest state.
-- Approval package: docs/human-gates/worker-display-name-write-path-gate.md
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────────
-- The onboarding display name a person types is discarded, so
-- `public.workers.display_name` is left NULL and nothing can later fill it.
--
-- EVIDENCE BOUNDARY — read this before quoting any number. The mechanism below
-- is proven by reading the migrations, and reproduced end-to-end on a
-- DISPOSABLE LOCAL STACK built from the same migration set as production
-- (create a user via the auth admin API, call
-- `complete_onboarding('worker','Jonas Petraitis','LT','{}'::jsonb,null)` as
-- that user → `workers.display_name` = NULL, `profiles.full_name` =
-- 'Jonas Petraitis'). PRODUCTION ROW COUNTS HAVE NOT BEEN MEASURED. The
-- mechanism implies every account onboarded on the affected code path is hit,
-- but this file does NOT assert how many production rows that is. The backfill
-- migration reports real before/after counts at apply time; that is the only
-- place a production number should come from.
--
-- The mechanism is an ordering accident between two migrations:
--
--   1. 0006/0008 wrote `complete_onboarding` so that the worker branch does
--        insert into public.workers (profile_id, display_name,
--                                    current_location_country)
--        values (...) on conflict (profile_id) do nothing;
--      When 0008 was authored this INSERT genuinely inserted — nothing else
--      created the row, so the DO NOTHING branch was unreachable.
--
--   2. 0009 (LATER) introduced "worker is the universal base profile": the
--      trigger `on_profile_created_ensure_worker` → `ensure_worker_profile()`
--      inserts `public.workers (profile_id)` — display_name NULL — AFTER
--      INSERT on `public.profiles`.
--
-- `handle_new_user()` creates the profiles row at signup, so by the time the
-- person submits onboarding the workers row ALWAYS exists. 0009 therefore
-- silently converted 0008's working INSERT into a permanent no-op. The
-- display name the person typed is read, trimmed, passed to the INSERT — and
-- discarded. Only `profiles.full_name` survives.
--
-- `complete_onboarding` is the ONLY writer of `workers.display_name` anywhere
-- in the system: no app code writes it (every hit under apps/web is a
-- reader), no other migration writes it, and the worker's own profile page
-- does not even SELECT it — so the person has no way to repair it either.
--
-- ── CUSTOMER-VISIBLE EFFECT ────────────────────────────────────────────────
-- Every employer-facing surface that names a worker via `workers.display_name`
-- falls back. In `listProjectAssignments` (apps/web/lib/projects/projects.ts)
-- the chain is
--     profiles.full_name ?? workers.display_name ?? profile_id.slice(0, 8)
-- and `profiles_select` is `(id = auth.uid() or is_admin())`, so an employer
-- can never read another person's `profiles.full_name`. Both real names are
-- unreachable and the employer sees a RAW UUID FRAGMENT — e.g. "aaaaaaaa" —
-- in the "Assigned people" roster. Same fallback in
-- lib/projects/booking-engagement-workers.ts; name-only degradation in
-- lib/company/company-workers.ts, lib/agency/agency-workers.ts,
-- lib/assets/assets.ts, lib/leave/absences.ts, lib/instructions/instructions.ts.
--
-- ── WHAT THIS MIGRATION CHANGES ────────────────────────────────────────────
-- Exactly one statement inside `complete_onboarding`: the worker-branch
-- conflict action becomes DO UPDATE. Every other line of the function is
-- carried over byte-for-byte from 0008 so this is a targeted repair, not a
-- rewrite. Diff against 0008 to confirm.
--
--   on conflict (profile_id) do nothing;                       -- before
--   on conflict (profile_id) do update set ... coalesce(...)   -- after
--
-- DECISION — `excluded` wins over the stored value, not the reverse:
--   coalesce(excluded.display_name, workers.display_name)
-- means a non-NULL onboarding value OVERWRITES, and a NULL/blank onboarding
-- value PRESERVES what is already stored. Rationale: step 1 of this same
-- function already overwrites `profiles.full_name` unconditionally from the
-- same `p_display_name`. Making the workers row keep a *different*, older
-- name would put the two columns permanently out of sync — and the fallback
-- chain reads them in sequence, so drift between them is exactly what
-- produces a wrong name on an employer screen. Onboarding is the person's own
-- explicit statement about themselves; re-submitting it is a correction and
-- must land.
--
-- DECISION — `current_location_country` gets the SAME treatment. It has the
-- identical defect from the identical cause (`ensure_worker_profile` leaves it
-- NULL, the DO NOTHING discards `p_country`). Fixing only display_name would
-- knowingly leave half the discarded payload on the floor for no reason. The
-- coalesce direction protects the one case that matters: the profile page
-- DOES let a worker edit `current_location_country` later, and a re-run of
-- onboarding that supplies no country will not wipe that edit.
--
-- `updated_at` is set explicitly. `public.workers` has NO `set_updated_at`
-- trigger (verified: no `before update on public.workers` trigger exists in
-- any migration), so without this the column would keep reporting row-creation
-- time after a real content change.
--
-- NOT IN SCOPE, deliberately:
--   * `profiles_select` is NOT touched. Letting employers read other people's
--     profile rows is not the fix for a missing display name.
--   * `ensure_worker_profile()` is NOT touched. It correctly creates a
--     minimal universal-base row; it has no name to write (`handle_new_user`
--     does not populate `profiles.full_name`).
--   * EXISTING rows are NOT backfilled here. This migration only repairs the
--     write path going forward. The backfill mutates production data and is a
--     separate owner-gated decision — see
--     20260805090100_worker_display_name_backfill_v1.sql.
--
-- Regression pin: apps/web/lib/guards/worker-display-name-write-path.test.ts
-- fails if the worker-branch conflict action ever returns to DO NOTHING.
--
-- ROLLBACK: supabase/rollbacks/20260805090000_worker_display_name_write_path_v1.down.sql
-- restores the 0008 function verbatim (back to DO NOTHING). Rolling back
-- re-opens the defect; it does not delete any name already written.
-- ════════════════════════════════════════════════════════════════════════

-- ── Safety assertion — fail loudly if the assumed shape drifted ────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workers'
       and column_name = 'display_name'
  ) then
    raise exception
      'workers.display_name missing — schema drift; review 20260805090000';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workers'
       and column_name = 'current_location_country'
  ) then
    raise exception
      'workers.current_location_country missing — schema drift; review 20260805090000';
  end if;

  -- The upsert below depends on a UNIQUE constraint over (profile_id); the
  -- ON CONFLICT target is meaningless without it.
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'workers'
       and c.contype in ('u','p')
       and c.conkey = array[(
         select attnum from pg_attribute
          where attrelid = t.oid and attname = 'profile_id'
       )]::int2[]
  ) then
    raise exception
      'workers.profile_id has no unique constraint — ON CONFLICT target invalid';
  end if;
end $$;

-- ── complete_onboarding — worker branch upsert repaired ────────────────────
-- Signature unchanged from 0008: (text, text, text, jsonb, uuid). No DROP, so
-- no PostgREST 404 window and no client change required.
create or replace function public.complete_onboarding(
  p_role          text,
  p_display_name  text,
  p_country       text,
  p_role_data     jsonb,
  p_profession_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  wid             uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('worker','company','agency','customer') then
    raise exception 'Invalid onboarding role: %', p_role
      using errcode = '22023';
  end if;

  -- 1. profiles core fields.
  update public.profiles
     set full_name    = nullif(trim(coalesce(p_display_name, '')), ''),
         country      = nullif(trim(coalesce(p_country, '')), ''),
         active_role  = p_role,
         onboarded_at = coalesce(onboarded_at, now()),
         onboarded    = true
   where id = uid;

  -- 2. profile_roles catalogue (idempotent: re-submit replaces role_data).
  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, p_role, true, coalesce(p_role_data, '{}'::jsonb))
  on conflict (profile_id, role) do update
     set is_active = true,
         role_data = excluded.role_data;

  -- 3. role-specific entity row.
  if p_role = 'worker' then
    -- THE FIX. `ensure_worker_profile()` (0009) has already created this row
    -- with display_name NULL, so this INSERT *always* conflicts. Under the
    -- previous DO NOTHING the typed name was silently dropped on every
    -- signup. DO UPDATE lands it. coalesce keeps a stored value when
    -- onboarding supplies nothing — see the DECISION notes in the header.
    insert into public.workers (
      profile_id,
      display_name,
      current_location_country
    )
    values (
      uid,
      nullif(trim(coalesce(p_display_name, '')), ''),
      nullif(trim(coalesce(p_country, '')), '')
    )
    on conflict (profile_id) do update
       set display_name = coalesce(
             excluded.display_name, workers.display_name),
           current_location_country = coalesce(
             excluded.current_location_country,
             workers.current_location_country),
           -- public.workers has no set_updated_at trigger; set it by hand.
           updated_at = now();

    -- 3a. primary profession (Step 1 of M1 C-scope). Only on worker role;
    --     idempotent on the (worker_id, profession_id) pair; if a primary
    --     already exists, the new pair is recorded as non-primary so the
    --     partial unique index isn't violated on re-submit with a
    --     different profession.
    if p_profession_id is not null then
      select id into wid from public.workers where profile_id = uid;
      if wid is not null then
        insert into public.worker_professions (
          worker_id,
          profession_id,
          is_primary
        )
        values (
          wid,
          p_profession_id,
          not exists (
            select 1 from public.worker_professions
             where worker_id = wid and is_primary
          )
        )
        on conflict (worker_id, profession_id) do nothing;
      end if;
    end if;

  elsif p_role = 'company' then
    if not exists (
      select 1 from public.companies where profile_id = uid
    ) then
      insert into public.companies (
        profile_id, legal_name, display_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_country, '')), '')
      );
    end if;

  elsif p_role = 'agency' then
    if not exists (
      select 1 from public.agencies where profile_id = uid
    ) then
      insert into public.agencies (
        profile_id, legal_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_country, '')), '')
      );
    end if;
  end if;
end $$;

comment on function public.complete_onboarding(text, text, text, jsonb, uuid) is
  'Onboarding RPC. Worker branch UPSERTS public.workers so the typed display '
  'name lands (0009''s auto-worker trigger made the old DO NOTHING branch '
  'unreachable-by-inversion, discarding it). Repaired 20260805090000.';

-- Privileges re-stated exactly as 0008 left them. CREATE OR REPLACE preserves
-- existing grants, so this is a no-op restatement kept for auditability — the
-- function's reachable surface is unchanged by this migration.
revoke all on function public.complete_onboarding(text, text, text, jsonb, uuid)
  from public;
-- SECDEF hygiene (secdef-local-reset-reproducibility guard): this SECURITY
-- DEFINER function is (re)created AFTER the 20260722160000 anon closure, so
-- the closure cannot reach it — without an explicit anon revoke it would stay
-- anon-reachable through the environment's default privileges. Behaviourally
-- inert (the function raises 42501 without auth.uid()), structurally required.
revoke all on function public.complete_onboarding(text, text, text, jsonb, uuid)
  from anon;
grant execute
  on function public.complete_onboarding(text, text, text, jsonb, uuid)
  to authenticated;
