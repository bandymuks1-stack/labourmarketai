-- @human-gate-approved — owner approved PR #2608 (2026-10-22, in chat): "I approve PR #2608 migration 20261021095500_worker_skill_confirmation_standing_v1.sql, including its reviewed SECURITY DEFINER function and GRANT permissions."
-- Scope: this SQL only.
--
-- SAFETY CLASS: RED (new SECURITY DEFINER function + explicit GRANT/REVOKE on
-- the trust model's read path). Apply ONLY via Supabase MCP `apply_migration`.
-- The marker is the risk acknowledgement the static gate reads, not an approval.
--
-- 20261021095500 - A SKILL CONFIRMATION STANDS ONLY WHILE ITS WORK STANDS
-- (owner-approved programme "skill confirmation withdrawal"; phase B).
--
-- THE DEFECT: worker_skills.verified is set by confirm_entry_and_verify_skills
-- and apply_learning_auto_confirmation (latest bodies 20260720150000) and is
-- never set back. A later rejection of the confirming entry (latest decision
-- wins), a correction (counted once: the corrected original is replaced by its
-- live correction) or a deletion leaves the skill "confirmed"; the 2 rows with
-- verified_by = the subject (20261003150500, "classified at read time") were
-- never classified by any reader.
--
-- PHASE A (app, GREEN, no migration) fixes every OWN surface - the subject can
-- read their own journal under RLS. A CROSS-PARTY viewer cannot: an employer
-- sees worker_skills through can_view_worker() but not that worker's journal,
-- so an app-side derivation would under-state every confirmed skill for them.
-- This file adds the ONE read door those readers need.
--
-- WHAT THIS ADDS: one function, nothing else.
--   public.worker_skill_confirmations_standing_v1(p_worker_ids uuid[])
--     returns (worker_id, skill_id, state) for every worker_skills row with
--     verified = true of every requested worker the CALLER MAY ALREADY SEE -
--     gated per worker by public.can_view_worker(), the exact predicate of
--     the worker_skills_select RLS policy - so it never reaches a row the
--     caller could not read today. state is one of
--       'standing'       independent, standing work backs it (rule below) -
--                        whoever flipped the flag
--       'withdrawn'      recorded once, but no standing work backs it now
--       'self_confirmed' verified_by = the subject and no standing work backs
--                        it (an own flag is never a confirmation on its own)
--   THE RULE (kept in step with apps/web/lib/evidence/skill-confirmation-standing.ts;
--   the same definition of a CONFIRMED ENTRY as lib/journal/review-status.ts):
--     an entry is CONFIRMED when it is LIVE (not deleted, not superseded),
--     not a corrected original (no live row has correction_of = it), and its
--     LATEST recognised EMPLOYER-basis decision made by someone other than
--     the subject is 'approved' (decision key, else the legacy action
--     confirm/reject/request_changes; counterparty rows never count).
--     A recorded skill confirmation STANDS when a confirmed entry of the
--     worker is linked to the skill (journal_entry_skills) or carries an
--     independent, employer-basis, approving decision that named it
--     (confirmation_scope.skills_confirmed).
--     A row the subject flagged themselves (verified_by = subject) stands only
--     through an independent approval that POSTDATES the flag (verified_at):
--     verified_by is written only on the false -> true flip and never moves
--     off the subject, so it may not be a permanent veto — but an OLDER
--     approval of the same work is not someone else confirming what the
--     person asserted afterwards. An unknown verified_at keeps it
--     'self_confirmed'. Any other row stands when standing work backs it,
--     else 'withdrawn'. (Mirrors skillConfirmationState in the app.)
--
-- WHAT IT DOES NOT DO: no data change (worker_skills.verified / verified_by /
-- verified_at, journal_entry_confirmations and every other row stay byte for
-- byte - history kept); no policy, grant or table change; it creates no
-- confirmation (only rows ALREADY verified are returned, so approval of work
-- never certifies a skill); confirm_entry_and_verify_skills /
-- apply_learning_auto_confirmation are untouched. The DB-side counters that
-- still read the raw flag (booking_requests verified_skill_count, team /
-- brigade "confirmed" counts, vacancy-interest handoff, team demand offer,
-- batch review exceptions, ops metrics) are a later, separately reviewed
-- slice; this function is the predicate they will call.
--
-- DISCLOSURE: per visible verified row the caller learns one state. That is
-- the CURRENT meaning of a flag they already read; it reveals no entry, no
-- decision, no confirmer and no text.
--
-- Rollback: supabase/rollbacks/20261021095500_worker_skill_confirmation_standing_v1.down.sql
-- (a pure function drop; nothing was written).

begin;

create or replace function public.worker_skill_confirmations_standing_v1(p_worker_ids uuid[])
 returns table (worker_id uuid, skill_id uuid, state text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_worker_ids is null or coalesce(cardinality(p_worker_ids), 0) = 0 then
    return;
  end if;
  if cardinality(p_worker_ids) > 500 then
    raise exception 'too_many_workers' using errcode = '22023';
  end if;

  return query
  with req as (
    -- only workers the caller can already see (= worker_skills_select RLS)
    select w.id as wid, w.profile_id as subject
      from public.workers w
     where w.id = any (p_worker_ids)
       and public.can_view_worker(w.id)
  ),
  flagged as (
    select ws.worker_id as wid, ws.skill_id as sid, ws.verified_by, ws.verified_at, r.subject
      from public.worker_skills ws
      join req r on r.wid = ws.worker_id
     where ws.verified is true
       and ws.skill_id is not null
  ),
  live as (
    select e.id as eid, e.worker_id as wid, r.subject
      from public.journal_entries e
      join req r on r.wid = e.worker_id
     where e.deleted_at is null
       and e.superseded_by is null
       -- counted once: a corrected original is replaced by its live correction
       and not exists (
         select 1 from public.journal_entries c
          where c.correction_of = e.id
            and c.deleted_at is null
            and c.superseded_by is null)
  ),
  decisions as (
    -- recognised, employer-basis, independent decisions on live entries
    select c.entry_id, c.id as cid, c.created_at, c.confirmation_scope, l.wid,
           case
             when c.confirmation_scope ->> 'decision' in ('approved', 'rejected', 'changes_requested')
               then c.confirmation_scope ->> 'decision'
             when c.confirmation_scope ->> 'action' = 'confirm'         then 'approved'
             when c.confirmation_scope ->> 'action' = 'reject'          then 'rejected'
             when c.confirmation_scope ->> 'action' = 'request_changes' then 'changes_requested'
             else null
           end as decision
      from public.journal_entry_confirmations c
      join live l on l.eid = c.entry_id
     where coalesce(c.confirmation_scope #>> '{authority,basis}', '') <> 'counterparty'
       and (l.subject is null or c.confirmer_id is distinct from l.subject)
  ),
  latest as (
    select distinct on (d.entry_id) d.entry_id, d.wid, d.decision
      from decisions d
     where d.decision is not null
     order by d.entry_id, d.created_at desc, d.cid desc
  ),
  confirmed as (
    select l.entry_id, l.wid from latest l where l.decision = 'approved'
  ),
  standing as (
    -- (a) the confirmed entry is linked to the skill; dated by each
    --     independent approval of that entry
    select k.wid, jes.skill_id as sid, d.created_at as approved_at
      from confirmed k
      join public.journal_entry_skills jes on jes.journal_entry_id = k.entry_id
      join decisions d on d.entry_id = k.entry_id and d.decision = 'approved'
    union
    -- (b) an independent approving decision on the confirmed entry named it
    select k.wid, (s.v)::uuid as sid, d.created_at as approved_at
      from confirmed k
      join decisions d on d.entry_id = k.entry_id and d.decision = 'approved'
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(d.confirmation_scope -> 'skills_confirmed') = 'array'
             then d.confirmation_scope -> 'skills_confirmed'
             else '[]'::jsonb end) as s(v)
     where s.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select f.wid, f.sid,
         case
           when f.subject is not null and f.verified_by = f.subject then
             case
               when f.verified_at is not null
                and exists (select 1 from standing s
                             where s.wid = f.wid and s.sid = f.sid
                               and s.approved_at > f.verified_at)
                 then 'standing'
               else 'self_confirmed'
             end
           when exists (select 1 from standing s where s.wid = f.wid and s.sid = f.sid) then 'standing'
           else 'withdrawn'
         end::text
    from flagged f;
end $$;

revoke all on function public.worker_skill_confirmations_standing_v1(uuid[]) from public, anon;
grant execute on function public.worker_skill_confirmations_standing_v1(uuid[]) to authenticated;

comment on function public.worker_skill_confirmations_standing_v1(uuid[]) is
  'Skill confirmation withdrawal (phase B): per verified worker_skills row of each requested worker the caller can already see (can_view_worker), whether the confirmation still stands (standing / withdrawn / self_confirmed). Read-only; writes nothing; creates no confirmation. Rule mirrors apps/web/lib/evidence/skill-confirmation-standing.ts.';

commit;
