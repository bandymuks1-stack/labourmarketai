/**
 * CLIENT CONFIGURATION — the same three values on every client, validated the
 * same way, with one refusal that only a native client needs.
 *
 * `apps/web/lib/env.ts` validates the whole server environment with zod. This
 * cannot reuse it (it is a Next.js module and reaches for server secrets) and
 * must not grow into a second one: a client is entitled to exactly three
 * public values, and asking for a fourth is how a secret ends up in a bundle
 * that ships to a phone.
 *
 * ## The refusal that matters
 *
 * `assertNotPrivilegedKey` rejects a Supabase key whose JWT claims the
 * `service_role`. That key bypasses RLS entirely. On the server a mix-up is a
 * bug; in a mobile bundle it is a permanent, unrevocable disclosure — the
 * binary is on the user's device and cannot be edited after the fact.
 * Refusing at construction time is the only place this can still be caught.
 *
 * It is a shape check, not a signature check. It cannot be, and does not
 * claim to be, authentication — it is a typo guard for a mistake whose cost
 * is unbounded, and it fails CLOSED: an unreadable key is refused rather than
 * assumed harmless.
 */

export type ClientConfig = {
  /** Supabase project URL. Public by design. */
  readonly supabaseUrl: string;
  /** Anon / publishable key. Public by design; RLS is what protects data. */
  readonly supabaseAnonKey: string;
  /**
   * Origin of the canonical LabourMarket.ai API (`app/api/**`).
   *
   * A native client reaches the canonical domain over HTTP, not by importing
   * it. This is where those requests go — and per docs/APP_READINESS_MAP.md §2
   * that boundary does not accept a non-cookie caller yet, so today this value
   * is configured and unused. See `transport.ts`.
   */
  readonly apiBaseUrl: string;
};

export type ConfigProblem =
  | { readonly kind: "missing"; readonly key: string }
  | { readonly kind: "malformed"; readonly key: string; readonly why: string }
  | { readonly kind: "privileged_key"; readonly key: string };

export type ConfigResult =
  | { readonly ok: true; readonly config: ClientConfig }
  | { readonly ok: false; readonly problems: readonly ConfigProblem[] };

/** A cleared dashboard field means "not configured", not "configured as empty". */
function present(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 decode, written out rather than delegated.
 *
 * `atob` is a browser/Hermes global and `Buffer` is a Node one. Reaching for
 * either would tie this package to a runtime, and it has to work on all of
 * them. Twenty lines is a cheaper price than a platform assumption.
 */
function decodeBase64(input: string): string | null {
  let bits = 0;
  let accumulator = 0;
  let out = "";
  for (const char of input) {
    if (char === "=") break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) return null;
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((accumulator >> bits) & 0xff);
    }
  }
  return out;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeBase64(base64);
    if (json === null) return null;
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Is this key one that bypasses RLS?
 *
 * Returns `true` for a legacy service-role JWT and for the newer
 * `sb_secret_...` publishable-key format. Anything it cannot read is treated
 * as privileged — see the fail-closed note above.
 */
export function looksPrivileged(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  // The new publishable format is explicitly safe and carries no JWT.
  if (key.startsWith("sb_publishable_")) return false;
  const payload = decodeJwtPayload(key);
  if (payload === null) return true;
  return payload.role === "service_role";
}

/**
 * Build a validated client configuration from whatever the platform calls its
 * environment: `process.env` on Node, `EXPO_PUBLIC_*` on a device build,
 * an injected object in a test.
 *
 * Returns problems rather than throwing, so a client can render an honest
 * "this build is misconfigured" screen instead of a white crash — the same
 * degradation rule the web app follows.
 */
export function readClientConfig(source: {
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
  apiBaseUrl?: string | null;
}): ConfigResult {
  const problems: ConfigProblem[] = [];

  const url = present(source.supabaseUrl);
  if (url === null) problems.push({ kind: "missing", key: "supabaseUrl" });
  else if (!/^https:\/\/[^\s]+$/.test(url)) {
    problems.push({
      kind: "malformed",
      key: "supabaseUrl",
      why: "must be an https origin",
    });
  }

  const anonKey = present(source.supabaseAnonKey);
  if (anonKey === null) {
    problems.push({ kind: "missing", key: "supabaseAnonKey" });
  } else if (looksPrivileged(anonKey)) {
    problems.push({ kind: "privileged_key", key: "supabaseAnonKey" });
  }

  const apiBaseUrl = present(source.apiBaseUrl);
  if (apiBaseUrl === null) {
    problems.push({ kind: "missing", key: "apiBaseUrl" });
  } else if (!/^https?:\/\/[^\s]+$/.test(apiBaseUrl)) {
    problems.push({
      kind: "malformed",
      key: "apiBaseUrl",
      why: "must be an http(s) origin",
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: {
      supabaseUrl: url as string,
      supabaseAnonKey: anonKey as string,
      apiBaseUrl: (apiBaseUrl as string).replace(/\/+$/, ""),
    },
  };
}

/** A one-line, non-leaking description of what is wrong, for an error screen. */
export function describeConfigProblem(problem: ConfigProblem): string {
  switch (problem.kind) {
    case "missing":
      return `${problem.key} is not configured`;
    case "malformed":
      return `${problem.key} is invalid — ${problem.why}`;
    case "privileged_key":
      return `${problem.key} looks like a privileged (RLS-bypassing) key and was refused`;
  }
}
