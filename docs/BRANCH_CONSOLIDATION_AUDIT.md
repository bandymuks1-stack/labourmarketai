# Branch & Parallel-Work Consolidation Audit
**Date:** 2026-05-30 · **Author:** Claude Code · **Branch:** `audit/cc/branch-consolidation`
**Task:** `docs/tasks/labourmarketai_TASK_02_branch_consolidation_audit.md`
**Method:** read-only git/GitHub forensics against `origin/main` (`1d6a9bd`) and the live prod migration ledger. **No branch was deleted, merged, or force-pushed — every destructive action is queued for DI below.**

---

## TL;DR — the repo is far more coherent than the branch list suggests

The 69-branch list looks like a junk-pile, but the forensics say otherwise. Every remote branch is now accounted for:

| Bucket | Count | What it means |
|---|---|---|
| **Cleanly merged** (ancestor of `main`) | 10 | merged via merge-commit; work is in `main` |
| **Folded** (squash-merged via a merged PR) | 52 | content is in `main`; only the orphaned original commit remains |
| **Genuinely unmerged** | 5 | the only branches that need a real decision |
| Remote total (excl. `main`) | 67 | |

**145 merged PRs** back the merged/folded buckets. The "ahead 1, behind 100+" pattern on most branches is exactly the squash-merge signature: the work landed, the original commit didn't become an ancestor.

**Keystone go/no-go: 🟢 GO** (see §2). The core user loop and the canonical org model exist in **exactly one place — `main`**. Nothing is being built twice in an unmerged branch.

---

## 1. The duplication question (the one that matters), answered with evidence

> *Is the core user loop (signup → onboarding → profile → work journal → manager review → verified proof) or the canonical org model being built in more than one place?*

**No.** Three independent lines of evidence:

**(a) No branch carries a divergent canonical schema.** Every migration file on every branch is already in `main`'s migration set — *except two known unfinished drafts* (below), and **neither touches a canonical table** (`organizations` / `engagement_contexts` / `relationship_types` / `conversations*` / `customer_requests*` / `projects`). Since the org model, messaging, and demand model are schema-defined, and there is no unmerged canonical migration anywhere, **no branch holds a second org/messaging/demand model**. Prod ledger + `main` migrations agree; branches conform.

