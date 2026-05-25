# Google OAuth Stability + Diagnostics v1 — Audit

Branch: `fix/google-oauth-stability-and-diagnostics`
Base: `origin/main` @ `c7973dc` (post-PR #54 + PR #65)
Date: 2026-05-25

## Read-only end-to-end diagnosis

### Production (`https://app.labourmarket.ai`)

**Verdict: HEALTHY at the Supabase auth layer.** Verified by inspecting
the last ~3.5h of Supabase auth logs via `mcp__claude_ai_Supabase__get_logs`
(2026-05-25 04:37–08:16 UTC window):

| Signal | Live count |
|---|---|
| Google PKCE login success (200 on `/token`, 302 on `/callback`) | every Google session in the window |
| `redirect_uri_mismatch` | 0 |
| `exchange_failed` | 0 |
| `code_challenge` / `code_verifier` errors | 0 |
| Preview-host (`*.vercel.app`) traffic hitting auth | 0 |
| 4xx / 5xx besides a single benign `session_not_found` (duplicate logout) | 0 |

Recent successful Google PKCE login: user `dc3284ea-…` (sukysdonatas@gmail.com)
from `referer: https://app.labourmarket.ai` at 2026-05-25 06:27:14 UTC.

**What this means for the sprint:** the symptom owner reported earlier
("Google login feels heavy") is not a backend failure — it's perceived
latency. The Supabase exchange is healthy. The next failure, wherever it
lands, will need observability we didn't have. That's what this PR adds.

### Vercel preview (`labourmarketai-<sha>.vercel.app`)

**Verdict: blocked by Vercel SSO before it can reach Supabase.** Confirmed
by the auth-log inspection (zero `*.vercel.app` referers in the window)
and by memory note `labourmarketai_vercel_topology` (all branch / preview
deploys are SSO-401, only `app.labourmarket.ai` is public).

Even if the SSO gate were opened, Supabase's project Site URL is
`https://app.labourmarket.ai` (production), so a Google callback fired
from a preview origin would be rejected by Supabase's redirect-URL
allowlist OR bounce the user back to the prod origin with a code minted
for the preview's PKCE verifier cookie → exchange fails.

This is **environment, not code**. The right product response is to tell
the tester honestly (see `auth.login.preview_host_notice`), not to
silently swallow it.

## Code surface inventory

| File | Role |
|------|------|
| `apps/web/components/app/google-button.tsx` | Generates a PKCE start request via `supabase.auth.signInWithOAuth({provider:"google"})`. Pre-evicts stale local auth state via `signOut({scope:'local'})` (PR #59 fix for the cookie race). |
| `apps/web/app/[locale]/auth/callback/route.ts` | Server route handler that exchanges `?code=…` for a session, includes a PKCE-race fallback that proceeds when `getSession` returns a valid session despite `exchangeCodeForSession` erroring. |
| `apps/web/components/app/login-form.tsx` | Renders the GoogleButton + email/password form; reads `?next=…` for post-login redirect. |
| `apps/web/middleware.ts` | Auth-gate for `/dashboard` and `/onboarding`; redirects unauthenticated users to `/auth/login?next=…`. |
| `apps/web/lib/supabase/server.ts` | Per-request server client; `cookies.setAll` catch logs non-secret error fields (no cookie values). |
| `apps/web/lib/supabase/client.ts` | Memoised browser client. |
| `apps/web/lib/env.ts` | `NEXT_PUBLIC_SUPABASE_URL` (defaults to the prod project) + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (runtime-only). **No `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` usage anywhere in the OAuth path** — the GoogleButton derives the callback URL from `window.location.origin`, which is correct for prod / preview / localhost. |

## What this PR ships

### New: OAuth trace id (observability)

`lib/auth/oauth-trace.ts` provides `generateOauthTraceId()` →
`withOauthTraceId(url, id)` → `readOauthTraceId(url)` plus
`rememberOauthTraceId` / `recallOauthTraceId` (sessionStorage cache so the
correlation survives if a provider strips query params). The id is a 16-char
hex string from `crypto.getRandomValues` — NOT derived from the auth code,
tokens, or cookies. Logging it is safe.

Wired through:
- `GoogleButton` generates an id on click, stashes it in sessionStorage,
  attaches it as `?trace=…` to the callback URL, and `console.info`s
  `[auth] oauth start` with `{provider, trace, origin, locale}`.
- `/[locale]/auth/callback/route.ts` reads the id off the URL, includes
  it in every log line (`missing_code`, `exchangeCodeForSession failed`,
  PKCE-race fallback warning, `no_user`, success, unexpected catch),
  forwards it to `/login?error=…&trace=…` on failure.
- `LoginForm` reads `?error=…&trace=…` off `searchParams`, renders the
  precise LT/EN message + the trace id in a font-mono label so the user
  can quote it back in a support thread.

When a future failure happens, the same trace id will appear in:
1. Browser console (`oauth start` line at click time).
2. Vercel runtime logs (every callback line + the redirect to /login).
3. Supabase auth log (in the `referer` field's query string).

### New: Preview-host honest framing

`isVercelPreviewHost(host)` flags branch/preview `*.vercel.app` URLs
(everything except `app.labourmarket.ai` and the prod alias
`labourmarket-ai.vercel.app`). `LoginForm` shows an informational notice
on those hosts:

> LT: "Esate Vercel peržiūros (preview) versijoje. Google prisijungimas
> šiame URL nekonfigūruotas — Supabase Site URL nukreipia tik produkcijos
> adresą. Prisijungti galite https://app.labourmarket.ai. El. paštu +
> slaptažodžiu prisijungimas dirba ir čia."
>
> EN: "You're on a Vercel preview deployment. Google sign-in is not
> configured for this URL — Supabase Site URL only allows the production
> origin. Sign in at https://app.labourmarket.ai. Email + password sign-in
> still works here."

The notice is informational only — the Google button stays enabled in
case the owner later widens the Supabase allowlist to accept preview
origins.

### Improved: callback error UX

The login page now surfaces every `?error=…` callback redirect code with
a dedicated LT/EN message under `auth.errors.oauth.*`
(`missing_code`, `exchange_failed`, `no_user`, `callback`, `unknown`).
The trace id renders below the message. No silent re-render.

### Hardened: safe-logging contract pinned by tests

New guard `lib/guards/oauth-trace-and-safe-diagnostics.test.ts`:
- `oauth-trace.ts` doesn't import any auth-code / cookie / token surface.
- `GoogleButton` calls `generateOauthTraceId` + `withOauthTraceId`.
- `GoogleButton` failure log uses `.name` + `.message` only.
- Callback route includes `trace: traceId` in every console.error / warn / info.
- Login form maps every callback code to `auth.errors.oauth.<code>`.
- No `console.X(...)` call anywhere in these files contains a
  value-substitution pattern for the auth code (`${code}`, `[,{] code [},]`),
  any JWT field (`access_token`/`refresh_token`/`id_token`),
  the full request URL (`request.url`), or `document.cookie`.

## Required checks

| Gate | Result |
|------|--------|
| `pnpm -F web lint` | green |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | **490 / 490** passed (26 files) |
| `pnpm -F web build` | green |

## Dashboard config — owner action required

The code in this PR doesn't (and can't) change these. They must be
verified by hand once before each release where the OAuth surface is
exercised:

### A. Supabase Auth → URL Configuration (project `gorgitwvdzxbnaxhrsrw`)

Open https://supabase.com/dashboard/project/gorgitwvdzxbnaxhrsrw/auth/url-configuration

- **Site URL** must be exactly `https://app.labourmarket.ai` (no trailing
  slash, no locale prefix).
- **Additional Redirect URLs** should include — one per line:
  - `https://app.labourmarket.ai/*` (wildcard captures `/lt/auth/callback`, `/en/auth/callback`, etc.)
  - `http://localhost:3000/*` (local development)
  - Do NOT add per-deployment `*.vercel.app` URLs — they rotate every push
    and Supabase's allowlist isn't designed for that pattern. Preview-host
    notice above is the deliberate UX for testers who land on a preview.

### B. Google Cloud Console → OAuth 2.0 Client (the client configured in Supabase)

Open Google Cloud Console → APIs & Services → Credentials → the OAuth
2.0 client used by Supabase.

- **Authorized JavaScript origins** must include `https://gorgitwvdzxbnaxhrsrw.supabase.co` and `https://app.labourmarket.ai`.
- **Authorized redirect URIs** must include `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback` (Supabase's fixed callback). Do NOT add the app's `/lt/auth/callback` here — Google → Supabase, then Supabase → app.

### C. Supabase Auth → Providers → Google

Open https://supabase.com/dashboard/project/gorgitwvdzxbnaxhrsrw/auth/providers

- Provider enabled = ON.
- Client ID + Client Secret match the Google Cloud client above.
- Skip nonce check = OFF (default).
- Callback URL (read-only) = `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback` — paste this into Google Cloud B above.

## Owner smoke checklist

1. https://app.labourmarket.ai/lt/auth/login — click **Tęsti su Google** in a fresh incognito window. Expect: redirect to Google → consent → back to `/lt/dashboard`. Open DevTools console BEFORE clicking; verify the `[auth] oauth start` log line shows up with a `trace: <hex>` value.
2. Open a preview deployment URL (e.g. one from a recent PR) — log in to Vercel SSO. Expect: the LT/EN preview-host notice appears above the Google button. Clicking the Google button still works (no disable), but the OAuth round-trip will land on /login with `?error=…&trace=…` and the precise LT/EN message.
3. Force a callback failure on prod: open `https://app.labourmarket.ai/lt/auth/callback?code=invalid&trace=manual-test`. Expect: redirect to `/lt/auth/login?error=exchange_failed&trace=manual-test`, with the LT/EN "Prisijungimo kodas neišsikeitė į sesiją…" message + `trace: manual-test` below.
4. Sign out then sign back in — the PR #59 race-fallback log line (`exchangeCodeForSession errored but getSession is valid`) should NOT appear on prod (it's the diagnostic for the intermittent race; absence = healthy).

## Out of scope (intentionally)

- Widening Supabase redirect allowlist to accept `*.vercel.app` — owner-side
  config decision; would also need Google Cloud to add a matching domain
  pattern (Google doesn't support wildcards in Authorized origins).
- A self-hosted preview gate that proxies through `app.labourmarket.ai` —
  larger infra slice.
- Replacing the Supabase auth provider with a different IdP — strategic
  decision, not a P0.
- PR #18 manager-confirmation backbone — explicitly untouched.
