-- ============================================================================
-- ROLLBACK for 20260901060000_relationship_visibility_least_privilege_v1.sql
--
-- Restores the pre-migration values: volunteer, viewer and unemployed regain
-- `grants_worker_visibility = true`.
--
-- WARNING — this rollback RE-OPENS an exposure. After it, any organization can
-- invite a person as a `volunteer` (invitable = true) and thereby gain
-- employer-grade read on the person worker record through
-- public.can_view_worker — which reaches salary expectations, relocation
-- willingness and shift tolerances in `workers`, plus worker_skills,
-- worker_professions, worker_languages and propose_contact_disclosure_request_v1.
--
-- Roll back only as a deliberate ruling, never as routine cleanup.
--
-- The column itself is LEFT IN PLACE by both directions — it is the mechanism,
-- not the ruling.
-- ============================================================================

begin;

update public.relationship_types
   set grants_worker_visibility = true
 where slug in ('volunteer', 'viewer', 'unemployed');

commit;

-- Verification after rollback:
--   select slug, grants_worker_visibility from public.relationship_types
--    where slug in ('volunteer','viewer','unemployed');
--   EXPECT all three true.
