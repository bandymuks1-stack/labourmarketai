-- =====================================================================
-- 20261117060000_former_employer_limited_access_v1
--
-- RED by rule: DROP POLICY + CREATE POLICY on public.journal_entries,
-- public.journal_entry_work_items, public.journal_entry_metrics and
-- public.journal_entry_confirmations, plus four SECURITY DEFINER functions
-- replaced in place (an RLS / authority change).
--
-- APPLY ORDER (R2, 2026-11-17): AFTER 20261115120000_journal_learning_access_
-- follows_link_v1 (#3421), never before it. This migration is written on
-- #3421's definitions and carries BOTH rules in every object they share
-- (journal_entries_select, can_read_journal_entry_v1,
-- journal_entry_review_authority_v1): #3421's learning condition word for
-- word, plus the end-date rule for every other relationship. Applying #3421
-- after this one would overwrite the end-date rule. Needs the human gate (draft
-- PR + needs-human-gate); never auto-applied.
-- @human-gate-approved — acknowledgement only: the owner decided the rule
-- (2026-11-17, relayed by the coordinator) and asked for this RED change to be
-- PREPARED. The PR stays a draft with needs-human-gate and is applied only
-- after the owner approves this exact SQL and R2's security review passes.
--
-- OWNER DECISION (2026-11-17): a former employer keeps limited access.
--   · It keeps the time and work records created DURING the employment that
--     belong to the company, as lawful accounting and retention require.
--   · It loses the person's personal journal, other employers' records and
--     every NEW record.
--   · Historical records are never changed or deleted arbitrarily; every
--     correction stays traceable.
--   · An ended relationship removes current access automatically and never
--     removes the organization's lawfully retained history.
--
-- WHAT A FORMER EMPLOYER COULD DO BEFORE (repo state, latest definitions):
--   R1 read every entry ever written under its engagement context, including
--      entries created AFTER the end date (0013 journal_entries_select checks
--      no status and no date; the attribution guard lets a person still file
--      into their own ended context);
--   W1 rewrite any column of the person's historical work items
--      (journal_entry_work_items_update, manager arm, no status check);
--   W2 add metrics to any historical entry (journal_entry_metrics_write,
--      WITH CHECK manager arm);
--   W3 confirm entries of an ended engagement by first switching review back
--      on: set_engagement_journal_review had no status check, and the
--      confirmation insert policy and reviewable_journal_entry_ids none either.
-- Already as the rule, and pinned by the tests, not changed here: the
-- personal journal (an organization-less context) and other organizations'
-- entries are unreachable; journal entries and confirmations have no UPDATE or
-- DELETE grant; supersede / correction_of keep every correction traceable;
-- ending a relationship deletes nothing.
--
-- REVIEW AUTHORITY (R2 P2-1): journal_entry_review_authority_v1 grants the
-- employer basis to a manager of the entry's organization while review is on.
-- #3421 limits a learning relationship to `active`; here every other
-- relationship is limited to `active` or `paused`, so an ended employment
-- with review left on (the 2026-09-23 consolidation ended engagements without
-- switching it off) no longer resolves to `employer`. review_journal_entry,
-- the batch review, confirm_entry_and_verify_skills, reviewable_journal_entry_ids
-- and the confirmation guard trigger all resolve authority through it.
--
-- THE RULE AFTER, one predicate in two places (the policy and its SECURITY
-- DEFINER mirror can_read_journal_entry_v1), for a MANAGER of the entry's
-- engagement organization (the person, admins and confirmers are unchanged):
--   · a relationship outside the `education` category, while `active` or
--     `paused`: every entry, as before;
--   · the same relationship once `ended`: only entries CREATED on or before
--     its end date: created before the end of that day, UTC
--     (created_at < (ended_at + 1) at UTC). The end day counts as part of the
--     employment, because ended_at is a date. A correction or a late entry the person
--     files after the end is a new record and is not shown. An ended row with
--     no end date shows nothing (fail-closed; every end door sets ended_at);
--   · a learning relationship (category `education`): only while it is
--     `active` and journal review is on, the rule of #3421 (owner decision
--     2026-11-15), carried here unchanged so either order of applying keeps
--     it;
--   · a relationship type that cannot be found: nothing (fail-closed).
-- WRITES by a manager (W1, W2, W3) need the engagement to be `active` or
-- `paused`: an ended relationship can no longer change, add to or decide on
-- the person's records. Disabling review stays possible at any time.
-- The person keeps every right to their own records; admins are unchanged.
--
-- No table, column, grant or data change. Child tables that reach an entry
-- through `exists (… journal_entries …)` (metrics, work items, skills, photos
-- and the photo bucket) follow the read rule, because RLS applies inside those
-- sub-selects; the SECURITY DEFINER readers are replaced here explicitly.
--
-- ROLLBACK: supabase/rollbacks/20261117060000_former_employer_limited_access_v1.down.sql
-- restores every policy and function body exactly as it was before this
-- migration, i.e. after #3421: journal_entries_select, can_read_journal_entry_v1
-- and journal_entry_review_authority_v1 as 20261115120000 defines them, the
-- others as main defines them.
-- =====================================================================

