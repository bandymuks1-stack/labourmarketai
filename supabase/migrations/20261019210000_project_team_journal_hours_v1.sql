-- 20261019210000_project_team_journal_hours_v1
--
-- @human-gate-approved (acknowledgement: RED by new SECURITY DEFINER function + GRANT;
--   owner approval in chat 2026-10-19: "Leidžiu įgyvendinti B2B-9 RLS pataisymą")
--
-- RED CLASS — applied via Supabase MCP `apply_migration` after the owner's
-- approval. Never `supabase db push`.
--
-- ── WHAT IS WRONG ON PRODUCTION TODAY ────────────────────────────────────
-- A brigade (a team organization) offered itself against a buyer's need, the
-- buyer handed it into its OWN project as one team assignment (B2B-7), and a
-- member recorded the day's work on that project (B2B-8). The entry is linked
-- correctly (journal_entries.project_id = the buyer's project, context = the
-- brigade). But the buyer's project page showed 0 h (production walk
-- 39312088526, B2B-9): `journal_entries_select` lets a manager read entries
-- only of contexts THEIR organization manages, so work done FOR the buyer on
-- the buyer's own project never reached the buyer.
--
-- ── THE FIX — hours, not the journal ─────────────────────────────────────
-- No RLS policy is widened: the buyer gets NO general access to the brigade's
-- journal (decision 0024 isolation is kept). Instead ONE read answers the
-- project page's own question — "how many hours were worked on my project" —
-- for exactly these entries:
--   · on THIS project (journal_entries.project_id),
--   · recorded in a TEAM organization's context,
--   · while that team held an assignment on this project (assigned_at <=
--     created_at <= ended_at), i.e. legitimately assigned work,
--   · live (not deleted, not superseded),
--   · and NOT already readable by the caller under journal_entries_select
--     (own entries, contexts the caller manages) — so the two reads are
--     disjoint and nothing is counted twice.
-- The caller must be able to manage the project (`can_manage_project`); a
-- third organization gets nothing.
--
-- WHAT IS RETURNED is the minimum the ONE work-time rule needs
-- (lib/journal/work-time.ts via deriveWindowWorkTime), never more:
--   · opaque keys (md5) for the entry, its correction target and its context —
--     no entry id, no worker id, no profile id, no organization id;
--   · the time, the metric rows' slug / number / unit / source, with
--     value_text ONLY for the two time fields the rule parses — work_date
--     (YYYY-MM-DD) and fragment_time (the fragment index digits) — and only
--     when the value matches that exact shape; activity and evidence text,
--     notes and the entry text never leave;
--   · per review row: scope, time, role and whether the reviewer was the
--     worker themselves (the rule excludes self-confirmation) — never who.
--
-- Rollback: supabase/rollbacks/20261019210000_project_team_journal_hours_v1.down.sql

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
