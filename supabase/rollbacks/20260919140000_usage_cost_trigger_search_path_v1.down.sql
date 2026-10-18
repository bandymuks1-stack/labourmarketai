-- DOWN for 20260919140000_usage_cost_trigger_search_path_v1
-- Removes the pinned search_path from both trigger functions (proconfig NULL,
-- the pre-2026-09-19 state). Bodies, triggers, grants untouched.

begin;

alter function public.usage_cost_events_forbid_mutation() reset search_path;
alter function public.usage_cost_events_forbid_truncate() reset search_path;

commit;
