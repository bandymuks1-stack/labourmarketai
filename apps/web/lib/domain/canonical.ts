/**
 * Canonical domain policy — SINGLE DOMAIN.
 *
 * Policy (effective 2026-07-19, owner task
 * `single-domain-and-deep-cleanup-v1` — SUPERSEDES the 2026-06-15
 * split marketing/app policy and the 2026-05-28 "apex redirects to
 * app" policy):
 *
 *   - `labourmarket.ai` (apex) is the ONLY public product origin.
 *     It serves EVERYTHING: marketing, auth (login / signup /
 *     callback / password recovery), onboarding, dashboard, all
 *     workspaces, admin, public business pages and API routes.
 *     Every canonical URL / sitemap entry / OpenGraph URL /
 *     hreflang / email link points here.
 *   - `www.labourmarket.ai` and `app.labourmarket.ai` are LEGACY
 *     REDIRECT ALIASES only. Both permanently (308) redirect to
 *     `https://labourmarket.ai/<same-path>?<same-query>`, preserving
 *     locale, `next` params, entity IDs and invitation tokens so old
 *     bookmarks and deep links keep working. `app.labourmarket.ai`
 *     must NEVER serve product content again — reintroducing it as a
 *     product origin is a policy violation (guarded by
 *     lib/guards/single-domain-origin.test.ts).
 *   - `labourmarket-ai.vercel.app` is the Vercel-managed alias
 *     (internal/monitoring); it is NOT advertised anywhere.
 *   - Anything else under `.vercel.app` is a preview deploy gated by
 *     Vercel preview SSO. Previews never redirect to production.
 *
 * Why this changed: the split policy pinned auth CTAs to the app
 * subdomain via a host-upgrade helper (now removed), which made the
 * product LOOK like two versions — users bounced between hosts,
 * sessions were host-scoped, and the app subdomain leaked into
 * bookmarks and emails. Both hosts always served the same Vercel
 * deployment; the single-domain policy keeps every flow (including
 * the whole OAuth PKCE round-trip) on one origin, so there is no
 * cross-host cookie seam at all.
 *
 * Host → deployment binding lives in Vercel + DNS, not here. This
 * module + middleware + next.config redirects encode the in-app rule
 * (www/app → apex 308; the apex never redirects to another host).
 *
 * PURE. No fs / net / spawn / env. Safe to import from middleware
 * (edge runtime), client components, and tests.
 */

/** The ONLY canonical product host (apex). */
export const CANONICAL_HOST = "labourmarket.ai";

/** The only canonical product origin (https://<canonical-host>). */
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}` as const;

/**
 * Back-compat aliases — the SEO layer (metadata / robots / sitemap /
 * answer-engine) imports these names. Same value as the canonical
 * host/origin BY DEFINITION under the single-domain policy.
 */
export const MARKETING_HOST = CANONICAL_HOST;
export const MARKETING_ORIGIN = CANONICAL_ORIGIN;

/** Legacy www alias — 308 redirect to the apex only. */
export const WWW_HOST = "www.labourmarket.ai";

/** Legacy app alias — 308 redirect to the apex ONLY. Never a product
 *  origin. Kept as a named constant so redirect config + guards can
 *  reference it without scattering the literal. */
export const LEGACY_APP_HOST = "app.labourmarket.ai";

/** Hosts that must permanently redirect to the canonical origin. */
export const LEGACY_REDIRECT_HOSTS: readonly string[] = [
  WWW_HOST,
  LEGACY_APP_HOST,
];

/** Vercel-managed alias treated as internal (monitoring);
 *  not a public surface, not advertised, never redirected here. */
export const VERCEL_PRODUCTION_ALIAS = "labourmarket-ai.vercel.app";

/** Normalize a host header: lower-case, strip any :port suffix. */
function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  return host.toLowerCase().replace(/:\d+$/, "");
}

/** Returns true if the given host must be permanently redirected to
 *  the canonical origin (www + legacy app host).
 *  Case-insensitive, port-stripping. */
export function isLegacyRedirectHost(host: string | null | undefined): boolean {
  const normalised = normalizeHost(host);
  if (!normalised) return false;
  return LEGACY_REDIRECT_HOSTS.includes(normalised);
}

/** Returns true if the host is the canonical apex host. */
export function isCanonicalHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === CANONICAL_HOST;
}

/** Build a full URL on the canonical origin. */
export function buildCanonicalUrl(pathname: string, search: string = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${CANONICAL_ORIGIN}${path}${search ?? ""}`;
}
