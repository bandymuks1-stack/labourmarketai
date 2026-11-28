-- =====================================================================
-- 20261120190000_former_employer_chain_fixes_v1
--
-- RED by rule: two SECURITY DEFINER functions of the former-employer access
-- rule (20261118164500_former_employer_limited_access_v1, #3474, APPLIED)
-- replaced in place. An authority change: it decides which organization a
-- journal entry is stored under and what a former employer still reads.
-- @human-gate-approved — acknowledgement only: the owner approved ONE draft
-- PR that fixes the two defects found on #3474 after it was applied. The PR
-- stays a draft with needs-human-gate and is applied to production only with
-- the owner's separate permission.
--
-- APPLY ORDER: AFTER 20261118164500_former_employer_limited_access_v1. It
-- replaces only journal_entries_ancestor_context_v1() and
-- journal_entry_chain_root_at_v1(uuid); every other object of #3474 is
-- unchanged. No table, column, policy, trigger, grant or data change.
--
-- P1 — journal_entries_ancestor_context_v1(): a correction moved into the
-- ended original's context although it did not correct a record of that
-- context. Both supersede RPCs (20260720150000_journal_photo_continuity_v1)
-- carry `correction_of` forward when an UNCONFIRMED correction is edited, so
-- the new row names the confirmed original E even though the row being
-- edited is a different one. Failure: confirmed entry E is in context A;
-- while A was active the person filed a correction C1 of E under context B
-- (or the personal journal); A ends; editing C1 creates C2 with
-- `correction_of = E`, and the trigger moved C2 into A. A then read B's (or
-- the personal) text, and decision 0033's isolation broke. If B had ended
-- too, the successor lock refused the edit outright.
-- FIX: the row moves into the ended original's context only for a DIRECT
-- correction of a record of that context: when no OTHER live row (not
-- deleted, not superseded: the same "live" the supersede RPCs use to refuse a
-- second correction) that corrects the same original sits outside that
-- context. At insert time the row being edited is still live (both RPCs
-- insert first and link `superseded_by` after), so:
--   · a correction of the confirmed original itself: the RPCs refuse it while
--     another live correction exists, so none does; it moves into A, as
--     before;
--   · an edit of a correction that is already in A: the only live sibling is
--     the edited row, in A; it moves into A, as before (and
--     journal_entries_successor_context_v1 still locks that predecessor);
--   · an edit of a correction that is in B or the personal journal: the
--     edited row is live outside A; the context stays the one the person
--     chose, and A never sees it.
-- A row inserted outside the RPCs while another live correction exists
-- elsewhere keeps its own context: the fail-safe direction, A sees less.
--
-- P2 — journal_entry_chain_root_at_v1(uuid): the walk stopped at depth 32, so
-- an entry of an ended relationship edited 33 or more times was dated by a
-- version made after the end, and the former employer lost a retained record.
-- FIX: the walk follows the whole chain with a visited-path array. It fails
-- closed (null: not retained) only on a real cycle or when a safety bound of
-- 10000 steps is reached, never on an ordinary long chain. The walk still
-- stays inside the entry's own engagement context (R2 P3-1), unchanged.
--
-- APPLY / CHECK / ROLLBACK STEPS: docs/ops/FORMER_EMPLOYER_CHAIN_FIXES_APPLY.md
-- ROLLBACK: supabase/rollbacks/20261120190000_former_employer_chain_fixes_v1.down.sql
-- restores both function bodies exactly as 20261118164500 defines them.
-- =====================================================================

begin;

-- P2. The original of an entry, cycle-safe -----------------------------------
-- Same walk as #3474 (the row it superseded, else the confirmed row it
-- corrects, never leaving the entry's own engagement context), without the
-- depth cap. `path` holds every row already visited on this branch: a row seen
-- again marks a cycle and is not followed. A cycle, or reaching the safety
-- bound, returns null, so org_retains_journal_entry_v1 retains nothing.
create or replace function public.journal_entry_chain_root_at_v1(p_entry_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    select e.id as node_id, e.correction_of as node_correction_of, e.created_at as at,
           e.engagement_context_id as ctx, 0 as depth,
           array[e.id] as path, false as is_cycle
      from public.journal_entries e
     where e.id = p_entry_id
    union all
    select o.id, o.correction_of, o.created_at, up.ctx, up.depth + 1,
           up.path || o.id, o.id = any(up.path)
      from up
      left join public.journal_entries pred on pred.superseded_by = up.node_id
      join public.journal_entries o on o.id = coalesce(pred.id, up.node_correction_of)
     where not up.is_cycle
       and up.depth < 10000
       and o.engagement_context_id is not distinct from up.ctx
  )
  select case
           when bool_or(up.is_cycle) or max(up.depth) >= 10000 then null
           else (array_agg(up.at order by up.depth desc))[1]
         end
    from up;
$$;

revoke all on function public.journal_entry_chain_root_at_v1(uuid) from public, anon, authenticated;

-- P1. Only a DIRECT correction of an ended context's record moves into it ----
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
  if found and not exists (
    select 1 from public.journal_entries c
     where c.correction_of = new.correction_of
       and c.id is distinct from new.id
       and c.deleted_at is null
       and c.superseded_by is null
       and c.engagement_context_id is distinct from v_ctx
  ) then
    new.engagement_context_id := v_ctx;
  end if;
  return new;
end;
$$;
revoke all on function public.journal_entries_ancestor_context_v1() from public, anon, authenticated;

commit;
