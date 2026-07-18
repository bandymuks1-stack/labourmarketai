/**
 * Answer Engine — questions sitemap (/questions-sitemap.xml).
 *
 * Emits ONLY indexable (HUMAN_APPROVED, published) answer URLs — capped at 200,
 * per-locale, with reciprocal hreflang alternates and lastModified from the
 * review date. No preview/noindex URLs, no inactive-locale URLs. Empty until
 * real pilot pages publish. Advertised in /robots.txt as a second Sitemap
 * entry (see app/robots.ts) so crawlers discover it; reachable directly.
 */
import { buildAnswerSitemap } from "@/lib/answer-engine/answer-seo";

const XHTML = "http://www.w3.org/1999/xhtml";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function GET(): Response {
  const entries = buildAnswerSitemap();
  const urls = entries
    .map((e) => {
      const alts = e.alternates?.languages ?? {};
      const links = Object.entries(alts)
        .map(([lang, href]) => `<xhtml:link rel="alternate" hreflang="${esc(lang)}" href="${esc(String(href))}"/>`)
        .join("");
      const lastmod = e.lastModified
        ? `<lastmod>${esc(typeof e.lastModified === "string" ? e.lastModified : new Date(e.lastModified).toISOString())}</lastmod>`
        : "";
      return `<url><loc>${esc(String(e.url))}</loc>${lastmod}${links}</url>`;
    })
    .join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="${XHTML}">${urls}</urlset>`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
  });
}
