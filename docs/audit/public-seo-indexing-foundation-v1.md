# Public SEO Indexing Foundation v1

**Branch:** `fix/public-seo-indexing-foundation-v1`
**Date:** 2026-06-15
**Scope:** public indexing, www redirect, brand metadata, robots, sitemap, SEO base.
**Out of scope (untouched):** billing/payments/Stripe, DB migrations, auth core logic
(only the host-redirect rule changed), worker/company data.

---

## 1. The problem

Searching `www.labourmarket.ai` / `labourmarket.ai` returned no clear information
about the project, and results surfaced the old / confused **"Labma — Construction OS"**
signal instead of LabourMarket.ai.

Root causes found in the code + live checks (2026-06-15):

- **Apex + www both 308-redirected to `app.labourmarket.ai`** (the 2026-05-28 canonical
  policy). The public marketing surface therefore had **no indexable host of its own** —
  Google only ever saw a redirect, never a clean `labourmarket.ai` page.
  - Live before: `https://labourmarket.ai` → `308` → `https://app.labourmarket.ai/`
  - Live before: `https://www.labourmarket.ai` → `308` → `https://app.labourmarket.ai/`
- **No `robots.txt`** and **no `sitemap.xml`** existed (no `app/robots.ts` / `app/sitemap.ts`).
- **Thin / generic brand metadata:** the title was `labourmarket.ai — the living labour market`
  with a single description; no per-page canonical, no hreflang, no OpenGraph/Twitter brand,
  no per-page titles.

(The literal string "Labma — Construction OS" is **not** in this repo — the stale signal is
Google's index of the old apex content. The fix is to give the apex a clean, indexable
public surface so search engines re-index it.)

---

## 2. What changed (code)

