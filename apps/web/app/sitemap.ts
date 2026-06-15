import type { MetadataRoute } from "next";
import { activeLocales } from "@/lib/i18n/config";
import { localizedUrl, hreflangAlternates } from "@/lib/seo/metadata";
import { SUPPORTED_COUNTRIES } from "@/lib/labour-market/country-evidence";

/**
 * /sitemap.xml — only public, indexable marketing pages, on the apex
 * (https://labourmarket.ai). Every entry is emitted per active locale
 * (lt / en / ru) and carries hreflang alternates so Google maps the
 * localized versions to each other. No app / dashboard / auth / preview
 * URLs, no localhost, no app subdomain (enforced by the SEO guard).
 */

/** Public marketing paths (after the /{locale} segment). "" = locale home. */
const STATIC_PATHS: readonly string[] = [
  "",
  "/for-workers",
  "/for-companies",
  "/for-agencies",
  "/work-abroad",
  "/company-need",
  "/worker-intake",
  "/labour-market",
  "/match-preview",
  "/pricing",
  "/vision",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
];

/** Per-country labour-market evidence pages, e.g. /labour-market/lt. */
const COUNTRY_PATHS: readonly string[] = SUPPORTED_COUNTRIES.map(
  (c) => `/labour-market/${c.toLowerCase()}`,
);

/** Core cross-sector audience pages — prioritised over secondary pages. */
const CORE_PATHS: readonly string[] = [
  "/for-workers",
  "/for-companies",
  "/for-agencies",
  "/labour-market",
  "/company-need",
  "/worker-intake",
];

function priorityFor(path: string): number {
  if (path === "") return 1;
  if (CORE_PATHS.includes(path)) return 0.8;
  if (path.startsWith("/legal")) return 0.3;
  return 0.7;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...STATIC_PATHS, ...COUNTRY_PATHS];
  const entries: MetadataRoute.Sitemap = [];

  for (const path of paths) {
    const languages = hreflangAlternates(path);
    const priority = priorityFor(path);
    for (const locale of activeLocales) {
      entries.push({
        url: localizedUrl(locale, path),
        changeFrequency: path === "" ? "weekly" : "monthly",
        priority,
        alternates: { languages },
      });
    }
  }

  return entries;
}
