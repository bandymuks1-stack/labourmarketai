# Google OAuth branding / trust runbook — remove `supabase.co` from the login screen

**Status:** investigation + owner runbook. **No changes have been made.** Nothing
here touches DNS, env, secrets, or product code — it is the exact step list for
the owner to apply/approve.

## Problem
On the Google sign-in/consent screen, users see
`gorgitwvdzxbnaxhrsrw.supabase.co` instead of Labourmarket.ai branding. That
reads as untrustworthy to clients. This is an **OAuth branding/trust** issue —
separate from the login technical flow (which works) and from CV upload.

## Why `supabase.co` shows
Google's consent screen shows the **domain of the OAuth client's redirect URI /
the auth server hosting the flow**. Auth runs on Supabase's hosted GoTrue, so:
- the OAuth `redirect_uri` registered in the Google client is
  `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback`, and
- `/authorize` + `/token` are served from `gorgitwvdzxbnaxhrsrw.supabase.co`.

So Google displays that host. The app's own post-login `redirectTo` is already
`app.labourmarket.ai`; the `supabase.co` host is the **auth server in the
middle**, fixed by Supabase's hosted domain. **No app/PR code change can move
it** — it is governed by (1) the Google consent-screen branding and (2) whether
Supabase serves auth on a custom domain.

Verified (read-only):
- Google OAuth **Client ID:** `313295493545-cdt9i065q3j9fgirq2lhp6n4801lj29t.apps.googleusercontent.com`
- Supabase **project ref:** `gorgitwvdzxbnaxhrsrw` · **plan: Free** (custom domain needs an upgrade)
- Current **redirect URI:** `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback`
- App host `app.labourmarket.ai`; apex `labourmarket.ai`; login already starts on the app host (PR #452)

---

## Lever 1 — Google consent-screen branding (free; biggest trust win; do first)

**Key correction:** the consent-screen **Authorized domains** list must contain
**only `labourmarket.ai`** — the domain you actually own. Do **NOT** add
`supabase.co` there; you do not own it and must not try to claim it as an
authorized domain. `supabase.co` belongs **only** in the OAuth *client's*
Authorized redirect URIs (it is the callback target, not a branding domain).

### Owner steps — OAuth consent screen
Google Cloud Console → project owning client `313295493545-…` →
**APIs & Services → OAuth consent screen → Edit**:

| Field | Value |
|---|---|
| User type | External |
| **App name** | `Labourmarket.ai` |
| **App logo** | Labourmarket.ai logo (square PNG ≥120×120) |
| **User support email** | your support inbox (e.g. `info@labourmarket.ai`) |
| **Application home page** | `https://labourmarket.ai` |
| **Privacy policy link** | `https://labourmarket.ai/en/legal/privacy` |
| **Terms of service link** | `https://labourmarket.ai/en/legal/terms` |
| **Authorized domains** | `labourmarket.ai` *(only — NOT supabase.co)* |
| **Developer contact email** | your email |

Then **Save → Publish app → Submit for verification** if Google requires it
(uploading a logo + serving external users triggers verification; until verified
external users may see an "unverified app" warning and the logo may not show).

### Owner steps — OAuth client (verify; unchanged in Lever 1)
**Credentials → OAuth 2.0 Client ID `313295493545-…`**:
- **Authorized redirect URIs:** KEEP `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback`
  (the Supabase callback stays here — this is correct and required).
- **Authorized JavaScript origins:** add the app host if required:
  `https://app.labourmarket.ai`.

### What still shows after Lever 1
- The screen reads **"Sign in to continue to Labourmarket.ai"** with your logo
  and no "unverified app" warning.
- The `supabase.co` host can **still appear** in a small "you'll be redirected
  to `gorgitwvdzxbnaxhrsrw.supabase.co`" notice and in the address bar during
  the redirect hop. Removing that string entirely requires Lever 2.

---

## Lever 2 — Supabase custom auth domain `auth.labourmarket.ai` (paid; fully removes `supabase.co`)

### Owner approval list (nothing applied without these)
1. **Cost:** upgrade Supabase project **Free → Pro (~$25/mo)** **and** enable the
   **Custom Domains add-on (~$10/mo)**. Custom domains are unavailable on Free.
2. **DNS:** permission to add the records Supabase generates (see below).
3. **Env:** permission to change `NEXT_PUBLIC_SUPABASE_URL` (Vercel + local) and redeploy.
4. **Google redirect URI:** permission to add the custom-domain callback to the OAuth client.

### Owner steps (in order, after approval)
1. Upgrade plan + enable Custom Domains add-on in Supabase billing.
2. Supabase → **Project Settings → Custom Domains** (or CLI
   `supabase domains create --project-ref gorgitwvdzxbnaxhrsrw --custom-hostname auth.labourmarket.ai`).
3. Add the **DNS records Supabase shows** at your DNS host (Vercel DNS / registrar):
   - `CNAME  auth.labourmarket.ai → <target Supabase shows>`
   - `TXT  <name Supabase shows> → <verification token Supabase shows>`
   (exact target + token are generated by Supabase at enable time)
   then click **Verify / Activate** → Supabase provisions the TLS cert.
4. Supabase → **Authentication → URL Configuration:** Site URL = `https://app.labourmarket.ai`;
   Redirect URLs include `https://app.labourmarket.ai/**`.
5. Google client → **Authorized redirect URIs:** add
   `https://auth.labourmarket.ai/auth/v1/callback` (keep the supabase.co one during
   cutover; remove it after Lever 2 is confirmed working).
6. **App env (owner-approved only):** set `NEXT_PUBLIC_SUPABASE_URL=https://auth.labourmarket.ai`
   in Vercel env (+ `.env.local`) → **redeploy**.
7. **Smoke:** incognito login via Google → consent screen + redirect now show
   `auth.labourmarket.ai`; confirm dashboard loads and session persists on reload.

### What fully disappears after Lever 2
- Every visible host becomes `auth.labourmarket.ai` / `app.labourmarket.ai`.
- **`supabase.co` no longer appears anywhere in the visible auth flow** (consent
  screen, redirect notice, address bar).

---

## Vercel / domains (already correct — no change)
`app.labourmarket.ai` is the app host; the apex serves marketing; login CTAs are
pinned to the app host (PR #452) so OAuth always starts on `app.labourmarket.ai`.

## Summary
| | Lever 1 (free) | Lever 2 (paid) |
|---|---|---|
| App name + logo | ✅ Labourmarket.ai | ✅ |
| "Unverified app" warning gone | ✅ (after Google verification) | ✅ |
| `supabase.co` host removed | ❌ still in redirect notice/URL | ✅ gone everywhere |
| Cost | $0 | ~$35/mo + DNS + 1 env change |
| Owner-gated changes | Google consent config only | plan upgrade, DNS, env, Google redirect URI |