| Area | File | Change |
|------|------|--------|
| Canonical policy | `lib/domain/canonical.ts` | Rewritten. **Apex `labourmarket.ai` = public marketing canonical**; `www.labourmarket.ai` → apex; `app.labourmarket.ai` = app host. New exports: `MARKETING_HOST/ORIGIN`, `APP_HOST/ORIGIN`, `WWW_HOST`, `isWwwRedirectHost`, `isMarketingHost`, `isAppHost`, `buildAppUrl`. `CANONICAL_ORIGIN` kept as back-compat alias = apex. |
| Host redirect | `middleware.ts` | `maybeRedirectWwwToApex`: **www → apex 308**. The apex is no longer redirected — it serves content. App host untouched. |
| Brand metadata | `app/[locale]/layout.tsx` | `generateMetadata` (locale-aware): brand title/description (lt/en/ru), `metadataBase = apex`, robots `index/follow`, OpenGraph + Twitter. No tree-wide canonical (so subpages aren't mislabeled). |
| SEO helper | `lib/seo/metadata.ts` | New pure module: `BRAND_SEO`, `PAGE_SEO`, `buildPageMetadata`, `buildPageMetadataFor`, `hreflangAlternates`, `localizedUrl`. Per-page canonical + hreflang on the apex. |
| Per-page meta | 8 marketing pages | `generateMetadata` added: home, for-workers, for-companies, for-agencies, work-abroad, company-need, worker-intake, labour-market, pricing. |
| robots | `app/robots.ts` | New. Allows public root, blocks app/internal, points at apex sitemap. |
| sitemap | `app/sitemap.ts` | New. Public marketing routes × active locales (lt/en/ru) with hreflang, apex origin. |
| Guard | `lib/seo/seo-indexing-audit.ts`, `lib/guards/public-seo-indexing.test.ts`, `scripts/check-public-seo-indexing.ts` | Pure audit + CI vitest guard + `pnpm -F web check:public-seo-indexing`. |
| Tests | `lib/domain/canonical.test.ts`, `lib/domain/middleware-redirect.test.ts` | Rewritten to the new policy (anti-regression now protects apex-as-canonical). |

The brand title is now (homepage, by locale):

- **en:** `LabourMarket.ai — Construction Workers, Teams and Employer Needs in Europe`
- **lt:** `LabourMarket.ai — darbuotojai, brigados ir darbdavių poreikiai Europoje`
- **ru:** `LabourMarket.ai — строители, бригады и потребности работодателей в Европе`

---

## 3. How it should work after this change + the Vercel/DNS owner action

**Intended behaviour:**

- `https://labourmarket.ai` → **serves** the public marketing site (HTTP 200 / locale
  redirect to `/lt`). It is the canonical host: every canonical tag, hreflang alternate,
  OpenGraph URL and sitemap entry points here.
- `https://www.labourmarket.ai` → **301/308 redirect** to `https://labourmarket.ai`
  (same path + query).
- `https://app.labourmarket.ai` → stays the app/login/dashboard host. The public
  marketing domain never auto-redirects here; only an explicit login/app CTA does.

> **⚠️ OWNER ACTION REQUIRED (Vercel + DNS) — code alone cannot finish this.**
> The www→apex redirect and "apex must not redirect to app" rule are now in the app
> middleware, but **which Vercel domain is a primary vs. a redirect is configured in the
> Vercel dashboard, not in code.** The apex currently 308s to app at the edge. After this
> PR deploys, the owner must:
>
> 1. **Vercel → project (the one serving `app.labourmarket.ai`) → Settings → Domains.**
> 2. Ensure **`labourmarket.ai` (apex) is attached to this project as a normal domain**
>    (NOT configured as "Redirect to app.labourmarket.ai"). If a domain-level redirect
>    apex→app exists, **remove it** so the app/middleware serves the apex.
> 3. Ensure **`www.labourmarket.ai`** is attached and set to **Redirect → `labourmarket.ai`
>    (308 Permanent)** — or leave it on the project and let the middleware redirect it.
>    Either is fine; do not point www at app.
> 4. **DNS (registrar):** apex `A`/`ALIAS` → Vercel (`76.76.21.21` or the Vercel-provided
>    ALIAS), `www` `CNAME` → `cname.vercel-dns.com`. Keep existing MX/SPF/DKIM/DMARC.
> 5. Keep `app.labourmarket.ai` pointed at the app deployment unchanged.

If apex is already served by this Vercel project (just with an edge redirect), removing the
edge redirect + deploying this branch is sufficient — the middleware handles www→apex.

---

## 4. Routes in the sitemap (`/sitemap.xml`)

Each emitted **per active locale (lt/en/ru)** with hreflang alternates, on `https://labourmarket.ai`:

- `/{locale}` (home)
- `/{locale}/for-workers`
- `/{locale}/for-companies`
- `/{locale}/for-agencies`
- `/{locale}/work-abroad`
- `/{locale}/company-need`
- `/{locale}/worker-intake`
- `/{locale}/labour-market`
- `/{locale}/labour-market/{country}` for `lt, lv, ee, pl, de, nl`
- `/{locale}/match-preview`
- `/{locale}/pricing`
- `/{locale}/vision`
- `/{locale}/legal/privacy`, `/legal/terms`, `/legal/cookies`

## 5. Routes blocked by `/robots.txt`

`Disallow`: `/api/`, `/*/dashboard` (covers nested `/admin/*`), `/*/onboarding`,
`/*/auth`, `/*/cv`, `/*/design`. `Allow: /`. `Host` + `Sitemap` = apex.

---

## 6. Validation results (2026-06-15, on this branch)

- `pnpm -F web typecheck` → **pass** (0 errors)
- `pnpm -F web lint` → **pass** (0 warnings)
- `pnpm -F web test` → **pass** (273 files, 3955 tests)
- `pnpm -F web build` → **pass** (`/robots.txt` + `/sitemap.xml` emitted as static)
- `pnpm -F web check:public-seo-indexing` → **pass**

Verified from the build output:
- `/robots.txt` → apex host + sitemap, app/internal disallowed.
- `/sitemap.xml` → apex URLs + hreflang for lt/en/ru.
- `/lt` home → `<title>` LT brand, `canonical https://labourmarket.ai/lt`, hreflang set.
- `/lt/for-workers` → localized title + apex canonical + hreflang.

---

## 7. Production smoke checklist (after merge + deploy + the §3 owner action)

```
# Apex must SERVE (200 or 307→/lt), NOT redirect to app:
curl -sSI https://labourmarket.ai            # expect 200 or 307 → /lt (same host)
curl -sSI https://labourmarket.ai/lt         # expect 200

# www must redirect to apex:
curl -sSI https://www.labourmarket.ai        # expect 301/308 → https://labourmarket.ai/...

# robots + sitemap on the apex:
curl -sS  https://labourmarket.ai/robots.txt   # Host + Sitemap = labourmarket.ai
curl -sS  https://labourmarket.ai/sitemap.xml  # <loc> = https://labourmarket.ai/...

# app stays the app zone:
curl -sSI https://app.labourmarket.ai        # app/login (unchanged)

# brand check:
curl -sS  https://labourmarket.ai/lt | grep -i "<title>"   # LabourMarket.ai brand
```

PASS = apex serves a 200/`/lt`, www 301/308→apex, robots+sitemap on apex, app unchanged,
title shows the LabourMarket.ai brand (no "Labma — Construction OS").

---

## 8. Google Search Console + Bing Webmaster submit checklist (owner)

**Google Search Console** (https://search.google.com/search-console):
1. **Add a Domain property** for `labourmarket.ai` (covers apex + www + all subdomains).
2. **Verify via DNS** — add the `TXT` record GSC provides at the registrar; confirm.
3. **Submit the sitemap:** Sitemaps → add `https://labourmarket.ai/sitemap.xml`.
4. **Request indexing** for `https://labourmarket.ai/lt` (and `/en`, `/ru`) via URL Inspection.
5. **Check the www redirect:** inspect `https://www.labourmarket.ai` → should report the
   apex as canonical / a redirect.
6. (Optional) Add a separate URL-prefix property for `https://app.labourmarket.ai` only if
   you want app-host diagnostics — it is not part of the public sitemap.

**Bing Webmaster Tools** (https://www.bing.com/webmasters):
1. Add site `https://labourmarket.ai` (or **import from GSC** to skip re-verification).
2. Verify via DNS `TXT` (or the GSC import).
3. Submit sitemap `https://labourmarket.ai/sitemap.xml`.
4. Use **URL submission** for the apex home pages.

After submission, allow days–weeks for the old "Labma — Construction OS" result to be
replaced by the LabourMarket.ai brand as Google/Bing re-crawl the apex.
