-- ============================================================================
-- ORG DOCUMENT REGISTER DELTA v1 — PROOF HARNESS PRELUDE (supplement).
--
-- Runs AFTER
--   scripts/db-proof/document-file-layer.prelude.sql  (profiles / workers /
--     organizations / projects / company_memberships / document_types /
--     worker_documents / storage stubs + the auth.uid() / is_admin() GUCs)
--   scripts/db-proof/agreements-v1.prelude.sql        (engagement_contexts +
--     membership_actor_role_v1 / belongs_to_organization)
--
-- It adds ONLY what the REAL work_objects migration additionally needs, so
-- that
--   supabase/migrations/20260817130000_workflow_engine_v1.sql
--   supabase/migrations/20260817140000_document_file_layer_v1.sql
--   supabase/migrations/20260817150000_work_objects_v1.sql
--   supabase/migrations/20260817240000_org_document_register_delta_v1.sql
-- can all be executed VERBATIM against a throwaway Postgres 15.
--
--   * set_updated_at() -> 0001_initial_schema.sql (verbatim), the shared
--     updated_at trigger function work_objects_v1 attaches to its table.
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

-- Verbatim from supabase/migrations/0001_initial_schema.sql (line 286).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
