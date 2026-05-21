/**
 * Maps a Supabase auth error to a localized message key under the `auth.errors`
 * i18n namespace, so login / signup / reset-password all surface specific,
 * friendly messages instead of a generic "failed". Pure + framework-free so it
 * is unit-testable; the caller resolves the key with next-intl:
 *
 *   const info = mapAuthError(err);
 *   setError(t(info.key, info.params));
 *
 * Matches on Supabase's stable `code` first, then falls back to message text
 * (older SDKs / edge cases don't always set `code`).
 */
export type AuthErrorInfo = {
  key:
    | "userAlreadyRegistered"
    | "passwordTooShort"
    | "invalidCredentials"
    | "invalidEmail"
    | "rateLimited"
    | "generic";
  params?: Record<string, string | number>;
};

const DEFAULT_MIN_PASSWORD = 8;

function read(error: unknown): { code: string; message: string; status?: number } {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown; status?: unknown };
    return {
      code: typeof e.code === "string" ? e.code.toLowerCase() : "",
      message: typeof e.message === "string" ? e.message : "",
      status: typeof e.status === "number" ? e.status : undefined,
    };
  }
  if (typeof error === "string") return { code: "", message: error };
  return { code: "", message: "" };
}

export function mapAuthError(error: unknown): AuthErrorInfo {
  const { code, message, status } = read(error);
  const msg = message.toLowerCase();

  if (code === "user_already_exists" || /already registered|already been registered/.test(msg)) {
    return { key: "userAlreadyRegistered" };
  }

  if (code === "weak_password" || /password should be at least|password.*too short|at least \d+ characters/.test(msg)) {
    const m = msg.match(/at least (\d+) characters/);
    const min = m ? Number(m[1]) : DEFAULT_MIN_PASSWORD;
    return { key: "passwordTooShort", params: { min } };
  }

  if (code === "invalid_credentials" || /invalid login credentials|invalid credentials/.test(msg)) {
    return { key: "invalidCredentials" };
  }

  if (
    code === "email_address_invalid" ||
    code === "validation_failed" ||
    /unable to validate email|invalid email|email.*invalid/.test(msg)
  ) {
    return { key: "invalidEmail" };
  }

  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429 || /rate limit/.test(msg)) {
    return { key: "rateLimited" };
  }

  return { key: "generic" };
}
