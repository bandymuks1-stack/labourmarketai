import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "./config";

// Decision (ADR 0004): localePrefix 'always' — every path is /{locale}/...
// Predictable URLs, simple Vercel/SEO behaviour. Root '/' redirects to /lt.
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
