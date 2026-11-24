-- ============================================================================
-- ROLLBACK for supabase/migrations/20260817232000_management_decisions_v1.sql
--
-- Restores the prior state EXACTLY: the up migration created 4 tables, 1
-- trigger guard and 8 functions and touched NO existing object, so this file
-- recreates nothing — it only drops what was added. No workflow, document or
-- work_tasks row is touched here or was ever touched by the module.
--
-- 0-ROW GUARD: it REFUSES while real rows exist. Dropping the tables would
-- destroy the organization's recorded decisions and their audit ledger
-- irrecoverably.
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
    select count(*) from public.management_decision_events
    union all select count(*) from public.decision_task_links
    union all select count(*) from public.decision_document_links
    union all select count(*) from public.management_decisions
  loop
    n := n + c;
  end loop;
  if n > 0 then
    raise exception
      'refusing to roll back management decisions v1: % row(s) exist across management_decisions / decision_document_links / decision_task_links / management_decision_events. Export and delete them deliberately first.', n;
  end if;
end $$;

drop trigger if exists management_decision_events_append_only on public.management_decision_events;

-- Tables first: the SELECT policies depend on the visibility helper, so the
-- helper can only be dropped once the policies are gone with their tables.
drop table if exists public.management_decision_events;
drop table if exists public.decision_task_links;
drop table if exists public.decision_document_links;
drop table if exists public.management_decisions;

drop function if exists public.link_decision_task_v1(text, text);
drop function if exists public.attach_decision_document_v1(text, text);
drop function if exists public.record_management_decision_result_v1(text, text);
drop function if exists public.sync_management_decision_v1(text);
drop function if exists public.submit_management_decision_v1(text);
drop function if exists public.update_management_decision_v1(text, text, text, text, text);
drop function if exists public.create_management_decision_v1(text, text, text, text, text);
drop function if exists public.can_view_management_decision_v1(uuid);
drop function if exists public.management_decision_events_guard();

commit;
