import { activeLocales, locales } from "./config";
import { NON_UI_TAXONOMY_LOCALES } from "./launch-language-scope";

/**
 * A LANGUAGE CODE IN THE URL THAT WE DO NOT ROUTE IS NOT A PAGE NAME.
 *
 * THE DEFECT
 * ---------------------------------------------------------------------------
 * `localePrefix: "always"` means every real page lives under `/{activeLocale}/`.
 * next-intl therefore treats a first segment it does not recognise as an
 * ordinary path and prefixes the default locale. Measured on production
 * 2026-09-09, redirects not followed:
 *
 *     /sv  →  307  →  /lt/sv
 *     /pl  →  307  →  /lt/pl
 *     /uk  →  307  →  /lt/uk
 *
 * `/sv` does not 404. It resolves, and it resolves into LITHUANIAN. A Swedish
 * reader who follows a Swedish-language acquisition post lands on a Lithuanian
 * page at a URL that reads like a mistake. That is worse than an English
 * landing page: English is a language they may not have, Lithuanian is one they
 * certainly do not, and the URL now contains their language code as evidence
 * that we thought about them and got it wrong anyway.
 *
 * Nothing could have told us. There is no broken link, no 404 and no failing
 * test — the route "works". It was found from outside, by the system that
 * writes the Swedish copy.
 *
 * WHY THE FIX IS A REDIRECT AND NOT A NEW LOCALE
 * ---------------------------------------------------------------------------
 * The obvious repair is to activate `/sv`. Measured against the catalogs on
 * this commit:
 *
 *     active (lt/en/ru/nl/de)   11,610 leaf strings   0 "[EN] " placeholders
 *     sv.json                    4,741 leaf strings   2,475 placeholders (52%)
 *     pl.json                    4,741 leaf strings   2,472 placeholders (52%)
 *     uk.json                    does not exist
 *
 * Activating `sv` today would ship a product missing 59% of its strings, half
 * of the remainder rendered in English inside a page claiming to be Swedish.
 * `config.ts` already forbids exactly this: a locale is promoted only after
 * full catalog parity, which is how NL and DE were activated. So the honest
 * destination for a Swedish reader today is the English product, and this file
 * is the smallest thing that gets them there.
 *
 * Activation stays a one-row change in `config.ts` when the catalog is real.
 * This file needs no edit when that happens — the list is DERIVED from the
 * active set, so promoting `sv` removes it from here automatically.
 *
 * WHY 307 AND NOT 308
 * ---------------------------------------------------------------------------
 * A permanent redirect is cached by browsers and search engines and outlives
 * the reason it was issued. `/sv → /en` is true only until the Swedish catalog
 * is finished, and the day it is, a 308 issued today would still be sending
 * Swedish readers to English out of a cache nobody can reach. The condition is
 * temporary, so the status code is temporary.
 *
 * WHY EVERY LANGUAGE FALLS BACK TO ENGLISH, INCLUDING UKRAINIAN
 * ---------------------------------------------------------------------------
 * The mechanically clever answer for `uk` is `ru` — an active locale, and the
 * nearest language by lexical distance. It is the wrong answer. A large number
 * of Ukrainian speakers actively reject being addressed in Russian, and a
 * product that redirects `/uk` to `/ru` has made a statement about its reader
 * that it did not intend and cannot take back. English is neutral, complete,
 * and nobody reads it as a claim about who they are.
 */

/** Languages we publish acquisition copy in but hold no UI catalog for.
 *
 * `uk` is here because Agentai OS composes Ukrainian worker copy for external
 * community distribution while `messages/uk.json` does not exist. Listing it
 * does NOT make Ukrainian a locale — it is the opposite: it is the record that
 * we know the code names a language, so the router must stop reading it as a
 * page. Adding a code here is not a §2.4 catalog change and creates no claim of
 * Ukrainian support anywhere in the product. */
export const ACQUISITION_ONLY_LANGUAGES = ["uk"] as const;

/** Where a reader of an unrouted language is sent. */
export const UNSUPPORTED_LANGUAGE_FALLBACK = "en";

/**
 * Every language code that names a real language and is not routed.
 *
 * DERIVED, never hand-listed. Three sources, each already declared elsewhere:
 *
 *   1. UI-catalog locales that are not active (`lv et da no sv pl`) — the six
 *      §2.4 shells.
 *   2. Taxonomy/recognition-only languages (`fi`) — we recognise Finnish text
 *      and ship Finnish taxonomy names, so `/fi` is unambiguously a language.
 *   3. Acquisition-only languages (`uk`).
 *
 * Because (1) is computed, promoting a locale in `config.ts` removes it from
 * this list in the same edit. A stale redirect for a locale that has since gone
 * live is impossible by construction.
 */
export const UNROUTED_LANGUAGE_CODES: readonly string[] = [
  ...locales.filter(
    (l) => !(activeLocales as readonly string[]).includes(l),
  ),
  ...NON_UI_TAXONOMY_LOCALES,
  ...ACQUISITION_ONLY_LANGUAGES,
];

/**
 * The path an unrouted-language URL should be sent to, or `null` to leave the
 * request alone.
 *
 * Only the FIRST segment is examined, and only against the derived list. This
 * is deliberately narrow: `/lt/sv-tools` and `/en/da` are ordinary pages inside
 * an active locale and must not be touched, and an unknown first segment that
 * is not a language (`/pricing`) keeps its existing behaviour — next-intl
 * prefixes the default locale and the app 404s it, which is correct for a page
 * that does not exist.
 */
export function unsupportedLanguageRedirectPath(
  pathname: string,
): string | null {
  const segments = pathname.split("/").filter((s) => s !== "");
  const first = segments[0]?.toLowerCase();
  if (first === undefined) return null;
  if (!UNROUTED_LANGUAGE_CODES.includes(first)) return null;
  const rest = segments.slice(1);
  return `/${[UNSUPPORTED_LANGUAGE_FALLBACK, ...rest].join("/")}`;
}
