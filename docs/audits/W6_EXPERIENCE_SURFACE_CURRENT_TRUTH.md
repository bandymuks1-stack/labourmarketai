# W6 experience surface — current truth (preservation, 2026-08-24)

Preserved on the master-order hygiene pass when closing **#1048** (W6 stale-header
reconciliation) and **#1049** (W1–W22 matrix recount). Both PRs were stale
against `origin/main` and would have regressed newer content; the two facts
worth keeping are recorded here.

## The W6 experience surface SHIPPED

Main carries the full surface — `apps/web/components/app/experience-{submit-form,
response-form,dispute-form,moderation-panel,counts-block}.tsx`,
`apps/web/components/app/workspace/experiences-result.tsx`,
`apps/web/lib/trust/experience-{records,actions,entry-actions,interaction-token}.ts`,
migration `supabase/migrations/20260802120000_experience_records_v1.sql` (APPLIED),
and four e2e specs `apps/web/tests/e2e/w6-experience-*.spec.ts`.

**Production write proof (the only record of it — `git grep` for these ids on
main returns nothing):** submissions `dce74d70` / `23e52ec7`, response
`caf2e340`; count moved 0 → 1; a duplicate response was refused
(`response_exists`); counts read back `{1,0,0,1}`; an unrelated user saw 0 rows;
anonymous access returned `42501`. The §19 "Fit, ne reitingas" reconciliation
holds — experience records are structured factual accounts, never a person
rating.

## STALE HEADER on main (follow-up code fix, not done here)

`apps/web/lib/trust/experience-eligibility.ts` still opens with
`OWNER_DECISION_GATED — THIS IS A CONTRACT LIBRARY ONLY. No UI, no storage, no
route may render or persist experience records …`. That sentence is now false
of the platform — the surface above shipped through the *other* trust modules.
The `experience-eligibility` contract library itself genuinely still has **no
importers** (its zero-consumer pin in `experience-eligibility.test.ts` stays
valid), so the header is stale only in what it claims about the *platform*, not
about this file's own use. Retire the sentence *with a dated citation* in a
follow-up code PR (never silently delete a gate); this doc is that citation.

## Matrix fact (from #1049)

The W6 row of `docs/program/W1_W22_CURRENT_STATE_MATRIX.md` should read **DONE /
production-proven**, not "write proof in flight … run the approved PROD_QA
journey". Relatedly, the **PROD_QA Alfa account IS verified in production** (org
`9e4f4467…` → company `c2a43118…`, `verification_status='verified'`), so
"admin-verify Alfa" is not an outstanding owner gate. Queue item 2 of
`docs/program/SEQUENTIAL_W_EXECUTION_TRAIN.md` should be refreshed to match.

## Methodology lesson (preserved)

The pinned-worktree-vs-shared-main-tree audit lesson from #1048: audit against
the tree the guards actually run on, not a stale worktree — a review that reads
an old checkout can "confirm" a gate that main has already resolved.
