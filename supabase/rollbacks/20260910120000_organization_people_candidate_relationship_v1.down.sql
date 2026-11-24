-- Rollback for 20260910120000_organization_people_candidate_relationship_v1.sql
--
-- Restores the twelve-value `relationship_kind` domain exactly as it stood
-- before the forward migration. A faithful inverse: the forward file altered
-- one CHECK and nothing else, so this file alters that one CHECK back.
--
-- ── WHAT ROLLING BACK COSTS ───────────────────────────────────────────────
-- THIS IS NOT SAFE TO RUN BLIND. If any `organization_people` row has been
-- written with `relationship_kind = 'candidate'` since the forward migration,
-- re-adding the narrower constraint FAILS (23514) — Postgres validates the
-- new constraint against existing rows.
--
-- That failure is the correct behaviour and must not be worked around by
-- adding NOT VALID or by rewriting the rows. A candidate row exists because a
-- real organization recorded a real relationship with a real person; silently
-- reclassifying them as `employee` or `other` to make a rollback succeed would
-- assert something untrue about that person's working life, which is exactly
-- what the forward migration exists to prevent.
--
-- If a rollback is genuinely required while candidate rows exist, the honest
-- order is: decide with the owner what should happen to those relationships,
-- act on that decision explicitly and visibly, and only then narrow the
-- domain. Check first:
--
--   select count(*) from public.organization_people where relationship_kind = 'candidate';

alter table public.organization_people
  drop constraint if exists organization_people_relationship_kind_check;

alter table public.organization_people
  add constraint organization_people_relationship_kind_check
  check (
    relationship_kind = any (
      array[
        'employee'::text,
        'former_employee'::text,
        'agency_worker'::text,
        'subcontractor'::text,
        'contractor'::text,
        'student'::text,
        'graduate'::text,
        'trainee'::text,
        'apprentice'::text,
        'programme_participant'::text,
        'volunteer'::text,
        'other'::text
      ]
    )
  );
