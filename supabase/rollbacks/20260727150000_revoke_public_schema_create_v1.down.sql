-- ============================================================================
-- ROLLBACK for 20260727150000_revoke_public_schema_create_v1
--
-- Restores the pre-migration ACL exactly: puts back the implicit PUBLIC
-- CREATE grant on schema `public` (returning nspacl to
-- {postgres=UC/postgres,=UC/postgres}). Nothing else was changed by the
-- forward migration, so nothing else needs restoring.
--
-- Apply ONLY via Supabase MCP / SQL editor after explicit owner decision.
-- ============================================================================

begin;

grant create on schema public to public;

commit;
