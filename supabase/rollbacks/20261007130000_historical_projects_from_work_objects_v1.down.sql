-- ROLLBACK of 20261007130000_historical_projects_from_work_objects_v1.
-- Unlinks the sites from the projects this migration created, then deletes those
-- projects ONLY IF nothing else references them. If anything does (journal entries,
-- assignments, tasks, clients, ... -- any foreign key into projects), it raises and
-- changes nothing: the transaction rolls back and a human decides.
begin;

do $$
declare
  fk record;
  n bigint;
begin
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, c.conrelid as relid
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.projects'::regclass
      and c.conrelid <> 'public.work_objects'::regclass   -- unlinked below
      and c.conrelid <> 'public.projects'::regclass        -- self reference (canonical_project_id)
  loop
    execute format(
      'select count(*) from %s t where t.%I in (select id from public.projects where historical_key like %L)',
      fk.tbl, fk.col, 'hp:v1:wo:%')
      into n;
    if n > 0 then
      raise exception 'rollback refused: % row(s) in % reference migration-created historical projects via %; resolve them first', n, fk.tbl, fk.col;
    end if;
  end loop;

  select count(*) into n from public.projects
  where canonical_project_id in (select id from public.projects where historical_key like 'hp:v1:wo:%');
  if n > 0 then
    raise exception 'rollback refused: % project(s) point at a migration-created project as canonical', n;
  end if;
end $$;

update public.work_objects
set project_id = null
where project_id in (select id from public.projects where historical_key like 'hp:v1:wo:%');

delete from public.projects where historical_key like 'hp:v1:wo:%';

commit;
