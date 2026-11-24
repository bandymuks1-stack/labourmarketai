# LabourMarket.ai — Security model v1

> Draft for owner review — 2026-07-06. Source-grounded against `origin/main`
> @ 7dcef6d. This describes what actually protects the product today, in
> benefit language (what each layer protects FOR the user), plus honest gaps.
> Not legal advice; legal-review items are flagged.

## 1. What we protect, for whom

| Asset | Whose benefit | Protected today by |
|---|---|---|
| Account access | every user | Supabase Auth (password / Google OAuth with PKCE), HTTP-only session cookies via `@supabase/ssr` middleware |
| Profile + work card | worker | RLS: every read/write scoped to `auth.uid()`; server actions derive identity from the session, never from client input |
| Work journal (CV evidence) | worker | profile-keyed RLS + atomic RPC with hash chain (`lib/journal/actions.ts`) — entries cannot be silently rewritten |
| Documents & uploads | worker | Supabase storage with owner-scoped paths + consent flags (`s6_worker_docs_consent`) |
| Messages | both parties | participant-scoped RLS (`chat-visibility-rls` guard); counterpart identity restricted (`message-counterpart-restricted` guard) |
| Company workspace data | company/agency | `getOwnCompany()` session-derived scoping everywhere; build-time contract guard `workspace-scope-isolation.test.ts` |
| Admin surfaces | platform | dual-signal `is_admin()` + `admin-grant-guard` migration; superadmin gates for preview chrome |
| Secrets | platform | server-only env; guards `no-secret-leakage` / `no-provider-secret-leak`; no keys in client bundles |

## 2. Defense layers (verified in code)

1. **Session layer** — Supabase SSR middleware refreshes and validates the
   session on every request; PKCE for OAuth (`auth-stability-pkce-logout`
   guard pins the flow, logout invalidation, and callback route behavior).
2. **Authorization layer** — Postgres RLS on every user table; SECURITY
   DEFINER RPCs are the only writers for cross-cutting operations, each
   pinned by a migration test.
3. **Application layer** — server actions re-derive the caller's identity
   and role per call (`require-role.ts`); role checks never trust the URL
   or client state.
4. **Guard layer** — 500+ vitest guard files pin the contracts above so a
   refactor cannot silently remove a protection (this file's companion:
   `lib/guards/*`).
5. **Human layer** — manual-review-first fraud posture
   (`docs/policies/risk-monitoring-and-fraud-response-v1.md`): no
   auto-suspensions, a human reviews every escalation.

## 3. Honest gaps (as of 2026-07-06)

| Gap | Risk | Planned home |
|---|---|---|
| No MFA offer | account takeover via phished/reused password | `authentication-and-mfa-v1.md` (sequenced plan) |
| No session/device list for users | user can't see or end other sessions | same plan, step 4 |
| No security-event history | user can't see "password changed" etc. | same plan, step 5 |
| No rate limiting beyond Supabase defaults on auth endpoints | credential stuffing slows only at Supabase's layer | evaluate before public launch |
| Notification spine missing | security emails/alerts have no in-product mirror | audit §17.4 owner decision |

## 4. Responsibility split

- **Platform** (us): keep the layers in §2 true, patch dependencies, apply
  migrations safely (rollback files, human gate), never store plaintext
  secrets, honest breach communication (see `incident-response-v1.md`).
- **User**: a strong unique password OR their Google account's protections;
  keeping recovery email access; optionally MFA once offered.
- **Company/admin users**: inviting only real colleagues; reviewing team
  membership; treating exported data with the same care as the product.
- **Legal review needed**: breach-notification wording and timelines
  (`gdpr-readiness-v1.md` §5), pilot terms interaction — owner + lawyer.

An MFA offer strengthens the user's own layer; it does not transfer
platform responsibilities in §2 to the user, and no copy should ever
suggest it does.
