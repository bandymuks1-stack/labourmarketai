# Train A1 — production proof (2026-09-02, after #1418 deployed)

Bounded TEST identities only (`e2e-a1-*@labourmarket.ai`), created through the public signup API the way the
web form does it (PKCE S256). Token hashes were read with read-only SQL from `auth.users.confirmation_token`
for THESE identities only — the equivalent of opening the e-mail. Statuses and masked URLs only; no token,
code or cookie value is recorded.

| # | Case | Request | Result | Verdict |
|---|---|---|---|---|
| P6a | password login before confirming | `POST /auth/v1/token?grant_type=password` | `400 email_not_confirmed` | refused, as designed |
| P6b | resend confirmation | `POST /auth/v1/resend {type:signup}` | `200` (token rotated server-side — the earlier hash became invalid, see P1-stale) | resend works, single pending token per address |
| P1-stale | the PRE-resend hash on our callback | `GET /lt/auth/callback?token_hash=<old>&type=signup&next=…` | `307 /lt/auth/login?next=…&error=link_expired` | a superseded link is a dead link, `next` preserved |
| **P1** | **the current hash opened on a device that never started the signup** (fresh HTTP client, no PKCE verifier) | `GET /lt/auth/callback?token_hash=<new>&type=signup&next=%2Flt%2Foauth%2Fconsent%3F…` | **`307 /lt/onboarding?next=%2Flt%2Foauth%2Fconsent%3Fauthorization_id%3D…`, `Set-Cookie: sb-…-auth-token`** | cross-device confirmation creates the session HERE; the pending destination survived the inbox round trip |
| P2 | replay of the same hash | same request again | `307 …/auth/login?…&error=link_expired`, no cookie | single-use enforced by GoTrue |
| P3 | garbage hash | `token_hash=pkce_000…` | `307 …&error=link_expired` | never reaches a session |
| P4 | GoTrue's expired-link redirect shape | `?error=access_denied&error_code=otp_expired&next=…` | `307 …&error=link_expired` (not `cancelled`) | classification correct on prod |
| P5a | default e-mail template (GoTrue `/verify`) | `GET /auth/v1/verify?token=<hash>&type=signup&redirect_to=<our callback with next>` | `303 https://labourmarket.ai/lt/auth/callback?code=…&flow=email_confirm&next=%2Flt%2Foauth%2Fconsent%3F…` | the allow-list accepts our callback WITH a query; `next` intact |
| P5b | that `code` opened on another device | `GET /lt/auth/callback?code=…&flow=email_confirm&next=…` | `307 …/auth/login?next=…&error=confirmed_sign_in` | honest outcome: address confirmed (DB: `email_confirmed_at` set), person signs in here; `next` preserved |

Unit/guard coverage: `lib/auth/email-confirm.test.ts`, `lib/auth/callback-route.test.ts` (+7),
`lib/auth-errors.test.ts`, guards `oauth-trace-and-safe-diagnostics`, `google-same-tab-redirect`,
`auth-stability-pkce-logout`. Deployed as `2a939c83` (#1418).

Still EXTERNAL_GATE (G-1): delivery of the mail to a real inbox (custom SMTP) — see
`docs/human-gates/email-delivery-gate.md`. UI-level browser walk of the "check your e-mail" state and the resend
button runs in the CI e2e subset against the local stack (Confirm email OFF there → the state is reached by
mocking `signUp` returning no session — see `tests/e2e/auth.spec.ts` follow-up in Train M).

Residue (gate G-9): `e2e-a1-crossdevice-202609021353` (confirmed, onboarding never completed),
`e2e-a1-replay-202609021353` (confirmed), `e2e-a2-connected-202609021353` (A2 proof), plus the three
`e2e-confirm-*` identities from the reconciliation — all `@labourmarket.ai`, TEST, never metrics.
