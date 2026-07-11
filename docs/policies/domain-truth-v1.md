# Domain Truth — labourmarket.ai (v2, 2026-07-11)

This is the canonical domain policy for the labourmarket.ai product.
The middleware + metadata + tests are all derived from
`apps/web/lib/domain/canonical.ts`. If a change to the domain surface is
ever needed, update that module first; this doc, the middleware, and the
guard tests all follow it.

> **v2 supersedes v1 (2026-05-28).** v1 made `app.labourmarket.ai` the
> canonical host and 308-redirected apex + www to it — an emergency
> measure while old LABMA content still squatted the apex. On 2026-06-15
> the owner flipped the policy: the apex is the public canonical host and
> serves the marketing product; only www redirects. The code
> (`canonical.ts`, `middleware.ts`) was updated then, but this document
> was not — it stayed on v1 and contradicted both code and production
> until this v2 rewrite (non-landing launch repair v1). The v1 text is
> preserved below under "Version history" as the historical record.

## Canonical surface (current)

| Role | Host | Behaviour |
|---|---|---|
| **Public canonical** | `labourmarket.ai` (apex) | Serves the public marketing product. All SEO `canonical`, `hreflang`, OpenGraph URLs, sitemap entries and shareable URLs point here. Never redirected. |
| **App host** | `app.labourmarket.ai` | Auth + dashboard host. OAuth starts and finishes here (PKCE verifier stays same-origin). Auth CTAs on marketing hosts cross to this host via `AuthCtaLink` / `preferAppHostHref`. Serves the same Next.js deployment; `robots.txt` + per-page canonicals keep it out of the index. |
| WWW | `www.labourmarket.ai` | **308-redirects** to the apex, path + query preserved (`middleware.ts`). |
| Alias (Vercel-managed) | `labourmarket-ai.vercel.app` | Internal alias only. Never canonical, never advertised. **Known issue:** as of 2026-07-11 this alias still serves a separate, sign-in-gated legacy "Labour Market Operating System" build — see `docs/launch/domain-production-truth-v1.md` for the owner action. |
| Preview deploys | `*.vercel.app` (other) | Gated by Vercel preview SSO. Owner-only. Never redirect to production. |

Key invariants (enforced by `apps/web/lib/seo/seo-indexing-audit.ts` +
guard tests, wired into CI via `pnpm check:public-seo-indexing`):

- The apex is the only origin in canonicals, hreflang, OG URLs, sitemap and robots `Host`.
- www→apex 308 exists; there is **no** apex→app redirect.
- robots disallows `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`, `/*/design`.
- No "Labma" / "Construction OS" branding anywhere in the new system.
- Auth CTAs on marketing pages route through `AuthCtaLink` (app-host aware); the frozen landing page is the sole documented exception until its real-data replacement plan runs.

## What is legacy

- **Old LABMA** — a separate, pre-existing project that, until 2026-05-28,
  was served at the apex. It is not this repo, must not be used as a
  reference, and must never be re-mapped to any host above without an
  explicit owner decision recorded here.
- **The v1 "app is canonical" policy** — superseded 2026-06-15. Any doc,
  test or code comment still claiming apex 308→app describes v1 and is stale.

## Module + guard tests

- `apps/web/lib/domain/canonical.ts` — pure module, single source of truth
  (`MARKETING_ORIGIN` = apex, `APP_ORIGIN`, `preferAppHostHref`).
- `apps/web/lib/domain/canonical.test.ts`, `middleware-redirect.test.ts`
- `apps/web/lib/guards/auth-cta-app-host.test.ts` — helper + nav + page-body coverage.
- `apps/web/lib/seo/seo-indexing-audit.ts` + `lib/guards/public-seo-indexing.test.ts`
- `apps/web/middleware.ts` — www→apex ahead of locale + auth.

Any future change to canonical / legacy hosts MUST update this document
in the same PR.

## Version history

- **v2 — 2026-07-11** — doc realigned with the 2026-06-15 owner decision
  already live in code and production: apex is the public canonical host
  serving marketing; app.labourmarket.ai is the auth/dashboard host; only
  www redirects. Recorded the stale-alias owner action.
- **v1 — 2026-05-28** — owner decision at the time: `app.labourmarket.ai`
  canonical; apex + www 308 to it. Purpose: stop old LABMA content being
  visible under the labourmarket.ai brand. Superseded 2026-06-15.
