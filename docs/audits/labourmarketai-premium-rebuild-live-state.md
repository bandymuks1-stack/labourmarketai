# LABOURMARKET.AI — PREMIUM REBUILD LIVE STATE

> Canonical continuation file. A new session reads this FIRST, verifies git and
> production state independently, then resumes from **NEXT EXACT ACTION**.
> Never restart the audit from zero.

---

## TIMESTAMP

| | |
|---|---|
| Europe/Vilnius | 2026-07-31 14:10 |
| UTC | 2026-07-31 11:10 |

## REPOSITORY

| | |
|---|---|
| Repo | `bandymuks1-stack/labourmarketai` |
| Canonical path | `C:\Users\Mano\Documents\labourmarketai` |
| Working worktree | `C:\Users\Mano\Documents\lm-unified-wt` (isolated per CLAUDE.md §4) |
| Production | `app.labourmarket.ai` (Vercel, deploys on `main`) |

## BRANCH / COMMIT GRAPH (verified 2026-07-31)

```text
752f8b19  main  ==  origin/main            ← what production runs
   │
   │ 16 commits — unified premium product + landing rebuild
   ▼
edcec2fc  (was the head of PR #925)
   │
   ▼
f3e16015  Goal 3 — market → projects → project evaluation
   │
   ▼
9c7da373  W1 — three dead CTAs + guards that follow the composition
          ==  feat/cc/premium-unified-product-v1  (PR #925 head, pushed)
          ==  feat/cc/goal3-project-evaluation-v1 (pushed, same commit)
```

`main` is **0 ahead / 18 behind**. Strict linear chain, no divergence, no
possible merge conflict. Verified: `git merge-base --is-ancestor edcec2fc
9c7da373` → true.

### Why ONE PR and not the two the master command anticipated

The command permits "a safer equivalent if the actual graph proves it". It does:
the required `quality` check passes **only at the tip**. Merging `edcec2fc`
first would have put a tree with 7 known-failing landing guards onto `main`, and
branch protection requires `quality`. Cherry-picking the fixes backwards onto
the earlier commit would have duplicated commits on two branches. So
`feat/cc/premium-unified-product-v1` was **fast-forwarded** (not force-pushed,
not rebased) to the tip and PR #925 now covers the whole chain.

`feat/cc/goal3-project-evaluation-v1` was pushed unchanged as a second ref to
the same commit, so the Goal 3 lineage is preserved and recoverable. **No third
implementation branch was created.**

## PR / CI / MERGE STATUS

| | |
|---|---|
| PR | **#925** — `feat(product): unified premium workspace — chat-first result surface, Goal 3 market depth, landing repair` |
| State | OPEN, **ready for review** (undrafted 2026-07-31) |
| Head | `9c7da373` |
| Base | `main` |
| Mergeable | MERGEABLE |
| Required checks | `quality`, `migration-safety` (branch protection on `main`) |
| Previous CI | `quality` **FAILURE** at `edcec2fc` — 6 files / 7 tests, ALL landing guards. Confirmed against run `30609842472`; identical to the set fixed by `9c7da373`. |
| Current CI | **running at `9c7da373`** |
| Merge method | **merge commit or rebase — NOT squash.** A squash would collapse 18 commits and orphan the Goal 3 branch's base. |

## PRODUCTION

| | |
|---|---|
| Production SHA | `752f8b19` (= `main`, unchanged) |
| Deployment ID | not yet — no deploy performed this session |
| Vercel | preview built SUCCESS on the PR |

## DEV SERVER OWNERSHIP (master command §4)

| Port | PID | PPID | Started | Checkout | Owner | Decision |
|---:|---:|---:|---|---|---|---|
| 3000 | 1856 | 9736 | 09:24:13 | `lm-unified-wt` | **another active session** (harness warned) | **LEFT RUNNING.** Not mine; §4.6 forbids killing an unknown process for its port. |
| 3400 | 18508 | 24972 | 13:53:14 | `lm-unified-wt` | **this session** | Kept — it is the base URL for local browser proof. Stop before handoff if idle. |

