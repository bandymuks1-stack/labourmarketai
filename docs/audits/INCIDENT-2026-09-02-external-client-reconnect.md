# Incident 2026-09-02 — ChatGPT connector: "We couldn't connect your account"

**Class:** P0 reliability regression, external-client authentication
**Baseline:** `main = b9749280 = production` at investigation start · tree clean
**Status:** root cause identified from production evidence; fix prepared as a
RED-class (auth-core) change awaiting the owner's merge approval. **Production
was not changed during the investigation.**

---

## 1. What the owner saw

`@LabourMarket.ai` in ChatGPT discovered and invoked `profile_get`; ChatGPT
then rendered:

```
ConnectorClientError: 400: Server returned 400: "We couldn't connect your account. Please try again."
```

The quoted sentence is **ChatGPT's own generic message** — it appears nowhere in
LabourMarket.ai. The 400 it wraps was **not** returned by LabourMarket.ai either.

## 2. Where the failure actually occurred (evidence)

Sanitized production logs (project `gorgitwvdzxbnaxhrsrw`), last 24 h:

| Time (UTC) | Source | Request | Result |
|---|---|---|---|
| 2026-09-02 06:05:21 | edge | `POST /auth/v1/oauth/token` from `Python/3.13 aiohttp/3.13.5` (ChatGPT's connector backend) | **400** |
| 2026-09-02 06:05:22 | auth | `/oauth/token` | **400 `Invalid Refresh Token: Refresh Token Not Found`** |

That is the **only** authentication-relevant request in the window. There was
**no** `GET /auth/v1/user` (the bearer verification LabourMarket.ai performs)
and **no** request to `/api/mcp` at all. ChatGPT tried to **refresh** its
access token at the authorization server, the refresh grant no longer existed,
and ChatGPT surfaced its generic wall. LabourMarket.ai's door was never
reached.

## 3. Why the refresh grant no longer existed

Authorization server = Supabase Auth's OAuth 2.1 server (LabourMarket.ai is the
resource server only). Production state, read without modification:

```
auth.oauth_clients      ChatGPT client 3624f6dc… registered 2026-08-30 11:09, grant_types
                        authorization_code,refresh_token, not deleted
auth.oauth_consents     1 row: owner ↔ ChatGPT, scopes "openid email offline_access profile phone",
                        granted 2026-08-30 11:11, NOT revoked
auth.sessions           0 rows with oauth_client_id            ← the ChatGPT session is GONE
auth.sessions           0 rows for the owner at all, although auth.users.last_sign_in_at = 2026-08-31 12:13
auth.sessions           no session created anywhere since 2026-08-20; n_tup_del = 268
auth.refresh_tokens     0 orphans (deleted WITH their sessions, not revoked in place)
```

Discriminating comparison: the only other user who signed in after 08-20 and
**never used the web logout** still holds **5** sessions. The owner, who signed
out of the web app after 08-31, holds **0** — including the ChatGPT one.

GoTrue **deletes** a user's sessions (rather than revoking tokens in place)
in exactly one ordinary path: **logout with `scope=global`**. And:

```ts
// apps/web/app/[locale]/auth/logout/route.ts  (before the fix)
await supabase.auth.signOut();
```

`@supabase/auth-js` 2.112.4, installed:

```
 * **Warning:** the default `scope` is `'global'`. This signs the user out of
 async signOut(options = { scope: 'global' }) {
```

The web logout route called `signOut()` bare → global scope → GoTrue deleted
**every** session of the user, including the one minted for the ChatGPT OAuth
client, and its refresh token with it. The next ChatGPT refresh answered
`invalid_grant / Refresh Token Not Found`. The Google sign-in button and the
mobile app already used `scope: "local"`; the web logout route was the one
caller left on the library default — and two guards
(`logout-route.test.ts`, `account-menu-logout-admin.test.ts`) **pinned the bare
call**, so the defect was protected by tests.

## 4. Hypotheses tested and ruled out

