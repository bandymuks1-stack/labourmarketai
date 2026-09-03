/**
 * Public job board — SITEMAP INDEX (/jobs-sitemap.xml).
 *
 * WHY A SEPARATE SITEMAP AT ALL
 * `app/sitemap.ts` lists the ~40 curated marketing pages and is hand-maintained.
 * The job board is 39,241 live pages that change every import run, so it cannot
 * be a hand-maintained list. It is also large enough to need sharding: this file
 * is the INDEX, and `/jobs-sitemap/{n}.xml` holds the URLs.
 *
 * The shard URLs carry a `.xml` EXTENSION deliberately. `middleware.ts` matches
 * `/((?!api|_next|_vercel|.*\..*).*)` — every path WITHOUT a dot is treated as a
 * localizable page and rewritten to `/{locale}/...`. A shard at
 * `/jobs-sitemap/0` would therefore be redirected to `/lt/jobs-sitemap/0` and
 * 404. The dot keeps shards out of the locale pipeline, which is the same
 * reason `/sitemap.xml`, `/robots.txt` and `/questions-sitemap.xml` work.
 *
 * WHAT THIS FIXES
 * `/jobs` and `/jobs/[id]` shipped and are live, but nothing pointed a crawler
 * at them — not `sitemap.ts`, not `robots.txt`, and no internal link outside the
 * board itself. The board's own pagination is ~1,963 hops deep, far past any
 * realistic crawl depth, so every one of those pages was orphaned.
 *
 * Advertised in /robots.txt as a third Sitemap entry (see app/robots.ts), which
 * is the standard multi-sitemap discovery mechanism and the same one the Answer
 * Engine's /questions-sitemap.xml already uses.
 */
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import {
  PUBLIC_VACANCY_SITEMAP_SHARD_SIZE,
  readPublicVacancySupplyCounts,
} from "@/lib/vacancy-store/public-vacancy-preview";

export const revalidate = 3600;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(): Promise<Response> {
  let counts: Awaited<ReturnType<typeof readPublicVacancySupplyCounts>>;
  try {
    counts = await readPublicVacancySupplyCounts();
  } catch {
    // The count is a real query that can exceed the anon statement timeout on
    // a cold buffer pool (P0-1b, 2026-09-03). A crawler must never read that
    // as "the sitemap is broken" (500) nor as "there are no jobs" (an empty
    // index would invite de-indexing). 503 + Retry-After is the truthful
    // answer: temporarily unavailable, come back — and it is never cached.
    return new Response(null, {
      status: 503,
      headers: { "Retry-After": "600", "Cache-Control": "no-store" },
    });
  }

  // `not_provisioned` (feature off) and "zero live ads" both mean there is
  // nothing to advertise. A crawler must still receive a VALID, EMPTY index —
  // never a 404 or a 500, which would be read as a broken sitemap.
  const shardCount =
    counts.status === "ok" && counts.activeVacancies > 0
      ? Math.ceil(counts.activeVacancies / PUBLIC_VACANCY_SITEMAP_SHARD_SIZE)
      : 0;

  const sitemaps = Array.from({ length: shardCount }, (_, i) => {
    const loc = `${MARKETING_ORIGIN}/jobs-sitemap/${i}.xml`;
    return `<sitemap><loc>${esc(loc)}</loc></sitemap>`;
  }).join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}</sitemapindex>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
