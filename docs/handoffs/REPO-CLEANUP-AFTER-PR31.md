# Repo cleanup — open PRs and dangling branches (post-PR-31)

**Sprint:** "clean up remaining open PRs and dangling work safely"  
**Run date:** 2026-05-23  
**Main at start:** `db73ef1` (PR #31 — fix(beta): post-merge product readiness guardrails)  
**Main at end:** `db73ef1` (no main changes — cleanup-only sprint)

## Why this doc exists

The owner asked for the repo to stop carrying old unfinished PRs and dangling
branches as future confusion. This sprint did the cleanup, then recorded the
inventory and decisions here so the history is searchable later.

This sprint **did not**: touch app code, change DB, run migrations, change
billing / payments / pricing, change deploy / Vercel config, change secrets
or `.env`, change auth flow, merge PR #18, or apply PR #18's migration.

## Open PR inventory at start

| PR | Title | Draft | Risk | Action |
| --- | --- | --- | --- | --- |
| #24 | docs(audit): Public Beta Readiness Audit v1 — conditional go | yes | STALE_DOCS | Closed as superseded |
| #18 | feat(pr10b): 0014 journal security hardening migration | yes | BLOCKED_MIGRATION | Left open + tracking issue + labels |

No other PRs were open at sprint start.

## Action: PR #24 (Option B — close as superseded)

The audit was dated 2026-05-22 against `main @ ecbf8b6`. Its P0 / P1 findings
have since been addressed on `main`:

- **P0.2** (preview counters / scale honesty) → addressed by **PR #25**.
- **P1.1** (non-primary locale rewording on `/for-*`) → partially addressed
  by **PR #25**.
- **P1.2** (empty Discover / Search nav tabs) → addressed by **PR #25**
  (`BottomNav` now points at Profile / Journal — the real surfaces).
- Connected work-identity path, dedup dashboard, multi-direction, broader
  journal → **PR #26**.
- Premium work-identity passport + capability groups + compact language
  selector → **PR #28**.
- Closed Beta GO checkpoint → **PR #29**.
- Text-first / CV-first profile, skills and Work Journal → **PR #30**.
- Post-merge product readiness guardrails (PR #30 production smoke
  checklist, copy polish, confirmed-suggestions foundation) → **PR #31**.

What still remains from the audit:

- **P0.1** — verify `SUPABASE_SERVICE_ROLE_KEY` set in production. Owner /
  env action; never an in-PR fix.
- **Production mobile smoke for PR #30** — still PENDING, owner-only;
  tracked in `docs/evidence/post-merge-production-smoke-pr30.md`.

PR #24 was closed with a supersession comment that points at every PR above
so the audit content stays linked. The PR page itself preserves all 523
lines of audit content on GitHub for reference.

## Action: PR #18 (Option A — keep open, add tracking issue + labels)

PR #18 contains the real Supabase migration
`supabase/migrations/0014_journal_security_hardening.sql` (461 lines):

- Feature-flag lock + seeds (`feature_flags`).
- AFTER INSERT trigger on `journal_entry_confirmations` writing to
  `audit_logs` for both the direct-insert manager path and the new RPCs.
- Reject / revoke ledger — additive `kind` + `reason` on confirmations.
- `journal_entries.original_language` CHECK constraint.
- `proof_of_work` scaffold with RLS default-deny.
- Direct-INSERT compensating controls on `journal_entries`.
- RPCs: `confirm_journal_entry`, `reject_journal_entry`,
  `revoke_entry_confirmation`, `set_entry_visibility`.
- Manual DOWN rollback block in the migration footer.

**Status:** `BLOCKED_MIGRATION`. The PR explicitly says `supabase db reset`
was not run in the source environment. `main` has moved ~12 commits since
the PR was last updated (2026-05-22) and the migration must be re-validated
against the *current* schema before any merge.

Actions taken:

- Created tracking issue
  [#32 — "DB migration review: journal security hardening 0014"](https://github.com/bandymuks1-stack/labourmarketai/issues/32)
  with the full validation / approval checklist (re-inspect against current
  schema, `supabase db reset`, staging-copy DB validation, app-path checks,
  DOWN-block check, no-duplicate-model check, owner approval).
- Added three new labels to the repo and applied them to PR #18 + issue
  #32: `blocked:migration`, `needs-db-validation`, `do-not-merge`.
- Posted a comment on PR #18 stating cleanup status and pointing at #32.
- **Left PR #18 open as the migration reference.** No merge. No
  application. No DB touched. No app change.

## Branch sweep

Branches with merged squash-commits were deleted from the remote. Squash
merges produce new SHAs in `main`, so `git branch --merged main` doesn't
flag them — the mapping was instead taken from
`gh pr list --state merged --json number,headRefName,mergeCommit` and
cross-checked against the live branch list.

### Deleted (20 — all confirmed-merged via a closed PR)

| Branch | PR | Merge commit |
| --- | --- | --- |
| `fix/cc/post-merge-product-readiness-guardrails` | #31 | `db73ef1` |
| `docs/cc/closed-beta-go-checkpoint-v1` | #29 | `eb50c9b` |
| `docs/cc/contextual-fit-signals-doctrine` | #22 | `abd4fd9` |
| `docs/cc/public-beta-readiness-audit-v1` | #24 | n/a (closed, not merged — see Option B above) |
| `feat/cc/auth-unified-onboarding` | #5 | `af957ea` |
| `feat/cc/handoff-template-recovery` | #9 | `ffa3142` |
| `feat/cc/m1-onboarding-mvp` | #8 | `07acdb7` |
| `feat/cc/m1-owner-label-disambiguation` | #16 | `7d59687` |
| `feat/cc/m1-skills-and-fixes` | #6 | `2077805` |
| `feat/cc/m1-work-journal` | #12 | `318348b` |
| `feat/cc/mobile-nav-bottombar` | #3 | `791669c` |
| `feat/cc/pr10-schema-gap-analysis` | #14 | `8a63cae` |
| `feat/cc/pr10b-0014-hardening-spec` | #15 | `4e779da` |
| `feat/cc/pr10b-0014-implementation-command` | #17 | `98efc98` |
| `feat/cc/pr9-universal-arch-docs` | #13 | `cd30446` |
| `feat/cc/schema-inventory` | #10 | `dc8bf7f` |
| `feat/cc/sign-in-with-google` | #4 | `776eb3b` |
| `feat/cc/work-journal-design` | #11 | `2f48253` |
| `feat/cc/wow-beta-constitution-audit` | #19 | `67ee03b` |
| `feat/cc/wow-beta-start-v1` | #20 | `b0cf3f5` |

All deletions used `git push origin --delete <branch>`. No history rewrites,
no force-push.

### Kept (5)

| Branch | Reason |
| --- | --- |
| `main` | Production branch. |
| `feat/cc/pr10b-0014-hardening-implementation` | Backs **open PR #18** (BLOCKED_MIGRATION). Do not delete until the migration review in issue #32 reaches a conclusion. |
| `dev` | Long-lived branch last touched 2026-05-20 (slice 6 magic-link auth + multi-role + marketplace shell + onboarding). Diverges from current `main` in app structure. No backing PR was ever opened. Investigate ownership before any deletion. |
| `feat/labourmarketai-foundation-v1` | Last touched 2026-05-19 ("docs(review): v6 owner-review artifacts + provided visual references"). Looks like an early scaffold branch; no backing PR. Investigate before deletion. |
| `docs/cc/post-pr26-wow-handoff` | Last touched 2026-05-22 ("docs(handoff): prepare post-PR26 work-identity & header WOW UX v1 (not executed)"). Planning doc plus an unexecuted experimental fork of the dashboard routes (`profile/page.tsx`, `journal/page.tsx`, `account/page.tsx`, `design/text-first/*`). PR #30 + #31 effectively shipped the intent of this handoff, but the branch itself was never PR'd; investigate before deletion. |

Per the task safety rule, none of the three unmapped branches were deleted
without explicit owner intent — flagged here for owner decision next sprint.

## Validation on main after cleanup

| Command | Result |
| --- | --- |
| `pnpm -F web typecheck` | OK |
| `pnpm -F web lint` | OK (0 errors / 0 warnings) |
| `pnpm -F web test` | 29 / 29 (5 files, includes 9 product-readiness guards from PR #31) |
| `pnpm -F web build` | OK (all 10 locales prerender) |
| `pnpm -F web placeholders:check` | OK — 173 entries |
| `pnpm check` | n/a — script does not exist in this repo |

## Production smoke status

PR #30 production mobile smoke is still **PENDING**. The owner-followable
checklist lives at `docs/evidence/post-merge-production-smoke-pr30.md`. The
guardrail at `apps/web/lib/guards/product-readiness.test.ts` (added by
PR #31) keeps that file's `Status: PENDING` line stable until the owner
manually flips it after performing the real check.

## Remaining risks

- **PR #18 stays open as draft.** The migration is real and the security
  hardening it brings (audit logs, ledger, feature flags, narrowed RLS,
  RPCs) is genuinely valuable. The longer it sits, the larger the
  re-validation cost. Recommendation: schedule a small "migration review"
  sprint with explicit DB / owner approval before the `main` schema drifts
  further.
- **Three branches (`dev`, `feat/labourmarketai-foundation-v1`,
  `docs/cc/post-pr26-wow-handoff`) were not deleted.** They are not backed
  by an open PR and have no clean mapping to a merged commit, so deleting
  them without confirming owner intent is unsafe. Each is documented above.
  Owner action: confirm whether any of them carry useful in-flight work; if
  not, delete in a follow-up.
- **Production mobile smoke for PR #30 is still PENDING.** Owner-only
  action; cannot be performed by an agent against the live Supabase
  project.

## Recommended next step

1. Owner: run the production mobile smoke checklist for PR #30 against the
   live deploy of `db73ef1`. Flip the status block when done.
2. Owner: decide on `dev` / `feat/labourmarketai-foundation-v1` /
   `docs/cc/post-pr26-wow-handoff` — keep, archive, or delete.
3. Schedule a migration review sprint to either bring PR #18 back to a
   mergeable state against the current schema (per issue #32) or formally
   archive it.
