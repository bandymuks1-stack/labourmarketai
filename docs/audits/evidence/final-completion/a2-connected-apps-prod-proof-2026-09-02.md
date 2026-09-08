# Train A2 — Connected Apps production proof (2026-09-02, after #1419 = `289c92ac` deployed)

Bounded TEST identity `e2e-a2-connected-202609021420@labourmarket.ai` (`f8369831…`), created through the public
signup API (PKCE), confirmed through the Train A1 token-hash path, onboarded through the same `complete_onboarding`
RPC the wizard calls, then granted the temporary public proof client `lm-oauth-proof-temp-20260830`
(`0e8c4466…`, redirect `http://127.0.0.1:8912/callback`) through the real authorization-server flow. The web
steps ran in headless Chromium at 390 px with the identity's session injected as the `@supabase/ssr` cookie.
Statuses and names only; no token, code or cookie value recorded.

| # | Step | Result |
|---|---|---|
| 1 | confirm via `POST /verify {token_hash}` (no PKCE verifier anywhere) | 200, user `f8369831…` |
| 1b | `rpc/complete_onboarding` (worker, LT) | 204 |
| 2 | `GET /oauth/authorize` for the proof client | 302 → `labourmarket.ai/oauth/consent?authorization_id=…` |
| 3 | consent: `GET /oauth/authorizations/{id}` then `POST …/consent {approve}` on the user's session | 200 / 200, code issued |
| 4 | client `POST /oauth/token` (authorization_code + PKCE) | 200, access + refresh |
| 5 | `GET /user/oauth/grants` (the API the surface reads) | 200, 1 grant: `lm-oauth-proof-temp-20260830` |
| 6a | `/lt/dashboard/account` with the session | lands on the account page (not bounced) |
| 6b | Connected Apps section | present; **1 row**: name `lm-oauth-proof-temp-20260830`, permissions `openid · email · offline_access`, granted-at rendered — `a2-connected-apps-list-390.png` |
| 6c | Disconnect (first press) | inline confirmation shown, nothing revoked yet — `a2-connected-apps-confirm-390.png` |
| 6d | Confirm | `?apps=revoked`, revoked banner 1, **rows 0**, empty state 1 — `a2-connected-apps-after-390.png` |
| 7a | client refresh after disconnect | `400 refresh_token_not_found` |
| 7b | still-valid client access token at `/api/mcp` | **401** (bearer verified against the auth server on every call) |
| 8 | fresh `GET /oauth/authorize` after disconnect | 302 → consent page again (reconnect works) |

Verdict: **A2 PRODUCTION_PROVEN** — list → scopes → authorization metadata → revoke → revoked access rejected →
reconnect. The same surface lists the owner's real ChatGPT grant (client `3624f6dc…`, consent 2026-08-30); revoking
it is the owner's own action and was not performed.

Residue (gate G-9): `e2e-a2-connected-202609021353` (grant left in place, never onboarded) and
`e2e-a2-connected-202609021420` (onboarded worker, grant revoked) — TEST identities, never metrics.
