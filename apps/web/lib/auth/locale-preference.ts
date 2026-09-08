import { activeLocales } from "@/lib/i18n/config";

/**
 * Post-login language resolution (V8 W4-B item 2).
 *
 * `profiles.locale` is written at signup and onboarding but was never READ —
 * a person who registered in Russian and later logged in on a fresh device
 * landed on the URL default and stayed there. This module decides, at the
 * auth callback, which language the person lands in.
 *
 * PRIORITY ORDER (pinned by lib/auth/locale-preference.test.ts):
 *
 *   1. NEXT_LOCALE cookie — an explicit DEVICE choice. If it exists, it wins
 *      and the profile preference never overrides it. (The middleware already
 *      honours the cookie on every navigation; the callback must not fight it.)
 *   2. profiles.locale — the ACCOUNT preference. Honoured only on a device
 *      with no cookie (fresh device / cleared cookies), only when it is a
 *      valid active locale, only when it differs from the URL locale, and
 *      ONLY for an account that has completed onboarding. Before onboarding
 *      `profiles.locale` is a DB default the person never chose
 *      (`handle_new_user` falls back to 'lt' when OAuth supplies no locale
 *      in `raw_user_meta_data`), so honouring it would yank a brand-new
 *      Google signup who landed on /en into /lt/onboarding AND pin
 *      NEXT_LOCALE=lt for a year. The onboarding wizard writes the REAL
 *      choice (from the URL locale) at completion; from then on the account
 *      preference participates exactly as before.
 *   3. The URL locale — which the middleware derived from Accept-Language
 *      when neither of the above existed. Left untouched.
 *
 * Pure — no request objects, unit-testable.
 */

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export interface PostLoginLocaleDecision {
  /** The locale the post-login redirect should land in. */
  readonly locale: string;
  /** True = the ACCOUNT preference overrode the URL locale — the caller must
   *  also set the locale cookie so the choice sticks on this device. */
  readonly overridden: boolean;
}

function isActiveLocale(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    (activeLocales as readonly string[]).includes(value)
  );
}

export function resolvePostLoginLocale(input: {
  /** NEXT_LOCALE cookie value from the request, null when absent. */
  cookieLocale: string | null;
  /** profiles.locale, null when unset. */
  profileLocale: string | null;
  /** The locale segment of the callback URL. */
  urlLocale: string;
  /** Has this account completed onboarding (`profiles.onboarded_at` set)?
   *  When false, the profile locale is the signup-time DB default — not a
   *  human choice — and must never override the URL locale the person
   *  actually landed on. */
  onboarded: boolean;
}): PostLoginLocaleDecision {
  // 1. A device cookie — even one matching the URL — is an explicit choice.
  if (input.cookieLocale !== null && input.cookieLocale.trim() !== "") {
    return { locale: input.urlLocale, overridden: false };
  }
  // 2. The account preference, only when real, active, actually different —
  //    and only once onboarding has confirmed it as a human choice.
  if (
    input.onboarded &&
    isActiveLocale(input.profileLocale) &&
    input.profileLocale !== input.urlLocale
  ) {
    return { locale: input.profileLocale, overridden: true };
  }
  // 3. The URL locale (Accept-Language-derived by the middleware) stands.
  return { locale: input.urlLocale, overridden: false };
}
