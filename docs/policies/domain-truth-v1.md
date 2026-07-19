# Domain Truth — labourmarket.ai (v3, 2026-07-19 — SINGLE DOMAIN)

This is the canonical domain policy for the labourmarket.ai product.
The middleware + next.config redirects + metadata + tests are all
derived from `apps/web/lib/domain/canonical.ts`. If a change to the
domain surface is ever needed, update that module first; this doc, the
middleware, and the guard tests all follow it.

> **v3 supersedes v2 (2026-07-11) and v1 (2026-05-28).** v2 kept a
> split architecture: apex = marketing, `app.labourmarket.ai` = auth +
> dashboard, with auth CTAs crossing hosts. On 2026-07-19 the owner
> ordered the single-domain migration (task
> `single-domain-and-deep-cleanup-v1`): **everything** lives on the
> apex; `www` and `app` are permanent redirect aliases only. Evidence
> at the time of migration showed both hosts already served the same
> Vercel deployment — the "two versions" impression was produced by
> the CTA host-upgrade, not by separate builds.

## Canonical surface (current)

| Role | Host | Behaviour |
|---|---|---|
| **The one product origin** | `labourmarket.ai` (apex) | Serves EVERYTHING: marketing, auth (login / signup / OAuth callback / password recovery), onboarding, dashboard, all workspaces, admin, projects, matching, messaging, finance, commercial, assets, absences, marketplace, public business pages, API routes, invitation deep links. All SEO `canonical`, `hreflang`, OpenGraph URLs, sitemap entries, email links and shareable URLs point here. Never redirected. |
| Legacy alias | `www.labourmarket.ai` | **308** to `https://labourmarket.ai/<same-path>?<same-query>` (next.config + middleware). |
| Legacy alias | `app.labourmarket.ai` | **308** to `https://labourmarket.ai/<same-path>?<same-query>`. Must NEVER serve product content again. Old bookmarks / deep links / invitation URLs keep working via the redirect. |
| Alias (Vercel-managed) | `labourmarket-ai.vercel.app` | Internal alias only. Never canonical, never advertised. |
| Preview deploys | `*.vercel.app` (other) | Gated by Vercel preview SSO. Owner-only. Never redirect to production. |

Key invariants (enforced by `apps/web/lib/seo/seo-indexing-audit.ts`,
`apps/web/lib/guards/single-domain-origin.test.ts` and the domain
tests, wired into CI via `pnpm -F web test` +
`pnpm -F web check:public-seo-indexing`):

- The apex is the only origin in canonicals, hreflang, OG URLs, sitemap and robots `Host`.
- `www` **and** `app` → apex 308 (path + query + locale + `next` + invitation tokens preserved); the apex itself is never redirected (no loops).
- Host redirects exist in BOTH layers: `next.config.ts` (`has: host` rules — cover `/api/*` and static paths) and `middleware.ts` (belt-and-braces for app-shell routes).
- `preferAppHostHref` / auth-CTA host upgrades must not be reintroduced; auth CTAs are relative links.
- The raw Supabase project-ref host (`gorgitwvdzxbnaxhrsrw.supabase.co`) never appears in user-facing source (messages / components / app routes). See "Auth origin visibility" below.
- robots disallows `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`, `/*/design`.
- No "Labma" / "Construction OS" branding anywhere in the new system.

## Auth origin visibility (owner-gated remainder)

Email/password auth is pure XHR — the browser address bar never leaves
`labourmarket.ai`. Two Supabase-hosted seams remain and can only be
removed with Supabase/Google console changes (documented in
`docs/audit/single-domain-and-deep-cleanup-v1.md`):

1. **Google OAuth hop** — `signInWithOAuth` navigates via
   `<ref>.supabase.co/auth/v1/authorize` → Google → back through the
   Supabase callback → apex. Removing the visible hop requires the
   Supabase **custom auth domain** (paid add-on) or a first-party
   `signInWithIdToken` flow (Google console change). Owner decision.
2. **Auth emails** (recovery/confirmation) — Supabase default templates
   link through `<ref>.supabase.co/auth/v1/verify`. Fixable in the
   Supabase dashboard (email templates → token-hash links to
   `https://labourmarket.ai/{locale}/auth/…`).

## What is legacy

- **Old LABMA** — a separate, pre-existing project that, until 2026-05-28,
  was served at the apex. It is not this repo, must not be used as a
  reference, and must never be re-mapped to any host above without an
  explicit owner decision recorded here.
- **The v1 "app is canonical" policy** (2026-05-28) and **the v2 split
  marketing/app policy** (2026-06-15) — both superseded 2026-07-19. Any
  doc, test or comment still describing `app.labourmarket.ai` as a
  serving host, or auth CTAs crossing hosts, is stale.

## Module + guard tests

- `apps/web/lib/domain/canonical.ts` — pure module, single source of truth
  (`CANONICAL_HOST` / `CANONICAL_ORIGIN` = apex; `LEGACY_REDIRECT_HOSTS`).
- `apps/web/lib/domain/canonical.test.ts`, `middleware-redirect.test.ts`
- `apps/web/lib/guards/single-domain-origin.test.ts` — split-domain regression guard.
- `apps/web/lib/guards/auth-middleware-session.test.ts` — legacy-host 308 at middleware level.
- `apps/web/lib/seo/seo-indexing-audit.ts` + `lib/guards/public-seo-indexing.test.ts`
- `apps/web/middleware.ts` — legacy-host 308 ahead of locale + auth.
- `apps/web/next.config.ts` — host-scoped 308 redirects incl. `/api/*`.

Any future change to canonical / legacy hosts MUST update this document
in the same PR.

## Version history

- **v3 — 2026-07-19** — single-domain migration: apex serves everything;
  `www` + `app` are 308 aliases only; split-domain CTA helper removed;
  regression guards added. Task `single-domain-and-deep-cleanup-v1`.
- **v2 — 2026-07-11** — doc realigned with the 2026-06-15 owner decision:
  apex public canonical serving marketing; app.labourmarket.ai the
  auth/dashboard host; only www redirects.
- **v1 — 2026-05-28** — owner decision at the time: `app.labourmarket.ai`
  canonical; apex + www 308 to it. Purpose: stop old LABMA content being
  visible under the labourmarket.ai brand. Superseded 2026-06-15.
