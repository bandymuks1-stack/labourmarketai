/**
 * Public job board — one SITEMAP SHARD (/jobs-sitemap/{n}.xml).
 *
 * The `.xml` suffix is REQUIRED, not decoration: `middleware.ts` matches
 * `/((?!api|_next|_vercel|.*\..*).*)`, so any path without a dot is treated as
 * a localizable page and rewritten to `/{locale}/...`. `/jobs-sitemap/0` would
 * be redirected to `/lt/jobs-sitemap/0` and 404; `/jobs-sitemap/0.xml` is
 * excluded from the matcher and reaches this handler.
 *
 * Emits up to PUBLIC_VACANCY_SITEMAP_SHARD_SIZE live job URLs. Only ids and
 * publication dates cross this boundary: the SQL function behind it returns
 * exactly `id` and `last_modified` and physically cannot return a title,
 * employer, location, compensation, description or application URL. A sitemap
 * needs a URL and a date; anything more would be a leak with no purpose.
 *
 * ── ONE URL PER JOB, NOT ONE PER LOCALE ────────────────────────────────────
 * `app/sitemap.ts` emits every curated marketing path once per active locale,
 * because those pages ARE translated. A job page is not: the title, occupation
 * and category come from the publisher as `title_raw` and render identically in
 * all five locales — only the surrounding chrome is localized. Emitting five
 * locale variants of each ad would advertise ~196,000 near-duplicate pages that
 * differ only in boilerplate, which is the duplicate-content pattern rather
 * than internationalization.
 *
 * So each job appears ONCE at the default locale, carrying reciprocal hreflang
 * alternates for every active locale plus x-default. That is precisely what
 * hreflang exists for: it declares the localized variants without asking the
 * crawler to treat each as a separate document.
 *
 * <lastmod> is the publisher's `published_at` and never an ingestion timestamp
 * — see the migration header for the production measurement behind that.
 */
import { listPublicVacancySitemapEntries } from "@/lib/vacancy-store/public-vacancy-preview";
import { localizedUrl, hreflangAlternates } from "@/lib/seo/metadata";
import { defaultLocale } from "@/lib/i18n/config";

export const revalidate = 3600;

const XHTML = "http://www.w3.org/1999/xhtml";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emptySitemap(): Response {
  return xml(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="${XHTML}"></urlset>`,
  );
}

function xml(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shard: string }> },
): Promise<Response> {
  const { shard: raw } = await params;

  // Only "<non-negative integer>.xml" is a shard. Anything else is a bad URL,
  // and an empty valid sitemap is a safer answer to a crawler than a 500.
  const match = /^(\d{1,4})\.xml$/.exec(raw);
  if (!match) return emptySitemap();
  const shard = Number.parseInt(match[1], 10);

  const page = await listPublicVacancySitemapEntries({ shard });
  if (page.status === "not_provisioned" || page.entries.length === 0) {
    return emptySitemap();
  }

  const urls = page.entries
    .map((entry) => {
      const path = `/jobs/${entry.id}`;
      const loc = localizedUrl(defaultLocale, path);
      const links = Object.entries(hreflangAlternates(path))
        .map(
          ([lang, href]) =>
            `<xhtml:link rel="alternate" hreflang="${esc(lang)}" href="${esc(href)}"/>`,
        )
        .join("");
      const lastmod = entry.lastModified
        ? `<lastmod>${esc(new Date(entry.lastModified).toISOString())}</lastmod>`
        : "";
      return `<url><loc>${esc(loc)}</loc>${lastmod}${links}</url>`;
    })
    .join("");

  return xml(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="${XHTML}">${urls}</urlset>`,
  );
}
