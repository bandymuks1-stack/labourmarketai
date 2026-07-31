# PRODUCTION SMOKE — 2026-07-31

> **Two production deployments this session.** Both smoke-proven. The second
> table is the current one.

## Deployment 2 (current) — W3 row 4

| | |
|---|---|
| Production SHA | **`3e31a70e`** (merge of PR #927) |
| Deployment ID | **`5691288750`** — Production, state **success** |
| CI at merge | `quality` SUCCESS, `migration-safety` SUCCESS, mergeState `CLEAN` |
| Public landing smoke | **4/4 PASSED** against `https://app.labourmarket.ai` |
| Contents | production evidence for #925, plus W3 row 4 (the fake market-map SVG removed) and the `product-readiness` scan-budget fix |

W3 row 4 is an authenticated surface (`/dashboard/advanced`), so its proof is
LOCAL (2 scenarios, `tests/e2e/w3-second-dashboard.spec.ts`) and remains
unproven in production for the same credential reason recorded below.

---

## Deployment 1 — the premium chain

| | |
|---|---|
| Production SHA | **`a5b991f4`** (merge commit of PR #925) |
| Previous production SHA | `752f8b19` |
| Deployment ID | **`5690792306`** |
| Environment | Production |
| Deployment state | **success** |
| Created | 2026-07-31T11:32:05Z |
| Target | `https://app.labourmarket.ai` |
| Merge method | merge commit — history preserved, all 18 commits intact |

Required checks at merge: `quality` **SUCCESS**, `migration-safety` **SUCCESS**,
mergeState `CLEAN`. CodeQL SUCCESS. No migration in the chain, so no database
change accompanied this deploy.

---

## PUBLIC LANDING — PRODUCTION PROVEN

`tests/e2e/landing-repair.spec.ts` run against `https://app.labourmarket.ai`
(`E2E_BASE_URL=https://app.labourmarket.ai E2E_NO_SERVER=1`).

**4 passed.**

| Scenario | What it proves in production | Result |
|---|---|---|
| the hero's ask is not a silent submit | `aria-busy` flips `false → true → false` and the pending dot appears/disappears | **pass**, 0 console errors |
| an unanswerable question is announced | the unmatched message is visible and carries `role="status"` | **pass** |
| every public nav item goes somewhere real | `Partneriams` is **absent**; `Kaip veikia` navigates to `#how-it-works` and the target is **in viewport** | **pass** |
| the two real entries are reachable | `/auth/signup` and `/company-need` both present on the landing and both resolve `< 400` | **pass** |

These are the three dead-CTA defects from the W1 audit, now proven fixed **in
production**, not locally. Screenshots: `production-landing/`.

This is unauthenticated public-route proof. It is the strongest level available
without a production account, and it covers exactly the surface that
2026-08-01 promotion sends traffic to first.

---

## AUTHENTICATED PRODUCTION PROOF — BLOCKED, CREDENTIAL

Goal 3's authenticated chain (`/lt/dashboard?result=market` → Rotterdam →
project → evaluation) is **proven locally** (8 scenarios, 5 consecutive clean
runs) and is **NOT yet proven in production**.

**Blocker, named precisely:** a synthetic production worker account and its
credentials do not exist and cannot be created by this agent.

- `scripts/e2e-mint-session.ts` refuses any non-local target by design
  (`REFUSED_NON_LOCAL_E2E_SESSION_MINT`) — correctly; it holds a service-role
  key path and must never mint against the cloud project.
- Creating an account or entering credentials is outside what this agent may
  do.
- Using a real user's account for a test is not acceptable.

**What unblocks it (owner action, one of):**

1. create a synthetic production worker account (e.g.
   `qa.worker+goal3@…`) and supply its credentials through the approved secret
   path, **or**
2. authorize a scoped, time-limited service path for minting a session for that
   one synthetic account against production.

Until then the authenticated production claim stays **UNPROVEN** and is not
counted toward any launch gate.

---

## WHAT THIS DEPLOY DID NOT CHANGE

- No migration was applied. `migration-safety` passed and the chain contains no
  new SQL.
- No production data was written.
- No billing, subscription or payment path was touched.
- RLS, authentication and privacy controls are unchanged.

## ROLLBACK

- Revert target: `git revert -m 1 a5b991f4` on `main`, or redeploy the Vercel
  production deployment built from `752f8b19`.
- **No database rollback is required** — nothing schema-level changed.
- Not exercised. `rollback-proof.md` remains NOT YET PRODUCED.

## OPEN AFTER THIS DEPLOY

| Item | Severity | State |
|---|---|---|
| Authenticated production proof of Goal 3 | P1 for the employee gate | blocked on a synthetic production account |
| `/dashboard/advanced` second dashboard | P1 architectural | W3 matrix written, 0 of 27 capabilities migrated |
| `EMPLOYEE_BETA_PRODUCTION_GATE` | — | **NOT ASSESSED** — needs the authenticated path above |
| Accessibility / Lighthouse / security scans | — | not run |
