import { routing } from "../i18n/routing";

/**
 * Sanitise the `next` query parameter that the middleware attaches when it
 * bounces an unauthenticated user toward `/auth/login`. The login / signup
 * forms + the OAuth callback consult this helper before routing the user
 * after a successful sign-in / sign-up so we don't drop the user back on
 * the homepage when they wanted `/dashboard/journal`.
 *
 * Rules:
 *
 * - The value must be an INTERNAL absolute path (starts with `/`) — never a
 *   full URL, never a protocol-relative `//evil.com`. This prevents the
 *   classic open-redirect post-login.
 * - The value must NOT itself lead back to an auth surface (`/auth/...`).
 *   Otherwise a hostile link could send the user into a login → login
 *   redirect loop.
 * - When the input is missing / invalid, fall back to the locale-prefixed
 *   `/<locale>/dashboard` so the user still lands somewhere sensible.
 * - If the input is a bare `/dashboard/...` without a locale, prefix the
 *   current locale so middleware doesn't re-route again on next render.
 */
export function getSafeReturnPath(
  input: string | null | undefined,
  locale: string,
): string {
  const fallback = `/${locale}/dashboard`;

  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (raw.length === 0) return fallback;

  // Protocol-relative or full URL — block.
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;

  // Must be an absolute internal path.
  if (!raw.startsWith("/")) return fallback;

  // Reject anything that takes the user back into the auth flow itself —
  // login → login is the classic redirect loop.
  const lowered = raw.toLowerCase();
  if (/^\/(?:[a-z]{2}\/)?auth(?:\/|$)/.test(lowered)) return fallback;

  // If the path already carries a known locale prefix, accept as-is.
  const parts = raw.split("/").filter(Boolean);
  const maybeLocale = parts[0];
  const isKnownLocale = (routing.locales as readonly string[]).includes(
    maybeLocale,
  );
  if (isKnownLocale) return raw;

  // Otherwise prefix the active locale so the next render doesn't trigger
  // another locale redirect (middleware sets cookies on the prefixed path).
  return `/${locale}${raw}`;
}

/** Same idea but for callers that need an internal href stripped of locale. */
export function isSafeReturnPath(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  const raw = input.trim();
  if (raw.length === 0) return false;
  if (raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  if (!raw.startsWith("/")) return false;
  if (/^\/(?:[a-z]{2}\/)?auth(?:\/|$)/.test(raw.toLowerCase())) return false;
  return true;
}
