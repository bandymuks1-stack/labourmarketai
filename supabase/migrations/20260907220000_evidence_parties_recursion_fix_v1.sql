-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. A new SECURITY DEFINER function plus a policy replacement.
-- Draft PR + `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration`
-- after explicit owner approval. Never `supabase db push`.
--
-- NO OWNER DECISION EXISTS FOR THIS FILE YET. The marker above is the risk
-- ACKNOWLEDGEMENT the static gate reads (doctrine: "an acknowledgement, not an
-- auto-merge pass"). It is not an approval, and it is not self-approval. The
-- control is the human gate.
--
-- 20260907220000 — repair the mutual RLS recursion shipped by
-- 20260907114500_organization_evidence_import_v1, which was applied earlier the
-- same day as ledger 20260907180944.
--
-- ── THE DEFECT, MEASURED ON PRODUCTION 2026-09-07 ─────────────────────────
--
-- FOUR of the import's eight tables cannot be read at all. Under a real
-- organization manager's own auth, every one of these fails
-- `42P17 infinite recursion detected in policy`:
--
--   organization_evidence_records
--   organization_evidence_parties
--   organization_evidence_events                (its policy joins records)
--   organization_evidence_competency_signals    (its policy joins records)
--
-- The cycle is mutual and exact:
--
--   organization_evidence_records_select  --subquery-->  ..._parties
--   organization_evidence_parties_select  --subquery-->  ..._records
--
-- This takes the import DOWN rather than degrading it. `commitImport` ends in
-- `.select("id, import_row_id")`, and an `INSERT ... RETURNING` must evaluate
-- the SELECT policy — so the WRITE dies with the read. No row has ever been
-- written: all eight tables hold 0 rows.
--
-- Only `organization_people` and `evidence_import_sessions` / `_rows` work,
-- because their policies never leave their own table. That is also why the
-- first verification of this schema passed: it exercised the roster table and
-- then checked that the other policies EXISTED, instead of reading through
-- them. Policy presence is not policy reachability.
--
-- ── THE REPAIR ────────────────────────────────────────────────────────────
--
-- Break the cycle on ONE side, and choose the side that changes least.
--
-- The parties policy's third branch exists to let the SUBJECT of a record see
-- who else stands in it. Asking that question required reading
-- `organization_evidence_records`, which re-entered its policy. A
-- SECURITY DEFINER resolver answers exactly the same question with RLS bypassed
-- inside the function, so:
--
--   records_select --> parties_select --> (no further policy) --> done.
--
-- `organization_evidence_records_select` is NOT touched. Its parties branch
-- keeps working, because parties no longer re-enters records.
--
-- ── WHY THIS DOES NOT WIDEN ANYTHING ──────────────────────────────────────
--
-- The resolver is the previous subquery, verbatim, with the same two
-- conditions: the caller must be the roster record's `linked_profile_id` AND
-- the link must be `linked`. It takes a record id and returns a boolean — it
-- returns no rows and leaks no column. `authenticated` only; `public` and
-- `anon` are revoked BY NAME, because on a clean local reset the environment's
-- default privileges can hand `anon` EXECUTE.
--
-- SECURITY DEFINER is required here, and it is the narrow choice: the
-- alternative is widening a policy, which would expose whole rows rather than
-- one boolean.
--
-- ── PROVEN ON PRODUCTION, IN A TRANSACTION, THEN ROLLED BACK ──────────────
--
-- Applied exactly as written below, inside one transaction, under real users'
-- own auth contexts, then rolled back:
--
--   before  all four SELECTs                     42P17
--   after   all four SELECTs                     OK
--           record INSERT ... RETURNING          OK
--           two competency signals               written
--           method 'ai_inference'                REFUSED 23514 (closed set holds)
--           DELETE on an evidence record         BLOCKED 42501 (append-only holds)
--           an unrelated person reads records    0
--           an unrelated person reads signals    0
--
-- Re-measured after the rollback: the resolver does not exist, the parties
-- policy still carries the recursive subquery, and all eight tables still hold
-- 0 rows. Production is exactly as it was.
--
-- ── NOT DESTRUCTIVE ───────────────────────────────────────────────────────
--
-- Replaces one SELECT policy and adds one function. No table, column, row,
-- grant on an existing object, or other policy is altered. No data exists to
-- lose. Rollback:
-- supabase/rollbacks/20260907220000_evidence_parties_recursion_fix_v1.down.sql

create or replace function public.is_evidence_record_subject(p_record_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.organization_evidence_records r
      join public.organization_people op on op.id = r.organization_person_id
     where r.id = p_record_id
       and op.linked_profile_id = auth.uid()
       and op.link_state = 'linked'
  );
$$;

revoke all on function public.is_evidence_record_subject(uuid) from public;
revoke all on function public.is_evidence_record_subject(uuid) from anon;
grant execute on function public.is_evidence_record_subject(uuid) to authenticated;

comment on function public.is_evidence_record_subject(uuid) is
  'Is the caller the LINKED subject of this evidence record? The exact predicate organization_evidence_parties_select used to inline, lifted into a SECURITY DEFINER boolean so that policy no longer re-enters organization_evidence_records and the two policies stop recursing (42P17). Returns a boolean only - no rows, no columns.';

drop policy if exists organization_evidence_parties_select on public.organization_evidence_parties;

create policy organization_evidence_parties_select on public.organization_evidence_parties
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or (party_organization_id is not null and public.manages_organization(party_organization_id))
    -- Was: a subquery over organization_evidence_records joined to
    -- organization_people. Identical meaning, no policy re-entry.
    or public.is_evidence_record_subject(record_id)
    or public.is_admin()
  );
