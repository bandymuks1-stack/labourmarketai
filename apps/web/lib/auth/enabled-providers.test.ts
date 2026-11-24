import { describe, expect, it } from "vitest";

import {
  FAIL_CLOSED_PROVIDERS,
  parseProviderSettings,
  readEnabledProviders,
} from "@/lib/auth/enabled-providers-core";

/**
 * Enabled-providers honesty core — FAIL-CLOSED proof.
 *
 * The §18 gate: a provider button renders only when the auth server's
 * `/auth/v1/settings` confirms the provider. These tests prove every failure
 * path (network error, non-2xx, malformed body, missing config) resolves to
 * the known-good Google-only surface — never a thrown error (an auth page
 * must still render), and never an accidentally-advertised provider.
 */

const URL = "https://example.supabase.co";
const KEY = "anon-key";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe("parseProviderSettings — literal-true only, fail-closed shape", () => {
  it("parses the documented GoTrue shape", () => {
    expect(
      parseProviderSettings({
        external: { google: true, linkedin_oidc: true, facebook: false },
      }),
    ).toEqual({ google: true, linkedin_oidc: true, facebook: false });
  });

  it("fails closed on null / non-object / missing external", () => {
    for (const bad of [null, undefined, 42, "google", [], {}, { external: null }, { external: "yes" }]) {
      expect(parseProviderSettings(bad)).toEqual(FAIL_CLOSED_PROVIDERS);
    }
  });

  it("a provider counts as enabled ONLY on literal true (no truthy coercion)", () => {
    const parsed = parseProviderSettings({
      external: { google: "true", linkedin_oidc: 1, facebook: {} },
    });
    expect(parsed).toEqual({ google: false, linkedin_oidc: false, facebook: false });
  });

  it("the fail-closed constant is the current known-good surface: Google only", () => {
    expect(FAIL_CLOSED_PROVIDERS).toEqual({
      google: true,
      linkedin_oidc: false,
      facebook: false,
    });
  });
});

describe("readEnabledProviders — every failure path fails closed, never throws", () => {
  it("returns the live flags on a successful fetch", async () => {
    const flags = await readEnabledProviders(URL, KEY, async () =>
      jsonResponse({ external: { google: true, linkedin_oidc: true, facebook: true } }),
    );
    expect(flags).toEqual({ google: true, linkedin_oidc: true, facebook: true });
  });

  it("sends the anon key as the apikey header to /auth/v1/settings", async () => {
    let seenUrl = "";
    let seenHeaders: unknown;
    await readEnabledProviders(URL, KEY, async (input, init) => {
      seenUrl = String(input);
      seenHeaders = init?.headers;
      return jsonResponse({ external: {} });
    });
    expect(seenUrl).toBe(`${URL}/auth/v1/settings`);
    expect(seenHeaders).toEqual({ apikey: KEY });
  });

  it("fails closed when the fetch throws", async () => {
    const flags = await readEnabledProviders(URL, KEY, async () => {
      throw new Error("network down");
    });
    expect(flags).toEqual(FAIL_CLOSED_PROVIDERS);
  });

  it("fails closed on a non-2xx response", async () => {
    const flags = await readEnabledProviders(URL, KEY, async () =>
      jsonResponse({ external: { linkedin_oidc: true } }, false),
    );
    expect(flags).toEqual(FAIL_CLOSED_PROVIDERS);
  });

  it("fails closed when the body is not JSON", async () => {
    const flags = await readEnabledProviders(URL, KEY, async () =>
      ({
        ok: true,
        json: async () => {
          throw new SyntaxError("not json");
        },
      }) as unknown as Response,
    );
    expect(flags).toEqual(FAIL_CLOSED_PROVIDERS);
  });

  it("fails closed when url or anon key is missing (build without secrets)", async () => {
    const neverCalled: typeof fetch = async () => {
      throw new Error("must not be called");
    };
    expect(await readEnabledProviders(undefined, KEY, neverCalled)).toEqual(
      FAIL_CLOSED_PROVIDERS,
    );
    expect(await readEnabledProviders(URL, undefined, neverCalled)).toEqual(
      FAIL_CLOSED_PROVIDERS,
    );
  });
});
