# Gate G-2 — LinkedIn + Facebook/Meta sign-in (EXTERNAL_GATE)

**Opened:** 2026-09-02 (FINAL COMPLETION, Train C).
**Register row:** [`docs/launch/FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md) §3 G-2.
**Class:** EXTERNAL_GATE — developer-console apps + Supabase provider credentials; no code can close it.

## What is already true (verified, do not repeat)

| Fact | Evidence |
|---|---|
| Google is the only social provider enabled at the auth server | `/auth/v1/settings` 2026-09-02: `google=true`, `linkedin_oidc=false`, `facebook=false` |
| The product is provider-neutral and fail-closed | `lib/auth/enabled-providers-core.ts` reads the auth server's own `/settings` (300 s cache); a button renders ONLY when the server can complete the flow. LinkedIn/Facebook buttons already exist (`components/app/google-button.tsx` → `LinkedInButton`, `FacebookButton`, same same-tab PKCE core, same callback, same `next` handling, same cancel path) |
| Callback handles every provider the same way | `/[locale]/auth/callback`: PKCE `?code=` exchange, `?error=access_denied` → neutral "cancelled", trace id, safe `next` (Train A1 added token_hash + expiry classification) |
| Identity collision policy | Supabase "Manual linking" is OFF (owner-observed). GoTrue's default **automatic linking** merges a social identity into the existing account when the provider reports the same, verified e-mail — one person, one `auth.users` row, one profile. No second professional identity is created. Unverified provider e-mails are NOT auto-linked (GoTrue refuses with `identity_already_exists` / `email_exists`), which the login form renders through `mapAuthError` |
| Existing-user Google login, new-user Google signup, logout (`scope: local`), reconnect, external-assistant continuation after Google | PRODUCTION_PROVEN (owner hops 2026-08-30/09-02, audit `#1416` §A) |

The day the owner enables a provider in Supabase, its button appears with **no deploy**.

## Owner action (exact)

### LinkedIn (OIDC)
1. https://www.linkedin.com/developers/apps → *Create app* (company page required: use the LabourMarket.ai page). Products → add **"Sign In with LinkedIn using OpenID Connect"** (free, instant).
2. Auth tab → *Authorized redirect URLs for your app*: `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback`
   (after the custom-auth-domain package 0011 lands, ALSO add `https://auth.labourmarket.ai/auth/v1/callback` — keep both).
3. Copy **Client ID** + **Primary Client Secret**.
4. Supabase dashboard → Authentication → Sign In / Providers → **LinkedIn (OIDC)** → enable, paste both, Save. Scopes stay `openid profile email`.
5. Cost: free. Reversible: toggle off (button disappears within 5 min, no deploy).

### Facebook / Meta
1. https://developers.facebook.com/apps → *Create app* → use case "Authenticate and request data from users with Facebook Login" → add **Facebook Login** product.
2. Facebook Login → Settings → *Valid OAuth Redirect URIs*: the same Supabase callback URL(s) as above.
3. App settings → Basic: copy **App ID** + **App Secret**; set Privacy Policy URL (`https://labourmarket.ai/lt/legal/privacy`), category, icon; switch the app to **Live** mode (required for non-developer accounts). `email` + `public_profile` are default permissions — no App Review.
4. Supabase → Authentication → Sign In / Providers → **Facebook** → enable, paste both, Save.
5. Cost: free. Reversible: toggle off.

### Google (branding only — flow already proven)
Google shows `gorgitwvdzxbnaxhrsrw.supabase.co` on its consent screen; the fix is the custom auth domain (package 0011, needs a Supabase plan that supports custom domains) — see `docs/GOOGLE_OAUTH_BRANDING_RUNBOOK.md`. Not a G-2 item.

## Proof the agent runs once a provider is on (per provider, bounded identities)

The matrix in register §1 Train C: signup, login, callback, existing-e-mail collision (auto-link, one
identity), linking semantics with manual linking OFF, logout, re-login, profile provisioning (trigger creates
profile + worker + personal context only), external-assistant continuation (`next` to `/oauth/consent`),
mobile width, cancel path. Provider-side steps (typing a LinkedIn/Facebook password) are a HUMAN action —
the agent never enters credentials — so each provider needs ONE owner sign-in per case that requires the
provider screen (signup, collision, cancel); everything after the callback is automated
(`tests/e2e/social-auth-matrix.spec.ts`, parameterised by provider, runs the callback/`next`/cancel/
logout/re-login legs without a provider screen).

## What is proven today without the gate

- Cancel path on production for any provider: `GET /lt/auth/callback?error=access_denied` → `307 /lt/auth/login?error=cancelled` (neutral status, no red alert).
- Expired e-mail link path: `error=access_denied&error_code=otp_expired` → `link_expired` (Train A1).
- Provider honesty: no LinkedIn/Facebook button is rendered while the auth server reports them off (guard `social-auth-providers.test.ts`).
