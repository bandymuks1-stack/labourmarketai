import { buildLlmsTxt } from "@/lib/seo/llms-txt";

/**
 * GET /llms.txt — static, public, plain text (AEO; see lib/seo/llms-txt.ts).
 * A dotted path, so it bypasses the i18n middleware like robots.txt and the
 * sitemaps do. Revalidated daily; the content changes only with a deploy.
 */
export const revalidate = 86_400;

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
