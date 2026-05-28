import { defineRouting } from "next-intl/routing";
import { activeLocales, defaultLocale } from "./config";

// Decision (ADR 0004): localePrefix 'always' — every path is /{locale}/...
// Predictable URLs, simple Vercel/SEO behaviour. Root '/' redirects to /lt.
//
// Owner P0 override (2026-05-28): routing uses `activeLocales` (lt + en
// only) instead of the full doctrine 10-locale `locales` set so the build
// stops prerendering /lv/... /et/... /nl/... /de/... /da/... /no/... /sv/...
// /pl/... pages with `MISSING_MESSAGE` warnings. The 10 JSON files stay in
// repo per §2.4 file-presence; routing simply does not surface them.
export const routing = defineRouting({
  locales: activeLocales,
  defaultLocale,
  localePrefix: "always",
});
