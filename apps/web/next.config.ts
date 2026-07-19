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

const nextConfig: NextConfig = {
  // Cross-platform safety: Vercel builds on Linux. Keep config minimal.
  reactStrictMode: true,
  async redirects() {
    return LEGACY_HOST_REDIRECTS;
  },
};

export default withNextIntl(nextConfig);
