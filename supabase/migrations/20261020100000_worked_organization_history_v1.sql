-- @human-gate-approved — owner approved the limited-access principle of PR #2563
-- (2026-10-20): a person sees the name and period of an organization linked to
-- their own work history; no other person's data and no private organization
-- data. Access scenarios checked in a rolled-back transaction. Scope: this SQL only.
-- ============================================================================
-- worked_organization_history_v1 — the people who worked for an organization
-- read its NAME and its stated earlier PERIODS (decision 0025, owner order
-- 2026-10-20: "Vivat Rex" is one example of a general defect).
--
-- Today:
--   · organization_history_periods (e.g. "this company earlier operated as
--     Vivat Rex") is readable only by the organization's managers
--     (organization_history_periods_select: manages_organization OR admin);
--   · my_historical_organization_names_v1 returns an organization's name only
--     to a person with an engagement context there — a person who CLAIMED
--     their historical roster row (organization_people, link_state 'linked')
--     with no engagement context gets no name for their own records.
-- So a former worker's Living CV cannot say that their work happened under
-- the company's earlier name, and a claimed person's records may show no
-- company name at all.
--
-- Change (read-only, names and stated periods only):
--   1. my_worked_organization_periods_v1(p_org_ids uuid[]) — the stated
--      periods of organizations the CALLER has or had a working relationship
--      with: an engagement context there (any status — history counts), or a
--      roster row the person CONFIRMED (linked_profile_id = caller,
--      link_state = 'linked' AND link_method = 'worker_confirmed': the
--      integrity-door rule, since definer/service writers bypass the consent
--      trigger, a subject-side read never trusts 'linked' alone). Returns the period's label, legal-entity label,
--      relation, basis category, dates, continuity, source labels and
--      supersedes link — the
--      fields the experience model reads. NOT returned: statement,
--      basis_reference, created_by (the organization's internal evidence).
--   2. my_historical_organization_names_v2(p_org_ids uuid[]) — v1's rule plus
--      the confirmed roster row (same predicate).
--   Both: SECURITY DEFINER, STABLE, search_path public, at most 100 ids,
--   EXECUTE for authenticated only. No table, policy or data is changed.
--
-- Rollback: supabase/rollbacks/20261020100000_worked_organization_history_v1.down.sql
-- ============================================================================

create or replace function public.my_worked_organization_periods_v1(p_org_ids uuid[])
 returns table (
   id uuid,
   organization_id uuid,
   period_label text,
   legal_entity_label text,
   legal_entity_relation text,
   basis text,
   period_start date,
   period_end date,
   continuity text,
   source_labels text[],
   supersedes_id uuid,
   created_at timestamptz
 )
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.organization_id, p.period_label, p.legal_entity_label,
         p.legal_entity_relation, p.basis, p.period_start, p.period_end, p.continuity,
         p.source_labels, p.supersedes_id, p.created_at
    from public.organization_history_periods p
   where auth.uid() is not null
     and p.organization_id = any (p_org_ids[1:100])
     and (
       exists (select 1 from public.engagement_contexts ec
                where ec.organization_id = p.organization_id
                  and ec.profile_id = auth.uid())
       or exists (select 1 from public.organization_people op
                   where op.organization_id = p.organization_id
                     and op.linked_profile_id = auth.uid()
                     and op.link_state = 'linked'
                     and op.link_method = 'worker_confirmed'))
   order by p.created_at, p.id;
$function$;

create or replace function public.my_historical_organization_names_v2(p_org_ids uuid[])
 returns table (organization_id uuid, display_name text, legal_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select o.id, o.display_name, o.legal_name
    from public.organizations o
   where auth.uid() is not null
     and o.id = any (p_org_ids[1:100])
     and (
       exists (select 1 from public.engagement_contexts ec
                where ec.organization_id = o.id
                  and ec.profile_id = auth.uid())
       or exists (select 1 from public.organization_people op
                   where op.organization_id = o.id
                     and op.linked_profile_id = auth.uid()
                     and op.link_state = 'linked'
                     and op.link_method = 'worker_confirmed'));
$function$;

revoke all on function public.my_worked_organization_periods_v1(uuid[]) from public, anon;
grant execute on function public.my_worked_organization_periods_v1(uuid[]) to authenticated;
revoke all on function public.my_historical_organization_names_v2(uuid[]) from public, anon;
grant execute on function public.my_historical_organization_names_v2(uuid[]) to authenticated;
