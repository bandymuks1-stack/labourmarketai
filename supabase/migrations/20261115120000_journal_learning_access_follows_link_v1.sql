-- =====================================================================
-- 20261115120000_journal_learning_access_follows_link_v1
--
-- RED by rule: DROP POLICY + CREATE POLICY on public.journal_entries (an RLS
-- policy change) and two SECURITY DEFINER function replacements. Needs the
-- human gate (draft PR + needs-human-gate); never auto-applied.
-- @human-gate-approved — acknowledgement only: the owner decided the rule
-- (2026-11-17) and asked for this RED fix to be PREPARED, not deployed. The PR
-- stays a draft with needs-human-gate and is applied only after the owner
-- approves this exact SQL.
--
-- OWNER DECISION (binding, approved 2026-11-17):
--   · When the student ↔ institution relationship ends, the institution loses
--     access to the student's personal work journal.
--   · The institution's own historical records stay, on their lawful
--     retention basis.
--   · General rule: an ended relationship automatically removes current
--     access, but never removes the organization's lawfully retained record
--     history.
--
-- THE RULE AFTER. Unchanged for the person themselves, for platform admins,
-- and for every relationship outside the `education` category (employee,
-- collaborator, owner, manager, …): employer review, confirmation, hours and
-- reports keep reading exactly what they read today. For a LEARNING
-- relationship (relationship_types.category = 'education': today `student`
-- and `intern`) an organization manager reaches the entry only while
--   · the engagement is `active`, AND
--   · journal review is switched on for that engagement
--     (engagement_contexts.journal_review_enabled — the existing audited
--     door set_engagement_journal_review).
-- Ending the link (status 'ended') or pausing it closes access at once;
-- nothing is deleted.
--
-- ONE rule, three places. RLS does not apply inside SECURITY DEFINER
-- functions, so the two definer copies of the manager rule follow it too:
--   1. journal_entries_select              — the RLS read (replaced);
--   2. journal_entry_review_authority_v1   — the employer review basis
--      (current body from 20261003150500; ONE condition added). It already
--      requires journal_review_enabled; for an `education` relationship it now
--      also requires ec.status = 'active'. reviewable_journal_entry_ids,
--      review_journal_entry and the confirmation guard trigger all resolve
--      authority through it, so they follow without being replaced;
--   3. can_read_journal_entry_v1           — the definer mirror of the read
--      (body from 20260819190000; the same condition as the policy).
-- Signatures, SECURITY DEFINER, search_path and grants are unchanged; the
-- privilege statements below restate the existing ACL, they widen nothing.
--
-- The rule is DATA (relationship_types.category), never a slug literal: a
-- future learning relationship (apprentice, trainee) follows it without a
-- migration. Fail-closed: a manager passes only when the relationship row is
-- found and is not `education`, or the learning conditions hold.
--
-- WHAT STAYS READABLE, through its own table and unchanged:
--   · journal_entry_confirmations the confirmer created
--     (confirmer_id = auth.uid());
--   · competency_recognitions the organization assessed
--     (manages_organization(assessor_organization_id));
--   · the organization's programmes, cohorts and cohort memberships.
-- Child tables that reach the entry through `exists (… journal_entries …)`
-- follow the policy automatically, because RLS applies inside those
-- sub-selects.
--
-- No table, column or data change.
--
-- ROLLBACK: supabase/rollbacks/20261115120000_journal_learning_access_follows_link_v1.down.sql
-- restores the 0013 policy and both previous function bodies exactly.
-- =====================================================================

begin;

-- 1. The RLS read ------------------------------------------------------------
drop policy if exists journal_entries_select on public.journal_entries;

create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id)
    or is_admin()
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.id = journal_entries.engagement_context_id
         and manages_organization(ec.organization_id)
         and (
           -- Any relationship outside the education category: as before.
           exists (
             select 1 from public.relationship_types rt
              where rt.slug = ec.relationship_slug
                and rt.category <> 'education'
           )
           -- A learning relationship: only while the link is active and
           -- review is switched on for it.
           or (ec.status = 'active' and ec.journal_review_enabled is true)
         )
    )
  );

