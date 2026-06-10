-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (ESCO import unblock). Never `db push`.
--
-- GRANTS ONLY, no data, no RLS change. Root cause (verified on prod
-- 2026-06-10 via has_table_privilege): the four S2 ESCO tables were created
-- via MCP apply_migration and Supabase's default privileges did NOT cascade
-- to service_role there — service_role ended up with ZERO table privileges
-- (RLS is irrelevant for it; this is a plain table-level GRANT gap), so the
-- official import's upserts fail with "permission denied for table
-- esco_occupations".
--
-- Scope, deliberately minimal:
--   * service_role: select + insert + update on the four import tables
--     (exactly what the idempotent upsert importer needs — no delete);
--   * authenticated: NO change (it already has the read grant from S2 and
--     read-only RLS policies — verified auth_select=true);
--   * anon: NOTHING (stays without access; no app read path requires it);
--   * RLS policies: untouched — normal users' access is NOT loosened.
-- ============================================================================

begin;

grant select, insert, update on public.esco_occupations      to service_role;
grant select, insert, update on public.esco_skills           to service_role;
grant select, insert, update on public.esco_labels           to service_role;
grant select, insert, update on public.esco_occupation_skills to service_role;

commit;

-- ROLLBACK (reverse SQL):
-- revoke select, insert, update on public.esco_occupations      from service_role;
-- revoke select, insert, update on public.esco_skills           from service_role;
-- revoke select, insert, update on public.esco_labels           from service_role;
-- revoke select, insert, update on public.esco_occupation_skills from service_role;
