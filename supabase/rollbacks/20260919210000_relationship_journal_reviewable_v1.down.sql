-- DOWN for 20260919210000_relationship_journal_reviewable_v1
-- Restores set_engagement_journal_review to its production definition
-- (employee-only literal, byte-for-byte as read from prod 2026-09-19) and
-- drops the data column. Reviews already enabled on student engagements keep
-- their flag (journal_review_enabled is on engagement_contexts, untouched);
-- the owner may disable them through the same RPC before running this if
-- that is the intent.

begin;

create or replace function public.set_engagement_journal_review(p_engagement_id uuid, p_enabled boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_org uuid; v_slug text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id, relationship_slug into v_org, v_slug from public.engagement_contexts where id = p_engagement_id;
  if not found then return 'engagement_not_found'; end if;
  if v_org is null then return 'engagement_not_org_scoped'; end if;
  if v_slug <> 'employee' then return 'not_a_member_engagement'; end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  update public.engagement_contexts set journal_review_enabled = p_enabled, updated_at = now() where id = p_engagement_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_engagement_journal_review', 'engagement_contexts', p_engagement_id, jsonb_build_object('organization_id', v_org, 'enabled', p_enabled));
  return case when p_enabled then 'enabled' else 'disabled' end;
end $$;

revoke all on function public.set_engagement_journal_review(uuid, boolean) from public, anon;
grant execute on function public.set_engagement_journal_review(uuid, boolean) to authenticated;

alter table public.relationship_types drop column if exists journal_reviewable;

commit;
