import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

/**
 * Single-domain policy (2026-07-19): labourmarket.ai is the only
 * product origin. The legacy hosts below are redirect aliases only.
 * These host-scoped redirects run BEFORE middleware and cover every
 * path — including /api/* and static assets, which the middleware
 * matcher excludes. `permanent: true` → 308 (method-preserving);
 * `:path*` + Next's default query passthrough preserve the full
 * path, query, locale, `next` params and invitation tokens.
 * Mirrors lib/domain/canonical.ts LEGACY_REDIRECT_HOSTS.
 */
const LEGACY_HOST_REDIRECTS = ["www.labourmarket.ai", "app.labourmarket.ai"].map(
  (host) => ({
    source: "/:path*",
    has: [{ type: "host" as const, value: host }],
    destination: "https://labourmarket.ai/:path*",
    permanent: true,
  }),
);

/**
 * Security response headers — security audit finding M-01.
 *
 * The audit found this app shipped with NO browser security headers at all: no
 * CSP, no frame protection, no Referrer-Policy, no Permissions-Policy, no
 * nosniff. Two of those matter concretely here rather than theoretically:
 *
 *   1. Referrer-Policy. Invitation tokens travel in URLs (see the redirect
 *      comment above — `next` params and invitation tokens are deliberately
 *      preserved). With no policy, the browser default leaks the FULL URL,
 *      token included, in the `Referer` header of every cross-origin
 *      subresource and outbound link. `strict-origin-when-cross-origin` sends
 *      only the origin cross-site, which closes that leak.
 *   2. Frame protection. Dashboard actions are one-click state changes, so a
 *      framed clickjacking overlay is a real path, not a hypothetical.
 *
 * SPLIT ENFORCEMENT, DELIBERATELY. Everything that cannot break a working page
 * is ENFORCED now. CSP ships as `Content-Security-Policy-Report-Only` because
 * this app has an inline theme-bootstrap script (app/[locale]/layout.tsx), uses
 * Google Identity Services, and talks to a Supabase host — an enforced policy
 * written blind would break login. Report-Only surfaces real violations in the
 * browser console first; promoting it to enforced is a separate, evidence-led
 * step once the violation list is empty.
 *
 * NOT a substitute for server-side authorization. These are defence-in-depth.
 */

/** Supabase origin, so CSP can allow the API/auth host it actually uses. */
function supabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function contentSecurityPolicyReportOnly(): string {
  const supabase = supabaseOrigin();
  const connect = ["'self'", supabase, "https://accounts.google.com"].filter(Boolean);
  return [
    "default-src 'self'",
    // 'unsafe-inline' is required by the theme-bootstrap script and Next's
    // hydration payload. Removing it needs a nonce pipeline — tracked as the
    // follow-up that must land BEFORE this policy is enforced.
    "script-src 'self' 'unsafe-inline' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    // Google Identity Services renders its button/prompt in an iframe.
    "frame-src 'self' https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const SECURITY_HEADERS = [
  // Clickjacking. `frame-ancestors` in CSP is the modern control, but that is
  // Report-Only for now, so this is the one actually enforcing it today.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Closes the invitation-token-via-Referer leak described above.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  },
  // Vercel may also set HSTS at the edge; sending it explicitly means the
  // guarantee does not depend on a platform default we do not control.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicyReportOnly(),
  },
];


/**
 * W1 canonical-route redirects.
 *
 * These six paths used to exist as redirect-only `page.tsx` files whose entire
 * body was `redirect(...)`. The route files are gone; the URLs are NOT. Moving
 * them here keeps every external link, bookmark and old email working while
 * removing six App Router entries, six RSC payloads and six build outputs.
 *
 * `permanent: true` (308) is correct: these are canonical moves, not
 * experiments. The locale segment is preserved so /lt/... stays /lt/...
 */
const W1_CANONICAL_REDIRECTS = [
  { source: "/:locale/dashboard/assistant", destination: "/:locale/dashboard", permanent: true },
  { source: "/:locale/dashboard/marketplace", destination: "/:locale/dashboard/market-map", permanent: true },
  { source: "/:locale/dashboard/player-card", destination: "/:locale/dashboard/journal", permanent: true },
  { source: "/:locale/dashboard/agency", destination: "/:locale/dashboard/company", permanent: true },
  { source: "/:locale/dashboard/agency/pool", destination: "/:locale/dashboard/company#company-team", permanent: true },
  { source: "/:locale/dashboard/start/agency", destination: "/:locale/dashboard/start/company", permanent: true },
] as const;

const nextConfig: NextConfig = {
  // Cross-platform safety: Vercel builds on Linux. Keep config minimal.
  reactStrictMode: true,
  // Never advertise the framework version to attackers scanning for CVEs.
  poweredByHeader: false,
  async redirects() {
    return [...LEGACY_HOST_REDIRECTS, ...W1_CANONICAL_REDIRECTS];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
