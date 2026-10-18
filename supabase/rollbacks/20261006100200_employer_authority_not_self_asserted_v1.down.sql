-- ROLLBACK of 20261006100200_employer_authority_not_self_asserted_v1.
-- Restores the previous is_employer() body (active_role alone).
begin;

create or replace function public.is_employer()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select active_role from public.profiles where id = auth.uid())
      in ('company','agency'),
    false)
$$;

commit;
