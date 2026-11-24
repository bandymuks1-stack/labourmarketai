# Labourmarket.ai — Google OAuth Exchange Failed Hotfix

## Context

Owner observed production Google login returning to:

`/lt/auth/login?next=%2Flt%2Fdashboard&error=exchange_failed`

PR #55 and PR #56 are merged. PR #54 must stay unmerged until authenticated role smoke can be completed. PR #18 stays blocked.

## Objective

Diagnose and fix Google OAuth callback/session exchange failure safely.

Expected production flow:

1. User opens `/lt/auth/login?next=/lt/dashboard`.
2. User clicks Google login.
3. Google/Supabase returns to the app callback route.
4. Callback exchanges code for session.
5. Cookies/session are set.
6. User is redirected to `/lt/dashboard`.
7. `exchange_failed` appears only when Supabase actually rejects the code.

## Hard rules

- Do not merge PR #54 while Google login is broken.
- Do not touch PR #18.
- Do not remove PR #18 labels.
- Do not run DB migrations.
- Do not mutate production DB manually.
- Do not touch billing, payment, provider, or service_role.
- Do not edit env/secrets.
- Do not log tokens, auth codes, cookies, refresh tokens, access tokens, or secrets.
- No destructive git operations.
- Make the smallest safe auth fix.
- Use a separate branch from updated main.

## Branch

Create:

`fix/auth/google-oauth-exchange-failed`

from updated `origin/main`.

## Baseline report

Report:

```bash
pwd
git status --short
git branch --show-current
git rev-parse --short HEAD
gh pr list --state open
gh pr view 54 --json number,title,mergeStateStatus,isDraft,labels,statusCheckRollup
gh pr view 18 --json number,title,isDraft,labels
```

Confirm:

- PR #55 merged.
- PR #56 merged.
- PR #54 still open and unmerged.
- PR #18 still draft/blocked with `blocked:migration`, `needs-db-validation`, `do-not-merge`.

## Inspect only auth-related code

Search:

```bash
rg "exchange_failed|exchangeCodeForSession|signInWithOAuth|redirectTo|next=|callback|getURL|SITE_URL|APP_URL|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY" apps/web
```

Inspect relevant files only:

- `apps/web/app/[locale]/auth/login`
- `apps/web/app/[locale]/auth/callback`
- auth actions
- Supabase browser/server/client helpers
- middleware
- env validation
- redirect URL helpers

## Root-cause checklist

Determine the actual cause. Do not guess.

Check:

1. Wrong `redirectTo` domain or path.
2. Callback path mismatch.
3. Locale or `next` param lost during Google flow.
4. Callback uses wrong Supabase client for code exchange.
5. Cookies not set after exchange.
6. App domain mismatch between `app.labourmarket.ai`, `labourmarket.ai`, and Vercel.
7. Supabase dashboard Google redirect URL mismatch.
8. Callback catches useful Supabase error and hides it as generic `exchange_failed`.
9. Recent routing/design merges changed auth callback assumptions.

If the issue is only Supabase dashboard configuration, do not fake a code fix. Report exact redirect URLs owner must add.

## Safe fix requirements

A code fix is allowed only if source code is wrong or too fragile.

Requirements:

- Validate `next` as an internal path only.
- Preserve locale.
- Use the correct Supabase server/client helper for `exchangeCodeForSession`.
- Redirect success to sanitized `next` or localized dashboard fallback.
- Redirect failure to localized login with `error=exchange_failed`.
- Never put auth code, token, cookie, or secret in redirect URL.
- Avoid open redirect vulnerability.
- Keep change small and auth-only.

## Tests

Add or update focused tests for:

- callback success redirects to internal `next`
- callback failure redirects to localized login with `error=exchange_failed`
- invalid external `next` is rejected/sanitized
- locale is preserved
- error redirect does not include token/code/secret
- login OAuth `redirectTo` points to the expected callback route

Run repo-appropriate commands. Prefer:

```bash
pnpm -F web lint
pnpm -F web typecheck
pnpm -F web test
pnpm -F web build
```

If this repo uses different scripts, use the existing scripts and report exact commands.

## PR

Open a new PR:

Title:

`fix(auth): repair Google OAuth callback exchange failure`

PR body must include:

- root cause
- files changed
- tests/checks run
- whether Supabase dashboard redirect config is required
- exact redirect URLs owner must verify/add
- safety proof
- note that PR #54 remains unmerged
- note that PR #18 remains untouched

## Production verification after merge/deploy

After hotfix merge/deploy, owner must verify:

- `/lt/auth/login?next=/lt/dashboard` → Google → `/lt/dashboard`
- `/en/auth/login?next=/en/dashboard` → Google → `/en/dashboard`
- no `exchange_failed`
- refresh keeps session

Only after this passes may PR #54 role smoke resume.

## Final report

Include:

- branch
- commit SHA
- PR URL
- root cause
- files changed
- checks/tests
- whether deploy happened
- production smoke status if available
- Supabase dashboard URLs required, if any
- PR #54 still unmerged
- PR #18 blocked/untouched
- safety proof:
  - no DB migration
  - no DB manual mutation
  - no service_role
  - no billing/payment/provider
  - no env/secrets edited
  - no secrets logged
  - no destructive git operations

## Owner next action format

End with one exact next action:

- `Merge the auth hotfix PR now`
- or `Add these Supabase redirect URLs, then retry login`
- or `Do not merge; fix listed blocker first`
