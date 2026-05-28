# Domain Truth — labourmarket.ai (v1, 2026-05-28)

This is the canonical, permanent domain policy for the
labourmarket.ai product. The middleware + metadata + tests are
all derived from `apps/web/lib/domain/canonical.ts`. If a change
to the domain surface is ever needed, update that module first;
this doc, the middleware, and the guard tests all follow it.

## Canonical surface

| Role | Host | Behaviour |
|---|---|---|
| **Canonical app** | `app.labourmarket.ai` | Serves the new labourmarket.ai product (this repo). All public links, SEO `canonical`, OAuth callbacks, and shareable URLs point here. |
| Alias (Vercel-managed) | `labourmarket-ai.vercel.app` | Internal production alias used by Vercel + monitoring. Not advertised. Treated as a production host (no redirect) so OAuth `request_id` traces stay intact, but it's not the canonical URL. |
| Apex (legacy) | `labourmarket.ai` | **308-redirects** to `https://app.labourmarket.ai/<path>?<query>`. Was previously serving old LABMA content; this redirect is what made that drift stop. |
| WWW (legacy) | `www.labourmarket.ai` | **308-redirects** to `https://app.labourmarket.ai/<path>?<query>`. Same reason as apex. |
| Preview deploys | `*.vercel.app` (other) | Gated by Vercel preview SSO (401). Owner-only. Never redirect to production; previews need to stand alone for inspection. |

## What is legacy

- **Old LABMA** — a separate, pre-existing project that, until
  2026-05-28, was the surface served at `labourmarket.ai` (apex)
  and possibly `www.labourmarket.ai`. **It is not this repo.**
  Old LABMA content must not be used as a reference for any new
  labourmarket.ai work, must not be imported into this repo, and
  must not be re-mapped to any host in the table above without
  an explicit owner decision recorded in this document.

- **Pre-canonical metadata** — any code path that hard-coded
  `https://labourmarket.ai` as the canonical URL was making
  the LABMA-content-on-apex problem worse by signalling SEO and
  share-links to a host that didn't serve our product. Every
  such reference is migrated to `CANONICAL_ORIGIN` from
  `@/lib/domain/canonical`.

## What must NEVER be used as source

The following must NOT be used as a starting point, reference,
or template for new labourmarket.ai work:

1. The old LABMA repo and any of its files.
2. Snapshots, exports, or screenshots of the content that was
   previously served at `labourmarket.ai` apex (those represent
   the old LABMA, not this product).
3. Any DNS, Vercel project, or hosting-config that points
   `labourmarket.ai` apex (or `www`) at anywhere other than this
   project. Re-attaching the legacy LABMA project to the
   labourmarket.ai apex is forbidden.

## Owner action — DNS + Vercel attachment (one-time)

The middleware + metadata changes in this repo ensure the
canonical policy is honoured **as soon as the legacy hosts
point at this Vercel project**. If the legacy hosts still serve
old LABMA, the redirect won't fire because the request never
reaches this app. The owner-side steps are:

1. Vercel dashboard → labourmarket.ai project → Settings →
   Domains:
   - Add `labourmarket.ai` (apex) to this project.
   - Add `www.labourmarket.ai` to this project.
   - `app.labourmarket.ai` should already be attached as the
     canonical app domain.
2. Detach `labourmarket.ai` apex and `www.labourmarket.ai`
   from the legacy LABMA Vercel project (Vercel rejects the
   add in step 1 until the previous owner releases the domain).
3. DNS (Cloudflare or current provider):
   - `labourmarket.ai` apex → ALIAS/ANAME → `cname.vercel-dns.com`
     (or the apex record Vercel suggests when you add the domain).
   - `www.labourmarket.ai` → CNAME → `cname.vercel-dns.com`.
   - `app.labourmarket.ai` → CNAME → `cname.vercel-dns.com` (no change if already set).
4. Once Vercel issues the SSL certificate (usually <5 min),
   the middleware in this repo immediately handles the redirect:
   `https://labourmarket.ai/x` and `https://www.labourmarket.ai/x`
   both 308 to `https://app.labourmarket.ai/x`.

## Verification (post-attachment)

```sh
curl -I https://labourmarket.ai/lt
# Expect: HTTP/2 308, location: https://app.labourmarket.ai/lt

curl -I https://www.labourmarket.ai/lt
# Expect: HTTP/2 308, location: https://app.labourmarket.ai/lt

curl -I https://app.labourmarket.ai/lt
# Expect: HTTP/2 200 (or 307 from the locale stripper)
```

## Module + guard tests

The policy is locked by these source-tree artefacts:

- `apps/web/lib/domain/canonical.ts` — pure module, single source of truth.
- `apps/web/lib/domain/canonical.test.ts` — value + anti-regression tests (apex must NEVER be canonical).
- `apps/web/lib/domain/middleware-redirect.test.ts` — behavioural contract for the redirect.
- `apps/web/middleware.ts` — host-normalization wired ahead of locale + auth.
- `apps/web/app/[locale]/layout.tsx` — `metadataBase` + `alternates.canonical` resolve from the canonical origin.

Any future change to canonical / legacy hosts MUST update this
document in the same PR.

## Version history

- **v1 — 2026-05-28** — owner decision: `app.labourmarket.ai` is
  canonical; apex + www 308 to it. Old LABMA content must stop
  being visible under the labourmarket.ai brand.
