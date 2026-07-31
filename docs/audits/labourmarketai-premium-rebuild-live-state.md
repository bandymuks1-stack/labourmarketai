# LABOURMARKET.AI — PREMIUM REBUILD LIVE STATE

> Canonical continuation file. A new session reads this FIRST, verifies git and
> production state independently, then resumes from **NEXT EXACT ACTION**.
> Never restart the audit from zero.

---

## TIMESTAMP

| | |
|---|---|
| Europe/Vilnius | 2026-07-31 18:55 |
| UTC | 2026-07-31 15:55 |

## REPOSITORY

| | |
|---|---|
| Repo | `bandymuks1-stack/labourmarketai` |
| Canonical path | `C:\Users\Mano\Documents\labourmarketai` |
| Working worktree | `C:\Users\Mano\Documents\lm-unified-wt` (isolated per CLAUDE.md §4) |
| Production | `https://labourmarket.ai` — the APEX is canonical; `app.labourmarket.ai` is a legacy host that 301s here. Vercel deploys on `main`. |

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
| State | **MERGED** 2026-07-31 into `main` |
| Head at merge | `9628308b` |
| Base | `main` |
| Mergeable | MERGEABLE |
| Required checks | `quality`, `migration-safety` (branch protection on `main`) |
| Previous CI | `quality` **FAILURE** at `edcec2fc` — 6 files / 7 tests, ALL landing guards. Confirmed against run `30609842472`; identical to the set fixed by `9c7da373`. |
| Final CI | `quality` **SUCCESS**, `migration-safety` **SUCCESS**, mergeState `CLEAN` at `9628308b` |
| Merge method used | **merge commit** — history preserved, all 20 commits intact. Merge SHA `a5b991f4`. |

## PRODUCTION

| | |
|---|---|
| Production SHA | **`3e31a70e`** (was `752f8b19` → `a5b991f4` → `3e31a70e`) |
| Deployment ID | **`5691288750`** — Production, state **success** (prior: `5690792306`) |
| Target | `https://app.labourmarket.ai` |
| Public landing proof | **4/4 PASSED IN PRODUCTION on both deploys** — `premium-rebuild/production-smoke.md` |
| Authenticated proof | **NOT PROVEN in production** — blocked on a synthetic production account |

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
| W1 — audit + landing repair | **PRODUCTION PROVEN** | `premium-rebuild/production-smoke.md` — 4/4 against app.labourmarket.ai |
| Branch integration | **MERGED + DEPLOYED** | PR #925 → `a5b991f4`, deployment `5690792306` |
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
   single largest violation still open. W3 matrix: 28 capabilities,
   **1 MIGRATED** (row 4 — the fake market-map SVG is gone).
2. **71** authenticated `/dashboard` routes (107 pages total).
3. **Three** navigation systems: `bottom-nav` (5 items), `dashboard-chrome`
   module bar, account menu.
4. `audience-value-sections.tsx` — dead, **not deleted**: no successor, so
   deleting it destroys content. Owner/product decision required.
5. W2, W4–W11 not started.
6. The AUTHENTICATED product is not production-proven (public landing is).

## BLOCKERS

**ONE, and it is a genuine credential blocker — not a permission request.**

Authenticated production proof of Goal 3 needs a synthetic PRODUCTION worker
account. `scripts/e2e-mint-session.ts` refuses non-local targets by design, and
this agent may not create accounts or handle credentials. Unblock by either
creating `qa.worker+goal3@…` in production and supplying credentials through the
approved secret path, or authorizing a scoped session-mint for that one
synthetic account.

Everything else proceeds: merge and deploy were authorized by master command §3
and are DONE.

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

## CURRENT STATE — 2026-07-31 18:55 Europe/Vilnius

| | |
|---|---|
| `main` HEAD | `7debb071` (== `origin/main`) |
| Production deployment | `5694282066` — Production, **success**, sha `7debb071` |
| Production URL | `https://labourmarket.ai` (apex, verified live — not the 301 host) |
| PRs merged this session | **#931** (`9519df3c`), **#932** (`7debb071`) |
| Open PRs | none |
| Unit/guard suite | 791 files / 12833 tests PASS |
| W3 e2e | `w3-second-dashboard.spec.ts` — 9/9 PASS (rows 4 + 5) |
| Typecheck / lint | clean |

### Employee beta production gate

`EMPLOYEE_BETA_PRODUCTION_GATE = BLOCKED_BY_OWNER_SECRET_SETUP` — re-probed
2026-07-31 18:00: `PROD_QA_SUPABASE_URL`, `PROD_QA_ANON_KEY`,
`PROD_QA_SERVICE_ROLE_KEY` are all absent from the environment. The harness is
complete and one command away (`pnpm -C apps/web prod-qa:gate`). Reported once;
NOT re-probed on a loop, per CLAUDE.md §2.

**Consequence for W3 production proof, stated rather than papered over:** the
`opportunities` result is authenticated-only, so it cannot be browser-proven in
PRODUCTION until that gate opens. Using a real person's account instead is
forbidden. What IS proven in production for `7debb071`: the apex serves the
deploy, `/lt/dashboard?result=opportunities` correctly redirects an anonymous
visitor to `/lt/auth/login?next=/lt/dashboard` with no result markup leaking,
0 console errors, 0 failed requests. The authenticated render is proven against
the LOCAL acceptance stack (9/9 e2e), and that distinction is deliberate.

### W3 progress

- Row 4 — **MIGRATED** (fake SVG map removed; #927, deployed `3e31a70e`)
- Rows 13, 15 — **VERIFIED**; no independent drop exists, they die with the route
- Row 5 — **ABSORBED** (#932, deployed `7debb071`): `JobRecommendationsCard`
  → the `opportunities` result. Old mount **deleted**; both halves guard-pinned.
- Row 28 — found, tracked: `/dashboard/market-map` runs a SECOND Leaflet chain
- Remaining: **14 ABSORB rows**. `/dashboard/advanced` still stands.

### CodeQL

24 open alerts, all raised 2026-07-27, none from any W3 or gate branch. Alert
**#9** (`oauth-trace.ts:66`) is READ and answered with a code-path proof — a
zero-argument CSPRNG trace id, flagged by a name heuristic ("auth" inside
"Oauth"), never an auth factor. Documented in `security-scan-triage.md`, and
deliberately **NOT dismissed** in GitHub. 23 remain queued; no P0/P1 found, so
W3 is not blocked.

---

## NEXT EXACT ACTION

```text
1. W3 row 6 — worker invitations (WorkerInvitationsCard), the next smallest
   ABSORB. It is heavier than row 5 in one specific way: it carries a WRITE
   (accept-invitation RPC), so the result needs the outcome states the
   read-only opportunities result did not — linked / already-linked /
   no-invitation / no-worker / error, plus the needs-migration degradation.
   Method, unchanged and proven twice now: build the result state on real data
   with the full idle/loading/empty/partial/error/retry set, prove it in a
   browser at 1440 AND 375, THEN delete the card and repoint its guard so BOTH
   halves are pinned.

2. Row 28 — collapse market-map-live into the canonical MarketMap, finishing
   the collapse market-map.tsx's own header already describes.

3. Then the remaining 12 ABSORB rows in dependency order.

4. Delete /dashboard/advanced only when every row is MIGRATED or
   OBSOLETE-proven, updating surface-registry.ts and route-truth-map.test.ts in
   the same commit.

5. Owner-blocked, not agent-blocked: set the three PROD_QA_* secrets, then run
   `pnpm -C apps/web prod-qa:gate` for G1–G10 and the authenticated production
   proof of rows 4 and 5.
```
