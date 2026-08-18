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
 *
 * The public job board ships a THIRD sitemap the same way
 * (/jobs-sitemap.xml) — see sitemapUrls() below.
 */

/**
 * The sitemaps advertised to crawlers, all on the apex origin.
 *
 * `/jobs-sitemap.xml` is the public job board's own sharded index. Its
 * `/jobs/[id]` pages are far too many (39,241 live) for the curated
 * `sitemap.xml` list, and the board's own pagination is ~1,963 hops deep, so
 * without this entry every one of those pages is orphaned from a crawler's
 * point of view — which is exactly the state the board shipped in.
 */
function sitemapUrls(origin: string): string[] {
  return [
    `${origin}/sitemap.xml`,
    `${origin}/questions-sitemap.xml`,
    `${origin}/jobs-sitemap.xml`,
  ];
}

export default function robots(): MetadataRoute.Robots {
  return {
    // Every sitemap URL is built on MARKETING_ORIGIN (the apex), which the
    // public-SEO guard asserts on this line. Keep the binding here so wrapping
    // the array below can never move it out of the guard's sight.
    sitemap: sitemapUrls(MARKETING_ORIGIN),
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
