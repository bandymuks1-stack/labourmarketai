# Owner migration decision package — 2026-08-31 (M1 + M2 + M3)

**One consolidated decision, three production defects, two artifacts.**
Everything below is already engineered, tested and shipped UNAPPLIED — the
only missing input is the owner's OK. Nothing here may be applied
autonomously (RED / human-gate class). Order matters and is stated.

Source of truth for the defect evidence:
[`CAPABILITY_INVENTORY.md` §5.2](../CAPABILITY_INVENTORY.md) findings M1–M3,
[`APPLIED_LEDGER.md`](../APPLIED_LEDGER.md) (A1 entry + timesheet zero-hours
entry).

---

## Item 1 — `20260808150000_caller_manages_worker_engagements_v1.sql` (fixes M1 AND M2)

- **WHY:** two production journeys are broken today.
  - **M1:** `caller_manages_worker()` checks roster tables only
    (`company_workers` + `agency_workers`), so an employer whose relationship
    was minted by an ACCEPTED BOOKING (`company_worker_engagements`, the
    canonical #1047 org-first path) cannot see or approve that worker's
    absence requests. `/dashboard/absences` → "Requests to review" renders
    empty; `review_worker_absence_v1` refuses even with a known id.
  - **M2:** the applied W11 migration `20260804120000_project_lifecycle_v1`
    re-issued `assign_worker_to_project` from a pre-engagement ancestor and
    silently dropped the `caller_has_booking_engagement_for_project`
    OR-branch. Confirmed against prod catalog 2026-08-08: the helper has ZERO
    callers. The accepted-booking → project-assignment bridge is broken in
    both directions.
- **EXACT BEHAVIOR FIXED:** three function bodies, nothing else.
  1. NEW `caller_manages_worker_by_roster(uuid)` — current roster-only body
     verbatim under an honest name.
  2. `caller_manages_worker(uuid)` → roster OR an ACTIVE, ATTACHED
     (`worker_id is not null`) engagement of a company the caller OWNS
     (`owns_company`; `manages_organization` deliberately NOT admitted).
  3. `assign_worker_to_project(text,text)` → restores the engagement
     OR-branch AND pins its roster clause to `by_roster` — required so an
     engagement with company C1 can never reach sibling company C2's project
     (the 2026-07-23 owner decision, proven still closed). W11
     completed-project guard preserved verbatim, still checked AFTER
     authorization.
- **DATA / RLS IMPACT:** **NO table, column, index, constraint, trigger,
  policy or grant added or changed; ZERO DML at apply time.** All three
  functions keep signatures, SECURITY DEFINER, pinned `search_path`,
  authenticated-only EXECUTE (PUBLIC + anon revoked). Enumerated blast
  radius of the predicate widening: the absence RLS policy + review RPC (the
  intended fix) and the `worker_absence_scheduling` view (an engaged
  worker's approved unavailability becomes visible to the ENGAGING employer —
  scheduling columns only; the view carries no `note` / `absence_type`, so
  the W12 privacy narrowing is untouched).
- **ROLLBACK:** `supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql`
  — restores both pre-change bodies; re-apply proven clean.
- **TEST EVIDENCE:** `scripts/db-proof/a1-caller-manages-worker-engagements.sh`
  — **48/48 on a throwaway Postgres 15**, executing migration + rollback
  VERBATIM: both defects reproduced before, fixed after; unrelated / ended /
  detached / anon still see nothing; worker self-visibility byte-identical;
  roster path unchanged; the sibling-company trap proven closed. Guard:
  `apps/web/lib/guards/caller-manages-worker-engagements.test.ts`.
- **DEPENDENCIES:** none unapplied. Verified 2026-08-31: no migration after
  `20260808150000` re-issues any of the three functions (later files only
  reference them), so the fix is NOT stale against current prod.
- **STALENESS CAVEAT FOR THE APPLIER:** the 48/48 proof and the prod catalog
  confirmation are dated 2026-08-08. Before applying, re-run the read-only
  catalog check (does `assign_worker_to_project.prosrc` still lack the
  helper?) — 30 seconds, and the proof script can be re-run as-is.

## Item 2 — PR #1344 `20260829140000_work_hour_allocations_v1.sql` (fixes M3's missing primitive)

- **WHY (M3):** organization timesheets compute ZERO hours in production and
  always will: 6 of 7 journal time rows hang off org-less engagement
  contexts, and `timesheet_compute_lines_v1` scopes on
  `ec.organization_id`. The deeper cause is structural — main has NO
  row-level work-hour fact for an organization to aggregate. PR #1344 adds
  the canonical `work_hour_allocations` primitive (+ the `/dashboard/hours`
  surface and allocation module on its branch).
- **EXACT BEHAVIOR FIXED:** managers/workers can record per-day allocated
  hours against org contexts; timesheets gain a real source. (Full scope in
  the PR body — the PR is the review unit here, not just the migration.)
- **DATA / RLS IMPACT:** new table + policies (additive); see the exact SQL
  in the PR diff. RED because it is a new authorization surface.
- **ROLLBACK:** `supabase/rollbacks/20260829140000_work_hour_allocations_v1.down.sql`
  ships in the same PR.
- **TEST EVIDENCE:** carried in PR #1344 (draft). Review before merge.
- **DEPENDENCIES:** independent of Item 1. The PR must be REVIEWED + MERGED
  first (it is a DRAFT with `needs-human-gate`), then applied.

## Recommended order

1. **Item 1 now** — smallest possible surface (3 function bodies, zero DML),
   fixes two P0 journeys at once, rollback proven. Apply via Supabase MCP
   `apply_migration` (never `db push`), then verify with the read-only
   checks the ledger entry names.
2. **Item 2 after review** — a real new primitive; review the PR, merge,
   apply, then re-run a timesheet against a real allocation.

Items are independent — approving Item 1 alone already unblocks
EMPLOYER_READY for engagement-based employers (absences + project
assignment). M3 remains P1 (fails honestly empty) until Item 2 lands.

## Explicitly NOT in this package (unchanged existing gates)

#1355 ESCO linkage · #1305 LMC compensate-spend · AI `AI_PROVIDER_MODE` env ·
email channel env (`INVITE_EMAIL_*` + SMTP) · LinkedIn/Meta provider apps.
