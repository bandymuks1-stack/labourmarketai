# Wagon 1 — Production Viewport & Readability Recovery: verification (2026-07-16)

PR #766 · branch `fix/production-viewport-readability-v1` · UX Recovery Train v1.

## Root cause (audited)
Dashboard shell `<main>` was already `max-w-container` (1440px). The narrow-column
owner screenshots came from **page roots re-constraining themselves** to stock
`max-w-xl…4xl` (448–896px); five pages also stacked their own `px/py` padding on
the shell's. One page-root lived in a component (`WorkerProjectPanel`) and was
caught by adversarial review.

## Fix
- `max-w-content` token (1200px) in `tailwind-preset.ts`.
- 13 page roots + `WorkerProjectPanel` → `mx-auto w-full max-w-content`; duplicate
  padding removed.
- Onboarding `<main>`: `max-w-md → sm:max-w-lg lg:max-w-2xl` (448px strip fix).
- Auth login intentionally stays a centered `max-w-md` card.
- Non-recurrence guard: `apps/web/lib/guards/viewport-page-width.test.ts`
  (CI fails on any new narrow dashboard page root; `journal/voice` allowlisted).

## Verification evidence
1. **Static/unit**: `tsc`, eslint, vitest **10 011 + 3** guard tests, worker-plain-language,
   constitution, `next build` — all green. Compiled CSS ships
   `.max-w-content{max-width:1200px}` (verified in `.next/static/css`).
2. **Authenticated browser proof (local stack)** — `pnpm e2e:local
   tests/e2e/viewport-readability-authenticated.spec.ts`, Supabase local
   (Docker) + `dev-fixtures.sql` users, 2026-07-16:
   - worker routes (opportunities, projects, instructions, gallery): measured
     page-root `getBoundingClientRect().width` **≥ 1000px @1920 and @1440**
     (defect band was ≤896px); **no horizontal overflow @390**;
   - manager routes (candidates, projects): same assertions green;
   - login card measured **≤460px** (intended) with no mobile overflow.
   - Result: **3 passed (1.6m)**. Screenshots archived in the operator artifact
     store (agantai `runtime/audits/labourmarketai/wagon1-viewport-proof/`).
3. **Local-run side observations (NOT Wagon 1 regressions, pre-existing on main)**:
   - `auth.dashboard.wow.pilot.progressHelper` missing in every locale →
     MISSING_MESSAGE logged on each dashboard render (flagged as separate task);
   - `pilot_events` RLS insert failures on the local stack (fixture users lack
     the anon-insert grant path) — local-only noise.

## Migration state at merge time
`20260713190000` (ledger `20260716063308`) and `20260714161000` (ledger
`20260716063515`) applied + verified in prod — see `docs/APPLIED_LEDGER.md`.