| Hypothesis | Verdict | Evidence |
|---|---|---|
| access token expired, refresh broken | **No** — refresh is what ran; it failed because the grant was gone | auth log 06:05:22 |
| refresh token never issued / `offline_access` absent | **No** | consent scopes include `offline_access`; client `grant_types` include `refresh_token` |
| refresh token expired / rotation reuse | **No** — that answers "Already Used" or a revoked row; here the row does not exist | `refresh_tokens` orphans = 0, session rows = 0 |
| discovery metadata / redirect URI / client registration / scopes changed | **No** | client row unchanged since 08-30; RFC 9728 document unchanged |
| account-link record disappeared | **Partly** — the *consent* is intact; the *session* is gone | `oauth_consents` 1 row not revoked |
| sub / user-id mapping changed | **No** | same `dc3284ea…` user; identities intact |
| env / deployment drift | **No** | resource-server code path was never exercised today |
| auth middleware converting a recoverable state into "account-link failure" | **Not on our side** — but our 401 body was `{ok:false}` with no class, so a client could not have told retry from reconnect had it reached us | `app/api/mcp/route.ts` (before) |
| production differs from the E2E environment | **No** — the E2E proof of 2026-08-30 ran on this same production | `docs/integrations/CHATGPT_MCP_CLIENT_V1.md` §7 |

Also confirmed: `auth.audit_log_entries` has **never** received a row on this
project (`n_tup_ins = 0`), so its emptiness is configuration, not deletion.

## 5. Failure classification

**PRODUCT** (auth UX contract): signing out of one browser silently revoked a
delegated grant the person made on purpose. Not a token-lifetime, discovery,
scope, environment or harness failure.

## 6. Fix (prepared, not applied to production)

1. `apps/web/app/[locale]/auth/logout/route.ts` — `signOut({ scope: "local" })`.
   Signing out ends **this** session; revoking an external client is its own
   explicit act (`supabase.auth.oauth.revokeGrant`), never a side effect.
2. The two guards now pin `scope: "local"` and reject `global`/`others`; a new
   regression test asserts on the **argument**, which is what would have
   caught this.
3. `lib/api/external-client-auth.ts` — the machine-readable taxonomy
   (`CREDENTIALS_MISSING`, `ACCESS_TOKEN_REJECTED`, `AUTH_PROVIDER_UNAVAILABLE`,
   `RATE_LIMITED` at our boundary; `ACCESS_TOKEN_EXPIRED`, `REFRESH_REQUIRED`,
   `REFRESH_FAILED`, `REFRESH_REVOKED`, `ACCOUNT_LINK_MISSING`,
   `ACCOUNT_LINK_INVALID`, `SCOPE_MISSING`, `USER_REVOKED_ACCESS`,
   `SERVER_AUTH_FAILURE` at the authorization server), each with a
   `client_action` (`retry_after_refresh` / `reconnect` / …) and a
   `user_message` kind (`retry_automatically` / `reconnect_required` / …).
   `/api/mcp` now answers a rejected token with
   `WWW-Authenticate: Bearer error="invalid_token", resource_metadata=…` —
   RFC 6750's own refresh-and-retry signal — plus that body. The no-oracle
   rule is kept: malformed and invalid tokens are the same class.
4. Privacy-safe observability: one JSON line per auth outcome and per tool
   call (classes and names only; a forbidden-key check throws before anything
   credential-shaped can be logged).
5. `scripts/mcp-contract-check.ts` — the §15 release gate, runnable against
   any environment with a bearer from the environment (never printed).

## 7. Why this is RED class and what the owner must do

`docs/PLATFORM_DOCTRINE.md` and `CLAUDE.md` classify any change to auth-core
logic as **RED**: no auto-merge, draft PR, `needs-human-gate`, explicit owner
approval. The logout route is auth-core.

**Exactly two owner actions, in order:**

1. Approve and merge the draft PR (it is intentionally not auto-merged).
2. After production deploys, reconnect the LabourMarket.ai connector **once**
   in ChatGPT. The consent row still exists, so this is a re-authorization of
   an existing grant, not a new account link. This step cannot be automated:
   it is the OAuth consent a person gives.

Nothing in this fix creates long-lived credentials, weakens verification,
bypasses OAuth, or stores anything new.

## 8. What would have caught it earlier

- The old 401 body (`{ok:false}`) gave clients no next action; the new one
  does.
- Nothing counted connector auth failures; the `external_client.auth` log
  line now makes `outcome=refused error_class=…` countable, and the contract
  check gives every release a pass/fail on the door.