**(b) The two named suspects are folded, not parallel:**
- `feat/cc/registered-user-core-loop-v1` (merged **PR #44**) — despite the alarming name, its only unique work is the `profiles.profile_text` text-first composer. `main` has `0014_profile_text_column.sql` (applied as ledger `20260524060556`). It does **not** implement the signup→journal→review loop. **Folded.**
- `feat/cc/adaptive-human-centered-os-v1` (merged **PR #35**) — its config layer (`apps/web/lib/config/{roles,activity-types,intents,navigation,feature-availability,suggestion-statuses}.ts`) + product docs are **all present in `main`** (some files are `main`'s *evolved* versions; the branch holds the older 05-23 originals). **Folded and superseded.**

**(c) No second source tree / config / lockfile.** `main` has one `pnpm-lock.yaml`, one `supabase/`, one `apps/web`, one `next.config.ts`/`tsconfig.json`, and two `package.json` (root + `apps/web` — correct monorepo, not duplication). The old pre-monorepo `src/` layout (`src/lib/sample-data.ts`, `src/lib/types.ts`) exists **only on the dead `feat/labourmarketai-foundation-v1` seed branch**, never in `main`.

**Conclusion:** the loop and org model are single-sourced in `main`. The keystone (`feat/cc/membership-engagement-reroute`) can be built **fresh on `main`** — there is nothing to fold first, and no risk of creating a third copy.

---

## 2. Keystone (TASK 01) go/no-go — 🟢 GO

> The loop / canonical org model exists nowhere else as unmerged work — **safe to build** on `main`.

Caveat to carry in (not a blocker): the staged reroute already has its scope + the `projects.organization_id ON DELETE RESTRICT` constraint recorded in `TASKS.md` and `CONVERGENCE_CHANGELOG.md`. Build there; do not start a new "core-loop" branch family.

---

## 3. The 5 genuinely-unmerged branches (the only real decisions)

| Branch | Date | What it is | Recommendation |
|---|---|---|---|
| **`feat/cc/automerge-safety-envelope`** | 05-30 | The auto-merge safety envelope (open **draft PR #154**). Active, mine. | **KEEP** — lands via #154 once DI sets the one-time toggles. |
| **`feat/sr1-tier2-schema-draft-v1`** | 05-26 | Open **draft PR #81**. Carries unmerged migration `0022_organization_tier2.sql` (Tier-2 org fields: registration_code, address, representatives, countries). **Additive extension** of the canonical org model, never applied (`main` has no `0022`). | **ESCALATE → DI.** RED (DB). Decide finish-and-apply vs retire. Tracked as SR-1 in `TASKS.md`. Not a duplicate — an unfinished extension. |
| **`feat/cc/pr10b-0014-hardening-implementation`** | 05-22 | No PR. Carries unmerged `0014_journal_security_hardening.sql` (a **second `0014`**, colliding with `main`'s real `0014_profile_text_column`). The PR #10b journal-security delta — spec-only, never applied. | **ESCALATE → DI.** RED (DB). Decide finish (rename to §16 timestamp, the number is taken) vs retire. Tracked as PR #10b in `TASKS.md`. |
| **`docs/cc/post-pr26-wow-handoff`** | 05-22 | No PR. A stale docs/handoff draft (83 lines), superseded by everything since. | **RETIRE (gated)** — docs-only, no unique value; confirm then delete. |
| **`feat/labourmarketai-foundation-v1`** | 05-19 | The original seed (PR #1 era): premium landing v1–v6 + the **pre-monorepo `src/` layout**. Entirely superseded by the `apps/web` restructure and the current landing. | **RETIRE (gated)** — historical seed, no unique value remaining. |

Nothing here re-implements the loop, auth, or the org model. Two are unfinished **schema extensions** (gated, DI call); two are stale (retire); one is the active envelope.

---

## 4. Local clutter (known, not mystery)

- **137 local branches** and **22 git worktrees** (`labourmarketai-*-wt/` sibling dirs), each holding a mostly-**folded** branch (e.g. `-cw-wt` = `company-workers` = PR #102 merged; the `visual-*`, `stage2-*`, `p0-*` worktrees are all merged PRs). These are the **concurrency mechanism** behind the mid-slice merge races seen earlier — and they're clutter, not unknowns: each mirrors a remote branch already classified above.
- **Recommendation (gated):** prune the worktrees whose branch is merged/folded, then delete the corresponding local branches. ⚠️ Worktree removal must de-junction `node_modules` first or `git worktree remove` errors (known repo gotcha). Do this as a single supervised batch, not piecemeal.

---

## 5. Recommended convergence actions (all branch deletions are GATED — DI approval required)

**A. Retire the 62 merged/folded remote branches** (10 in-main + 52 folded — full list in the Appendix, each with its PR#). These are 100% in `main`; deleting the remote branches loses nothing. *Proposed as one batch for DI sign-off.* I did **not** delete them (guardrail: "a branch you can't prove is fully redundant is not yours to delete" — these are proven redundant, but deletion is still gated).

**B. Escalate the 2 unmerged schema drafts to DI** (`sr1-tier2-schema-draft-v1` / `0022`, `pr10b-0014-hardening-implementation` / `0014`): finish-and-apply (via MCP, after review — RED) or retire. Both are additive extensions, not duplicates.

**C. Retire the 2 stale branches** (`post-pr26-wow-handoff`, `labourmarketai-foundation-v1`) after DI confirms no keepsake value.

**D. Keep `feat/cc/automerge-safety-envelope`** (PR #154) — it lands normally.

**E. Prune the 22 worktrees + 137 local branches** as a supervised batch (§4 gotcha applies).

**F. Build the keystone on `main`** — green light.

**Obviously-safe consolidation done in this pass:** the map itself + this report (the actual deliverable). No destructive step was taken; all are queued above per the guardrails.

---

## Appendix — full branch ledger

### Cleanly merged into `main` (ancestor; retire, gated)
dev · feat/cc/converge-single-product · feat/cc/manager-review-evidence-result-v1 · feat/cc/sales-core-nonstop-v1 · feat/cc/sales-offer-pilot-workflow-v1 · feat/cc/worker-invitation-accept-v1 · feat/journal-review-enable-toggle-v1 · fix/cc/dashboard-chain-actions-company-branch-v1 · fix/cc/dashboard-chain-reachability-v1 · fix/cc/dashboard-force-dynamic-cta-top-v1

### Folded via merged PR (squash-merged; content in `main`; retire, gated)
PR#42 chore/cc/production-smoke-evidence-pr41 · PR#77 claude/labourmarket-sales-readiness-b8cdb · PR#33 docs/cc/repo-cleanup-after-pr31 · **PR#35 feat/cc/adaptive-human-centered-os-v1** · PR#92 feat/cc/agency-card-slice4 · PR#37 feat/cc/catalogue-driven-primary-nav-v1 · PR#102 feat/cc/company-workers · PR#101 feat/cc/customer-partial-to-start · PR#34 feat/cc/first-working-beta-variant-v1 · PR#41 feat/cc/hide-vision-until-owner-smoke-v1 · PR#56 feat/cc/landing-premium-impression-v1 · PR#36 feat/cc/neutral-dashboard-feature-availability-v1 · PR#94 feat/cc/p0-admin-locale-fix · PR#96 feat/cc/p0-constitution-enforcement · PR#97 feat/cc/p0-duplicate-cleanup · PR#93 feat/cc/p0-project-truth · PR#51 feat/cc/pilot-readiness-superadmin · PR#53 feat/cc/pilot-role-dashboards · PR#55 feat/cc/premium-design-v1 · PR#50 feat/cc/profile-max-capability-capture · PR#49 feat/cc/profile-save-state-and-idea-extraction · PR#45 feat/cc/profile-text-to-skill-suggestions-v1 · **PR#44 feat/cc/registered-user-core-loop-v1** · PR#38 feat/cc/role-catalogue-dashboard-surfaces-v1 · PR#95 feat/cc/stage2-activity-setup · PR#99 feat/cc/stage2-agency-worker-link · PR#100 feat/cc/stage2-customer-entity · PR#40 feat/cc/supergrand-vision-os-leap-v1 · PR#39 feat/cc/super-max-cosmo-pilot-readiness-v1 · PR#90 feat/cc/talent-route-visible · PR#91 feat/cc/visual-os-route · PR#88 feat/cc/visual-slice-1-worker-card · PR#89 feat/cc/visual-slice-2-job-demand · PR#83 feat/db-validation-safety-harness-v1 · PR#76 feat/labourmarketai-builder-first-sales-v1 · PR#84 feat/sr1-static-migration-preview-v1 · PR#79 feat/sr2-role-switch-pilot-banner-v1 · PR#80 feat/sr5-honest-pricing-sales-page-v1 · PR#78 feat/sr6-contextual-fit-copy-reframe-v1 · PR#82 feat/tier2-readiness-ui-no-db-v1 · PR#58 fix/account-menu-logout-admin-visibility · PR#57 fix/auth/google-oauth-exchange-failed · PR#59 fix/auth-stability-pkce-logout · PR#52 fix/cc/admin-role-switcher-display · PR#43 fix/cc/auth-session-reentry-registered-user-v1 · PR#48 fix/cc/cv-unify-self-declared · PR#98 fix/cc/p0-header-role-switcher · PR#125 fix/cc/placeholder-always-on-sample · PR#47 fix/cc/profile-text-skills-unify-flow-v2 · PR#63 fix/journal-v3-correction-lifecycle-and-extraction · PR#60 fix/pilot-ready-stability-trust-sprint · PR#121 fix/primary-role-flow-placeholder-cleanup

### Genuinely unmerged (decisions in §3)
feat/cc/automerge-safety-envelope (PR#154 draft, KEEP) · feat/sr1-tier2-schema-draft-v1 (PR#81 draft, 0022, ESCALATE) · feat/cc/pr10b-0014-hardening-implementation (0014, ESCALATE) · docs/cc/post-pr26-wow-handoff (RETIRE) · feat/labourmarketai-foundation-v1 (RETIRE)

*Local branches (137) and worktrees (22) mirror the remote branches above — same classifications apply; prune per §4.*
