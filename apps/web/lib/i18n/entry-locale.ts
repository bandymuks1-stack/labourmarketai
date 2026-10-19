import { activeLocales } from "./config";
import { UNSUPPORTED_LANGUAGE_FALLBACK } from "./unsupported-language";

/**
 * ENTRY LOCALE FOR A VISITOR WHOSE LANGUAGE IS NOT ROUTED (audit 2026-10-16, U-1).
 *
 * next-intl negotiates an unprefixed request (`/`, `/jobs`) against
 * `Accept-Language` and, when NOTHING matches, falls back to `defaultLocale`
 * — Lithuanian. A first visit from Stockholm, Helsinki or Paris therefore
 * landed on a Lithuanian page, for a platform whose acquisition markets are
 * the Nordics, DACH and Benelux. Explicit `/sv` URLs were already sent to
 * `/en` (`unsupported-language.ts`); the far more common case — a browser
 * that simply prefers `sv-SE` on `/` — was not.
 *
 * Pure decision: `"en"` when the browser states language preferences and
 * none of them is a routed UI locale (and no routed locale cookie exists);
 * `null` otherwise — let next-intl negotiate as before. A missing or empty
 * header is NOT a preference, so the Lithuanian default stands for it.
 */
export function entryLocaleForUnmatchedLanguage(
  acceptLanguage: string | null | undefined,
  cookieLocale: string | null | undefined,
): typeof UNSUPPORTED_LANGUAGE_FALLBACK | null {
  const routed = activeLocales as readonly string[];
  if (cookieLocale && routed.includes(cookieLocale)) return null;
  const header = (acceptLanguage ?? "").trim();
  if (!header) return null;
  let stated = 0;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag || tag === "*") continue;
    stated += 1;
    const base = tag.split("-")[0];
    if (routed.includes(base)) return null;
  }
  return stated > 0 ? UNSUPPORTED_LANGUAGE_FALLBACK : null;
}
