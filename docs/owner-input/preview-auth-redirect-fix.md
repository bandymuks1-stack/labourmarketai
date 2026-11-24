# Vercel preview Google login — redirect fix (Supabase URL Configuration)

> Why preview PR reviews kept landing on production, and the one-line fix so
> future previews are verifiable. No DB / auth-schema / production-deploy
> changes — this is a Supabase **Authentication → URL Configuration** setting
> the owner manages in the dashboard.

## Symptom

Open a PR preview (e.g. PR #497 at
`https://labourmarketai-git-feat-ccia-c-dba2e8-bandymuks1-6851s-projects.vercel.app`),
log in with Google → the browser ends on **`app.labourmarket.ai/lt/dashboard`**
(production), so the reviewer sees `main`, not the PR branch.

## Root cause (confirmed in code)

`GoogleButton` (`apps/web/components/app/google-button.tsx`) builds
`redirectTo = ${window.location.origin}/${locale}/auth/callback` — correct, the
preview origin. But Supabase validates `redirectTo` against the **Redirect URLs
allowlist** and, when the URL is not allowlisted, **silently substitutes the
Site URL** (`https://app.labourmarket.ai`). Preview `*.vercel.app` origins were
not allowlisted, so every preview login fell back to production. This is
documented in-code at `apps/web/components/app/login-form.tsx` (preview notice)
and `apps/web/lib/auth/oauth-trace.ts` (`isVercelPreviewHost`).

Two walls stack on a preview: (1) **Vercel SSO** gates the preview host first
(the human passes that login); (2) the Supabase **redirect allowlist** — the
wall fixed below.

## Fix applied — Option B (scoped wildcard), owner-approved 2026-06-25

In **Supabase Dashboard → project `gorgitwvdzxbnaxhrsrw` → Authentication → URL
Configuration → Redirect URLs**, add exactly:

```
https://labourmarketai-git-*-bandymuks1-6851s-projects.vercel.app/**
```

- **Scoped to this Vercel project/team only.** Do **NOT** use the broad
  `https://*.vercel.app/**` (open-redirect risk).
- **Site URL stays `https://app.labourmarket.ai` — unchanged.**
- **Google Cloud OAuth needs no change** — Google's authorized redirect URI is
  the Supabase project callback `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback`,
  independent of app/preview origins.

The git-**branch** preview alias is stable across commits to the same branch,
and the wildcard matches all branch previews for this team — so future PRs no
longer need a per-branch allowlist edit.

## Verify a preview after the setting is added

From `apps/web`, with the owner doing the manual logins (Vercel SSO, then
Google — no stored credentials, never fake proof):

```
BASE_URL="https://labourmarketai-git-feat-ccia-c-dba2e8-bandymuks1-6851s-projects.vercel.app" \
  node scripts/capture-ia-proof.mjs
```

Confirm the final URL stays on the **preview** host (not `app.labourmarket.ai`).
The script captures `/lt/dashboard`, `/lt/dashboard/marketplace`,
`/lt/dashboard/profile`, `/lt/dashboard/journal`, `/lt/dashboard/account` at
desktop + mobile into `apps/web/ia-proof/`.

## Long-term — Option A (deferred, not done yet)

Assign a stable `preview.labourmarket.ai` domain in Vercel, add one permanent
`https://preview.labourmarket.ai/**` redirect entry, then narrow the wildcard.
Cleaner + least-privilege; revisit later. (Do not change the in-code preview
notice to name `preview.labourmarket.ai` until Option A is actually adopted.)
