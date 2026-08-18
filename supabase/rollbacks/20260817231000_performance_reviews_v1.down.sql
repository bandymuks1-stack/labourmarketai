-- ============================================================================
-- ROLLBACK for supabase/migrations/20260817231000_performance_reviews_v1.sql
--
-- Restores the prior state EXACTLY: the up migration created 4 tables, 2
-- trigger guards and 8 functions and touched NO existing object, so this
-- file recreates nothing — it only drops what was added.
--
-- 0-ROW GUARD: it REFUSES while real rows exist. A recorded development
-- conversation is somebody's personal record; dropping the tables would
-- destroy it irrecoverably. To roll back a populated environment the
-- operator must first export and explicitly delete the rows.
--
-- NOTE: this file deliberately carries NO `@human-gate-approved` marker.
-- ============================================================================

begin;

do $$
declare
  n bigint := 0;
  c bigint;
begin
  for c in
    select count(*) from public.performance_review_events
    union all select count(*) from public.review_evidence_links
    union all select count(*) from public.performance_reviews
    union all select count(*) from public.review_cycles
  loop
    n := n + c;
  end loop;
  if n > 0 then
    raise exception
      'refusing to roll back development & performance reviews v1: % row(s) exist across review_cycles / performance_reviews / review_evidence_links / performance_review_events. Export and delete them deliberately first.', n;
  end if;
end $$;

drop trigger if exists performance_reviews_immutable_when_closed on public.performance_reviews;
drop trigger if exists performance_review_events_append_only on public.performance_review_events;

-- Tables first: the SELECT policies depend on the visibility helper, so the
-- helper can only be dropped once the policies are gone with their tables.
drop table if exists public.performance_review_events;
drop table if exists public.review_evidence_links;
drop table if exists public.performance_reviews;
drop table if exists public.review_cycles;

drop function if exists public.close_performance_review_v1(text);
drop function if exists public.add_review_evidence_link_v1(text, text, text, text);
drop function if exists public.save_review_manager_input_v1(text, text, text, text);
drop function if exists public.save_review_worker_input_v1(text, text);
drop function if exists public.create_performance_review_v1(text, text, text);
drop function if exists public.set_review_cycle_status_v1(text, text);
drop function if exists public.create_review_cycle_v1(text, text, text, text);
drop function if exists public.review_can_view_v1(uuid);
drop function if exists public.performance_review_immutability_guard();
drop function if exists public.performance_review_events_guard();

commit;
