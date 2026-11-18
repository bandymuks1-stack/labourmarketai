-- Rollback of 20261118164500_former_employer_limited_access_v1.
-- Restores every policy and function body exactly as it was before that
-- migration, which is applied AFTER #3421's 20261115120000: the three objects
-- both migrations define return to #3421's text, the others to main's (each
-- block is copied verbatim from the migration named above it; pinned by
-- lib/guards/former-employer-limited-access.test.ts).

begin;

-- 20261115120000_journal_learning_access_follows_link_v1 (#3421, applied before this one)
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

-- 20261115120000_journal_learning_access_follows_link_v1
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

-- 20261115120000_journal_learning_access_follows_link_v1
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

-- 20260601090000_journal_entry_work_items
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
         and public.manages_organization(ec.organization_id)
    )
  );

-- 0013_work_journal_m1
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
                                            and manages_organization(ec.organization_id)))));

-- 20260720150000_journal_photo_continuity_v1
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
                  and manages_organization(ec.organization_id))
  );

-- 20260919210000_relationship_journal_reviewable_v1
create or replace function public.set_engagement_journal_review(p_engagement_id uuid, p_enabled boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_org uuid; v_slug text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id, relationship_slug into v_org, v_slug from public.engagement_contexts where id = p_engagement_id;
  if not found then return 'engagement_not_found'; end if;
  if v_org is null then return 'engagement_not_org_scoped'; end if;
  -- The rule is data (relationship_types.journal_reviewable), not a literal.
  if not exists (select 1 from public.relationship_types rt
                  where rt.slug = v_slug and rt.journal_reviewable) then
    return 'not_a_member_engagement';
  end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  update public.engagement_contexts set journal_review_enabled = p_enabled, updated_at = now() where id = p_engagement_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_engagement_journal_review', 'engagement_contexts', p_engagement_id, jsonb_build_object('organization_id', v_org, 'enabled', p_enabled, 'relationship_slug', v_slug));
  return case when p_enabled then 'enabled' else 'disabled' end;
end $$;

revoke all on function public.set_engagement_journal_review(uuid, boolean) from public, anon;
grant execute on function public.set_engagement_journal_review(uuid, boolean) to authenticated;

-- 20261003150550_counterparty_link_assignment_kinds_review_doors_v1
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

-- Added by 20261118164500 (nothing references them once the blocks above
-- are restored).
drop function if exists public.org_retains_journal_entry_v1(uuid);
drop function if exists public.journal_entry_chain_root_at_v1(uuid);

commit;
