import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCEPTANCE_FLAG,
  assertAcceptanceTargetIsLocal,
  describeAcceptanceEnv,
  isAcceptanceMode,
  startAcceptanceGuard,
} from "@/lib/testing/acceptance-mode";
import {
  NonLocalTargetError,
  PRODUCTION_PROJECT_REF,
} from "@/lib/testing/local-supabase-guard";

/**
 * ACCEPTANCE MODE — the owner's §12 production protection, as executable rules.
 *
 * The scenarios being guarded are WRITES. So the properties that matter are:
 * an acceptance run cannot reach production by any route, and a normal run is
 * completely unaffected by the guard existing.
 */

const LOCAL_URL = "http://127.0.0.1:54321";
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

/** A local demo JWT: `iss: supabase-demo`, no `ref` claim. */
function localKey(): string {
  const body = Buffer.from(
    JSON.stringify({ iss: "supabase-demo", role: "service_role" }),
  ).toString("base64url");
  return `header.${body}.sig`;
}
/** A cloud JWT carrying a project `ref` — what must always be refused. */
function cloudKey(ref: string = PRODUCTION_PROJECT_REF): string {
  const body = Buffer.from(
    JSON.stringify({ iss: "supabase", ref, role: "service_role" }),
  ).toString("base64url");
  return `header.${body}.sig`;
}

describe("acceptance mode — the flag itself", () => {
  it("is off unless explicitly '1'", () => {
    expect(isAcceptanceMode({})).toBe(false);
    expect(isAcceptanceMode({ [ACCEPTANCE_FLAG]: "0" })).toBe(false);
    // A typo must not read as truthy and silently disable the guard.
    expect(isAcceptanceMode({ [ACCEPTANCE_FLAG]: "true" })).toBe(false);
    expect(isAcceptanceMode({ [ACCEPTANCE_FLAG]: "yes" })).toBe(false);
    expect(isAcceptanceMode({ [ACCEPTANCE_FLAG]: "1" })).toBe(true);
  });
});

describe("acceptance mode — never touches a normal run", () => {
  it("is a no-op when the flag is off, even pointed at production", () => {
    expect(() =>
      assertAcceptanceTargetIsLocal({
        NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
        SUPABASE_SERVICE_ROLE_KEY: cloudKey(),
      }),
    ).not.toThrow();
  });
});

describe("acceptance mode — refuses production by every route", () => {
  const on = { [ACCEPTANCE_FLAG]: "1" };

  it("refuses the production URL", () => {
    expect(() =>
      assertAcceptanceTargetIsLocal({
        ...on,
        NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      }),
    ).toThrow(NonLocalTargetError);
  });

  it("refuses any cloud host, not just the known production ref", () => {
    expect(() =>
      assertAcceptanceTargetIsLocal({
        ...on,
        NEXT_PUBLIC_SUPABASE_URL: "https://someotherproject.supabase.co",
      }),
    ).toThrow(NonLocalTargetError);
  });

  it("refuses a production KEY even behind a local URL (tunnel case)", () => {
    // The dangerous combination: everything looks local except the credential.
    expect(() =>
      assertAcceptanceTargetIsLocal({
        ...on,
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
        SUPABASE_SERVICE_ROLE_KEY: cloudKey(),
      }),
    ).toThrow(NonLocalTargetError);
  });

  it("refuses a leftover production ANON key too", () => {
    expect(() =>
      assertAcceptanceTargetIsLocal({
        ...on,
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
        SUPABASE_SERVICE_ROLE_KEY: localKey(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: cloudKey(),
      }),
    ).toThrow(NonLocalTargetError);
  });

  it("refuses when no URL resolved — never falls back to ambient config", () => {
    expect(() => assertAcceptanceTargetIsLocal({ ...on })).toThrow(
      NonLocalTargetError,
    );
  });

  it("accepts the genuine local stack", () => {
    expect(() =>
      assertAcceptanceTargetIsLocal({
        ...on,
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
        SUPABASE_SERVICE_ROLE_KEY: localKey(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: localKey(),
      }),
    ).not.toThrow();
  });
});

describe("acceptance mode — never leaks a secret", () => {
  it("describes the environment without echoing keys", () => {
    const secret = cloudKey();
    const described = describeAcceptanceEnv({
      [ACCEPTANCE_FLAG]: "1",
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
      SUPABASE_SERVICE_ROLE_KEY: secret,
    });
    expect(described).not.toContain(secret);
    expect(described).toContain("ACCEPTANCE");
    expect(described).toContain("127.0.0.1:54321");
    expect(described).toMatch(/redacted/);
  });

  it("the refusal message names the problem, not the credential", () => {
    const secret = cloudKey();
    try {
      startAcceptanceGuard({
        [ACCEPTANCE_FLAG]: "1",
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
        SUPABASE_SERVICE_ROLE_KEY: secret,
      });
      throw new Error("should have refused");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(secret);
      expect(msg).toContain("REFUSED");
    }
  });
});

describe("acceptance mode — wired into the app, not just available", () => {
  const APP = process.cwd();
  const envSrc = readFileSync(join(APP, "lib", "env.ts"), "utf8");

  it("both Supabase env accessors call the guard", () => {
    // A guard nothing calls is decoration. These two functions are the only
    // ways the app obtains Supabase config, so covering both covers the app.
    expect(envSrc).toMatch(/requireSupabaseClientEnv/);
    expect(envSrc).toMatch(/requireSupabaseServiceEnv/);
    const calls = envSrc.match(/assertAcceptanceTargetIsLocal\(process\.env\)/g);
    expect(calls?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("the acceptance runner never prints a raw key", () => {
    const runner = readFileSync(
      join(APP, "scripts", "dev-acceptance.ts"),
      "utf8",
    );
    // It may reference key VARIABLES, but must never log one directly.
    expect(runner).not.toMatch(/console\.\w+\([^)]*serviceKey[^)]*\)/);
    expect(runner).not.toMatch(/console\.\w+\([^)]*anonKey[^)]*\)/);
    expect(runner).toMatch(/describeAcceptanceEnv/);
  });
});
