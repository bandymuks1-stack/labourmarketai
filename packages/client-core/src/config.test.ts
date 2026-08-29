import { describe, expect, it } from "vitest";

import { describeConfigProblem, looksPrivileged, readClientConfig } from "./config";

/** A JWT-shaped key whose payload claims the given role. Unsigned — the check
 *  under test is a shape check, deliberately, and says so. */
function keyClaiming(role: string): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const b64url = (value: object) => {
    const text = JSON.stringify(value);
    let bits = 0;
    let accumulator = 0;
    let out = "";
    for (let i = 0; i < text.length; i += 1) {
      accumulator = (accumulator << 8) | text.charCodeAt(i);
      bits += 8;
      while (bits >= 6) {
        bits -= 6;
        out += alphabet[(accumulator >> bits) & 0x3f];
      }
    }
    if (bits > 0) out += alphabet[(accumulator << (6 - bits)) & 0x3f];
    return out;
  };
  return [b64url({ alg: "HS256" }), b64url({ role, iss: "supabase" }), "sig"].join(
    ".",
  );
}

const ANON = keyClaiming("anon");

const VALID = {
  supabaseUrl: "https://gorgitwvdzxbnaxhrsrw.supabase.co",
  supabaseAnonKey: ANON,
  apiBaseUrl: "https://labourmarket.ai",
};

describe("a privileged key can never reach a device build", () => {
  // On a server a mixed-up key is a bug. In a mobile binary it is a permanent,
  // unrevocable disclosure of a key that bypasses RLS entirely — the build is
  // on the user's phone and cannot be edited afterwards.
  it("refuses a legacy service_role JWT", () => {
    expect(looksPrivileged(keyClaiming("service_role"))).toBe(true);
  });

  it("refuses the sb_secret_ format", () => {
    expect(looksPrivileged("sb_secret_abc123")).toBe(true);
  });

  it("accepts the two safe forms", () => {
    expect(looksPrivileged(ANON)).toBe(false);
    expect(looksPrivileged("sb_publishable_abc123")).toBe(false);
  });

  it("fails CLOSED on anything it cannot read", () => {
    // An unreadable key is refused rather than assumed harmless. The cost of a
    // false refusal is a build-time error message; the cost of a false accept
    // is unbounded.
    for (const unreadable of ["not-a-jwt", "a.b", "a.!!!.c", ""]) {
      expect(looksPrivileged(unreadable), unreadable).toBe(true);
    }
  });

  it("surfaces the refusal as a config problem, not a thrown crash", () => {
    const result = readClientConfig({
      ...VALID,
      supabaseAnonKey: keyClaiming("service_role"),
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems).toEqual([
      { kind: "privileged_key", key: "supabaseAnonKey" },
    ]);
  });
});

describe("configuration is validated, and reported rather than thrown", () => {
  it("accepts a complete configuration", () => {
    const result = readClientConfig(VALID);
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.config.apiBaseUrl).toBe(
      "https://labourmarket.ai",
    );
  });

  it("a cleared field means absent, not 'configured as empty'", () => {
    // The 2026-07-22 incident: a dashboard field cleared to an empty string
    // took every production deploy down for 19 hours because empty is present.
    const result = readClientConfig({ ...VALID, supabaseUrl: "   " });
    expect(result.ok === false && result.problems).toEqual([
      { kind: "missing", key: "supabaseUrl" },
    ]);
  });

  it("reports every problem at once, so one build fixes all of them", () => {
    const result = readClientConfig({});
    expect(result.ok === false && result.problems.map((p) => p.key)).toEqual([
      "supabaseUrl",
      "supabaseAnonKey",
      "apiBaseUrl",
    ]);
  });

  it("refuses a plaintext Supabase origin", () => {
    // These requests carry journal text and CVs.
    const result = readClientConfig({
      ...VALID,
      supabaseUrl: "http://gorgitwvdzxbnaxhrsrw.supabase.co",
    });
    expect(result.ok === false && result.problems[0].kind).toBe("malformed");
  });

  it("normalises a trailing slash so paths do not double up", () => {
    const result = readClientConfig({
      ...VALID,
      apiBaseUrl: "https://labourmarket.ai/",
    });
    expect(result.ok === true && result.config.apiBaseUrl).toBe(
      "https://labourmarket.ai",
    );
  });

  it("a problem description never repeats the value it rejected", () => {
    // An error screen is a screenshot waiting to happen.
    const secret = keyClaiming("service_role");
    const message = describeConfigProblem({
      kind: "privileged_key",
      key: "supabaseAnonKey",
    });
    expect(message).not.toContain(secret);
    expect(message).toContain("supabaseAnonKey");
  });
});
