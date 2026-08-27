-- @human-gate-approved
-- ============================================================================
-- GATE STATUS, stated exactly. The owner RULED that this change be made
-- (2026-08-27 §2: "implement the smallest architecture-consistent fix that
-- prevents student/learner relationships from accidentally inheriting
-- employee-level visibility"), so it is an intentional, human-reviewed RED
-- change and the annotation above says so.
--
-- IT IS NOT YET APPLIED. Approval to RUN it against production has not been
-- given, and the annotation is an acknowledgement, never an auto-merge pass:
-- this PR stays draft with `needs-human-gate`.
--
-- ORDERING THAT MATTERS: 20260827200000 IS already applied (ledger
-- 20260827132137), so the learner relationship is reachable in the production
-- database today. Nothing is exposed while the learner-invite UI is unmerged.
-- The moment that UI deploys without this file applied, the product ships the
-- exact behaviour the owner ruled against — so #1301 MUST NOT DEPLOY FIRST.
-- ============================================================================
--
-- 20260827210000 — learner visibility, least privilege (owner ruling
-- 2026-08-27, education pilot P0-C follow-up).
--
-- ── THE RULING ──────────────────────────────────────────────────────────────
-- "A learner/student relationship MUST NOT automatically grant an education
--  institution the same visibility scope that an employer receives for an
--  employee. Use least-privilege access. [...] Do not weaken existing worker
--  privacy. [...] First map the exact current can_view_worker implications and
--  implement the smallest architecture-consistent fix that prevents student/
--  learner relationships from accidentally inheriting employee-level
--  visibility. Regression-prove employee/employer visibility remains
--  unchanged."
--
-- 20260827200000 (applied, ledger 20260827132137) DISCLOSED this consequence
-- and deliberately left it to the owner. This migration answers it.
--
-- ── THE MAP, measured on production 2026-08-27, not assumed ─────────────────
-- `public.can_view_worker(w)` is referenced by exactly FOUR RLS policies and
-- ONE function. Nothing else in the database calls it:
--
--     workers            · workers_select            · SELECT · can_view_worker(id)
--     worker_skills      · worker_skills_select      · SELECT · can_view_worker(worker_id)
--     worker_professions · worker_professions_select · SELECT · can_view_worker(worker_id)
--     worker_languages   · worker_languages_select   · SELECT · can_view_worker(worker_id)
--     public.propose_contact_disclosure_request_v1(...)
--
-- So "employee-level visibility" concretely means the worker row plus that
-- person's skills, professions and languages. And `public.workers` holds,
-- among 32 columns:
--
--     salary_min_eur, salary_max_eur      what the person expects to be paid
--     willing_to_relocate, needs_accommodation, has_transport, max_trip_days
--     availability_status, available_from, pay_basis_preference
--     night_shifts_ok, weekend_shifts_ok, overtime_ok
--
-- That is a labour-market negotiating position. An employer holding an active,
-- worker-accepted employment relationship has a legitimate basis for it. A
-- school does not acquire one by enrolling a student — and a student is very
-- often a minor. Letting the education relationship inherit that scope is the
-- accident the ruling names, and it would have been silent: the branch it
-- travels through never looks at which relationship it is.
--
-- ── THE BRANCH AT FAULT (unchanged since it was written) ────────────────────
--     or exists (
--       select 1 from public.engagement_contexts ec
--       join public.workers x on x.id = w and x.profile_id = ec.profile_id
--       where ec.status = 'active'
--         and public.manages_organization(ec.organization_id))
--
-- Every active engagement is treated alike. Before 20260827200000 that was
-- harmless in practice, because the only engagements an organization could
-- CREATE were `employee` and `collaborator`. That migration made the set open,
-- so the predicate has to become relationship-aware or the openness leaks.
--
-- ── THE FIX: the rule becomes DATA, exactly like `invitable` ────────────────
-- NOT `and ec.relationship_slug <> 'student'`. That is the same hardcoded
-- taxonomy ARCHITECTURE §6.2 rejects, one layer down, and the next education
-- relationship (apprentice, trainee, mentee) would re-open the hole silently.
--
-- Instead `relationship_types` gains `grants_worker_visibility`, and the
-- branch joins it. Deciding whether a NEW relationship carries employer-grade
-- visibility is then an UPDATE plus a deliberate act — never a migration, and
-- never an accident.
--
-- ── FAIL-CLOSED DEFAULT, ZERO NARROWING TODAY (both, on purpose) ────────────
-- The column defaults to FALSE, so a relationship nobody has ruled on grants
-- nothing. Then every slug that exists TODAY except `student` is seeded TRUE,
-- so nothing that is currently possible becomes impossible (ARCHITECTURE §7
-- review question B). Concretely:
--
--   employee, freelancer, consultant, collaborator, manager, owner
--        work relationships. Employer/company visibility is EXACTLY what it
--        was before this file, by construction.
--   volunteer, viewer, unemployed
--        PRESERVED, NOT ENDORSED. These grant worker visibility today. Whether
--        they should is a real product question and it is NOT this ruling's
--        question, so this migration refuses to answer it by side effect. See
--        the enabling step below.
--   student
--        the one slug set false. It is the only behaviour this file changes.
--
-- Measured on production immediately before apply: engagement_contexts holds
-- 53 rows across exactly two slugs — 40 `employee`, 13 `owner`, both seeded
-- TRUE. Zero `student` rows exist. So the narrowing removes access from NOBODY
-- who has it, and closes it before the first learner ever accepts.
--
-- The join is total and cannot narrow by accident: `relationship_slug` is NOT
-- NULL and carries `engagement_contexts_relationship_slug_fkey` to this
-- registry, and production has 0 NULL and 0 orphan slugs.
--
-- ── WHAT AN INSTITUTION CAN STILL SEE, and why that is the right amount ─────
-- The ruling says the institution may access "only learner information
-- legitimately required for the education/practice/project relationship".
-- That path already exists and is untouched by this file:
--
--     or exists (
--       select 1 from public.project_worker_assignments pwa
--       where pwa.worker_id = w and pwa.status = 'active'
--         and pwa.ended_at is null
--         and public.can_manage_project(pwa.project_id))
--
-- So enrolment alone discloses nothing, and putting a learner on a real
-- practice PROJECT discloses what running that project requires — purpose-
-- bound, endable by ending the assignment, and the same rule that already
-- governs every other project. The institution keeps everything it needs to
-- INVITE and to see its own engagements; it loses only the worker's private
-- labour-market position, which it never had a reason to hold.
--
-- No UI regression is possible: no institution-facing surface reads `workers`,
-- `worker_skills`, `worker_professions` or `worker_languages` for a learner.
-- 20260827200000's UI adds the invite capacity only.
--
-- ── SAFETY CLASS: RED (auth-core predicate) ─────────────────────────────────
-- `can_view_worker` is SECURITY DEFINER and auth-core, so this is RED by the
-- envelope regardless of direction. It NARROWS, never widens: the branch gains
-- a conjunct and nothing else in the function is touched. No table, column,
-- policy or grant is dropped or loosened.
--
-- ROLLBACK: supabase/rollbacks/20260827210000_learner_visibility_least_privilege_v1.down.sql
--   restores the pre-migration predicate verbatim. The column is LEFT IN PLACE
--   (dropping it would destroy a deliberate ruling); it simply stops being read.
--
-- ENABLING STEP recorded for a later, separately-approved slice:
--   * rule on volunteer / viewer / unemployed, which are preserved here only
--     because narrowing them is outside this ruling;
--   * if an institution needs a learner ROSTER beyond the project path, build
--     it as a narrow, purpose-bound definer RPC returning name + the practice
--     record — never by re-widening can_view_worker.
--
-- POST-APPLY VERIFICATION: see the block at the end of this file.
-- ============================================================================

begin;

-- ── 1. The rule, as DATA on the registry that already exists ────────────────
alter table public.relationship_types
  add column if not exists grants_worker_visibility boolean not null default false;

comment on column public.relationship_types.grants_worker_visibility is
  'Does holding this ACTIVE relationship let the organization managers read '
  'the person worker record (workers, worker_skills, worker_professions, '
  'worker_languages) through public.can_view_worker? Fail-closed: false by '
  'default, so a newly registered relationship never inherits employer-grade '
  'visibility by accident. Owner ruling 2026-08-27: an education relationship '
  'does NOT carry it — the institution reaches its learner through the '
  'practice/project path instead.';

-- ── 2. Seed: preserve every slug that carries it today, except `student` ────
update public.relationship_types
   set grants_worker_visibility = true
 where slug <> 'student';

-- Explicit and idempotent, so the ruling is stated rather than implied.
update public.relationship_types
   set grants_worker_visibility = false
 where slug = 'student';

-- ── 3. The predicate consults the rule ──────────────────────────────────────
-- BODY PROVENANCE: this is the CURRENT production definition verbatim — the
-- owns/admin arms, the employer discovery-consent arm, both roster arms, the
-- booking-engagement arm and the project arm are byte-identical — with ONE
-- join added to the engagement_contexts arm.
create or replace function public.can_view_worker(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    public.owns_worker(w)
    or public.is_admin()
    -- Employer/agency DISCOVERY: only with a current granted
    -- profile_discoverability consent (GDPR consent basis, fail closed).
    or (
      public.is_employer()
      and exists (
        select 1 from public.workers x
        where x.id = w
          and x.profile_id is not null
          and public.worker_profile_discoverable(x.profile_id)
      )
    )
    -- Active work relationships keep visibility (contract / legitimate
    -- interest basis, NOT the discovery consent):
    or exists (
      select 1
      from public.company_workers cw
      join public.companies c on c.id = cw.company_id
      where cw.worker_id = w and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
      where aw.worker_id = w and aw.status = 'active' and a.profile_id = auth.uid()
    )
    -- An ACTIVE accepted-booking engagement held by a company the caller owns.
    -- Same legal basis as the two roster branches above: an ACTIVE,
    -- worker-ACCEPTED relationship (legal-basis-matrix-v1 row 4).
    or exists (
      select 1
      from public.company_worker_engagements e
      where e.worker_id is not null            -- a GDPR-detached row grants nothing (#856 model A)
        and e.worker_id = w
        and e.status = 'active'                -- an ended engagement grants nothing
        and public.owns_company(e.company_id)  -- caller-bound, same authority as the roster branch
    )
    -- ▼▼ CHANGED 20260827210000 — owner ruling, least privilege ▼▼
    -- An active organization engagement, AND that relationship must be one
    -- the registry says carries worker visibility. Every work relationship is
    -- seeded true, so employer/company behaviour is unchanged; `student` is
    -- false, so enrolling a learner discloses nothing on its own. The join is
    -- total: relationship_slug is NOT NULL with an FK to this registry.
    or exists (
      select 1
      from public.engagement_contexts ec
      join public.relationship_types rt
        on rt.slug = ec.relationship_slug
       and rt.grants_worker_visibility
      join public.workers x on x.id = w and x.profile_id = ec.profile_id
      where ec.status = 'active'
        and public.manages_organization(ec.organization_id)
    )
    -- ▲▲ END OF THE CHANGE ▲▲
    -- The PURPOSE-BOUND path an institution uses for a learner: a real
    -- practice assignment on a real project. Untouched.
    or exists (
      select 1
      from public.project_worker_assignments pwa
      where pwa.worker_id = w
        and pwa.status = 'active'
        and pwa.ended_at is null
        and public.can_manage_project(pwa.project_id)
    )
$function$;

revoke all on function public.can_view_worker(uuid) from public, anon;
grant execute on function public.can_view_worker(uuid) to authenticated;

commit;

-- ── POST-APPLY VERIFICATION (recorded in the PR) ────────────────────────────
--   select slug, grants_worker_visibility from public.relationship_types order by slug;
--     -- expect: student f · every other slug t
--
--   -- REGRESSION CONTROL, as an organization owner/manager with an employee:
--   --   can_view_worker(<that employee's worker id>) -> t   (unchanged)
--   -- LEARNER CONTROL, same manager, learner engaged as `student` only:
--   --   can_view_worker(<learner's worker id>)       -> f
--   -- PRACTICE CONTROL, same learner assigned to a project the org manages:
--   --   can_view_worker(<learner's worker id>)       -> t   (purpose-bound)
