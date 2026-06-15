import type { MetadataRoute } from "next";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";

/**
 * /robots.txt — allow indexing of the public marketing surface, block
 * the authenticated app + internal zones, and point crawlers at the
 * apex sitemap. Routes are /{locale}/... so app/internal paths are
 * blocked with a leading-locale wildcard (Googlebot honours `*`).
 *
 * Policy (2026-06-15): apex labourmarket.ai is the canonical public
 * host (see lib/domain/canonical.ts); the sitemap + host both point
 * there so search engines consolidate on one host.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/*/dashboard", // app: dashboard + nested /admin/* live here
          "/*/onboarding",
          "/*/auth", // login / signup / reset / callback
          "/*/cv", // worker CV tool (authenticated surface)
          "/*/design", // internal design preview, not a public page
        ],
      },
    ],
    sitemap: `${MARKETING_ORIGIN}/sitemap.xml`,
    host: MARKETING_ORIGIN,
  };
}
