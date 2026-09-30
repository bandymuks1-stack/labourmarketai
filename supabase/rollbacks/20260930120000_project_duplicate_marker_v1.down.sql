-- Rollback 20260930120000: removes the duplicate marker.
-- Refuses while any project is marked duplicate — that is an evidenced
-- decision; unmark it deliberately (and keep its audit row) first.
do $$
begin
  if exists (select 1 from public.projects where record_state = 'duplicate') then
    raise exception 'projects marked duplicate exist — unmark them deliberately before rolling back';
  end if;
end $$;
drop function if exists public.mark_project_duplicate_v1(uuid, uuid, text);
alter table public.projects drop constraint if exists projects_not_own_canonical;
alter table public.projects drop constraint if exists projects_duplicate_names_canonical;
alter table public.projects drop constraint if exists projects_record_state_check;
alter table public.projects drop column if exists canonical_project_id;
alter table public.projects drop column if exists record_state;
