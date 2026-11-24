# Owner action — Vercel Preview `BILLING_PROVIDER` breaks every preview build

**Date:** 2026-07-22 · **Severity:** P2 (blocks PR previews; production unaffected)
**Deliberately OUT OF SCOPE of the P0 security hotfix loop (PR #845).** Do not bundle
these two changes. This is a separate, small owner action.

---

## 1. Symptom

Every Vercel **Preview** deployment fails during `pnpm run build`:

```
Invalid environment variables: { BILLING_PROVIDER: [ 'Invalid input' ] }
Error: Invalid environment configuration — see .env.example
> Build error occurred
[Error: Failed to collect page data for /[locale]/auth/callback]
ELIFECYCLE  Command failed with exit code 1.
Error: Command "pnpm run build" exited with 1
```

Observed on PR #845 (`dpl_2MUjJ4RxBqJ3GcBikf5i3axVzZRu`) and independently on PR #844.
The older docs-only PR #779 deployed fine, which places the regression after the billing
environment contract was introduced.

**This is not caused by the security hotfix.** The same commit builds locally with
`pnpm -F web build` → exit 0.

---

## 2. Cause

`apps/web/lib/env.ts:28`

```ts
BILLING_PROVIDER: z.enum(["stripe", "none"]).default("none"),
```

A Zod `.default()` applies **only when the value is `undefined`**. An environment variable
that is *present but empty* (`""`) — or set to any string outside the enum — is passed
through to `z.enum` and fails validation.

So the Preview environment does not have the variable *missing* (that would be fine and
would default to `"none"`); it has it **set to an invalid or empty value**.

Repo contract for reference — `.env.example:11-14`:

```
# and fails the no-live-payments guard — by design.
PAYMENTS_ENABLED=false
BILLING_PROVIDER=none
STRIPE_MODE=test
```

---

## 3. What the owner needs to check and change

All of this is in **Vercel → Project `labourmarketai` → Settings → Environment Variables**.

| # | Step |
|---|---|
| 1 | **Record the current value** of `BILLING_PROVIDER` in the **Preview** environment, exactly as stored — including whether it is empty, whitespace, or absent. Note it before changing anything. |
| 2 | **Set Preview to `none`** — the only safe value. It matches `.env.example`, keeps payments off, and satisfies the enum. Do **not** set `stripe` in Preview. |
| 3 | **Scope: Preview only.** Do not touch Production or Development in this change. |
| 4 | **Verify Production is untouched.** Record Production's `BILLING_PROVIDER`, `PAYMENTS_ENABLED`, `STRIPE_MODE` and whether any `STRIPE_*` key is set — **before and after** — and confirm they are byte-identical. The audit found production carries no live payment path (LOOP 5: `PAYMENTS_ENABLED=false as const`, provider resolves to `noop`, all billing tables 0 rows). **That state must not change as a side effect of fixing a preview build.** |
| 5 | **Re-run a preview deploy** (re-push any open PR or use Vercel's redeploy) and confirm the build passes. |

**Do not** report the LIVE billing configuration as "verified safe" merely because the
preview build starts passing — those are different environments. Step 4 is the only
evidence that production was untouched.

---

## 4. Optional hardening (separate PR, not required for the fix)

Make the schema tolerant of an empty string so a blank variable degrades to the safe
default instead of breaking the build:

```ts
BILLING_PROVIDER: z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.enum(["stripe", "none"]).default("none"),
),
```

Worth considering across the env schema generally — an empty environment variable is a
common deployment artefact, and failing the whole build on one is a brittle failure mode
for a value that has a safe default. Any such change must keep the *live-payments* guards
strict: the safe direction is `"" → none`, never `"" → stripe`.

---

## 5. Why this matters beyond the annoyance

While preview builds fail, **no pull request gets a working preview deployment**. That
removes the only pre-merge environment where a reviewer could exercise a change in a
browser — which compounds the two coverage gaps found in the audit: 14 of 17 API route
handlers have no executed-code test coverage (LOOP 7 T-23), and production analytics has
never recorded an anonymous visitor (T-01). Restoring previews restores the one remaining
place a human can catch a regression before it reaches production.
