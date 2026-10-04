-- ROLLBACK of 20261003150560_batch_review_exceptions_employer_only_v1:
-- restores the production body of batch_review_exceptions (read 2026-10-04).
begin;

create or replace function public.batch_review_exceptions(p_entry_ids uuid[])
 returns table(entry_id uuid, exception_slug text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_entry_ids is null or array_length(p_entry_ids, 1) is null then
    return;
  end if;

  return query
  with reviewable as (
    select r.id
    from public.reviewable_journal_entry_ids() as r(id)
    where r.id = any (p_entry_ids)
  ),
  entries as (
    select je.id, je.worker_id
    from public.journal_entries je
    join reviewable rv on rv.id = je.id
  )
  select e.id, 'worker_first_entries'::text
  from entries e
  where (
    select count(*)
    from public.journal_entries je2
    join public.journal_entry_confirmations c on c.entry_id = je2.id
    where je2.worker_id = e.worker_id
      and (c.confirmation_scope ->> 'decision' = 'approved'
           or c.confirmation_scope ->> 'action' = 'confirm')
  ) < 3
  union all
  select e.id, 'unusual_hours'::text
  from entries e
  where (
    select coalesce(sum(
             case m.unit_slug
               when 'hours'   then m.value_numeric
               when 'minutes' then m.value_numeric / 60.0
               else 0
             end), 0)
    from public.journal_entry_metrics m
    where m.entry_id = e.id
      and m.metric_slug = 'fragment_time'
      and m.value_numeric is not null
  ) > 12
  union all
  select distinct e.id, 'new_skill'::text
  from entries e
  join public.journal_entry_skills jes on jes.journal_entry_id = e.id
  where not exists (
    select 1
    from public.worker_skills ws
    where ws.worker_id = e.worker_id
      and ws.skill_id = jes.skill_id
      and ws.verified is true
  );
end $function$;

commit;
