/**
 * Canonical domain policy — single source of truth for the
 * labourmarket.ai public surface vs. the app surface.
 *
 * Policy (effective 2026-06-15, owner-decided — SUPERSEDES the
 * 2026-05-28 "apex redirects to app" policy):
 *
 *   - `labourmarket.ai` (apex) is the CANONICAL PUBLIC MARKETING
 *     surface. It serves the public site (home + marketing pages)
 *     and is the host every public canonical URL / sitemap entry /
 *     OpenGraph URL points to. Search engines should index it.
 *   - `www.labourmarket.ai` is an ALIAS that must permanently
 *     (308 / 301-class) redirect to the apex
 *     `https://labourmarket.ai/<same-path>?<same-query>`.
 *   - `app.labourmarket.ai` is the APP host — login / dashboard /
 *     authenticated product. It is NOT the public marketing
 *     canonical. Public marketing pages served there still declare
 *     their canonical on the apex so Google consolidates on apex.
 *     The public marketing domain must never auto-redirect to the
 *     app subdomain; only an explicit login/app CTA sends a user
 *     there.
 *   - `labourmarket-ai.vercel.app` is the Vercel-managed alias
 *     (used internally for OAuth + monitoring); it is NOT a public
 *     canonical surface and is not advertised.
 *   - Anything else under `.vercel.app` is a preview deploy gated
 *     by Vercel preview SSO (401). Previews never redirect to
 *     production.
 *
 * Why this changed: the apex was previously redirecting to
 * `app.labourmarket.ai`, so search engines never saw a clean
 * LabourMarket.ai public surface — results showed the old / confused
 * "Labma — Construction OS" signal instead. The owner (2026-06-15)
 * wants LabourMarket.ai to surface clearly as a public labour-market
 * platform for construction / technical workers, teams, agencies and
 * employers across Europe. The apex now serves and owns the public
 * SEO surface; the app keeps its own subdomain.
 *
 * NOTE: actual host→deployment assignment (which Vercel domain is
 * primary vs. redirect) is configured in the Vercel dashboard + DNS,
 * NOT in code. This module + the middleware encode the in-app rule
 * (www→apex, no apex→app); the owner must ensure the apex is attached
 * to this project as a primary (non-redirecting) domain. See
 * docs/audit/public-seo-indexing-foundation-v1.md for the OWNER
 * ACTION list.
 *
 * PURE. No fs / net / spawn / env. Safe to import from middleware
 * (edge runtime), client components, and tests.
 */

/** The canonical PUBLIC MARKETING host (apex). */
export const MARKETING_HOST = "labourmarket.ai";

/** The canonical public marketing origin (https://<marketing-host>). */
export const MARKETING_ORIGIN = `https://${MARKETING_HOST}` as const;

/** The APP host — login / dashboard / authenticated product. */
export const APP_HOST = "app.labourmarket.ai";

/** The app origin (https://<app-host>). */
export const APP_ORIGIN = `https://${APP_HOST}` as const;

/** The www alias that must redirect to the apex. */
export const WWW_HOST = "www.labourmarket.ai";

/**
 * Back-compat alias. `CANONICAL_ORIGIN` now means the canonical
 * PUBLIC surface (apex), which is what metadataBase / canonical
 * URLs need. (Previously it meant the app host.)
 */
export const CANONICAL_ORIGIN = MARKETING_ORIGIN;

/** Hosts that must permanently redirect to the apex marketing origin. */
export const WWW_REDIRECT_HOSTS: readonly string[] = [WWW_HOST];

/** Vercel-managed alias treated as internal (auth / monitoring);
 *  not a public surface, not advertised, never redirected here. */
export const VERCEL_PRODUCTION_ALIAS = "labourmarket-ai.vercel.app";

/** Normalize a host header: lower-case, strip any :port suffix. */
function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  return host.toLowerCase().replace(/:\d+$/, "");
}

/** Returns true if the given host should be permanently redirected to
 *  the apex marketing origin (currently: www.labourmarket.ai).
 *  Case-insensitive, port-stripping. */
export function isWwwRedirectHost(host: string | null | undefined): boolean {
  const normalised = normalizeHost(host);
  if (!normalised) return false;
  return WWW_REDIRECT_HOSTS.includes(normalised);
}

/** Returns true if the host is the apex public marketing host. */
export function isMarketingHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === MARKETING_HOST;
}

/** Returns true if the host is the app host. */
export function isAppHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === APP_HOST;
}

/** Returns true if the host is one of the production surfaces
 *  (apex marketing, app, or Vercel-managed alias). */
export function isProductionHost(host: string | null | undefined): boolean {
  const normalised = normalizeHost(host);
  if (!normalised) return false;
  return (
    normalised === MARKETING_HOST ||
    normalised === APP_HOST ||
    normalised === VERCEL_PRODUCTION_ALIAS
  );
}

/** Build a full URL on the apex public marketing origin. */
export function buildCanonicalUrl(pathname: string, search: string = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${MARKETING_ORIGIN}${path}${search ?? ""}`;
}

/** Build a full URL on the app origin (login / dashboard). */
export function buildAppUrl(pathname: string, search: string = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${APP_ORIGIN}${path}${search ?? ""}`;
}