-- 2. The employer review basis (SECURITY DEFINER) ------------------------------
create or replace function public.journal_entry_review_authority_v1(p_entry_id uuid, p_actor uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_worker uuid; v_subject uuid; v_org uuid; v_enabled boolean; v_project uuid;
  v_sub uuid; v_link uuid; v_party uuid; v_role text;
begin
  if p_actor is null then return null; end if;
  select je.worker_id, w.profile_id, ec.organization_id,
         coalesce(ec.journal_review_enabled, false), je.project_id
    into v_worker, v_subject, v_org, v_enabled, v_project
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join public.workers w on w.id = je.worker_id
   where je.id = p_entry_id;
  if not found then return null; end if;
  -- The subject can never be the party that accepts their own work.
  if v_subject is not null and v_subject = p_actor then return null; end if;

  -- EMPLOYER: the organization of the entry's own (review-enabled) engagement.
  -- The actor must manage it and must NOT be a co-manager of any organization
  -- the subject manages: the manager of the subject's own sole-trader / own
  -- organization is the subject's side, not an employer.
  if v_org is not null and v_enabled
     and public.profile_manages_organization_v1(p_actor, v_org)
     and not public.profiles_co_manage_organization_v1(v_subject, p_actor)
     -- A LEARNING relationship (relationship_types.category = 'education')
     -- carries the employer basis only while the link is active; every other
     -- relationship as before. The same fail-closed condition as
     -- journal_entries_select (20261115120000).
     and exists (
       select 1 from public.journal_entries je2
         join public.engagement_contexts ec2 on ec2.id = je2.engagement_context_id
        where je2.id = p_entry_id
          and (exists (select 1 from public.relationship_types rt
                        where rt.slug = ec2.relationship_slug
                          and rt.category <> 'education')
               or ec2.status = 'active')
     ) then
    return jsonb_build_object('basis', 'employer', 'party_organization_id', v_org);
  end if;

  -- COUNTERPARTY: an explicitly SUBMITTED entry whose resolved counterparty
  -- link is still valid, reviewed by an authorized representative of that
  -- party who shares no organization with the subject.
  if v_project is not null and v_worker is not null then
    select s.id, l.id, l.counterparty_organization_id, l.party_role
      into v_sub, v_link, v_party, v_role
      from public.journal_entry_review_submissions s
      join public.work_counterparty_links l on l.id = s.link_id
     where s.entry_id = p_entry_id
       and l.worker_id = v_worker and l.project_id = v_project
       and public.work_counterparty_link_valid_v1(l.id)
       and l.counterparty_organization_id is distinct from v_org
       and public.profile_manages_organization_v1(p_actor, l.counterparty_organization_id)
       and not public.profiles_share_organization_v1(v_subject, p_actor);
    if found then
      return jsonb_build_object('basis', 'counterparty', 'party_organization_id', v_party,
                                'link_id', v_link, 'submission_id', v_sub, 'party_role', v_role);
    end if;
  end if;
  return null;
end $$;

revoke all on function public.journal_entry_review_authority_v1(uuid, uuid) from public, anon, authenticated;

-- 3. The definer mirror of the read --------------------------------------------
create or replace function public.can_read_journal_entry_v1(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.journal_entries je
     where je.id = p_entry_id
       and (
         public.owns_worker(je.worker_id)
         or public.is_admin()
         or exists (
           select 1 from public.engagement_contexts ec
            where ec.id = je.engagement_context_id
              and public.manages_organization(ec.organization_id)
              and (
                -- Any relationship outside the education category: as before.
                exists (
                  select 1 from public.relationship_types rt
                   where rt.slug = ec.relationship_slug
                     and rt.category <> 'education'
                )
                -- A learning relationship: only while the link is active and
                -- review is switched on for it.
                or (ec.status = 'active' and ec.journal_review_enabled is true)
              )
         )
       )
  );
$$;

revoke all on function public.can_read_journal_entry_v1(uuid) from public;
revoke all on function public.can_read_journal_entry_v1(uuid) from anon;
grant execute on function public.can_read_journal_entry_v1(uuid) to authenticated;

commit;
