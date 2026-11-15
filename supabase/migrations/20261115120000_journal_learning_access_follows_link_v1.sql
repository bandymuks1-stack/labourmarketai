-- =====================================================================
-- 20261115120000_journal_learning_access_follows_link_v1
--
-- RED by rule: DROP POLICY + CREATE POLICY on public.journal_entries (an RLS
-- policy change). Needs the human gate (draft PR + needs-human-gate); never
-- auto-applied.
-- @human-gate-approved — acknowledgement only: the owner decided the rule
-- (2026-11-15, Lane L) and asked for this RED fix to be PREPARED, not deployed.
-- The PR stays a draft with needs-human-gate and is applied only after the
-- owner approves this exact SQL.
--
-- OWNER DECISION (2026-11-15): when the link between an institution and a
-- student ends, the institution must NOT keep access to the student's work
-- journal. Records the institution lawfully created itself may be kept as the
-- applicable rules require; new access to a personal journal needs a separate
-- valid legal basis and matching access rights.
--
-- THE RULE BEFORE (0013_work_journal_m1, unchanged since): a manager of the
-- entry's engagement organization reads the entry, whatever the engagement's
-- status, relationship or review switch.
--
-- THE RULE AFTER. Unchanged for the person themselves, for platform admins,
-- and for every relationship outside the `education` category (employee,
-- collaborator, owner, manager, …): employer review, confirmation, hours and
-- reports keep reading exactly what they read today. For a LEARNING
-- relationship (relationship_types.category = 'education': today `student`
-- and `intern`) an organization manager reads the entry only while
--   · the engagement is `active`, AND
--   · journal review is switched on for that engagement
--     (engagement_contexts.journal_review_enabled — the existing audited
--     door set_engagement_journal_review).
-- This is what the education workspace already says to the institution:
-- "you see participation, not their journals". Ending the link (status
-- 'ended') or pausing it closes the read at once; nothing is deleted.
--
-- The rule is DATA (relationship_types.category), never a slug literal: a
-- future learning relationship (apprentice, trainee) follows it without a
-- migration. Written fail-closed: a manager read passes only when the
-- relationship row is found and is not `education`, or the learning
-- conditions hold.
--
-- WHAT STAYS READABLE, through its own table and unchanged:
--   · journal_entry_confirmations the confirmer created
--     (confirmer_id = auth.uid());
--   · recognitions and other records the organization itself created.
-- Child tables that reach the entry through `exists (… journal_entries …)`
-- (metrics, confirmations seen by other managers, photos) follow this policy
-- automatically, because RLS applies inside those sub-selects.
--
-- No table, column, function, grant or data change. One policy replaced.
--
-- ROLLBACK: supabase/rollbacks/20261115120000_journal_learning_access_follows_link_v1.down.sql
-- restores the 0013 policy text exactly.
-- =====================================================================

begin;

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

commit;

-- ROLLBACK (manual — copy-paste; same as the .down.sql file):
--   begin;
--   drop policy if exists journal_entries_select on public.journal_entries;
--   create policy journal_entries_select on public.journal_entries for select
--     using (
--       owns_worker(worker_id)
--       or is_admin()
--       or exists (
--         select 1 from public.engagement_contexts ec
--          where ec.id = journal_entries.engagement_context_id
--            and manages_organization(ec.organization_id)
--       )
--     );
--   commit;
