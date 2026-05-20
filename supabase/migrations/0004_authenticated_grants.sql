-- 0004_authenticated_grants.sql
-- Ensures the `authenticated` Postgres role has the table-level GRANTs needed
-- to perform CRUD on profiles and profile_roles. RLS policies further restrict
-- which ROWS each user can touch (see 0001 / 0003).
--
-- Without these GRANTs, even valid RLS policies produce
-- "permission denied for table" errors at the Postgres layer.
--
-- Idempotent: safe to re-run.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.profiles
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.profile_roles
  TO authenticated;

-- Sequences (in case any future identity columns rely on them)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
