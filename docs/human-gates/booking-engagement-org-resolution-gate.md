# HUMAN GATE — booking→engagement org-first resolution (#1047, the beta P0)

Migration: `supabase/migrations/20260807140000_booking_engagement_org_resolution_v1.sql`
Rollback:  `supabase/rollbacks/20260807140000_booking_engagement_org_resolution_v1.down.sql`
PR: #1047

State: `BOOKING_ENGAGEMENT_ORG_RESOLUTION_APPROVED_APPLY_IN_PROGRESS`

## OWNER DECISION — GIVEN 2026-08-08 (beta stabilization P0 command)

> APPROVE proceeding with #1047 PROVIDED current-code re-verification proves
> that it fixes organization/company resolution without weakening
> authorization, cross-org isolation, booking integrity, or engagement
> ownership.
>
> DO NOT BLINDLY MERGE THE OLD PR.

The condition is the content of this document. The re-verification was run
against post-#1091 main (`523fa9ce`), not carried over from the PR's original
base, and it EXTENDED the original proof with the three cases the owner's
condition names most directly (sibling-company isolation, already-active
idempotency, per-role visibility).

## Checksums the approval binds to

- comment-stripped **EXECUTABLE** sha256
  `da6ae1cd56abc5c382424452ddb5d3a737d429c103032c0e93f78dedeffcd8c2`
  — measured **identical before and after** the `@human-gate-approved` marker
  (the marker is comment-only, and a guard test now pins that property).
- pre-marker migration file sha256
  `3e7b84dccbd472cc69cf96e2b90d641ff73d107a7a24b9423226b657ea699ed7`
- rollback sha256
  `9a171daffdbd4b1c4600de5924d8c9eddf1588332567d3fbd0dc7204e52c0733`
  (restores the applied 20260802150000 W12 body verbatim)

## The P0, reproduced from CURRENT production before any edit

| link in the chain | production value (read-only, 2026-08-08) |
|---|---|
| accepted booking | `88a43ead…`, accepted 2026-08-06, **3 events, 0 engagements** |
| its demand | `02684b8a…`, owner = booking owner (invariant intact) |
| demand's organization | `9e4f4467…` (QA Alfa) — **the stamp the old body never reads** |
| org's canonical company | `legacy_company_id = c2a43118…`, same owner |
| owner's company count | **2** → the applied v3 takes `ambiguous_company` and mints nothing |

Coverage facts that make org-first CORRECT for this database, measured not
assumed: **19 of 19** demands carry `organization_id`; **0** company-type orgs
lack a `legacy_company_id`; **0** dangling pointers — and a dangling pointer is
structurally impossible (`organizations_legacy_company_id_fkey` has no
`ON DELETE` clause, so the referenced company cannot be deleted).

## What the migration changes, and what it provably does not

ONE function body (`respond_booking_request_v3`). Resolution order becomes:

1. demand's `organization_id` → that org's `legacy_company_id` — deterministic
   single-row read, no count, no ordering, no guess;
2. org present but no bound company (team/agency org) → honest `no_company`;
3. NULL-org demand → the applied body's profile-singleton rule **byte-preserved**
   (0 → `no_company`, >1 → `ambiguous_company`, 1 → mint).

Preserved verbatim and re-proven: L1 row lock + status gate + idempotent
replay; L2 per-worker advisory lock and the 23P01 overlap refusal; the L3
EXCLUDE constraint (untouched table object); worker-only authorization; the
engagement idempotency chain. Signature unchanged; no client-supplied
company/org/worker id exists anywhere in it. v1/v2 delegators pick the body up
with no edit. No RLS policy, table grant, or schema object changes.

## Re-verification on record — 39 passed, 0 failed

`scripts/db-proof/booking-engagement-org-resolution.sh` on a throwaway
`postgres:15` container: applies the CURRENT PRODUCTION v3 verbatim, reproduces
the live defect (BEFORE: org-stamped two-company demand → `ambiguous_company`,
nothing minted — the exact `88a43ead` outcome), then applies the migration
verbatim and proves:

| owner-condition | case | result |
|---|---|---|
| fixes resolution | S1: org-stamped, two-company owner → mints **the org's company**, exactly once | PASS |
| booking integrity | S2 replay: `already_recorded`, idempotent, ONE event row | PASS |
| booking integrity | S6: overlap still refused with canonical 23P01, zero overlapping accepted pairs | PASS |
| no weakened auth | S8: non-addressed caller still rejected (42501) | PASS |
| **cross-org isolation** | **S9 (new)**: same owner, demand stamped with the SIBLING org → engagement under **CB**, and **CA receives nothing** | PASS |
| engagement ownership | **S10 (new)**: worker already actively engaged with the resolved company → `already_active`, no second row, still exactly one active pair | PASS |
| engagement ownership | **S11 (new)**: under REAL roles and the REAL 20260723120000 RLS — company owner sees the row, the subject worker sees it, an unrelated profile sees zero, anon is denied at the grant layer | PASS |
| legacy resolvable | S3/S4: NULL-org fallback byte-identical (multi → honest `ambiguous_company`; single → mints) | PASS |
| agency/team | S5: company-less org → honest `no_company`, accept stands | PASS |
| decline | S7: never mints, engagement null | PASS |

Parallel-accept note, stated rather than implied: the L1/L2 lock structure is
byte-preserved and S6 proves the guard operative through the new body; the full
two-session race was proven against this same lock structure by
`booking-atomic-double-booking.sh` (W12) and was not re-run here.

## Success semantics + the silence fix (§6/§7 of the command)

Atomicity **proven by construction and by test**: the engagement insert is in
the SAME transaction as the accept — an insert failure rolls the accept back;
there is no half-state. The residual gap was that a REFUSED mint
(`no_company` / `ambiguous_company`) lives only in the RPC's transient
response. That silence — not the resolution bug — is what cost two days.

Closed in this PR by `lib/booking/engagement-invariant.ts` + a section on
`/dashboard/admin/project-truth`: re-derives, from the rows alone, whether
every accepted booking reached its promised engagement. Classifications:
`engaged` / `covered_active` / `honest_non_mint(reason)` / **VIOLATION**.
Ordinary RLS admin reads (every consulted table carries an `is_admin()` SELECT
arm) — no new SECDEF, no grant change, mutates nothing. 9/9 behavioural guard
cases, mutation-checked: reclassifying the violation state as honest fails 2
tests.

## Migration-safety findings the marker covers (exactly three)

1. `security-definer-function` — redefining the existing SECDEF v3 **is** the fix;
2. `grant-or-revoke` — re-stating the function's own unchanged EXECUTE posture
   after `CREATE OR REPLACE`;
3. `data-dml` — the UPDATE **inside** the function body (the accept itself);
   the migration performs zero statement-level DML at apply time.

## THE APPLY QUESTION

> Approve applying `20260807140000_booking_engagement_org_resolution_v1`
> (executable sha256 `da6ae1cd…cd8c2`) to production `gorgitwvdzxbnaxhrsrw`
> via Supabase MCP `apply_migration`?

**ANSWERED YES** by the owner decision above, its stated condition having been
met and recorded here.

## What this gate does NOT approve

- **No mutation of the historical booking `88a43ead…`.** Applying the new
  function body changes no existing row. Whether that booking should be
  repaired (re-invoking the idempotent replay cannot mint for an
  already-accepted row — repair means a deliberate, separate act) is §13 of
  the command and is presented as its own decision, never smuggled in here.
- No change to agency semantics (company-less orgs still honestly refuse).
- No auto-contact of any user.
