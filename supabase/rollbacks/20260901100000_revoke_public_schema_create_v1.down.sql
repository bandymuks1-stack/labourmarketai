-- ============================================================================
-- ROLLBACK for 20260901100000_revoke_public_schema_create_v1
--
-- Restores the pre-migration ACL exactly: puts back the implicit PUBLIC CREATE
-- grant on schema `public`, returning nspacl to
-- {postgres=UC/postgres,=UC/postgres}. Nothing else was changed by the forward
-- migration, so nothing else needs restoring.
--
-- WARNING — this rollback RE-OPENS the exposure. After it, `anon`,
-- `authenticated` and `service_role` again inherit CREATE on schema `public`
-- and can create tables, functions or operators there, which is a
-- lateral-movement / object-shadowing surface. Roll back only as a deliberate
-- ruling, never as routine cleanup.
--
-- Apply ONLY via Supabase MCP / SQL editor after an explicit owner decision.
-- ============================================================================

begin;

grant create on schema public to public;

commit;

-- Verification after rollback:
--   select nspacl::text from pg_namespace where nspname = 'public';
--   EXPECT {postgres=UC/postgres,=UC/postgres}
