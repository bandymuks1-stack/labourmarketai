-- Rollback of 20261117060000_former_employer_limited_access_v1.
-- Restores every policy and function body exactly as main defined them before
-- that migration (each block is copied verbatim from the migration named above
-- it; pinned by lib/guards/former-employer-limited-access.test.ts).
-- journal_entries_select returns to the 0013 text. If #3421's
-- 20261115120000_journal_learning_access_follows_link_v1 had been applied
-- before 20261117060000, apply 20261115120000 again after this rollback.

begin;

-- 0013_work_journal_m1
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

-- 20260819190000_journal_task_evidence_link_v1
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

commit;
