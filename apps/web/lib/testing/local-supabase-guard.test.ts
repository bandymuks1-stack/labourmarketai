import { describe, it, expect } from "vitest";
import {
  ALLOWED_LOCAL_ORIGINS,
  NonLocalTargetError,
  PRODUCTION_PROJECT_REF,
  REFUSAL_CODE,
  assertLocalSupabaseTarget,
  decodeJwtClaims,
  isCloudKey,
  keyProjectRef,
  redactKey,
} from "./local-supabase-guard";
import { parseSupabaseStatusEnv } from "./local-supabase-env";
import { assertFixtureCounts } from "../../scripts/db-fixtures-local";

/** Build an unsigned JWT with the given claims (signature is never checked). */
function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

const LOCAL_ANON = jwt({ iss: "supabase-demo", role: "anon" });
const LOCAL_SERVICE = jwt({ iss: "supabase-demo", role: "service_role" });
const PROD_SERVICE = jwt({
  iss: "supabase",
  ref: PRODUCTION_PROJECT_REF,
  role: "service_role",
});
const OTHER_CLOUD = jwt({ iss: "supabase", ref: "someotherproj", role: "anon" });

describe("local Supabase guard — accepts only the local stack", () => {
  for (const origin of ALLOWED_LOCAL_ORIGINS) {
    it(`accepts the allowed local origin ${origin}`, () => {
      const t = assertLocalSupabaseTarget({
        url: origin,
        anonKey: LOCAL_ANON,
        serviceKey: LOCAL_SERVICE,
      });
      expect(t.origin).toBe(origin);
    });
  }

  it("accepts a local origin with a trailing path", () => {
    expect(() =>
      assertLocalSupabaseTarget({ url: "http://127.0.0.1:54321/" }),
    ).not.toThrow();
  });
});

describe("local Supabase guard — refuses production", () => {
  const cases: Array<[string, Parameters<typeof assertLocalSupabaseTarget>[0]]> =
    [
      [
        "the production project URL",
        { url: `https://${PRODUCTION_PROJECT_REF}.supabase.co` },
      ],
      [
        "any supabase.co host",
        { url: "https://someotherproject.supabase.co" },
      ],
      ["a non-loopback host", { url: "https://staging.example.com:54321" }],
      [
        "a loopback host on a non-allowlisted port (possible tunnel)",
        { url: "http://127.0.0.1:9999" },
      ],
      ["a missing URL", { url: undefined }],
      ["an unparseable URL", { url: "not a url" }],
      [
        "a PRODUCTION service-role key even with a local URL",
        { url: "http://127.0.0.1:54321", serviceKey: PROD_SERVICE },
      ],
      [
        "a PRODUCTION anon key even with a local URL",
        { url: "http://127.0.0.1:54321", anonKey: PROD_SERVICE },
      ],
      [
        "any other cloud key with a local URL",
        { url: "http://127.0.0.1:54321", serviceKey: OTHER_CLOUD },
      ],
    ];

  for (const [label, input] of cases) {
    it(`refuses ${label}`, () => {
      expect(() => assertLocalSupabaseTarget(input)).toThrow(
        NonLocalTargetError,
      );
      try {
        assertLocalSupabaseTarget(input);
      } catch (err) {
        // The refusal code is the grep-able contract.
        expect((err as Error).message).toContain(REFUSAL_CODE);
      }
    });
  }

  it("refuses a production key before it can ever reach the Admin API", () => {
    // Regression pin for the real defect: .env.local held the production URL
    // AND a production service-role key, and nothing refused.
    expect(() =>
      assertLocalSupabaseTarget({
        url: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        serviceKey: PROD_SERVICE,
      }),
    ).toThrow(/REFUSED_NON_LOCAL_E2E_SESSION_MINT/);
  });
});

describe("key handling never leaks secrets", () => {
  it("redacts keys, showing at most the last 4 characters", () => {
    expect(redactKey(undefined)).toBe("[absent]");
    expect(redactKey("short")).toBe("[redacted]");
    const r = redactKey(PROD_SERVICE);
    expect(r).toContain("[redacted:");
    expect(r).not.toContain(PROD_SERVICE.slice(0, 20));
  });

  it("identifies cloud vs local keys by claims", () => {
    expect(isCloudKey(PROD_SERVICE)).toBe(true);
    expect(isCloudKey(OTHER_CLOUD)).toBe(true);
    expect(isCloudKey(LOCAL_ANON)).toBe(false);
    expect(isCloudKey("sb_publishable_abc123")).toBe(false);
    expect(keyProjectRef(PROD_SERVICE)).toBe(PRODUCTION_PROJECT_REF);
    expect(keyProjectRef(LOCAL_ANON)).toBeNull();
    expect(decodeJwtClaims("nonsense")).toBeNull();
  });
});

describe("supabase status env parsing", () => {
  it("parses quoted KEY=\"value\" lines", () => {
    const env = parseSupabaseStatusEnv(
      'API_URL="http://127.0.0.1:54321"\nANON_KEY="abc"\nnoise\n',
    );
    expect(env.API_URL).toBe("http://127.0.0.1:54321");
    expect(env.ANON_KEY).toBe("abc");
  });
});

describe("fixture assertions gate the success message", () => {
  const expected = {
    "auth.users": 3,
    "public.profiles": 3,
    "public.workers": 3,
    "public.companies": 1,
  };

  it("passes when every expected count matches", () => {
    const r = assertFixtureCounts((rel) => expected[rel as keyof typeof expected], expected);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("fails when the fixtures applied nothing (the real defect)", () => {
    const r = assertFixtureCounts(() => 0, expected);
    expect(r.ok).toBe(false);
    expect(r.failures.length).toBe(4);
    expect(r.failures[0]).toMatch(/expected 3, got 0/);
  });

  it("fails on a partial apply", () => {
    const r = assertFixtureCounts(
      (rel) => (rel === "public.companies" ? 0 : 3),
      expected,
    );
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(["public.companies: expected 1, got 0"]);
  });

  it("fails when a relation cannot be read at all", () => {
    const r = assertFixtureCounts(() => null, expected);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/could not be read/);
  });
});
