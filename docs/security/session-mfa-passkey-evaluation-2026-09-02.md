# Session management, MFA and passkeys — evaluation memo (FINAL COMPLETION Train A3, 2026-09-02)

**Purpose:** the register's Train A3 asks for an evaluation, not an enrolment build. This memo
records what exists, what the auth server offers today, and the recommended order — so the
decision is made once and the implementation PRs become mechanical.

## 1. Verified state (read live 2026-09-02, project `gorgitwvdzxbnaxhrsrw`)

| Item | State | Evidence |
|---|---|---|
| Sign-in methods | password + Google (same-tab PKCE) | `/auth/v1/settings`: `email=true`, `google=true`, every other provider `false` |
| E-mail confirmation | ON | `mailer_autoconfirm=false`; Train A1 shipped the UX |
| Anonymous sign-ins / manual linking | OFF / OFF | settings; owner-observed |
| Passkeys | OFF at the auth server | `passkeys_enabled=false` |
| MFA (TOTP) | factor type not enabled at the auth server; account page reads `listFactors()` and shows "not active"; enrolment UI deliberately absent | `docs/security/mfa-enrollment-readiness-pack-v1.md` §1 (unchanged since 2026-07-06) |
| Password reset / forgot password | live (`/auth/forgot-password`, `/auth/reset-password`) | routes exist; login shows `reset_success` |
| Web logout | THIS session only (`scope: local`, #1412) | `lib/guards/logout-*` |
| External-client access | listed + revocable natively (Train A2) | `/dashboard/account#connected-apps` |
| Session listing (own devices) | not available | GoTrue exposes no user-facing "my sessions" API; `auth.sessions` is admin-only |
| Bearer verification | live `getUser` per call, revocation immediate | audit 2026-09-02 §A.3 |

## 2. Recommendation (order by leverage, all additive)

1. **Keep the current gate posture for launch**: password + Google + confirmed e-mail + immediate
   revocation is a sound baseline for a labour-market product whose sensitive actions (payments,
   consent to external clients) are explicit, human-only screens.
2. **TOTP MFA — OWNER toggle first, then one PR.** Supabase dashboard → Authentication → Multi-Factor →
   enable TOTP (free, reversible). The enrolment PR is fully specified in
   `mfa-enrollment-readiness-pack-v1.md` (client component, QR + code, unenrol, AAL2 challenge on
   login). Offer, never demand (existing benefit-copy guard). Not a launch blocker.
3. **Passkeys — after TOTP.** The auth server supports them (`passkeys_enabled` flag exists) but they
   are OFF and the SDK surface is new; evaluate once TOTP has been used by real people. Not a launch
   blocker.
4. **"My sessions" list — do NOT build.** No user-facing API; a home-grown session table would be a
   parallel system to GoTrue's. Document the honest alternative on the account page: "Sign out
   everywhere" is available through password reset (GoTrue revokes all sessions on password change).
   Record as `DEFERRED` in `CAPABILITY_INVENTORY.md`.
5. **Recovery e-mail** stays the account e-mail; a second recovery address is a GoTrue non-feature.

## 3. Gate classification

- TOTP enablement, passkeys enablement: **OWNER_GATE** (dashboard toggles, free, reversible) — none
  blocks LAUNCH_READY; they are post-launch hardening unless the owner asks otherwise.
- Nothing in this memo requires a migration.
