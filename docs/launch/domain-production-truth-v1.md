# Domain Production Truth — v1 (2026-07-11)

Factual production audit performed as part of the non-landing launch
repair (Scope A). Every check below was run against live production on
2026-07-11 with plain HTTPS requests (no cache). Policy source of truth:
`docs/policies/domain-truth-v1.md` (v2) and `apps/web/lib/domain/canonical.ts`.

## Measured production state

| URL | Status | Redirect chain | Final host |
|---|---|---|---|
| `https://labourmarket.ai` | 200 | `/` → `/lt` (1 hop) | `labourmarket.ai` |
| `https://www.labourmarket.ai` | 308 → 200 | www → apex → `/lt` (2 hops) | `labourmarket.ai` |
| `https://app.labourmarket.ai` | 200 | `/` → `/lt` (1 hop) | `app.labourmarket.ai` |
| `https://labourmarket-ai.vercel.app` | 307 → 200 | `/` → `/sign-in?callbackUrl=…` | `labourmarket-ai.vercel.app` |

Per-page head audit (apex `/lt`, `/en`, `/lt/pricing`, `/lt/for-workers`,
`/lt/company-need`; app `/lt`):

- **Title**: `LabourMarket.ai — …` per locale/page. No "Labma", no
  "Construction OS" anywhere in served HTML. ✅
- **Canonical**: every page (including on `app.labourmarket.ai`) points to
  `https://labourmarket.ai/<locale>[/path]`. ✅
- **og:url**: apex, matches canonical. ✅
- **robots meta**: `index, follow` on public pages. ✅
- **robots.txt** (identical on apex and app host): allows `/`, disallows
  `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`,
  `/*/design`; `Host: https://labourmarket.ai`;
  `Sitemap: https://labourmarket.ai/sitemap.xml`. ✅
- **sitemap.xml**: 78 entries, all on apex, locales lt/en/ru. ✅
- **hreflang**: present on every public page checked — `lt`/`en`/`ru` +
  `x-default`, all on the apex (rendered as React's `hrefLang` attribute;
  an initial case-sensitive scan produced a false negative, re-verified
  case-insensitively). ✅
- **Auth links in served HTML**: relative `/lt/auth/login|signup` (see finding 2). ⚠️

## Findings and their classification

### 1. `app.labourmarket.ai` serves the full marketing landing — deployment topology, acceptable, documented
Both hosts serve the same Next.js deployment; there is no host-based
routing that limits the app host to auth/dashboard surfaces. SEO is safe
(canonicals on the app host point to the apex; robots block dashboard,
auth and onboarding paths), so there is no duplicate-content or indexing
risk. Splitting page-serving by host would require middleware host
routing that the 2026-06-15 owner policy explicitly declined ("app host
falls through and serves content"). **No code change. Not a launch blocker.**

### 2. Auth CTAs in page bodies stay on the apex origin — code issue, FIXED in this PR
`SiteNav` already used the host-aware `AuthCtaLink` (which crosses to
`app.labourmarket.ai` on marketing hosts so the OAuth PKCE round-trip
starts and finishes on one origin). But page-body CTAs on
`/company-need`, `/worker-intake` and `/work-abroad` used the bare locale
`Link` and kept visitors on the apex for login/signup. Fixed by routing
them through `AuthCtaLink`; a new guard in
`lib/guards/auth-cta-app-host.test.ts` scans every non-landing marketing
page for bare `/auth/*` links.

**Documented exception:** the frozen landing page
(`app/[locale]/(marketing)/page.tsx`, lines with `/auth/signup` CTAs)
also uses bare links. It is under the landing content freeze and was NOT
changed. Its CTAs land on `<apex>/<locale>/auth/*`, which still works
(email+password login is same-origin; the middleware serves auth pages on
the apex) but starts OAuth on the apex origin. This must be fixed inside
the owner-approved landing real-data replacement plan.

### 3. hreflang alternates — VERIFIED CORRECT in production (no action)
Every public page checked serves `lt`/`en`/`ru` + `x-default` alternates on
the apex, exactly matching `hreflangAlternates()` in
`apps/web/lib/seo/metadata.ts`. (Audit note: React renders the attribute as
`hrefLang`, so a case-sensitive `grep hreflang` false-negatives — check
case-insensitively.) After the NL/DE locale PR merges and deploys, re-verify
that `nl` and `de` appear:

```sh
curl -s https://labourmarket.ai/lt/pricing | grep -i hreflang
# expect: lt / en / ru / nl / de + x-default, all on apex
```

### 4. `labourmarket-ai.vercel.app` serves a legacy gated build — external, OWNER ACTION REQUIRED
The alias returns a sign-in-gated page titled
"labourmarket.ai — Labour Market Operating System" (description: "Clean
rebuild … gated for owner review"). This is a **different Vercel project**
than the one serving apex/app (this repo's alias would serve the same
build as production). Repo code cannot change another project's domain
assignment, and the Vercel CLI in this session had no project link.

**Owner actions (Vercel dashboard):**
1. Open the Vercel team → identify the project that owns the
   `labourmarket-ai.vercel.app` domain (the legacy "owner review" build).
2. Either delete/archive that legacy project, or remove/rename its
   `labourmarket-ai.vercel.app` domain so the alias stops resolving to it.
3. (Optional, recommended) In the real production project, confirm domain
   assignments: `labourmarket.ai` (production), `www.labourmarket.ai`
   (redirect handled by our middleware), `app.labourmarket.ai` (production).
4. No DNS change is required for findings 1–3; do not change DNS for this.

Until done, the alias is not indexed-canonical anywhere (it is not
referenced from the new system) and is login-gated, so the exposure is
low — but it is the last remaining "old product" signal.

### 5. Guard/CI gaps — FIXED in this PR
- `check:public-seo-indexing` existed only inside `apps/web`; added a root
  passthrough and wired it (plus the `check:i18n-debt` ratchet) into
  `.github/workflows/quality.yml`.
- Added the landing-freeze guard
  (`lib/guards/landing-freeze.test.ts` + committed SHA-256 baseline) so no
  later PR in this train — or any future PR — can silently change the
  landing page, its component tree, its placeholder feed, or its lt/en/ru
  i18n namespaces.

## Acceptance vs Scope A

| Acceptance criterion | State |
|---|---|
| `labourmarket.ai` is the public canonical host | ✅ live |
| `www.labourmarket.ai` permanent-redirects to apex | ✅ live (308) |
| `app.labourmarket.ai` is the auth/dashboard host | ✅ auth+dashboard live there; also serves marketing (finding 1, accepted) |
| No "Labma — Construction OS" in new-system production | ✅ verified |
| Canonical + hreflang never point to app/Vercel alias | ✅ canonical verified live; hreflang verified in code+local build, lands with next deploy (finding 3) |
| Auth CTA from apex leads to app host | ✅ nav already did; page bodies fixed in this PR; frozen landing documented exception (finding 2) |

## Owner actions summary

1. **Vercel**: retire the legacy project behind `labourmarket-ai.vercel.app` (finding 4).
2. **After this train merges**: confirm hreflang appears in production HTML (finding 3 command).
3. No DNS changes required or recommended right now.
