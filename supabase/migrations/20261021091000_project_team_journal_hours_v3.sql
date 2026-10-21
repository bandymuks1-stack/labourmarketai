-- 20261021091000_project_team_journal_hours_v3
--
-- RED by SECURITY DEFINER body replace + GRANT re-assert. Forward fix of
-- 20261019220000 (v2) inside the owner's 2026-10-19 B2B-9 approval. The
-- `-- @human-gate-approved` line is added ONLY after the owner approves this
-- exact SQL (then also list this file in booking-engagement-end-v1.test.ts).
--
-- THE DEFECT. v2 anchors a brigade entry to the ROOT of its chain and keeps it
-- when the root lies inside the team assignment window. It walked up through
-- `correction_of` only. A pre-confirmation edit (journal_entry_supersede_v2,
-- 20260720150000) does not use that link: the new row carries the OLD row's
-- `correction_of` forward (NULL for a plain entry) and the old row gets
-- `superseded_by` -> new. So the live row of an edited, unconfirmed entry was
-- its own root, dated by the EDIT; an edit made after the assignment ended put
-- it outside the window and the buyer's manager read 0 h where the worker read
-- 7 h.
--
-- THE FIX. One rule for "the row before this one": the row this row
-- superseded (a predecessor whose `superseded_by` = this id) if there is one,
-- otherwise the row it corrects (`correction_of`). The walk follows that rule
-- up to the root, so an edited entry is anchored where the WORK was recorded.
-- Taking the predecessor first loses nothing: an unconfirmed edit copies the
-- predecessor's `correction_of`, so the predecessor leads to the same
-- corrected original one step later. The walk reads the existing index on
-- journal_entries(superseded_by) (20260612190000).
--
-- Mirrors the app: an edit stays on the work's day (#2594) and one chain
-- counts once (lib/journal/counted-once.ts) — the de-duplication over the
-- returned rows is unchanged and stays in the app.
--
-- Everything else is v2, unchanged: hours-only (time metrics, review rows
-- rebuilt from decision / action / authority.basis), opaque md5 keys, team
-- contexts only, project-bound (can_manage_project), admins get nothing
-- (they read every entry already), disjoint from journal_entries_select,
-- depth cap 32, `order by created_at limit 1000`, same return shape. The two
-- entry guards are written null-safe (`coalesce(..., false)`); both helpers
-- are EXISTS-based and never NULL, so behaviour is identical. No RLS change,
-- no data change.
--
-- Truncation: unchanged and already honest in the app — project-hours.ts sets
-- `truncated` when the combined rows reach 1000, which a capped team read
-- alone already triggers.
--
-- Rollback: supabase/rollbacks/20261021091000_project_team_journal_hours_v3.down.sql
-- (restores the 20261019220000 body verbatim).

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
  -- organization, a member, a stranger) gets no rows. An admin already reads
  -- every entry through journal_entries_select: nothing here, never twice.
  if p_project_id is null
     or not coalesce(public.can_manage_project(p_project_id), false)
     or coalesce(public.is_admin(), false) then
    return;
  end if;

  return query
  with recursive up as (
    -- Walk each entry on this project up its chain to the root. The row
    -- before a row: the one it superseded (an edit before confirmation),
    -- else the one it corrects (a correction of a confirmed entry).
    select e.id as entry_id, e.id as node_id, e.correction_of as node_correction_of,
           e.created_at as at, 0 as depth
      from public.journal_entries e
     where e.project_id = p_project_id
    union all
    select up.entry_id, o.id, o.correction_of, o.created_at, up.depth + 1
      from up
      left join public.journal_entries pred on pred.superseded_by = up.node_id
      join public.journal_entries o on o.id = coalesce(pred.id, up.node_correction_of)
     where up.depth < 32
  ),
  anchor as (
    -- The root's time: when the WORK was recorded, whatever was edited or
    -- corrected later.
    select distinct on (up.entry_id) up.entry_id, up.at as anchor_at
      from up
     order by up.entry_id, up.depth desc, up.at
  )
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
                    -- Rebuilt, never the stored JSON: only what the review rule reads.
                    'confirmation_scope', jsonb_strip_nulls(jsonb_build_object(
                      'decision', case when jsonb_typeof(c.confirmation_scope -> 'decision') = 'string' then c.confirmation_scope -> 'decision' end,
                      'action', case when jsonb_typeof(c.confirmation_scope -> 'action') = 'string' then c.confirmation_scope -> 'action' end,
                      'authority', case when jsonb_typeof(c.confirmation_scope -> 'authority' -> 'basis') = 'string'
                                        then jsonb_build_object('basis', c.confirmation_scope -> 'authority' -> 'basis') end
                    )),
                    'created_at', c.created_at,
                    'confirmer_role', c.confirmer_role,
                    'by_subject', (c.confirmer_id is not null and c.confirmer_id = w.profile_id)
                  ) order by c.created_at, c.id)
             from public.journal_entry_confirmations c
            where c.entry_id = je.id
         ), '[]'::jsonb)
    from public.journal_entries je
    join anchor a on a.entry_id = je.id
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
          and ta.assigned_at <= a.anchor_at
          and (ta.ended_at is null or ta.ended_at >= a.anchor_at)
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
