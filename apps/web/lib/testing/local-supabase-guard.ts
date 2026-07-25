/**
 * Fail-closed guard for every LOCAL-ONLY test helper (session minting, dev
 * fixtures, any future local proof script).
 *
 * WHY THIS EXISTS. `apps/web/.env.local` legitimately points at the PRODUCTION
 * project and carries a real service-role key — that is what `pnpm dev` needs.
 * Test helpers that loaded it inherited that target: `e2e-mint-session.ts` would
 * have created a real session for a real user in production via the Admin API.
 * Nothing stopped it.
 *
 * The rule is now inverted: a local helper must PROVE its target is local
 * before doing anything, and refuses otherwise. It never trusts an ambient
 * `.env.local`.
 *
 * Everything here is pure and synchronous so it can be unit-tested without a
 * database, a network, or a running stack.
 */

/** The production Supabase project. Nothing local may ever resolve to it. */
export const PRODUCTION_PROJECT_REF = "gorgitwvdzxbnaxhrsrw";

/** The only origins a local helper may talk to. */
export const ALLOWED_LOCAL_ORIGINS = [
  "http://127.0.0.1:54321",
  "http://localhost:54321",
] as const;

/** Raised (as a message prefix) whenever a local helper refuses to run. */
export const REFUSAL_CODE = "REFUSED_NON_LOCAL_E2E_SESSION_MINT";

export class NonLocalTargetError extends Error {
  constructor(reason: string) {
    super(`${REFUSAL_CODE}: ${reason}`);
    this.name = "NonLocalTargetError";
  }
}

/**
 * Never print a key. Shows only enough to correlate two values in a log.
 * A short or empty key degrades to a constant so length is not leaked either.
 */
export function redactKey(key: string | undefined): string {
  if (!key) return "[absent]";
  if (key.length < 12) return "[redacted]";
  return `[redacted:…${key.slice(-4)}]`;
}

type JwtClaims = { iss?: string; ref?: string; role?: string };

/**
 * Decode a Supabase JWT's claims WITHOUT verifying the signature. We are not
 * authenticating anything — we only need to see which project a key belongs to
 * so we can refuse a production key. Returns null for non-JWT key formats
 * (e.g. the newer `sb_secret_…` / `sb_publishable_…` shapes).
 */
export function decodeJwtClaims(key: string | undefined): JwtClaims | null {
  if (!key) return null;
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * True when the key demonstrably belongs to a CLOUD project.
 *
 * Supabase cloud keys carry a `ref` claim naming the project; the local stack's
 * demo keys carry `iss: "supabase-demo"` and no `ref`. So a `ref` claim is a
 * positive identification of a cloud key — which is exactly what we must refuse,
 * even if someone points a localhost URL at a tunnel to production.
 */
export function isCloudKey(key: string | undefined): boolean {
  const claims = decodeJwtClaims(key);
  if (!claims) return false;
  if (claims.iss === "supabase-demo") return false;
  return typeof claims.ref === "string" && claims.ref.length > 0;
}

/** The project ref a key belongs to, when it is a cloud JWT. */
export function keyProjectRef(key: string | undefined): string | null {
  const claims = decodeJwtClaims(key);
  return typeof claims?.ref === "string" ? claims.ref : null;
}

export type LocalTargetInput = {
  url: string | undefined;
  /** Optional — checked when present. */
  serviceKey?: string;
  /** Optional — checked when present. */
  anonKey?: string;
};

export type LocalTarget = {
  origin: string;
  host: string;
  projectRef: string;
};

/**
 * Assert the target is the local Supabase stack, or throw NonLocalTargetError.
 *
 * Checks, in order (each is independently sufficient to refuse):
 *  1. a URL is present and parseable;
 *  2. the host is loopback — never a `supabase.co` host;
 *  3. the URL's project ref is not the production ref;
 *  4. the ORIGIN is exactly one of the allowed local origins (the explicit
 *     local marker — a loopback host on some other port is not accepted);
 *  5. neither supplied key is a cloud key, and neither belongs to production.
 */
export function assertLocalSupabaseTarget(
  input: LocalTargetInput,
): LocalTarget {
  const { url, serviceKey, anonKey } = input;

  if (!url) {
    throw new NonLocalTargetError(
      "no Supabase URL was resolved. Local helpers never fall back to " +
        ".env.local — start the local stack (`npx supabase start`) or set " +
        "E2E_SUPABASE_URL to a local origin.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NonLocalTargetError(`"${url}" is not a valid URL.`);
  }

  const host = parsed.hostname;

  if (parsed.host.endsWith("supabase.co") || host.endsWith("supabase.co")) {
    throw new NonLocalTargetError(
      `"${parsed.origin}" is a Supabase Cloud host. Local helpers must never ` +
        "touch a cloud project.",
    );
  }

  const isLoopback =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]";
  if (!isLoopback) {
    throw new NonLocalTargetError(
      `host "${host}" is not localhost/127.0.0.1.`,
    );
  }

  const urlRef = parsed.hostname.split(".")[0];
  if (urlRef === PRODUCTION_PROJECT_REF) {
    throw new NonLocalTargetError(
      `URL resolves to the production project ref "${PRODUCTION_PROJECT_REF}".`,
    );
  }

  if (!ALLOWED_LOCAL_ORIGINS.includes(parsed.origin as never)) {
    throw new NonLocalTargetError(
      `origin "${parsed.origin}" is not an allowed local origin ` +
        `(${ALLOWED_LOCAL_ORIGINS.join(", ")}). A loopback host alone is not ` +
        "an explicit local marker — it can be a tunnel to production.",
    );
  }

  for (const [label, key] of [
    ["service-role", serviceKey],
    ["anon", anonKey],
  ] as const) {
    if (!key) continue;
    const ref = keyProjectRef(key);
    if (ref === PRODUCTION_PROJECT_REF) {
      throw new NonLocalTargetError(
        `the supplied ${label} key belongs to the PRODUCTION project ` +
          `"${PRODUCTION_PROJECT_REF}". Refusing regardless of the URL.`,
      );
    }
    if (isCloudKey(key)) {
      throw new NonLocalTargetError(
        `the supplied ${label} key is a Supabase Cloud key (project ` +
          `"${ref ?? "unknown"}"). Local helpers accept local keys only.`,
      );
    }
  }

  return {
    origin: parsed.origin,
    host,
    projectRef: urlRef === host ? "local" : urlRef,
  };
}
