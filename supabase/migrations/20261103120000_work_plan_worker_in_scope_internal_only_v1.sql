-- @human-gate-approved — RED draft (grant change on a SECURITY DEFINER function); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261103120000_work_plan_worker_in_scope_internal_only_v1
--
-- ██ RED CLASS — human gate (EXECUTE grant change). Draft; owner-channel apply only.
--
-- GAP: work_plan_worker_in_scope_v1(org, worker) is SECURITY DEFINER with
-- EXECUTE granted to `authenticated` and no caller check, so any signed-in
-- person who knows two ids could ask "is worker X engaged in organization Y"
-- of ANY organization — a cross-tenant membership bit.
--
-- It is an internal predicate. Its only callers are the SECURITY DEFINER
-- planning commands create_work_plan_entry_v1 and its v2 successor (owned by
-- postgres, so they run it with the owner's rights, unaffected by this
-- revoke). No RLS policy, no SECURITY INVOKER function and no application
-- code calls it (checked in production 2026-11-03).
--
-- CHANGE: EXECUTE revoked from public, anon and authenticated. Body,
-- signature, SECURITY DEFINER and search_path are untouched. No data change.
-- Rollback: supabase/rollbacks/20261103120000_work_plan_worker_in_scope_internal_only_v1.down.sql

revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from public;
revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from anon;
revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from authenticated;

comment on function public.work_plan_worker_in_scope_v1(uuid, uuid) is
  'INTERNAL (no client grants; called only by create_work_plan_entry_v1/v2). True when the worker is in the organization''s worker scope.';