**Recorded hazard:** both servers run against the SAME checkout and therefore
share `.next`. That is the "stale server masks fresh code" case §4 names. The
landing proof was re-run against a **freshly restarted** 3400 after the earlier
instance was killed, so its evidence is against the verified code. Do not start
a third instance on this checkout.

Base URL used for local proof: `http://127.0.0.1:3400`.

## WHAT IS COMPLETE

| Item | State | Proof |
|---|---|---|
| Goal 3 — project evaluation | authenticated-browser proven, LOCAL | `docs/audits/evidence/goal3-project-evaluation/` — 8 scenarios, 5 clean runs, 14 screenshots |
| W1 — audit + landing repair | delivered, LOCAL | `docs/audits/evidence/premium-rebuild-w1/` — 4 scenarios, 3 screenshots |
| Branch integration | pushed, PR ready, CI running | PR #925 @ `9c7da373` |
| Ponytail Improved decision | `ADAPT_RULES_ONLY` — **not installed** | `premium-rebuild-w1/README.md` §2 |

### Checks at `9c7da373` (local)

```text
pnpm -F web test        790 files passed / 0 failed   (was 783 / 6 failed)
pnpm -F web typecheck   clean
pnpm -F web lint        0 errors, 22 warnings (baseline parity)
playwright goal3        8 passed, 5 consecutive clean runs
playwright landing      4 passed
```

## MIGRATIONS / DATA WRITES

- **No migration** in this chain. The features read existing tables.
- Only local writes: `supabase/dev-fixtures.sql` applied to the LOCAL stack, and
  Scenario E's `revoke`/`grant` on the LOCAL database (restored + verified).
- **Zero production writes.**

## KNOWN REMAINING FAILURES

None in the test suite at `9c7da373`.

## OPEN ARCHITECTURAL DEBT (drives W3+)

1. `/dashboard/advanced` — **916-line second dashboard** (Premium Hub). The
   single largest violation still open.
2. **71** authenticated `/dashboard` routes (107 pages total).
3. **Three** navigation systems: `bottom-nav` (5 items), `dashboard-chrome`
   module bar, account menu.
4. `audience-value-sections.tsx` — dead, **not deleted**: no successor, so
   deleting it destroys content. Owner/product decision required.
5. W2, W4–W11 not started.
6. Nothing production-proven yet.

## BLOCKERS

**None requiring owner action.** Merge and deploy are authorized by the master
command §3. The only wait is CI wall-clock.

## COMPLIANCE

```text
billing / purchases / subscriptions:   NONE
destructive production operations:     NONE
migrations applied:                    NONE
force-push:                            NONE  (the branch move was a fast-forward)
global tool installation:              NONE  (Ponytail = ADAPT_RULES_ONLY)
secrets printed:                       NONE
old LABMA project touched:             NO
```

## ROLLBACK

- Pre-merge `main` = `752f8b19`. Revert target if the merge causes production
  regression: `git revert -m 1 <merge-sha>` on `main`, or redeploy the Vercel
  deployment built from `752f8b19`.
- No migration was applied, so **no database rollback is needed**.

---

## NEXT EXACT ACTION

```text
1. gh pr view 925 --json statusCheckRollup   → confirm quality + migration-safety SUCCESS
2. gh pr merge 925 --merge                   → merge commit, NOT squash
3. Wait for the Vercel production deployment of the new main; record SHA + deployment ID
4. Run the authenticated browser proof against production (synthetic account only):
   landing → inline login → /lt/dashboard?result=market → Rotterdam → project → evaluation
5. Record production SHA, deployment ID, screenshots, failed-request and console counts
   into docs/audits/evidence/premium-rebuild/production-smoke.md
6. Then W3: write the /dashboard/advanced capability migration matrix before deleting anything.
```
