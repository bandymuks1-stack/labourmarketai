/**
 * THE CANONICAL LOCALE VOCABULARY — mirrored, and pinned to its source.
 *
 * The authority is `apps/web/lib/i18n/config.ts` (PLATFORM_DOCTRINE §2.4).
 * This file does NOT get to have an opinion: it restates that vocabulary so a
 * client that cannot import a Next.js app still speaks the same language set.
 *
 * ## Why a mirror and not an import
 *
 * The honest options were three:
 *
 *   1. Mobile imports `apps/web/lib/i18n/config.ts` across the app boundary.
 *      Metro would have to resolve into a Next.js app whose neighbouring
 *      modules import `server-only` and `next/headers`. One careless later
 *      edit to that directory and the mobile bundle breaks for a reason no
 *      one would look for.
 *   2. Web re-exports from here, making this the single source. That is the
 *      RIGHT end state and it is the recorded follow-up — but it makes
 *      `apps/web` depend on a workspace package, which means `transpilePackages`
 *      in `next.config.ts` and a lockfile edge into the required merge gate.
 *      That does not belong in the same slice as a new client.
 *   3. Mirror it and PIN it.
 *
 * (3) is what the repository already does when one truth has to exist in two
 * runtimes: `lib/journal/work-time.ts` is a byte-for-byte mirror of a SQL
 * function with a guard test holding the pair together. The guard here is
 * `apps/web/lib/guards/client-core-vocabulary-mirror.test.ts`, and it runs
 * inside the REQUIRED gate — so the two files cannot drift for longer than
 * one pull request.
 *
 * A mirror without a guard is a duplicate. A mirror with a guard is one
 * vocabulary that happens to be written down twice.
 */

/**
 * All 11 locales the platform commits to (doctrine §2.4). The set never
 * shrinks. Message catalogues must exist for every one of these.
 */
export const LOCALES = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * The locales a client may actually route to and offer today. A client that
 * showed the other six would be promising a translation that has not been
 * verified — the honesty rule (doctrine §7.4) applies to a phone exactly as
 * it applies to a browser.
 */
export const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

export type ActiveLocale = (typeof ACTIVE_LOCALES)[number];

export const DEFAULT_LOCALE: ActiveLocale = "lt";

/**
 * Human-verified. Everything else active is AI-seeded pending review, and a
 * client MUST label it as such rather than presenting it as finished
 * translation.
 */
export const TIER1_LOCALES = ["en", "lt"] as const;

export function isActiveLocale(value: unknown): value is ActiveLocale {
  return (
    typeof value === "string" &&
    (ACTIVE_LOCALES as readonly string[]).includes(value)
  );
}

/** True when a client must tag this language as a preview translation. */
export function isPreviewTranslation(locale: ActiveLocale): boolean {
  return !(TIER1_LOCALES as readonly string[]).includes(locale);
}

/**
 * Resolve a device language tag ("lt-LT", "ru_RU", "en") onto an active
 * locale, falling back to the default.
 *
 * Deliberately region-blind: `de-AT` is German. A client that refused to
 * match a region it had never heard of would show a Lithuanian UI to an
 * Austrian, which is worse than showing German.
 */
export function resolveDeviceLocale(
  deviceTags: readonly string[],
): ActiveLocale {
  for (const tag of deviceTags) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (isActiveLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}
