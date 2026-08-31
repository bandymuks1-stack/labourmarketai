/**
 * Enabled-OAuth-providers honesty core (social-auth surface v1).
 *
 * PURE logic — no Next.js imports — so the fail-closed behaviour is directly
 * unit-testable (lib/auth/enabled-providers.test.ts). The cached server entry
 * point lives in lib/auth/enabled-providers.ts.
 *
 * THE HONESTY MECHANISM (§18 reality principle): a provider button renders
 * ONLY when the auth server (GoTrue `/auth/v1/settings`) reports it can
 * actually complete the flow. A "Continue with LinkedIn" button whose press
 * dead-ends at Supabase with `provider is not enabled` would be a fake
 * feature — exactly the class of dishonesty the doctrine bans. The day the
 * owner enables a provider in the Supabase dashboard, its button appears with
 * NO deploy (settings are re-read on the 300 s cache expiry).
 *
 * FAIL-CLOSED: on ANY error (network, non-2xx, malformed body, missing anon
 * key) this returns the CURRENT KNOWN-GOOD surface — Google only. Verified
 * against production on 2026-08-31: `external` reports google=true,
 * linkedin_oidc=false, facebook=false. Failing closed can only ever hide a
 * working provider for one cache window; it can never advertise a broken one.
 */

/** The providers the auth surface knows how to render. Keys are the Supabase
 *  provider ids passed verbatim to `signInWithOAuth`. */
export type EnabledProviders = {
  readonly google: boolean;
  readonly linkedin_oidc: boolean;
  readonly facebook: boolean;
};

/** The current known-good surface (prod truth 2026-08-31): Google is live,
 *  LinkedIn/Facebook are not configured. Used whenever the settings endpoint
 *  cannot be read or parsed — never hardcode a NEW provider to `true` here. */
export const FAIL_CLOSED_PROVIDERS: EnabledProviders = {
  google: true,
  linkedin_oidc: false,
  facebook: false,
};

/**
 * Parse a GoTrue `/auth/v1/settings` response body into the provider flags.
 * Anything that is not the documented `{ external: { <provider>: boolean } }`
 * shape fails closed. A provider flag counts as enabled ONLY on literal
 * `true` — truthy strings/objects from a future API change fail closed too.
 */
export function parseProviderSettings(payload: unknown): EnabledProviders {
  if (payload === null || typeof payload !== "object") {
    return FAIL_CLOSED_PROVIDERS;
  }
  const external = (payload as { external?: unknown }).external;
  if (external === null || typeof external !== "object") {
    return FAIL_CLOSED_PROVIDERS;
  }
  const ext = external as Record<string, unknown>;
  return {
    google: ext.google === true,
    linkedin_oidc: ext.linkedin_oidc === true,
    facebook: ext.facebook === true,
  };
}

/**
 * Read the enabled-provider flags from the auth server. Injectable fetch for
 * unit tests; every failure path resolves to FAIL_CLOSED_PROVIDERS — this
 * function NEVER throws (an auth page must render its known-good login
 * surface even when the settings endpoint is down).
 *
 * The anon key is the PUBLIC client key (it ships in every browser bundle);
 * sending it as the `apikey` header here leaks nothing.
 */
export async function readEnabledProviders(
  supabaseUrl: string | undefined,
  anonKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<EnabledProviders> {
  try {
    if (!supabaseUrl || !anonKey) return FAIL_CLOSED_PROVIDERS;
    const res = await fetchImpl(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`,
      {
        headers: { apikey: anonKey },
        // The 300 s cache lives in the unstable_cache wrapper; the inner
        // request itself must always hit the live auth server.
        cache: "no-store",
      },
    );
    if (!res.ok) return FAIL_CLOSED_PROVIDERS;
    return parseProviderSettings(await res.json());
  } catch {
    return FAIL_CLOSED_PROVIDERS;
  }
}
