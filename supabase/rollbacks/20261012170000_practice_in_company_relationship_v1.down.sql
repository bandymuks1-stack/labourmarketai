-- ROLLBACK for 20261012170000_practice_in_company_relationship_v1.
-- Guarded: refuses to remove the relationship while anything uses it.
begin;

do $$
begin
  if exists (select 1 from public.engagement_contexts where relationship_slug = 'intern')
     or exists (select 1 from public.invitations where relationship_slug = 'intern') then
    raise exception 'rollback refused: the intern relationship is in use (engagement_contexts or invitations)';
  end if;
end $$;

delete from public.relationship_types where slug = 'intern';

commit;
