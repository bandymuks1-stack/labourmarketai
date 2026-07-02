-- @human-gate-approved
-- 20260702200000 — Service-role read for the local activation report.
--
-- Problem: `pnpm -C apps/web generate-activation-report` fails with
-- "permission denied for table pilot_events" even with a valid
-- SUPABASE_SERVICE_ROLE_KEY. Same root cause as the ESCO import fix
-- (20260610234500, verified again on prod 2026-07-02 via
-- has_table_privilege): tables created via MCP apply_migration get NO
-- default privileges cascaded to service_role in this project, so
-- service_role holds ZERO table privileges on pilot_events — and ALSO on
-- profiles / profile_roles, which the report reads to EXCLUDE admin
-- accounts. Without the exclusion grants the script's admin filter would
-- silently come back empty and admin noise would be counted as real users.
--
-- Scope, deliberately minimal (owner-side local tooling only):
--   * pilot_events: SELECT — full row is safe by design (bounded, non-PII,
--     allowlisted metadata; guard-pinned since 0020).
--   * profiles: SELECT on COLUMNS (id, active_role) ONLY — service_role
--     still cannot read names/emails/any other profile column.
--   * profile_roles: SELECT on COLUMNS (profile_id, role) ONLY.
--
-- NOT changed: anon stays INSERT-only (no SELECT); authenticated grants
-- unchanged (its SELECT remains RLS-restricted to is_admin() by the 0020
-- policy); no policy change; RLS stays enabled everywhere; no INSERT/UPDATE/
-- DELETE for service_role.
--
-- Owner applies via Supabase MCP after review; never db push.

grant select on public.pilot_events to service_role;
grant select (id, active_role) on public.profiles to service_role;
grant select (profile_id, role) on public.profile_roles to service_role;

-- ROLLBACK (down):
--   revoke select on public.pilot_events from service_role;
--   revoke select (id, active_role) on public.profiles from service_role;
--   revoke select (profile_id, role) on public.profile_roles from service_role;
-- (Prior state was zero service_role privileges on all three — the revokes
-- restore it exactly; the local report CLI then fails loudly again.)
