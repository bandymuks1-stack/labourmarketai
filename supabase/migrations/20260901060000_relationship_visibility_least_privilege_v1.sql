-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260901060000 — relationship visibility least privilege v1: rule on
-- `volunteer`, `viewer` and `unemployed`.
--
-- THIS IS THE SLICE 20260827210000 DEFERRED BY NAME. That migration's header
-- says, verbatim:
--
--     ENABLING STEP recorded for a later, separately-approved slice:
--       * rule on volunteer / viewer / unemployed, which are preserved here
--         only because narrowing them is outside this ruling;
--
-- It introduced `relationship_types.grants_worker_visibility` (fail-closed,
-- default false) and set it true for every slug except `student`, explicitly
-- PRESERVING rather than ENDORSING the three slugs above. This migration
-- makes the ruling those three were waiting for.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- `volunteer` is BOTH `invitable = true` AND `grants_worker_visibility = true`
-- (verified against production 2026-09-01). So any organization can invite a
-- person as a volunteer and thereby gain employer-grade read on the person
-- worker record through `public.can_view_worker` — which gates `workers`,
-- `worker_skills`, `worker_professions`, `worker_languages`, and by extension
-- `propose_contact_disclosure_request_v1`. `workers` carries salary
-- expectations, relocation willingness and shift tolerances.
--
-- A volunteer host does not need any of that to host a volunteer. This is the
-- same least-privilege argument the owner already accepted for `student` on
-- 2026-08-27; `volunteer` is the same shape of relationship and was left out
-- only because that ruling was scoped to education.
--
-- `viewer` and `unemployed` are `invitable = false`, so their exposure is
-- narrower, but neither describes a relationship that needs the worker record
-- either: `viewer` is a read-only observer and `unemployed` is a self-state,
-- not an employer relationship at all.
--
-- ── BLAST RADIUS: PROVEN ZERO ───────────────────────────────────────────────
--
-- Measured against production immediately before writing this file:
--
--     select relationship_slug, status, count(*)
--       from engagement_contexts group by 1, 2;
--     -> employee/active 40, owner/active 13. Nothing else.
--
-- There are ZERO volunteer, viewer and unemployed engagement contexts in
-- production, so applying this changes the visibility of exactly nobody
-- today. It closes the door before anyone walks through it, which is the
-- cheapest moment to close it.
--
-- ── WHY IT IS STILL OWNER-GATED ─────────────────────────────────────────────
--
-- It is inert on today's data but it is a PRODUCT SEMANTICS ruling: after it,
-- a future volunteer host will not receive worker-record access, and that is
-- a decision about what a volunteer relationship MEANS, not a bug fix. The
-- author of 20260827210000 deferred it deliberately; deferring it again to
-- the owner is the same judgement, not new caution.
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
--
-- DATA ONLY. Three rows of a reference registry. No function is redefined, no
-- policy is dropped or created, no grant moves, no column is added or removed.
-- `can_view_worker` already consults this column (20260827210000 §3) — this
-- migration only changes what the column says. That is precisely the
-- extensibility the column was built for.
--
-- Direction is NARROWING only: three `true` values become `false`. Nothing
-- gains visibility. `student` stays false; every employment-shaped slug
-- (employee, owner, manager, collaborator, consultant, freelancer) is
-- untouched and keeps exactly what it has today.
--
-- @human-gate-approved — TIER: owner-gated. The RED signal here is `data-dml`
-- on a table that governs an authorization predicate. The DML is intentional
-- and is the entire point of the change; it ships as a needs-human-gate DRAFT
-- carrying the exact SQL, and the production apply stays manual via Supabase
-- MCP after explicit owner approval. Same posture as 20260827210000.
--
-- ROLLBACK: supabase/rollbacks/20260901060000_relationship_visibility_least_privilege_v1.down.sql
-- (also inlined in the DOWN block at the end of this file). Rollback is a
-- single UPDATE restoring the three `true` values; it re-opens the exposure
-- described above, which is why it is a deliberate act and not a default.
-- ============================================================================

begin;

-- Explicit and idempotent, so the ruling is stated rather than implied —
-- the same form 20260827210000 used for `student`.
update public.relationship_types
   set grants_worker_visibility = false
 where slug in ('volunteer', 'viewer', 'unemployed');

comment on column public.relationship_types.grants_worker_visibility is
  'Does holding this ACTIVE relationship let the organization managers read '
  'the person worker record (workers, worker_skills, worker_professions, '
  'worker_languages) through public.can_view_worker? Fail-closed: false by '
  'default, so a newly registered relationship never inherits employer-grade '
  'visibility by accident. Owner ruling 2026-08-27: an education relationship '
  '(student) does NOT carry it — the institution reaches its learner through '
  'the practice/project path instead. Owner ruling 2026-09-01: volunteer, '
  'viewer and unemployed do NOT carry it either — hosting a volunteer, '
  'observing, or recording a self-state are not employer relationships and '
  'none of them needs salary expectations, relocation willingness or shift '
  'tolerances. Employment-shaped slugs (employee, owner, manager, '
  'collaborator, consultant, freelancer) keep it.';

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION (run read-only after apply)
--
--   select slug, grants_worker_visibility, invitable
--     from public.relationship_types order by 2 desc, 1;
--
--   EXPECT true  : collaborator, consultant, employee, freelancer, manager, owner
--   EXPECT false : student, unemployed, viewer, volunteer
--
--   -- and that no live relationship changed meaning:
--   select relationship_slug, status, count(*)
--     from public.engagement_contexts
--    where relationship_slug in ('volunteer','viewer','unemployed')
--    group by 1, 2;   -- EXPECT zero rows
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/)
--
--   begin;
--   update public.relationship_types
--      set grants_worker_visibility = true
--    where slug in ('volunteer', 'viewer', 'unemployed');
--   commit;
--
--   WARNING: this restores employer-grade worker-record visibility to any
--   organization holding one of these relationships, including the invitable
--   `volunteer` path. Roll back only deliberately.
-- ════════════════════════════════════════════════════════════════════════════
