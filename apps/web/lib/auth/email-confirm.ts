/**
 * Email-confirmation helpers (Train A slice 1, 2026-09-02).
 *
 * PURE — no Next.js imports — so every branch is unit-testable
 * (lib/auth/email-confirm.test.ts). Consumed by the auth callback route, the
 * signup form and the login form.
 *
 * WHY THIS EXISTS. Production "Confirm email" is ON (verified live
 * 2026-09-02): `signUp` returns NO session and the person must open a link.
 * Two things then have to hold that the PKCE-only callback could not give:
 *
 *  1. CROSS-DEVICE. The default Supabase link goes through GoTrue `/verify`,
 *     which confirms the address SERVER-SIDE and then redirects to our
 *     callback with `?code=`. A PKCE code can only be exchanged by the
 *     browser that started the signup (the verifier cookie lives there). A
 *     person who signs up on a laptop and opens the mail on a phone must not
 *     see "sign-in failed" — their address IS confirmed; they only need to
 *     sign in on this device. With the `token_hash` template (see
 *     docs/human-gates/email-delivery-gate.md) the callback verifies the
 *     token itself (`verifyOtp`) and the session is created on ANY device.
 *     Neither path weakens PKCE: `verifyOtp` is GoTrue's own single-use,
 *     expiring, hashed token — no secret is stored by us.
 *
 *  2. RESUME. A pending external authorization (an assistant's
 *     `/oauth/consent?authorization_id=…`) rides the `next` param through
 *     the email round trip inside `emailRedirectTo`, sanitised by the same
 *     `getSafeReturnPath` rules as every other redirect (internal path only,
 *     no nested next, no credential-shaped keys). The `authorization_id` is
 *     an opaque pending-request id, NOT an authorization code; GoTrue binds
 *     the decision to whoever is signed in and expires the request (measured
 *     10 min), so a stale id simply fails to resolve on the consent page.
 */

/** The e-mail OTP types the callback will verify. Closed allowlist — an
 *  unknown `type` is treated as "no verification present". */
export const EMAIL_OTP_TYPES = [
  "signup",
  "email",
  "recovery",
  "email_change",
  "magiclink",
  "invite",
] as const;
export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

/** Marker the signup form puts on `emailRedirectTo` so the callback can tell
 *  an e-mail confirmation return from a Google return. Bounded identifier,
 *  never a secret. */
export const EMAIL_CONFIRM_FLOW = "email_confirm";

/** GoTrue token hashes are hex; keep a generous but bounded shape so a
 *  malformed value never reaches the auth server. */
const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{16,256}$/;

export type EmailVerification = {
  readonly tokenHash: string;
  readonly type: EmailOtpType;
};

/** `?token_hash=…&type=signup` → verification params, or null when either
 *  half is missing/invalid. The callback only calls `verifyOtp` on a non-null
 *  result. */
export function parseEmailVerification(
  params: URLSearchParams,
): EmailVerification | null {
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!tokenHash || !type) return null;
  if (!TOKEN_HASH_RE.test(tokenHash)) return null;
  if (!(EMAIL_OTP_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as EmailOtpType };
}

/** True when the callback URL carries the marker the signup form set. */
export function isEmailConfirmFlow(params: URLSearchParams): boolean {
  return params.get("flow") === EMAIL_CONFIRM_FLOW;
}

/**
 * The `emailRedirectTo` for signup / resend. ALWAYS carries a query string
 * (`flow=email_confirm`) so a `token_hash` e-mail template can append with
 * `&`; carries `next` only when the caller had a real destination (never the
 * dashboard fallback, which would be noise in every mail).
 */
export function buildEmailConfirmRedirectTo(
  origin: string,
  locale: string,
  nextPath: string | null | undefined,
): string {
  const url = new URL(`${origin.replace(/\/$/, "")}/${locale}/auth/callback`);
  url.searchParams.set("flow", EMAIL_CONFIRM_FLOW);
  if (nextPath) url.searchParams.set("next", nextPath);
  return url.toString();
}

/**
 * A `token_hash` template cannot know the locale or the `next` the signup
 * carried, but it CAN pass `{{ .RedirectTo }}` along verbatim as `rt`. When
 * that value is a same-origin URL we lift the locale from its path and the
 * `next` from its query; anything else is ignored. Never a redirect target
 * itself — only a hint the callback validates through `getSafeReturnPath`.
 */
export function parseRedirectToHint(
  rt: string | null | undefined,
  origin: string,
  knownLocales: readonly string[],
): { locale: string | null; next: string | null } {
  const none = { locale: null, next: null };
  if (!rt) return none;
  let parsed: URL;
  try {
    parsed = new URL(rt);
  } catch {
    return none;
  }
  if (parsed.origin !== origin) return none;
  const first = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
  const locale = knownLocales.includes(first) ? first : null;
  const next = parsed.searchParams.get("next");
  return { locale, next: next && next.length > 0 ? next : null };
}

/** Callback `?error=` outcomes the login form knows how to render. */
export type AuthRedirectOutcome =
  | "cancelled"
  | "link_expired"
  | "provider_error";

/**
 * GoTrue reports an expired / already-used e-mail link as
 * `error=access_denied&error_code=otp_expired` — the SAME `error` value a
 * person produces by pressing Cancel at Google. The `error_code` is what
 * tells them apart; without this a dead link read as "you cancelled".
 */
export function classifyAuthRedirectError(input: {
  error: string | null;
  errorCode: string | null;
}): AuthRedirectOutcome {
  const code = (input.errorCode ?? "").toLowerCase();
  if (code === "otp_expired" || code === "otp_disabled") return "link_expired";
  if (input.error === "access_denied") return "cancelled";
  return "provider_error";
}

/** Exchange failures the login form renders after a failed `?code=`. */
export type ExchangeFailureOutcome = "exchange_failed" | "confirmed_sign_in";

/**
 * When the PKCE exchange fails BECAUSE THIS BROWSER HOLDS NO VERIFIER and the
 * return came from an e-mail confirmation, the address is already confirmed
 * (GoTrue confirmed it before redirecting) — the honest outcome is "signed up
 * elsewhere, sign in here", not a system fault. Any other failure keeps the
 * generic outcome. The verifier-missing signal is the auth-js error name or
 * GoTrue's own message; both are matched, neither is a secret.
 */
export function classifyExchangeFailure(
  error: { name?: string; message?: string; code?: string } | null | undefined,
  emailConfirmFlow: boolean,
): ExchangeFailureOutcome {
  if (!emailConfirmFlow || !error) return "exchange_failed";
  const name = (error.name ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  const verifierMissing =
    name === "authpkcecodeverifiermissingerror" ||
    /code verifier/.test(message) ||
    /both auth code and code verifier/.test(message);
  return verifierMissing ? "confirmed_sign_in" : "exchange_failed";
}

/** Seconds a person must wait before asking for another confirmation mail —
 *  mirrors GoTrue's default per-address e-mail rate limit so the UI never
 *  offers an action the server would refuse. */
export const RESEND_COOLDOWN_SECONDS = 60;
