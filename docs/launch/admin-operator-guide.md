# Admin / operator guide

## Access (fail-closed)
- All `/{locale}/dashboard/admin/*` pages are gated by a **fail-closed layout**
  that calls `requireSuperadmin` once for the whole subtree. A non-admin is
  redirected to login/dashboard — verified live (`/lt/dashboard/admin` → 307 → login),
  never a 500, never visible to a normal user.
- Admin/telemetry/QA/internal terms never leak into normal user copy (guarded).

## What the owner/admin does manually now (before automation)
- **First-user approval / onboarding** of early people and companies (owner-review).
- **Document verification** and any "verified" status (no auto-verification).
- **Marketplace moderation** (the offer object + moderation queue arrive in later PRs;
  until then, nothing is published unmoderated).
- **Payments**: none. First users are onboarded manually; paid access is not active.

## Admin surfaces (admin-only)
- Operations telemetry, readiness, company verification, language QA, etc. — these
  are intentionally internal and only rendered under the gated admin subtree.

## Rules
- Never expose contacts without permission.
- Never show "verified" without a real check.
- Never promise automatic legal eligibility without documents.
- Never enable live billing in this stage.
