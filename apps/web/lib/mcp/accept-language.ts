import { activeLocales, defaultLocale } from "@/lib/i18n/config";

/**
 * First ACTIVE locale named by an `Accept-Language` header, else the default.
 *
 * Untrusted client data with wildcards — Node's own `fetch` sends literally
 * `*`, which the live MCP write proof measured reaching the DB as a "locale"
 * and tripping the `original_language` constraint on the journal insert.
 * Handles quality-tagged lists ("lt-LT;q=0.9,en;q=0.8") and region subtags;
 * anything not in `activeLocales` fails closed to `defaultLocale`.
 *
 * Pure and transport-agnostic: the MCP route uses it today, and any future
 * bearer client (mobile) sending `Accept-Language` goes through the same
 * seam.
 */
export function localeFromAcceptLanguage(header: string | null): string {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if ((activeLocales as readonly string[]).includes(base)) return base;
  }
  return defaultLocale;
}
