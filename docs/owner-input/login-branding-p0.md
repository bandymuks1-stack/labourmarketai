# Login branding — P0 audit (Sprint Train v2, Wagon 3)

Goal: **a user must never see technical backend / hosting / project identity
while signing in.** They should see the product (LabourMarket.ai) and the
sign-in provider they chose (Google) — nothing about Vercel, Supabase, the
database, or the raw project host.

Layer-0 scope: app-side copy + a guard only. **No** env/DNS/Supabase/auth
provider config changes, no auth-core behaviour change, no secrets, no DB/
schema/RLS/RPC/migration, no production config mutation.

---

## 1. Audit — every sign-in surface

| # | Surface | Where | Finding | Class |
|---|---------|-------|---------|-------|
| A | Auth header wordmark | `app/[locale]/auth/layout.tsx` | Renders `labourmarket.ai` brand wordmark only. No infra. | **OBSERVE** |
| B | Login headline / subcopy / labels | `auth.login.*` (en/lt/ru) | Product copy, provider label "Continue with Google". No backend identity. | **OBSERVE** |
| C | Signup headline / subcopy / labels | `auth.signup.*` (en/lt/ru) | Same — clean. | **OBSERVE** |
| D | Provider button | `components/app/google-button.tsx` | "Continue with Google" + official Google mark. Google is the user-chosen provider, not a backend leak. | **OBSERVE** |
| E | Loading / redirecting states | `auth.login.google_redirecting` ("Redirecting…"), `signing`, `auth.callback.verifying` | Generic, no infra names. | **OBSERVE** |
| F | OAuth error copy | `auth.errors.oauth.*` (en/lt/ru) | "sign-in code", "session", "user record", "trace ID" — generic UX language, no backend/project identity. | **OBSERVE** |
| G | Callback route redirects | `app/[locale]/auth/callback/route.ts` | Server route; redirects to `/login?error=…&trace=…`. No technical identity rendered to the user. Console logs are server-side only (already guarded against token/cookie/URL leakage). | **OBSERVE** |
| H | Trace ID shown on login error | `components/app/login-form.tsx` (`trace: {oauthTrace}`) | Short random hex correlation id — explicitly NOT a secret, never derived from the auth code/cookie (`lib/auth/oauth-trace.ts`). A support-debug id, not backend/project identity. | **OBSERVE** |
| I | **Preview-host notice** | `auth.login.preview_host_notice` (en/lt/ru) | **Leaked two backend vendor names to the user: "Vercel preview deployment" and "Supabase Site URL".** | **GREEN — fixed** |
| J | Google OAuth consent app name | Google Cloud Console → OAuth consent screen | The app name + the auth domain Google shows ("to continue to …") are EXTERNAL provider config. Must read as the product, not a raw host. | **RED — owner** |
| K | Supabase auth host on Google's consent / account-chooser | Supabase project + Google consent | Without a custom auth domain, Google shows `…<project-ref>.supabase.co`. Owner-side config. | **RED — owner** |
| L | Custom auth domain status | Supabase dashboard + DNS (`auth.labourmarket.ai`) | Determines whether the consent screen shows a brand domain vs. the Supabase host. Owner DNS + Supabase config. | **RED — owner** |

---

## 2. GREEN — app-side fixes made in this PR

### I. Preview-host notice no longer names backend vendors

The notice is shown **only** on Vercel preview deployments (detected by
`isVercelPreviewHost`); on production (`app.labourmarket.ai`) it never renders.
Its honest job: tell a tester that Google sign-in won't work on a preview URL
and to use the live site. The old copy did that by naming the infrastructure:

> **Before (en):** "You're on a **Vercel** preview deployment. Google sign-in is
> not configured for this URL — **Supabase Site URL** only allows the production
> origin. Sign in at https://app.labourmarket.ai. Email + password sign-in still
> works here."

> **After (en):** "You're on a preview version of the site. Google sign-in only
> works on the live site — open https://app.labourmarket.ai to use it. Email and
> password sign-in works here as usual."

Same honest substance (use the live site for Google; email/password works here),
zero backend identity. Updated identically in **en / lt / ru**. The production
URL is preserved (still required by the existing diagnostics guard).

### Guard — close the i18n gap

`lib/guards/login-branding-no-infra-leak.test.ts` (new). The sibling
`public-brand-name.test.ts` only scans the auth `.tsx` source files for a
Supabase host; it never reads the message catalog where the visible copy lives —
which is exactly where this leak was. The new guard flattens every string under
the `auth` namespace in en/lt/ru and asserts none names a hosting/backend/DB
vendor (Vercel, Supabase, Netlify, Cloudflare, render.com, fly.io, Postgres,
"Site URL") or embeds a Supabase project host. "Google" stays allowed (chosen
provider). This makes the regression unrepeatable.

---

## 3. RED — external owner actions (NOT changed here)

These are the parts of sign-in branding that live in external dashboards / DNS.
They are owner-only; this PR does not touch them.

1. **Google OAuth consent app name** — Google Cloud Console → APIs & Services →
   OAuth consent screen → *App name*. Set to `LabourMarket.ai` (and brand logo +
   support email) so the Google consent screen reads as the product.
2. **Supabase auth host on the consent screen** — by default Google shows
   "to continue to `<project-ref>.supabase.co`". Removing that requires a
   **custom auth domain** (item 3); until then the Supabase host is visible on
   Google's own screen, which is outside app code.
3. **Custom auth domain** — configure `auth.labourmarket.ai` in Supabase (custom
   domain / auth settings) + the matching DNS record, then update the Google
   OAuth *Authorized redirect URI* to the branded domain. This is the only way to
   replace the `*.supabase.co` host on the Google consent screen with a brand
   domain. **DNS + Supabase + Google config = owner action; do not automate.**

> Cross-reference: the prior `production-reality-trust-p0` audit already recorded
> the Google consent app name + Supabase project domain as owner-fixed external
> config. This Wagon 3 audit confirms that classification and adds the
> custom-auth-domain follow-up explicitly.

---

## 4. OBSERVE — already acceptable

- Auth header wordmark is the brand name; the existing `public-brand-name`
  guard freezes the auth source files against a Supabase host.
- Provider label "Continue with Google" is correct (provider, not backend).
- OAuth error/loading copy is generic UX language with no backend/project name.
- The trace id is a non-secret support-correlation id (guarded in
  `oauth-trace-and-safe-diagnostics.test.ts`), not backend identity.
- Callback-route console logs are server-side and already guarded against
  leaking the auth code / cookies / full URL.

---

## 5. Forbidden actions — confirmed NOT taken

No env/DNS/Supabase/auth-provider config change · no auth-core behaviour change ·
no secrets · no production config mutation · no DB/schema/RLS/RPC/migration ·
no merge/deploy without owner approval · **Wagon 4 not started.**
