-- @human-gate-approved
--
-- SAFETY CLASS: RED (new SECURITY DEFINER function + explicit GRANT/REVOKE; it
-- writes worker_skills.confidence_score / confidence_bin, a pipeline-only trust
-- surface). OWNER DECISION R-5 (given in chat, 2026-10-08): manager approval of
-- work MUST be able to raise skill confidence when the approved work supports
-- that skill; fix with the NARROWEST SECURITY DEFINER authority. The marker
-- above is the risk ACKNOWLEDGEMENT the static gate reads, not self-approval.
--
-- 20261008120000 - MANAGER APPROVAL RAISES SKILL CONFIDENCE (R-5)
--
-- THE DEFECT: applyApprovalSkillEffects -> recomputeProfessionSkills ran
-- `update worker_skills set confidence_*` under the manager's own RLS. The
-- write policy is `owns_worker(worker_id) or is_admin()`, so for a manager the
-- statement matched ZERO rows and PostgREST reported no error. Production
-- evidence: 0 of 87 worker_skills rows have confidence_score > 0.
--
-- WHAT THIS ADDS: one function,
--   public.recompute_worker_skill_confidence_from_manager_approval_v1(entry)
-- It is NOT a general writer. It:
--   * authorises ONLY the entry's EMPLOYER reviewer - the same resolver
--     review_journal_entry uses (journal_entry_review_authority_v1, basis =
--     'employer') - and only while that caller's own latest employer-path
--     decision on the entry is an approval. Counterparty (client_accept) is
--     refused: independent acceptance is a different proof concept and does not
--     move confidence. Outsider / the subject themself / anon: refused.
--   * derives the skills ONLY from journal_entry_skills rows of that entry,
--     and only worker_skills rows that already exist (never inserts a skill).
--   * computes a deterministic, BOUNDED score from the DISTINCT set of
--     effectively-approved live entries linked to the skill:
--         score = least(27, 3 * distinct_approved_entries)
--     Recomputed from the set, never incremented; a second reviewer approving
--     the SAME entry, or the same reviewer again, changes nothing. No recency
--     and no unique-confirmer term (those would compound on the same evidence).
--     The cap is below 30 by design: manager approval alone never reaches the
--     "substantiated" band.
--   * counts an entry only if its skill link existed BEFORE the first effective
--     approval (a worker cannot attach skills to already-approved entries later
--     to lend them confidence), and excludes self-confirmations.
--   * only RAISES (new score must exceed the stored one); touches ONLY
--     confidence_score, confidence_bin and last_recompute_at. NEVER verified /
--     verified_by / verified_at / source / provenance. verified stays flipped
--     only by confirm_entry_and_verify_skills.
--   * search_path pinned; EXECUTE revoked from public and anon.
--
-- Rollback: supabase/rollbacks/20261008120000_manager_approval_skill_confidence_v1.down.sql
-- (a pure function drop; scores already written stay as honest history).

begin;

create or replace function public.recompute_worker_skill_confidence_from_manager_approval_v1(p_entry_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid        uuid := auth.uid();
  v_worker   uuid;
  v_subject  uuid;
  v_auth     jsonb;
  v_last     text;
  v_n        int := 0;
  -- bounded contribution (kept in step with apps/web/lib/journal/manager-approval-confidence.ts)
  c_per_entry constant int := 3;
  c_cap       constant int := 27;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_entry_id is null then return 'entry_not_found'; end if;

  select je.worker_id, w.profile_id
    into v_worker, v_subject
    from public.journal_entries je
    left join public.workers w on w.id = je.worker_id
   where je.id = p_entry_id and je.deleted_at is null and je.superseded_by is null;
  if not found then return 'entry_not_found'; end if;

  v_auth := public.journal_entry_review_authority_v1(p_entry_id, uid);
  if v_auth is null or (v_auth ->> 'basis') is distinct from 'employer' then
    return 'not_authorized';
  end if;

  -- the caller's own latest employer-path decision on this entry must be approval
  select c.confirmation_scope ->> 'action'
    into v_last
    from public.journal_entry_confirmations c
   where c.entry_id = p_entry_id and c.confirmer_id = uid
     and coalesce(c.confirmation_scope #>> '{authority,basis}', 'employer') <> 'counterparty'
   order by c.created_at desc, c.id desc
   limit 1;
  if v_last is distinct from 'confirm' then return 'not_approved_by_caller'; end if;

  perform pg_advisory_xact_lock(hashtextextended('skill-confidence:' || v_worker::text, 0));

  with latest as (
    -- each employer-path confirmer's latest decision per entry
    select distinct on (c.entry_id, c.confirmer_id)
           c.entry_id, c.confirmer_id, c.confirmation_scope ->> 'action' as action
      from public.journal_entry_confirmations c
      join public.journal_entries e on e.id = c.entry_id
     where e.worker_id = v_worker
       and coalesce(c.confirmation_scope #>> '{authority,basis}', 'employer') <> 'counterparty'
     order by c.entry_id, c.confirmer_id, c.created_at desc, c.id desc
  ),
  approved as (
    -- live entries with at least one current employer approval by someone other than the subject
    select e.id as entry_id,
           (select min(c2.created_at)
              from public.journal_entry_confirmations c2
             where c2.entry_id = e.id
               and c2.confirmation_scope ->> 'action' = 'confirm'
               and coalesce(c2.confirmation_scope #>> '{authority,basis}', 'employer') <> 'counterparty'
               and c2.confirmer_id is distinct from v_subject) as first_approved_at
      from public.journal_entries e
     where e.worker_id = v_worker and e.deleted_at is null and e.superseded_by is null
       and exists (select 1 from latest l
                    where l.entry_id = e.id and l.action = 'confirm'
                      and l.confirmer_id is distinct from v_subject)
  ),
  per_skill as (
    select jes.skill_id, count(distinct a.entry_id)::int as n
      from public.journal_entry_skills jes
      join approved a on a.entry_id = jes.journal_entry_id
     where jes.worker_id = v_worker
       and jes.created_at <= a.first_approved_at
       and jes.skill_id in (select s.skill_id from public.journal_entry_skills s
                             where s.journal_entry_id = p_entry_id and s.worker_id = v_worker)
     group by jes.skill_id
  ),
  target as (
    select ps.skill_id, least(c_cap, c_per_entry * ps.n) as score from per_skill ps
  )
  update public.worker_skills ws
     set confidence_score   = t.score,
         confidence_bin     = case when t.score between 1 and 29 then 'green'
                                   when t.score >= 30 then 'yellow'
                                   else ws.confidence_bin end,
         last_recompute_at  = now()
    from target t
   where ws.worker_id = v_worker and ws.skill_id = t.skill_id
     and t.score > ws.confidence_score;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'recompute_skill_confidence_from_manager_approval', 'journal_entries', p_entry_id,
      jsonb_build_object('worker_id', v_worker, 'skills_raised', v_n,
                         'organization_id', v_auth ->> 'party_organization_id'));
  end if;
  return 'raised:' || v_n::text;
end $$;

revoke all on function public.recompute_worker_skill_confidence_from_manager_approval_v1(uuid) from public, anon;
grant execute on function public.recompute_worker_skill_confidence_from_manager_approval_v1(uuid) to authenticated;

comment on function public.recompute_worker_skill_confidence_from_manager_approval_v1(uuid) is
  'R-5: employer approval of an entry raises confidence_score/bin (bounded 3 per entry, cap 27, distinct approved entries, idempotent, raise-only) for the skills that entry is linked to. Never touches verified/source/provenance. Counterparty acceptance does not move it.';

commit;
