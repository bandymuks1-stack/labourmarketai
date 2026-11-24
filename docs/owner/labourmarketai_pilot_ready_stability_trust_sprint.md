# Labourmarket.ai — Pilot-Ready Stability + Trust Sprint

## Purpose

Production mostly works, but owner reports it still feels strange and slow. Before adding major features, make the app stable, understandable, fast enough, and trustworthy for pilot use.

Recent state:

- PR #57 merged: safe OAuth diagnostics.
- PR #58 merged: account menu/logout + admin visibility app-layer fix.
- PR #59 merged: logout 303 fix + Google PKCE race fallback.
- Owner admin repair completed: owner profile has active_role='admin' and profile_roles includes admin.
- PR #54 remains open/unmerged.
- PR #18 remains blocked/draft/do-not-merge.

## Objective

Run an audit-first supersprint and fix only high-impact P0/P1 issues blocking trust, speed, auth/session stability, admin stability, profile/skills persistence, and PR #54 readiness.

Do not start a broad redesign or major feature sprint.

## Branch

Create from updated origin/main:

fix/pilot-ready-stability-trust-sprint

If fixes become unrelated, split into smaller PRs:

- fix/auth-session-admin-stability
- fix/profile-skills-persistence
- fix/performance-weirdness-cleanup
- chore/pr54-smoke-readiness-report

## Hard Rules

- Do not merge PR #54 until role smoke passes.
- Do not touch PR #18.
- No DB migrations unless clearly unavoidable; if migration is needed, stop and report first.
- No manual production DB mutation.
- No env/secrets edits.
- No service_role changes.
- No billing/payment/provider changes.
- No destructive git operations.
- No fake AI/matching/verification.
- No data deletion.
- No broad visual redesign.
- No hidden production writes except normal owner-visible app flows during smoke.
- Keep changes small, tested, and evidence-backed.

## Phase 1 — Production Stability Smoke

Verify current production behavior.

Routes:

- https://app.labourmarket.ai/lt/auth/login?next=/lt/dashboard
- https://app.labourmarket.ai/lt/dashboard
- https://app.labourmarket.ai/lt/dashboard/admin
- https://app.labourmarket.ai/lt/dashboard/profile
- https://app.labourmarket.ai/lt/dashboard/account

Check:

1. Google login reaches /lt/dashboard without exchange_failed.
2. Account menu is visible.
3. Logout redirects to /lt/auth/login without 405.
4. Admin badge/link is visible for owner admin.
5. /lt/dashboard/admin opens.
6. Admin badge persists after role switch:
   - Darbuotojas
   - Įmonė
   - Agentūra
   - Pirkėjas
7. Refresh after each role switch does not lose admin state.
8. PR #54 remains unmerged.
9. PR #18 remains blocked/untouched.

If any item fails, fix it first in the smallest branch/commit.

## Phase 2 — Performance and Strange UX Audit

Do not guess. Measure and inspect.

Audit:

- dashboard layout
- role switcher
- account menu
- admin badge loading
- auth/session/profile fetches
- profile page
- profile skills page
- dashboard cards
- server actions
- middleware
- Supabase query patterns
- client rerenders
- loading/success/error states
- swallowed errors

Find:

- duplicate session/profile queries
- repeated Supabase queries on one route
- unnecessary refresh after role switch
- slow SSR paths
- client re-render loops
- blocking queries
- missing loading states
- missing success/error feedback
- stale role/admin state
- links/buttons that look clickable but do nothing
- confusing Lithuanian copy
- catch blocks that hide actionable errors

Create an audit table:

| Issue | Route/component | Impact | Root cause | Fix | Risk | Fixed/deferred |
|---|---|---|---|---|---|---|

## Phase 3 — Small Fixes Only

Allowed fixes:

- reduce duplicate auth/profile fetches
- stabilize admin/account state after role switch
- make role switch feedback clear
- add missing loading/success/error states
- fix broken links/buttons
- fix confusing Lithuanian copy
- fix profile skill save/render persistence if root cause is small
- add focused tests/guards
- improve error handling without exposing secrets/private data

Not allowed:

- whole-dashboard redesign
- new product modules
- fake AI/matching/verification
- pricing/billing changes
- broad DB/schema redesign
- PR #54 merge without smoke

## Phase 4 — Profile / Skills Persistence

Owner previously observed that profile skills/manual skills may not save or render clearly.

Investigate:

- /lt/dashboard/profile
- manual skill add flow
- profile skills form/actions
- self-declared skill claims
- cache/revalidation after save
- Supabase table/API used for saved skills
- RLS by reading existing migrations/types only
- whether save succeeds but UI does not refresh
- whether skill writes to wrong user/profile/role
- whether Lithuanian route/copy breaks save
- whether company skills and worker profile skills are being confused

Expected behavior:

- manually added skill appears immediately after save
- reload keeps the skill
- duplicate skill is not added twice
- user sees clear success/error feedback
- self-declared skill is not shown as verified/confirmed
- data belongs only to the authenticated profile
- profile/CV skills are broad, not construction-only

Tests if fixed:

- manual skill save success
- skill appears after reload
- duplicate handling
- unauthenticated user cannot save
- user cannot write another user’s skills
- no verified/confirmed wording for self-declared skills

## Phase 5 — PR #54 Readiness

After auth/admin/profile basics are stable, check PR #54 again.

Verify:

- mergeStateStatus CLEAN
- checks green
- Supabase preview green
- no service_role exposure
- no public data exposure
- no fake matching/verification
- no billing/payment/env changes

Smoke plan:

Company:

- save private draft
- reload
- edit
- delete

Agency:

- save private draft
- reload
- edit
- delete

Buyer/customer:

- save private draft
- reload
- edit
- delete

Admin:

- read-only pilot metrics
- no unintended write controls
- per-user inspect read-only if implemented

If smoke passes, recommend PR #54 merge.

If smoke cannot be safely run by the agent, stop and give owner a minimal browser checklist.

## Tests / Checks

Run:

```bash
pnpm -F web lint
pnpm -F web typecheck
pnpm -F web test
pnpm -F web build
```

If repo scripts differ, use the existing scripts and report exact commands.

Add focused tests/guards for every fixed bug.

## PR

Open PR or PRs with accurate titles.

Suggested main PR title:

fix(app): stabilize pilot auth roles profile and readiness flows

PR body must include:

- production smoke result
- performance/weirdness audit table
- root causes fixed
- files changed
- tests/checks run
- PR #54 decision
- PR #18 blocked confirmation
- safety proof

## Final Report

Include:

- branch
- commit SHA(s)
- PR URL(s)
- production smoke result
- audit table
- fixed issues
- deferred issues
- files changed
- tests/checks run
- PR #54 merge recommendation or blocker
- PR #18 blocked/untouched confirmation
- safety proof:
  - no DB migration unless explicitly reported
  - no production DB mutation
  - no env/secrets edits
  - no service_role
  - no billing/payment/provider
  - no destructive git
  - no fake AI/matching/verification
- exact owner next action

## Owner Next Action Format

End with one sentence only:

- Merge PR X now
- or Do not merge; fix Y first
- or Run this browser smoke checklist for PR #54
