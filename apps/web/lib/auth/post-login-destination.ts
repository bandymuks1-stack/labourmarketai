/**
 * Where a PASSWORD login lands — PURE (no React, no Supabase).
 *
 * Measured on production 2026-09-06 (walk-real-person-join, build ca96605b):
 * the landing carried "esu suvirintojas, ieškau darbo Norvegijoje" as
 * `?next=/lt/dashboard?say=…` through signup and the check-your-e-mail
 * screen's login link; the login form then did
 * `location.assign(next)`, the dashboard layout saw `onboarded_at = null`
 * and bounced to a bare `/lt/onboarding` — the sentence was gone, the
 * person was asked "Ko atėjote?" from zero, and after onboarding landed on
 * the profile page, not on their sentence.
 *
 * The OAuth / e-mail-link path never had this hole: the callback route reads
 * the profile and sends a not-yet-onboarded person to `/onboarding?next=…`.
 * This helper gives the password path the same rule. The extra profile read
 * happens ONLY when a destination is at stake (`nextParam` present); a plain
 * login keeps today's single navigation. A failed read degrades to today's
 * behaviour (the layout's own bounce), never to an error in the person's
 * face.
 */
export type PostLoginInput = {
  readonly locale: string;
  /** Raw `?next=` from the URL, null when the login had no destination. */
  readonly nextParam: string | null;
  /** The sanitised, locale-prefixed destination (`getSafeReturnPath`). */
  readonly nextPath: string;
  /** `profiles.onboarded_at` when the read succeeded; `undefined` = not read
   *  or the read failed (fail-open to the destination itself). */
  readonly onboardedAt?: string | null;
};

/** Whether the login form should spend a profile read before navigating. */
export function needsOnboardingCheck(nextParam: string | null): boolean {
  return typeof nextParam === "string" && nextParam.length > 0;
}

/** The onboarding URL that keeps the destination for completion. */
export function onboardingPathWithReturn(locale: string, nextPath: string): string {
  return `/${locale}/onboarding?next=${encodeURIComponent(nextPath)}`;
}

export function postLoginDestination(input: PostLoginInput): string {
  const { locale, nextParam, nextPath, onboardedAt } = input;
  if (!needsOnboardingCheck(nextParam)) return nextPath;
  // Read failed / not performed → today's behaviour.
  if (onboardedAt === undefined) return nextPath;
  // Already onboarded → straight to the destination (no onboarding hop).
  if (onboardedAt) return nextPath;
  // Not yet onboarded → the wizard, with the destination kept for completion.
  return onboardingPathWithReturn(locale, nextPath);
}