begin;

-- 1. Reads: the journal entry itself ------------------------------------------
drop policy if exists journal_entries_select on public.journal_entries;

create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id)
    or is_admin()
    or exists (
      select 1
        from public.engagement_contexts ec
        join public.relationship_types rt on rt.slug = ec.relationship_slug
       where ec.id = journal_entries.engagement_context_id
         and manages_organization(ec.organization_id)
         and (
           -- A learning relationship (#3421): only while active and reviewed.
           (rt.category = 'education'
              and ec.status = 'active'
              and ec.journal_review_enabled is true)
           -- Any other relationship: while it runs, every entry; once ended,
           -- only what was recorded up to its end date (retained history).
           or (rt.category <> 'education'
               and (ec.status in ('active', 'paused')
                    or (ec.status = 'ended'
                        and ec.ended_at is not null
                        and journal_entries.created_at < ((ec.ended_at + 1)::timestamp at time zone 'UTC'))))
         )
    )
  );

-- 2. Reads: the SECURITY DEFINER mirror (journal tasks and their links) --------
-- Same signature, same ACL; the predicate is the policy's, word for word.
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
           select 1
             from public.engagement_contexts ec
             join public.relationship_types rt on rt.slug = ec.relationship_slug
            where ec.id = je.engagement_context_id
              and public.manages_organization(ec.organization_id)
              and (
                (rt.category = 'education'
                   and ec.status = 'active'
                   and ec.journal_review_enabled is true)
                or (rt.category <> 'education'
                    and (ec.status in ('active', 'paused')
                         or (ec.status = 'ended'
                             and ec.ended_at is not null
                             and je.created_at < ((ec.ended_at + 1)::timestamp at time zone 'UTC'))))
              )
         )
       )
  );
$$;

revoke all on function public.can_read_journal_entry_v1(uuid) from public;
revoke all on function public.can_read_journal_entry_v1(uuid) from anon;
grant execute on function public.can_read_journal_entry_v1(uuid) to authenticated;

