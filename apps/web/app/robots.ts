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
 *
 * The Answer Engine ships its own sitemap (/questions-sitemap.xml), which
 * lists ONLY HUMAN_APPROVED, indexable answer pages (empty until real pages
 * publish). It is advertised here as a second Sitemap entry — the standard
 * multi-sitemap discovery mechanism — and is fully crawlable. Which paths
 * crawlers may visit is unchanged; AI-crawler rules are unchanged (single
 * `*` rule). The sitemap/host entries are declared before the rule block so
 * the crawlable answer surface is never confused with a blocked path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    sitemap: [`${MARKETING_ORIGIN}/sitemap.xml`, `${MARKETING_ORIGIN}/questions-sitemap.xml`],
    host: MARKETING_ORIGIN,
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
  };
}
