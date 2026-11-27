-- Rollback of 20261120190000_former_employer_chain_fixes_v1.
-- Restores journal_entry_chain_root_at_v1(uuid) and
-- journal_entries_ancestor_context_v1() exactly as
-- 20261118164500_former_employer_limited_access_v1 (#3474) defines them: each
-- block below is copied verbatim from that file (pinned byte for byte by
-- lib/guards/former-employer-limited-access.test.ts). Nothing else changes:
-- the triggers, org_retains_journal_entry_v1 and every policy stay as #3474
-- left them.

begin;

-- 20261118164500_former_employer_limited_access_v1
create or replace function public.journal_entry_chain_root_at_v1(p_entry_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    select e.id as node_id, e.correction_of as node_correction_of, e.created_at as at,
           e.engagement_context_id as ctx, 0 as depth
      from public.journal_entries e
     where e.id = p_entry_id
    union all
    select o.id, o.correction_of, o.created_at, up.ctx, up.depth + 1
      from up
      left join public.journal_entries pred on pred.superseded_by = up.node_id
      join public.journal_entries o on o.id = coalesce(pred.id, up.node_correction_of)
     where up.depth < 32
       and o.engagement_context_id is not distinct from up.ctx
  )
  select up.at from up order by up.depth desc limit 1;
$$;

revoke all on function public.journal_entry_chain_root_at_v1(uuid) from public, anon, authenticated;

-- 20261118164500_former_employer_limited_access_v1
create or replace function public.journal_entries_ancestor_context_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
begin
  if new.correction_of is null then
    return new;
  end if;
  select o.engagement_context_id into v_ctx
    from public.journal_entries o
    join public.engagement_contexts ec on ec.id = o.engagement_context_id
   where o.id = new.correction_of
     and o.worker_id = new.worker_id
     and ec.status = 'ended';
  if found then
    new.engagement_context_id := v_ctx;
  end if;
  return new;
end;
$$;
revoke all on function public.journal_entries_ancestor_context_v1() from public, anon, authenticated;

commit;
