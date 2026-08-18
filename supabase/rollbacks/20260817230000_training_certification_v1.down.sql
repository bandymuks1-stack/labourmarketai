-- ============================================================================
-- ROLLBACK for supabase/migrations/20260817230000_training_certification_v1.sql
--
-- Restores the prior state EXACTLY: the up migration created 4 tables, 2
-- trigger guards and 8 functions and touched NO existing object, so this
-- file recreates nothing — it only drops what was added.
--
-- 0-ROW GUARD: it REFUSES while real rows exist. Dropping the tables would
-- destroy every training assignment, certificate pointer and audit event
-- irrecoverably; a rollback must be a no-loss operation or not run at all.
-- To roll back a populated environment the operator must first export and
-- explicitly delete the rows, which is a separate, deliberate act.
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
    select count(*) from public.training_assignment_events
    union all select count(*) from public.training_skill_links
    union all select count(*) from public.training_assignments
    union all select count(*) from public.training_programs
  loop
    n := n + c;
  end loop;
  if n > 0 then
    raise exception
      'refusing to roll back training & certification v1: % row(s) exist across training_programs / training_assignments / training_assignment_events / training_skill_links. Export and delete them deliberately first.', n;
  end if;
end $$;

drop trigger if exists training_assignments_fill_once on public.training_assignments;
drop trigger if exists training_assignment_events_append_only on public.training_assignment_events;

-- Tables first: the SELECT policies depend on the visibility helper, so the
-- helper can only be dropped once the policies are gone with their tables.
drop table if exists public.training_skill_links;
drop table if exists public.training_assignment_events;
drop table if exists public.training_assignments;
drop table if exists public.training_programs;

drop function if exists public.link_training_skill_v1(text, text);
drop function if exists public.set_training_assignment_expired_v1(text);
drop function if exists public.attach_training_certificate_v1(text, text, text, text);
drop function if exists public.complete_training_assignment_v1(text, text);
drop function if exists public.assign_training_v1(text, text, text);
drop function if exists public.update_training_program_v1(text, text, text, text, text);
drop function if exists public.create_training_program_v1(text, text, text, text);
drop function if exists public.training_can_view_assignment_v1(uuid);
drop function if exists public.training_assignment_fill_once_guard();
drop function if exists public.training_events_guard();

commit;
