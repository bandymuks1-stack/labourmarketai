-- @human-gate-approved
-- ============================================================================
-- 20260919100000_roster_writes_rpc_only_v1
-- RED — owner gate (R-1 of the 2026-09-19 completion audit, HIGH).
--
-- A roster relationship may only come into being through the person's own
-- acceptance. Today it can be manufactured.
--
-- Finding: `company_workers_write` (0027) and `agency_workers_write` (0001)
-- are `FOR ALL … using/with check (owns_company(...) or is_admin())`, and
-- `authenticated` holds insert/update/delete on both tables. The owner of a
-- company or agency can therefore INSERT `{company_id: own, worker_id: any
-- discoverable worker, status: 'active'}` straight through PostgREST — no
-- invitation, no acceptance, no consent. Rolled-back probe on production
-- (2026-09-19, as the real owner of a real company, against the allow-listed
-- QA worker): forged_active_company_worker_rows = 1.
--
-- Why that matters: the forged row is read everywhere as a two-sided fact —
-- `caller_manages_worker` (project assignment, absences, task eligibility),
-- the roster branch of `can_view_worker` (the worker row becomes readable
-- without discoverability consent), and the agency candidate-offer roster
-- check (`worker_not_on_roster` is the only guard). The 2026-09-18 subject-
-- consent trigger protects `organization_people` only.
--
-- The canonical path already exists and is the ONLY writer the product uses:
--   invite  → `invite_company_worker` / `invite_agency_worker`       (SECDEF)
--   accept  → `accept_company_worker_invitation` /
--             `accept_agency_worker_invitation`                     (SECDEF,
--             the caller must BE the invited worker: pending invitation
--             addressed to auth.uid()'s own e-mail)
--   manage  → `assign_*_worker_role`, `set_*_worker_journal_review` (SECDEF,
--             owner-gated, on an EXISTING row)
--   bind    → `accept_invitation_v2` (canonical invitations, SECDEF)
-- No application code writes either table with the caller's own client
-- (grep 2026-09-19: zero `.insert/.update/.upsert/.delete` on them).
--
-- MINIMUM CHANGE: take the direct write privilege away from `authenticated`
-- and drop the two `FOR ALL` write policies. SECURITY DEFINER functions run
-- as their owner and are unaffected; every legitimate path keeps working;
-- reads are untouched (the `_select` policies stay). Nothing is deleted,
-- nothing is backfilled, no row changes.
--
-- What must FAIL after apply (the hostile contract, pinned by
-- apps/web/lib/guards/red-roster-writes-rpc-only.test.ts):
--   • an owner/manager inserts an arbitrary `active` company_workers row
--   • an agency owner inserts an arbitrary `active` agency_workers row
--   • therefore no forged row can unlock project assignment, private roster
--     reads or agency offer authority
-- What must keep PASSING:
--   invitation → the WORKER accepts → row exists → assignment / role /
--   journal-review toggles by the owner → legitimate downstream actions.
--
-- Reversible: the DOWN file restores both grants and both policies verbatim.
-- ============================================================================

begin;

-- 1. The write privilege leaves the API role. Reads stay.
revoke insert, update, delete on public.company_workers from authenticated;
revoke insert, update, delete on public.agency_workers from authenticated;

-- 2. The FOR ALL write policies go with it (no privilege, no policy to
--    misread). Select policies are untouched.
drop policy if exists company_workers_write on public.company_workers;
drop policy if exists agency_workers_write on public.agency_workers;

commit;
