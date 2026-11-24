# Search Index — Owner Actions v1 (2026-07-11)

Scope I of the non-landing launch repair. What the agent verified in code
and live production, and exactly what the owner still has to do in Google
Search Console (and Bing Webmaster Tools, optionally). No claim is made
that Google's index is already updated — none of the actions below have
been performed yet.

## What was verified (agent, 2026-07-11)

- **Canonical/hreflang/OG**: every public page serves apex canonicals,
  `og:url` on the apex and hreflang alternates (lt/en/ru live; nl/de land
  with the locale PR deploy). Verified live and in the local build.
- **robots.txt** (apex + app host): allows `/`, disallows `/api/`,
  `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`, `/*/design`;
  `Host: https://labourmarket.ai`; sitemap pointer correct.
- **sitemap.xml**: apex-only URLs; after the NL/DE deploy it emits every
  public path × 5 locales with hreflang alternates.
- **robots meta**: public pages `index, follow`. Dashboard/auth/onboarding
  are path-disallowed and never in the sitemap.
- **No "Labma" / "Construction OS"** signal anywhere in the served HTML,
  titles, metadata or sitemap of the new system.
- **Guards in CI**: `check:public-seo-indexing` (canonical host, robots
  rules, banned brand terms, no construction-first framing) now runs in the
  Quality Gates workflow on every PR.

## What SHOULD be indexed

- `https://labourmarket.ai/{lt,en,ru,nl,de}` and the public marketing
  paths per locale: `/for-workers`, `/for-companies`, `/for-agencies`,
  `/work-abroad`, `/work-opportunities`, `/skills`, `/professions`,
  `/labour-market` (+ country pages), `/company-need`, `/worker-intake`,
  `/pricing`, `/about` — exactly the sitemap contents.

## What must NOT be indexed

- Anything on `app.labourmarket.ai` (same content, canonicals point to the
  apex; robots disallows the app surfaces).
- `/*/dashboard`, `/*/auth`, `/*/onboarding`, `/*/cv`, `/*/design`, `/api/`.
- `labourmarket-ai.vercel.app` (legacy gated build — see owner action 4).

## Owner actions (Search Console)

1. **Verify both properties**: `labourmarket.ai` (Domain property, covers
   www + app subdomains) in Google Search Console — DNS TXT verification.
2. **Submit the sitemap**: `https://labourmarket.ai/sitemap.xml` under the
   domain property. Re-submit after the NL/DE deploy so the new locale
   URLs get discovered quickly.
3. **Clean old URLs**: in the "Removals" tool, request removal of any
   indexed URLs from the old LABMA-era apex content and of
   `labourmarket-ai.vercel.app` pages if any are indexed (check with
   `site:labourmarket-ai.vercel.app` and `site:labourmarket.ai` queries
   first; record what you find).
4. **Retire the legacy Vercel alias** (also in the domain truth doc):
   remove/park `labourmarket-ai.vercel.app` from the legacy project so the
   old "Labour Market Operating System" build stops resolving.
5. **(Optional) Bing Webmaster Tools**: verify the domain and submit the
   same sitemap.

## What to check AFTER indexing (1–2 weeks later)

- Search Console → Pages: apex URLs indexed; `app.` URLs reported as
  "Duplicate, Google chose canonical" or simply absent — both fine.
- `site:labourmarket.ai` shows only the new-system pages, all five
  locales; no "Labma", no "Construction OS" snippets.
- hreflang report (International targeting / Page indexing details) shows
  the 5-locale cluster without errors.
- `site:labourmarket-ai.vercel.app` returns nothing.

Until these checks pass, the index state is UNKNOWN — do not report the
search cleanup as done.
