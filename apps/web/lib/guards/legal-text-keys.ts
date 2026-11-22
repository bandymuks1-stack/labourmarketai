/**
 * LEGAL TEXTS — the catalog keys whose wording is legal text (owner decision
 * on #3388, 2026-11-16: legal texts in every language stay unchanged).
 *
 * - `legal`: every page under /legal (terms, privacy, cookies, data protection,
 *   data access, data deletion, legal notice, marketplace rules).
 * - `consent`: the consent control the cookie policy page renders.
 * - `auth.legalNotice`: the acceptance of the terms and the privacy policy at
 *   sign-up and at a first social sign-in.
 * - mobile `auth.register.legal`: the same acceptance in the mobile app.
 *
 * A wording or register change elsewhere (e.g. the formal form of address)
 * never touches these; they change only in a PR made for that legal change,
 * which updates `legal-texts-baseline.json` on purpose.
 */
export const LEGAL_TEXT_KEY_PREFIXES = ["legal", "consent", "auth.legalNotice"] as const;

export const MOBILE_LEGAL_TEXT_KEYS = ["auth.register.legal"] as const;

/** True when a flattened catalog key (`a.b.c`) is legal text. */
export function isLegalTextKey(key: string): boolean {
  return LEGAL_TEXT_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
}
