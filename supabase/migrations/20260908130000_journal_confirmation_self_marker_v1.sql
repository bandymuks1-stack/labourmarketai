-- 20260908130000_journal_confirmation_self_marker_v1
--
-- @human-gate-approved
--
-- ── SCOPE OF THE MARKER ───────────────────────────────────────────────────
-- SAFETY CLASS: RED. An additive column plus a SECURITY DEFINER BEFORE INSERT
-- trigger on an append-only evidence table. Apply ONLY via Supabase MCP
-- `apply_migration` after explicit owner approval. Never `supabase db push`.
--
-- The owner approved the IMPLEMENTATION of EVID-2 on 2026-09-08 and stopped
-- short of the apply. The marker is the doctrine RISK ACKNOWLEDGEMENT that
-- lets a deliberate RED file pass the static gate.
-- IT IS NOT AN APPROVAL TO APPLY. This ships UNAPPLIED.
--
-- ── WHAT IS ACTUALLY WRONG, MEASURED ON PRODUCTION 2026-09-08 ─────────────
--
--   journal_entry_confirmations                    13 rows
--   ...of which the confirmer IS the entry's worker  3 rows
--   confirmer_role on all 13                       'owner'
--
-- The stored row cannot tell the two apart. Self-ness is only derivable by
-- joining journal_entries -> workers.profile_id back to confirmer_id, which
-- means every reader has to remember to do it, and the CV export did not
-- (fixed separately, read-side, no migration).
--
-- ── WHY THIS RECORDS THE FACT INSTEAD OF FORBIDDING THE ACT ───────────────
--
-- The obvious move is to refuse a self-confirmation outright. That would be
-- WRONG here, and production says so: all three self-confirmed rows carry
-- confirmer_role='owner' — an owner-operator confirming their own work. A
-- sole trader who is simultaneously the company and the worker is a real and
-- legitimate user of this product, not an abuse to be blocked. Refusing the
-- insert would break them and would delete a true fact about work that
-- happened.
--
-- SEP-3 (EVIDENCE != VERIFICATION) does not require that self-confirmation be
-- impossible. It requires that it never be MISTAKEN for somebody else's word.
-- So the database records which one it is, and the read layer labels it.
--
-- ── WHY THE COLUMN IS NULLABLE, AND WHY THAT MATTERS ──────────────────────
--
-- `self_confirmed boolean` with NO DEFAULT and NO backfill.
--
-- A `default false` would have written FALSE onto the three existing
-- self-confirmed rows — a silent reclassification of real evidence, and the
-- exact thing the owner forbade ("netrink ir tyliai neperklasifikuok").
--
-- NULL therefore means NOT RECORDED AT WRITE TIME, and that is the honest
-- state of all 13 legacy rows. It is SEP-7 held in a column:
-- UNKNOWN != FALSE. A reader must treat NULL as "derive it, or say you do not
-- know" — never as "not a self-confirmation".
--
-- Backfilling the three rows from the join is a DATA CHANGE to existing
-- evidence and is deliberately NOT in this migration. It is presented as its
-- own owner decision (see docs/launch/OWNER_GATE_PACKETS_2026-09-08.md).
--
-- ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
--
-- No existing row is read, written, deleted or reclassified. No policy, no
-- grant, no other column, no RPC signature changes. The append-only posture is
-- untouched: there is still no UPDATE and no DELETE policy on this table, and
-- this migration adds neither.
--
-- ── NOT VERIFIED AGAINST A LIVE APPLY ─────────────────────────────────────
--
-- Stated plainly: this file has NOT been applied or trial-applied. The DEFECT
-- is production-measured (13 rows, 3 self-confirmed, all role='owner'); the
-- REPAIR is CODE_PROVEN only.
--
-- Rollback:
-- supabase/rollbacks/20260908130000_journal_confirmation_self_marker_v1.down.sql

alter table public.journal_entry_confirmations
  add column if not exists self_confirmed boolean;

comment on column public.journal_entry_confirmations.self_confirmed is
  'Was the confirmer the same person as the entry''s worker? Recorded at write time by journal_entry_confirmation_self_marker(). NULL means NOT RECORDED - the 13 rows that predate this column - and must never be read as false (SEP-7: UNKNOWN != FALSE). Self-confirmation is permitted, because an owner-operator confirming their own work is legitimate; it simply may not be presented as an external party''s confirmation (SEP-3).';

create or replace function public.journal_entry_confirmation_self_marker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Derived from identity, never from confirmer_role: on production every row
  -- carries role='owner' including the self-confirmed ones, so a role-based
  -- rule would pass all three straight through.
  new.self_confirmed := exists (
    select 1
      from public.journal_entries je
      join public.workers w on w.id = je.worker_id
     where je.id = new.entry_id
       and w.profile_id = new.confirmer_id
  );
  return new;
end $$;

comment on function public.journal_entry_confirmation_self_marker() is
  'Stamps journal_entry_confirmations.self_confirmed at INSERT by comparing confirmer_id with the entry worker''s profile_id. SECURITY DEFINER because the confirming manager cannot necessarily read the worker row, and the stamp must not depend on who is inserting.';

-- Distinct from journal_entry_confirmations_guard (staleness). Kept separate so
-- neither trigger's failure mode is entangled with the other's, and named with
-- a `z_` prefix so it runs AFTER the guard: there is no point stamping a row
-- the guard is about to reject.
drop trigger if exists z_journal_entry_confirmation_self_marker
  on public.journal_entry_confirmations;

create trigger z_journal_entry_confirmation_self_marker
  before insert on public.journal_entry_confirmations
  for each row
  execute function public.journal_entry_confirmation_self_marker();
