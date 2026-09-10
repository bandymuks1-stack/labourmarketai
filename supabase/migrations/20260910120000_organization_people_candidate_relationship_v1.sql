-- 20260910120000 — `candidate` becomes a truthful organization-person relationship.
--
-- ── SAFETY CLASS: GREEN ───────────────────────────────────────────────────
-- ONE additive CHECK widening. No table, column, function, policy, grant,
-- trigger or default is created, dropped or altered. No data is written,
-- updated or deleted. The drop+re-add pair below is the recognized
-- CHECK-widening idiom (migration-safety.mjs rule (m)): the DROP is
-- immediately followed by an ADD in the same file, so no constraint is ever
-- left off the table.
--
-- ── WHY ───────────────────────────────────────────────────────────────────
-- Owner approval 2026-09-10. `organization_people.relationship_kind` admits
-- twelve values and none of them means "a person this organization is
-- considering, or represents, but does not employ". A staffing agency
-- carrying candidates therefore had to record them as `employee`,
-- `agency_worker`, `contractor` or `other` — each of which asserts something
-- untrue about a real person's working life, and two of which imply an
-- employment relationship that does not exist.
--
-- The alternative to this line is not "no candidates". It is candidates
-- recorded under a false relationship, which is worse and much harder to
-- unwind later.
--
-- ── WHY IT IS SAFE ────────────────────────────────────────────────────────
-- The new domain is a strict SUPERSET of the old one: every value that was
-- legal before is still legal, so no existing row can be invalidated by this
-- change. Measured on production 2026-09-10 before writing this file:
-- `organization_people` holds 0 rows, so the validation scan is empty and the
-- statement is instant. The widening is additionally validated (not NOT
-- VALID), so the constraint keeps its full guarantee for every future row.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
-- It does not touch RLS. It does not grant anything. It does not make a
-- candidate importable — the ingestion path is application code and is
-- authorized by the same organization-manager policies that already govern
-- this table. It adds one word to a vocabulary; nothing becomes reachable
-- that a manager could not already reach.

alter table public.organization_people
  drop constraint if exists organization_people_relationship_kind_check;

alter table public.organization_people
  add constraint organization_people_relationship_kind_check
  check (
    relationship_kind = any (
      array[
        'candidate'::text,
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

comment on constraint organization_people_relationship_kind_check
  on public.organization_people is
  'Truthful organization-person relationships. `candidate` added 2026-09-10 (owner approval) so a person an organization is considering or represents is not recorded as an employee.';

-- ROLLBACK
--
-- Restores the twelve-value domain exactly as it stood before this file.
-- See supabase/rollbacks/20260910120000_organization_people_candidate_relationship_v1.down.sql
--
-- alter table public.organization_people
--   drop constraint if exists organization_people_relationship_kind_check;
-- alter table public.organization_people
--   add constraint organization_people_relationship_kind_check
--   check (relationship_kind = any (array['employee'::text, 'former_employee'::text,
--     'agency_worker'::text, 'subcontractor'::text, 'contractor'::text, 'student'::text,
--     'graduate'::text, 'trainee'::text, 'apprentice'::text, 'programme_participant'::text,
--     'volunteer'::text, 'other'::text]));
