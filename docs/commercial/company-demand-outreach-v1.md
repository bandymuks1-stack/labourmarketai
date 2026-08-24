# Company-demand outreach v1 (preserved strategy, 2026-08-24)

Preserved on the master-order hygiene pass when closing **#687** (repeatable
company-demand outreach pipeline, draft-only). The strategy knowledge was not
canonical anywhere on main; it is recorded here as reference, NOT as an
authorization to send anything. Branch `feat/cc/company-demand-outreach-pipeline-v1`
is preserved for the raw draft.

## Reconciliation with the existing policy (binding)

Main already has `apps/web/lib/vacancy-sources/employer-outreach-policy.{ts,test.ts}`,
which governs a **different, narrower** population — employers discovered via
imported public vacancies — under a stricter, guard-backed doctrine: a 30-day
recency floor, **one initial contact ever**, per-company (never per-vacancy),
permanent opt-out, fail-closed. **Where the two overlap, `employer-outreach-policy.ts`
is stricter and WINS.** This document never loosens it.

## The strategy (reference only)

- **Recency bucketing.** Prioritise demand signals ≤6 months old; older signals
  drop down the queue, they are not silently discarded.
- **Dedup ledger.** Name + country dedup so one company is never approached
  twice across signals; the ledger is the source of truth for "already
  contacted".
- **Watchlist vs ready split.** Keep the honest count — e.g. "9 of 117 ready",
  never inflate the ready set to 100%. A signal on the watchlist is not yet a
  contact candidate.
- **Public-source-only harvesting.** Only publicly available company/demand
  information is used; no scraped private contacts.
- **Three owner gates before any send.** No outreach is sent without explicit
  owner approval at each of: (1) the harvested candidate list, (2) the message
  template, (3) the send itself. This pipeline PREPARES; it never dispatches.

## Ownership boundary (master order §15, §4)

Under the current owner direction, **acquisition/outreach is Agentai OS's
responsibility**, not labourmarket.ai's. labourmarket.ai owns product/user/domain
truth and must be *ready to receive* traffic; it does not run the outreach
campaign. This doc is therefore a preserved reference for whichever system owns
outreach, subject to the three owner gates and the stricter
`employer-outreach-policy.ts` wherever they overlap.

## Stale references to refresh (follow-up)

`docs/audits/labourmarketai-current-state-baseline-v1.md` and
`docs/launch/launch-blocker-register-v1.md` carry earlier triage lines pointing
at the #687 draft; both should cross-reference this preserved doc.
