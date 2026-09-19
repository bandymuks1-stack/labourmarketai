-- @human-gate-approved
-- ============================================================================
-- 20260919140000_usage_cost_trigger_search_path_v1
-- R-13 of the 2026-09-19 completion audit. NOT APPLIED — listed in the owner
-- packet, kept on the human gate by that classification (reclassification
-- only ever moves toward caution).
--
-- Finding: the Supabase security advisor flags the two append-only trigger
-- functions on `usage_cost_events` — `usage_cost_events_forbid_mutation()`
-- and `usage_cost_events_forbid_truncate()` — as "function without a pinned
-- search_path" (`proconfig` NULL, read on production 2026-09-19). Both are
-- SECURITY INVOKER, plpgsql, and their entire body is `raise exception`;
-- they reference no schema object, so the WARN is hygiene, not exposure.
--
-- MINIMUM CHANGE: pin `search_path = public` on both. No body change, no
-- grant, no policy, no trigger change, no rows. Reversible: DOWN resets the
-- attribute (proconfig back to NULL).
-- ============================================================================

begin;

alter function public.usage_cost_events_forbid_mutation() set search_path = public;
alter function public.usage_cost_events_forbid_truncate() set search_path = public;

commit;
