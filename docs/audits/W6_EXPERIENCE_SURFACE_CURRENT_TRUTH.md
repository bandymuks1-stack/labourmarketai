# W6 experience surface — current truth (preservation, 2026-08-24)

Preserved on the master-order hygiene pass when closing **#1048** (W6 stale-header
reconciliation) and **#1049** (W1–W22 matrix recount). Both PRs were stale
against `origin/main` and would have regressed newer content; the facts worth
keeping are recorded here at outcome level. Detailed production evidence lives in
the private Internal Brain (AGENTS.md) — not here.

## The W6 experience surface SHIPPED

Main carries the full surface — `apps/web/components/app/experience-{submit-form,
response-form,dispute-form,moderation-panel,counts-block}.tsx`,
`apps/web/components/app/workspace/experiences-result.tsx`,
`apps/web/lib/trust/experience-{records,actions,entry-actions,interaction-token}.ts`,
migration `supabase/migrations/20260802120000_experience_records_v1.sql`, and
four e2e specs `apps/web/tests/e2e/w6-experience-*.spec.ts`.

**Production behaviour is proven** (outcome level; row-level evidence is in the
Internal Brain): real experience records exist in production, a duplicate
response is refused, RLS isolates records to their parties, and anonymous access
is denied. The §19 "Fit, ne reitingas" reconciliation holds — experience records
are structured factual accounts, never a person rating.

## STALE HEADER on main (follow-up code fix, not done here)

`apps/web/lib/trust/experience-eligibility.ts` still opens with
`OWNER_DECISION_GATED — THIS IS A CONTRACT LIBRARY ONLY. No UI, no storage, no
route may render or persist experience records …`. That **platform-level** claim
is now false — the surface above shipped through the other trust modules.

Precise correction (per review): this contract library is **not dead code** — it
is imported and executed by sibling `lib/trust` modules (e.g.
`experience-entry.ts` uses `deriveReviewEligibility`; `experience-records.ts` and
`experience-interaction-token.ts` also import runtime values from it). What is
true is the narrower fact the guard `experience-eligibility.test.ts` proves: no
**direct UI import** from `app/` or `components/`. So the header is stale in what
it asserts about the *platform*, while the module remains a live contract used by
the trust layer. Retire the stale sentence *with a dated citation* in a follow-up
code PR (never silently delete a gate); this doc is that citation.

## Matrix fact (from #1049)

The W6 row of `docs/program/W1_W22_CURRENT_STATE_MATRIX.md` should read **DONE /
production-proven**, not "write proof in flight". Relatedly, the PROD_QA account
is provisioned and verified in production, so "admin-verify Alfa" is not an
outstanding owner gate. Queue item 2 of
`docs/program/SEQUENTIAL_W_EXECUTION_TRAIN.md` should be refreshed to match.

## Methodology lesson (preserved)

Audit against the tree the guards actually run on, not a stale worktree — a
review reading an old checkout can "confirm" a gate that main has already
resolved. (This is why #1048/#1049 needed re-verification rather than merge.)
