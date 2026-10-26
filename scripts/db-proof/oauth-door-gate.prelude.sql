-- STUBS for the local PG16 proof of 20261026090000_oauth_door_gate_v1.
-- Mirrors only what the migration touches on Supabase (production metadata
-- read 2026-10-26, PG 17.6):
--   * roles anon / authenticated / service_role, all granted to the login role
--     authenticator (production: authenticator is member of exactly these 3);
--   * schema `extensions` holding pgcrypto 1.3 (production: pgcrypto in
--     `extensions`). API roles get NO usage on `extensions` here, so the proof
--     shows the SECURITY DEFINER path does not depend on it.
-- NOT stubbed (not needed by the gate): auth schema, GoTrue, PostgREST itself.
-- PostgREST's per-request behaviour is simulated exactly as it does it:
--   BEGIN [READ ONLY]; set role; set_config('request.jwt.claims'|'request.headers'
--   |'request.method'|'request.path', ..., true); SELECT <pre-request>(); ...
-- Production-only differences: `supautils` / `safeupdate` session preload on
-- authenticator (safeupdate blocks UPDATE/DELETE without WHERE — every such
-- statement in the gate has a WHERE), and PG 17 vs 16 (pg_input_is_valid
-- exists since 16).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;
create schema extensions;
create extension pgcrypto with schema extensions;