-- 2b. The employer review basis (SECURITY DEFINER) — R2 P2-1 ---------------------
-- Body of 20261115120000 (#3421) verbatim; the one condition on the
-- engagement's status now covers every relationship: a learning one while
-- `active` (#3421), any other while `active` or `paused` (this migration).
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
     -- The relationship must still run: a LEARNING relationship
     -- (relationship_types.category = 'education') only while `active`
     -- (#3421); any other relationship while `active` or `paused`. An ended
     -- relationship carries no employer basis, whatever its review switch
     -- says. Fail-closed: a relationship type that cannot be found counts as
     -- learning.
     and exists (
       select 1 from public.journal_entries je2
         join public.engagement_contexts ec2 on ec2.id = je2.engagement_context_id
        where je2.id = p_entry_id
          and (ec2.status = 'active'
               or (ec2.status = 'paused'
                   and exists (select 1 from public.relationship_types rt
                                where rt.slug = ec2.relationship_slug
                                  and rt.category <> 'education')))
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

-- 3. Writes: work items (W1) ---------------------------------------------------
drop policy if exists journal_entry_work_items_update on public.journal_entry_work_items;
create policy journal_entry_work_items_update on public.journal_entry_work_items for update
  using (
    public.owns_worker(worker_id)
    or public.is_admin()
    or exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_work_items.journal_entry_id
         and ec.status in ('active', 'paused')
         and public.manages_organization(ec.organization_id)
    )
  )
  with check (
    public.owns_worker(worker_id)
    or public.is_admin()
    or exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_work_items.journal_entry_id
         and ec.status in ('active', 'paused')
         and public.manages_organization(ec.organization_id)
    )
  );

-- 4. Writes: metrics (W2) --------------------------------------------------------
drop policy if exists journal_entry_metrics_write on public.journal_entry_metrics;
create policy journal_entry_metrics_write on public.journal_entry_metrics for all
  using (exists (select 1 from public.journal_entries je
                  where je.id = journal_entry_metrics.entry_id
                    and (owns_worker(je.worker_id) or is_admin())))
  with check (exists (select 1 from public.journal_entries je
                       where je.id = journal_entry_metrics.entry_id
                         and (owns_worker(je.worker_id) or is_admin()
                              or exists (select 1 from public.engagement_contexts ec
                                          where ec.id = je.engagement_context_id
                                            and ec.status in ('active', 'paused')
                                            and manages_organization(ec.organization_id)))));

-- 5. Writes: confirmations (W3) -------------------------------------------------
-- Defense in depth beside the guard trigger (journal_entry_review_authority_v1
-- needs review switched on; the end doors switch it off, though the 2026-09-23
-- consolidation ended engagements without doing so).
drop policy if exists journal_entry_confirmations_insert
  on public.journal_entry_confirmations;
create policy journal_entry_confirmations_insert on public.journal_entry_confirmations for insert
  with check (
    confirmer_id = auth.uid()
    and exists (select 1 from public.journal_entries je
                 join public.engagement_contexts ec on ec.id = je.engagement_context_id
                where je.id = journal_entry_confirmations.entry_id
                  and je.superseded_by is null
                  and je.deleted_at is null
                  and ec.status in ('active', 'paused')
                  and manages_organization(ec.organization_id))
  );

-- 6. Writes: review cannot be switched back on for an ended relationship (W3) --
-- Body of 20260919210000 verbatim, plus the status read and one refusal.
create or replace function public.set_engagement_journal_review(p_engagement_id uuid, p_enabled boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_org uuid; v_slug text; v_status text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id, relationship_slug, status into v_org, v_slug, v_status from public.engagement_contexts where id = p_engagement_id;
  if not found then return 'engagement_not_found'; end if;
  if v_org is null then return 'engagement_not_org_scoped'; end if;
  -- The rule is data (relationship_types.journal_reviewable), not a literal.
  if not exists (select 1 from public.relationship_types rt
                  where rt.slug = v_slug and rt.journal_reviewable) then
    return 'not_a_member_engagement';
  end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  -- An ended relationship gives no current access: review may be switched
  -- off at any time, never back on.
  if p_enabled and v_status is distinct from 'active' and v_status is distinct from 'paused' then
    return 'engagement_not_active';
  end if;
  update public.engagement_contexts set journal_review_enabled = p_enabled, updated_at = now() where id = p_engagement_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_engagement_journal_review', 'engagement_contexts', p_engagement_id, jsonb_build_object('organization_id', v_org, 'enabled', p_enabled, 'relationship_slug', v_slug));
  return case when p_enabled then 'enabled' else 'disabled' end;
end $$;

revoke all on function public.set_engagement_journal_review(uuid, boolean) from public, anon;
grant execute on function public.set_engagement_journal_review(uuid, boolean) to authenticated;

-- 7. The employer's review queue lists only entries it may still decide -------
-- Body of 20261003150550 verbatim, plus one status condition.
CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join public.workers w on w.id = je.worker_id
    where ec.organization_id is not null
      and ec.status in ('active', 'paused')
      and je.superseded_by is null
      and je.deleted_at is null
      and coalesce(ec.journal_review_enabled, false) is true
      and coalesce(w.profile_id <> uid, true)
      and (public.journal_entry_review_authority_v1(je.id, uid) ->> 'basis') = 'employer'
      -- Only EMPLOYER-path decisions close the employer's pending item: a
      -- CLIENT decision (basis 'counterparty') neither substitutes for nor
      -- suppresses employer review (decision 0018).
      and not exists (select 1 from public.journal_entry_confirmations c
                       where c.entry_id = je.id
                         and c.confirmer_id is distinct from w.profile_id
                         and coalesce(c.confirmation_scope #>> '{authority,basis}', 'employer') <> 'counterparty');
end $function$;

revoke all on function public.reviewable_journal_entry_ids() from public, anon;
grant execute on function public.reviewable_journal_entry_ids() to authenticated;

commit;