- The remaining blind spot is the authorization-server half (refresh /
  revocation), which only a real OAuth client behind a human consent can
  exercise — recorded as a gap, not papered over.

---

## 9. Continuation — the owner's reconnect after #1412 also failed (proven)

`#1412` merged as `c3accc7c`, deployed `success`; the resource-server contract
was verified live (both refusal probes PASS). The owner then performed the
reconnect in ChatGPT and got the same generic wall. Production evidence:

| Time (UTC) | Request | Result |
|---|---|---|
| 09:01:51.9 | `GET /.well-known/oauth-authorization-server/auth/v1` | 200 |
| 09:01:52.1 | `GET /auth/v1/.well-known/openid-configuration` | 200 |
| 09:01:53.0 | **`POST /auth/v1/oauth/token`** (grant_type = **refresh_token**) | **400** `Invalid Refresh Token: Refresh Token Not Found` |
| 08:59:09 | same `POST /auth/v1/oauth/token` | 400 (the first click) |

**There was no `GET /auth/v1/oauth/authorize`, no `/oauth/consent` visit, no
new `oauth_authorizations` row, no authorization code, no session.** ChatGPT's
"reconnect/reload" is a *token refresh*, not a new authorization.

Why it does not fall back to a fresh authorization — measured on the live
endpoint:

```
POST /auth/v1/oauth/token  grant_type=refresh_token (dead grant, ChatGPT client_id)
→ 400 {"code":400,"error_code":"refresh_token_not_found","msg":"Invalid Refresh Token: Refresh Token Not Found"}

POST /auth/v1/oauth/token  grant_type=authorization_code (bogus code, same client)
→ 400 {"error":"invalid_grant","error_description":"Invalid authorization code"}
```

The **refresh** path answers Supabase Auth's *legacy* error shape with **no RFC
6749 §5.2 `error` member**; the **code-exchange** path on the same endpoint is
RFC-shaped. A standards-conforming OAuth client reads `error === "invalid_grant"`
as "grant dead → re-authorize". It never sees that word, cannot classify the
400, keeps believing its stored grant is valid, and surfaces "We couldn't
connect your account" — every "reconnect" then repeats the same refresh.

What is **not** the cause, each checked:
- the preserved consent row does not block a new grant — a fresh
  `GET /auth/v1/oauth/authorize` for the ChatGPT client (PKCE S256,
  `resource=https://labourmarket.ai`, registered redirect) answered
  **302 → `https://labourmarket.ai/oauth/consent?authorization_id=…`** (pending
  row, self-expiring in 10 min, not followed);
- discovery is correct (issuer, `authorization_endpoint`, `token_endpoint`,
  `grant_types_supported = authorization_code, refresh_token`,
  `offline_access` in `scopes_supported`);
- #1412 is live and unrelated to this hop; nothing in LabourMarket.ai was
  touched by the reconnect (no `/api/mcp`, no `/auth/v1/user` from ChatGPT).

**Root cause of the failed reconnect:** upstream. Supabase Auth's OAuth 2.1
`/oauth/token` emits a non-RFC error body on the `refresh_token` grant, and
ChatGPT's connector does not re-authorize on an unclassifiable 400. Neither is
LabourMarket.ai code; the AS is Supabase-managed.

**Smallest safe fix in this repo:** make the shape visible and classifiable —
`parseTokenEndpointError` + legacy-code folding in the taxonomy (first-party
clients now classify `refresh_token_not_found` → `REFRESH_REVOKED → reconnect`),
and a non-fatal `AS_TOKEN_ERROR_SHAPE` step in the contract check that WARNs
while the upstream shape is non-RFC and passes the day it heals. No auth-core
change; GREEN class.

**What actually restores the connector:** the client must discard its stored
grant so it issues `/oauth/authorize` again. That is a ChatGPT-side
disconnect (revoke / log out of the connector's OAuth), then connect — not a
"reload". Evidence-backed, not speculative: no reload can ever reach
`/oauth/authorize` while the client thinks its grant is valid. Nothing on the
LabourMarket.ai side is lost by it (consent is re-issued or re-used; DCR may
register a fresh client row). Report the token-endpoint shape to Supabase.
