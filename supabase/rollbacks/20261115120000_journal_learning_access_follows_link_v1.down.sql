-- Rollback of 20261115120000_journal_learning_access_follows_link_v1.
-- Restores, exactly:
--   · journal_entries_select as 0013_work_journal_m1 defined it;
--   · journal_entry_review_authority_v1 as 20261003150500_journal_counterparty_review_authority_v1 defined it;
--   · can_read_journal_entry_v1 as 20260819190000_journal_task_evidence_link_v1 defined it.
-- Grants are restated as they were (unchanged by the forward migration).

begin;

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
         )
       )
  );
$$;

revoke all on function public.can_read_journal_entry_v1(uuid) from public;
revoke all on function public.can_read_journal_entry_v1(uuid) from anon;
grant execute on function public.can_read_journal_entry_v1(uuid) to authenticated;

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
     and not public.profiles_co_manage_organization_v1(v_subject, p_actor) then
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

drop policy if exists journal_entries_select on public.journal_entries;

create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id)
    or is_admin()
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.id = journal_entries.engagement_context_id
         and manages_organization(ec.organization_id)
    )
  );

commit;
