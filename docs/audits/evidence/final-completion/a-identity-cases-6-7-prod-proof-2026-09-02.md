# Train A — identity cases 6 and 7 on production, real browser (2026-09-02)

Walker identity (bounded, onboarded), headless Chromium at 390 px, session injected; the temporary public
proof client `lm-oauth-proof-temp-20260830` (redirect `http://127.0.0.1:8912/callback`, intercepted by the
test so the final URL is observable). Statuses and masked ids only.

| Case | Step | Result | Verdict |
|---|---|---|---|
| 7 consent denied | `GET /auth/v1/oauth/authorize` → our consent page `/lt/oauth/consent?authorization_id=…` renders the client name and the **Deny** button (`a-case7-consent-page-390.png`) → Deny | browser navigated to `http://127.0.0.1:8912/callback?error=access_denied&error_description=User+denied+the+request&state=<echoed>` | **PRODUCTION_PROVEN** — the client learns the refusal, `state` is echoed, no code is issued |
| 6 signup / authorization interrupted | measured on the live `auth.oauth_authorizations` rows created by the probes | every pending authorization carries `expires_at − created_at = 00:10:00` | bounded server-side; after 10 min the consent page resolves to "request could not be resolved — go back and connect again" (copy shipped in #1418); a person who completes e-mail confirmation later lands on onboarding with `next` and reconnects from the assistant |

Cases 1–5, 8, 10–12 were already PRODUCTION_PROVEN / E2E_PROVEN (register §0 row 5, audit `#1416` §C, Train A1
evidence). Case 9 (identity collision with a real Google account) needs a real Google identity — owner
(gate G-2/C3).

Residue: two pending authorizations for the proof client (expire on their own in 10 min); nothing else.
