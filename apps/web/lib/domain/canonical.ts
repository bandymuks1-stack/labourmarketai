/**
 * Canonical domain policy — single source of truth for the
 * labourmarket.ai product surface.
 *
 * Policy (effective 2026-05-28, owner-decided):
 *   - `app.labourmarket.ai` is the CANONICAL production host.
 *   - `labourmarket.ai` (apex) and `www.labourmarket.ai` are
 *     LEGACY-ALIAS hosts that must 308-redirect to
 *     `https://app.labourmarket.ai/<same-path>?<same-query>`.
 *   - `labourmarket-ai.vercel.app` is the Vercel-managed
 *     production alias (used internally for OAuth + monitoring);
 *     it is NOT a public canonical surface and is not advertised.
 *   - Anything else under `.vercel.app` is a preview deploy and
 *     is gated by Vercel preview SSO (401). Previews never
 *     redirect to production.
 *
 * Why this exists: old LABMA content was previously served on
 * `labourmarket.ai` apex; the new labourmarket.ai product lives
 * in this repo and is deployed to `app.labourmarket.ai`. Owner
 * (2026-05-28) wants one canonical surface — old LABMA must not
 * be visible under the labourmarket.ai brand any more. This
 * module is the single place the middleware + tests + metadata
 * derive the canonical host from.
 *
 * PURE. No fs / net / spawn / env. Safe to import from middleware
 * (edge runtime), client components, and tests.
 */

/** The canonical production host. */
export const CANONICAL_HOST = "app.labourmarket.ai";

/** The canonical production origin (https://<canonical-host>). */
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}` as const;

/** Hosts that should 308-redirect to the canonical origin. */
export const LEGACY_REDIRECT_HOSTS: readonly string[] = [
  "labourmarket.ai",
  "www.labourmarket.ai",
];

/** Vercel-managed alias that is treated like canonical for auth
 *  / monitoring (not a public surface; not advertised). */
export const VERCEL_PRODUCTION_ALIAS = "labourmarket-ai.vercel.app";

/** Returns true if the given host should be 308-redirected to the
 *  canonical origin. Case-insensitive, port-stripping. */
export function isLegacyRedirectHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalised = host.toLowerCase().replace(/:\d+$/, "");
  return LEGACY_REDIRECT_HOSTS.includes(normalised);
}

/** Returns true if the given host is one of the production
 *  surfaces (canonical OR Vercel-managed alias). */
export function isProductionHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalised = host.toLowerCase().replace(/:\d+$/, "");
  return normalised === CANONICAL_HOST || normalised === VERCEL_PRODUCTION_ALIAS;
}

/** Build the canonical URL for a given pathname + search. */
export function buildCanonicalUrl(pathname: string, search: string = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${CANONICAL_ORIGIN}${path}${search ?? ""}`;
}
