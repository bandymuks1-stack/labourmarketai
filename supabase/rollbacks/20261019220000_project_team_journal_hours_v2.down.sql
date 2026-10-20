-- ROLLBACK for 20261019220000_project_team_journal_hours_v2.sql
-- Restores the 20261019210000 body (the version the three review fixes
-- replaced). No data is touched. To remove the door entirely, run the
-- 20261019210000 rollback after this one.

begin;

create or replace function public.project_team_journal_hour_rows_v1(p_project_id uuid)
returns table(
  entry_key text,
  correction_of_key text,
  created_at timestamptz,
  context_key text,
  metrics jsonb,
  confirmations jsonb
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- Only someone who can manage THIS project; anyone else (a third
  -- organization, a member, a stranger) gets no rows.
  if p_project_id is null or not public.can_manage_project(p_project_id) then
    return;
  end if;

  return query
  select md5('je:' || je.id::text),
         case when je.correction_of is null then null else md5('je:' || je.correction_of::text) end,
         je.created_at,
         md5('ec:' || je.engagement_context_id::text),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', md5('m:' || m.id::text),
                    'metric_slug', m.metric_slug,
                    'value_numeric', m.value_numeric,
                    'unit_slug', m.unit_slug,
                    'source', m.source,
                    'created_at', m.created_at,
                    'value_text', case
                      when m.metric_slug = 'work_date' and m.value_text ~ '^\s*\d{4}-\d{2}-\d{2}\s*$' then btrim(m.value_text)
                      when m.metric_slug = 'fragment_time' and m.value_text ~ '^\s*\d{1,3}\s*$' then btrim(m.value_text)
                      else null
                    end
                  ) order by m.created_at, m.id)
             from public.journal_entry_metrics m
            where m.entry_id = je.id
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'confirmation_scope', c.confirmation_scope,
                    'created_at', c.created_at,
                    'confirmer_role', c.confirmer_role,
                    'by_subject', (c.confirmer_id is not null and c.confirmer_id = w.profile_id)
                  ) order by c.created_at, c.id)
             from public.journal_entry_confirmations c
            where c.entry_id = je.id
         ), '[]'::jsonb)
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    join public.organizations t on t.id = ec.organization_id and t.organization_type = 'team'
    join public.workers w on w.id = je.worker_id
   where je.project_id = p_project_id
     and je.deleted_at is null
     and je.superseded_by is null
     and exists (
       select 1 from public.team_assignments ta
        where ta.team_org_id = ec.organization_id
          and ta.project_id = p_project_id
          and ta.assigned_at <= je.created_at
          and (ta.ended_at is null or ta.ended_at >= je.created_at)
     )
     -- Disjoint from journal_entries_select: what the caller can already read
     -- comes through that read, never twice.
     and not public.owns_worker(je.worker_id)
     and not public.manages_organization(ec.organization_id)
   order by je.created_at
   limit 1000;
end
$function$;

revoke all on function public.project_team_journal_hour_rows_v1(uuid) from public, anon;
grant execute on function public.project_team_journal_hour_rows_v1(uuid) to authenticated;

commit;
