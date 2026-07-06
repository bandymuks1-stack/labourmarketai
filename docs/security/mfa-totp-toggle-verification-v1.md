# LabourMarket.ai — Supabase MFA TOTP Toggle Verification Package v1

> Owner-ready action + verification package — 2026-07-06.
>
> **Status: the TOTP toggle is NOT enabled and MFA is NOT live.** This
> document changes no Supabase settings and implements nothing. It gives the
> owner the exact toggle steps, three ways to verify the toggle took effect,
> the rollback path, and the exact command that starts the implementation PR
> once the toggle is confirmed.

Companion to `docs/security/mfa-enrollment-readiness-pack-v1.md` (the
"readiness pack"; its §2 defines the owner action, and its "Verification
after the toggle" recipe is reproduced in §2b below) and to
`docs/security/authentication-and-mfa-v1.md` §3. The account "Security &
access" section this all builds on shipped in PR #651:
`apps/web/app/[locale]/dashboard/account/page.tsx`
(`data-testid="account-security"`, live `supabase.auth.mfa.listFactors()`
status chip) with the no-coercion guard
`apps/web/lib/guards/account-security-benefit.test.ts`.

---

## 1. Owner toggle steps (exact dashboard path)

Project ref: `gorgitwvdzxbnaxhrsrw`.

1. Open the Supabase dashboard →
   `https://supabase.com/dashboard/project/gorgitwvdzxbnaxhrsrw` →
   **Authentication → Multi-Factor Authentication** (under Auth settings;
   in newer dashboards the section is "Multi-Factor Authentication" on the
   Auth → Providers/Settings page).
2. Enable **TOTP (App Authenticator)** — both enroll and verify. TOTP is
   available on the free plan; do NOT enable Phone/SMS MFA (paid, out of
   scope, and no phone-number collection exists in the product).
3. Leave "maximum enrolled factors" at the default (10) — the UI will only
   ever surface one TOTP factor per account in v1.
4. No API keys, no secrets, no env vars change. The toggle is the entire
   owner action.

(Local-stack note from the readiness pack: the equivalent config would be
`[auth.mfa.totp] enroll_enabled = true / verify_enabled = true` in
`supabase/config.toml` — not present in this repo and not needed for the
hosted project.)

## 2. How to verify the toggle is enabled — three ways

### 2a. Dashboard readback

Reload the same page (Authentication → Multi-Factor Authentication) and
confirm TOTP shows as enabled (enroll + verify both on). This is the
authoritative source; the two checks below only corroborate it.

### 2b. The readiness-pack recipe (authenticated SDK probe)

From the readiness pack §2, "Verification after the toggle" — owner or
agent, read-only in effect:

Call `supabase.auth.mfa.enroll({ factorType: "totp" })` as a **signed-in
test user**.

- **Success** — the call returns a factor id plus a QR payload
  (`data.id`, `data.totp.qr_code`, `data.totp.secret`, `data.totp.uri`) —
  proves the toggle is on.
- **Failure** — an error of the "MFA is not enabled" shape proves it is
  still off.
- Either way, **unenroll the test factor immediately afterwards**:
  `supabase.auth.mfa.unenroll({ factorId })`. Unverified factors never
  count as protection (the account page derives status only from
  `status === "verified"` factors), but leaving strays around is sloppy.
- Do not log or persist `totp.secret`, `totp.uri`, or the QR payload.

### 2c. Why there is no unauthenticated check — and this session's honest limit

There is **no unauthenticated client API** that reports whether the
dashboard TOTP toggle is on; the enroll probe above requires a signed-in
session. In this agent session, a read-only network probe of the project's
`/auth/v1/settings` endpoint was **denied by session permission rules**, so
the live toggle state is **UNVERIFIED from the agent side**. The readiness
pack records the toggle as **NOT enabled as of 2026-07-06**, and this
document carries that state forward unchanged until the owner verifies
otherwise via 2a/2b.

## 3. Rollback / disable

- **Turn it off**: same dashboard path as §1 — Authentication →
  Multi-Factor Authentication → toggle TOTP off. Instant, no deploy, no
  code change.
- **Effect on new enrollments**: `enroll()` calls fail with the "not
  enabled" error shape; the planned UI's defense-in-depth path (readiness
  pack §4) degrades to the honest `setupComing` line — no dead buttons.
- **Effect on existing verified factors**: per the readiness pack §9,
  Supabase stops issuing AAL2 challenges for disabled factor types, and
  since v1 never gates anything on AAL2 (the sign-in challenge step is a
  separate future PR), no user can be locked out by this rollback. What is
  honestly uncertain and must be checked at rollback time rather than
  assumed: whether Supabase keeps the disabled-type factor rows in
  `auth.mfa_factors` (expected — the data is managed by Supabase and the
  toggle gates behaviour, not storage) and therefore whether the account
  page's `listFactors()` chip would still show "active" for previously
  enrolled users. If the chip would overstate protection after a rollback,
  the one-line code rollback below fixes the surface honestly.
- **Code-level rollback (post-implementation)**: flip
  `MFA_ENROLLMENT_READINESS` back to `"awaiting_supabase_config"` in
  `apps/web/lib/auth/mfa-readiness.ts` (file exists only after the
  implementation PR) — the enroll surface disappears entirely.
- **Per-user removal** (support case, owner-only, dashboard):
  Authentication → Users → user → remove MFA factor.

## 4. Post-toggle: the exact command for the implementation PR

Once — and only once — 2a/2b confirm the toggle, the owner (or the
ChiefOperator session on the owner's word) starts the implementation slice
with exactly this:

> Owner confirms: Supabase TOTP toggle enabled + verified via §2. Then run:
> implement `feat/mfa-enrollment-benefit-ui-v1` per
> docs/security/mfa-enrollment-readiness-pack-v1.md — benefit-based
> enrollment UI on Account → Security & access, LT/EN/RU, no coercive copy,
> guards per pack §tests, flip MFA_ENROLLMENT_READINESS to owner_confirmed.

## 5. Current state (as of 2026-07-06)

| Piece | State | Source of truth |
|---|---|---|
| Supabase TOTP toggle | **not enabled** (per readiness pack; live state unverified from agent side, §2c) | Supabase dashboard, project `gorgitwvdzxbnaxhrsrw` |
| Enrollment UI | **not implemented** (deliberately — waits for the toggle) | readiness pack §4–§5 |
| Account "Security & access" section | **live** — benefit-based copy, live `listFactors()` status chip, from PR #651 | `apps/web/app/[locale]/dashboard/account/page.tsx` |

Everything here is offered, reversible, and benefit-framed: the toggle
gives users the option of a second lock on their account, and the same
switch that turns it on turns it off.
