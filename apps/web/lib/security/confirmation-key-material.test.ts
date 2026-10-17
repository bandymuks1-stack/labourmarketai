import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MIN_DEDICATED_SECRET_LENGTH,
  confirmationKeyMaterial,
} from "@/lib/security/confirmation-key-material";

const DEDICATED = "a".repeat(64); // the shape of `openssl rand -hex 32`
const SERVICE_ROLE = "service-role-key-value-that-is-long-enough";

/**
 * ONE PURPOSE, ONE KEY, EVERYWHERE (2026-10-17). The service-role key is
 * never HMAC material in any environment. The `production` flag no longer
 * changes the verdict — these cases run the rule with the flag true, false
 * and absent and expect the same answer each time.
 */
const ENVIRONMENTS: ReadonlyArray<boolean | undefined> = [true, false, undefined];

describe("confirmation key material — the dedicated key, or a refusal", () => {
  it("signs with the dedicated key in every environment", () => {
    for (const production of ENVIRONMENTS) {
      expect(
        confirmationKeyMaterial({ dedicated: DEDICATED, serviceRole: SERVICE_ROLE, production }),
      ).toEqual({ ok: true, material: DEDICATED });
    }
  });

  it("REFUSES the service-role key as material in every environment — no fallback remains", () => {
    for (const production of ENVIRONMENTS) {
      const v = confirmationKeyMaterial({ dedicated: undefined, serviceRole: SERVICE_ROLE, production });
      expect(v.ok, `production=${String(production)}`).toBe(false);
      if (!v.ok) {
        expect(v.reason).toContain("CONVERSATION_TOKEN_SECRET");
        // The refusal never echoes key material.
        expect(v.reason).not.toContain(SERVICE_ROLE);
      }
    }
  });

  it("treats a blank dashboard field as unset (refuses, never signs with '')", () => {
    for (const blank of ["", "   ", "\n"]) {
      for (const production of ENVIRONMENTS) {
        expect(
          confirmationKeyMaterial({ dedicated: blank, serviceRole: SERVICE_ROLE, production }).ok,
        ).toBe(false);
      }
    }
  });

  it(`refuses a dedicated key shorter than ${MIN_DEDICATED_SECRET_LENGTH} characters, everywhere`, () => {
    const short = "x".repeat(MIN_DEDICATED_SECRET_LENGTH - 1);
    for (const production of ENVIRONMENTS) {
      const v = confirmationKeyMaterial({ dedicated: short, serviceRole: SERVICE_ROLE, production });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).not.toContain(short);
      expect(
        confirmationKeyMaterial({
          dedicated: "x".repeat(MIN_DEDICATED_SECRET_LENGTH),
          serviceRole: undefined,
          production,
        }).ok,
      ).toBe(true);
    }
  });

  it("with nothing configured refuses — never a hardcoded literal", () => {
    for (const production of ENVIRONMENTS) {
      expect(confirmationKeyMaterial({ dedicated: undefined, serviceRole: undefined, production }).ok).toBe(
        false,
      );
    }
  });

  it("the rule's source has no environment branch and no service-role read on the signing path", () => {
    const src = readFileSync(join(__dirname, "confirmation-key-material.ts"), "utf8");
    const body = src.slice(src.indexOf("export function confirmationKeyMaterial"));
    expect(body).not.toMatch(/input\.production/);
    expect(body).not.toMatch(/input\.serviceRole/);
    expect(body).not.toMatch(/NODE_ENV/);
  });
});

describe("both signers use the one rule", () => {
  const WEB = join(__dirname, "..", "..");
  for (const [file, fn] of [
    ["lib/conversation/dispatch.ts", "function tokenSecret()"],
    ["lib/capabilities/confirmable.ts", "export function capabilityTokenSecret()"],
  ] as const) {
    it(`${file} decides through confirmationKeyMaterial and keeps its purpose string`, () => {
      const src = readFileSync(join(WEB, file), "utf8");
      const body = src.slice(src.indexOf(fn), src.indexOf("\n}", src.indexOf(fn)));
      expect(body).toContain("confirmationKeyMaterial(");
      // No direct `||` fallback left inside the signer.
      expect(body).not.toMatch(/CONVERSATION_TOKEN_SECRET\s*\|\|/);
      expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*\|\|/);
      expect(body).toMatch(/throw new Error/);
    });
  }
});

describe("the local harnesses supply the dedicated secret (so no one is tempted to restore the fallback)", () => {
  const WEB = join(__dirname, "..", "..");
  for (const file of ["scripts/dev-acceptance.ts", "scripts/e2e-local.ts"] as const) {
    it(`${file} passes CONVERSATION_TOKEN_SECRET to the child, preferring an exported value`, () => {
      const src = readFileSync(join(WEB, file), "utf8");
      expect(src).toMatch(/CONVERSATION_TOKEN_SECRET:\s*\n?\s*process\.env\.CONVERSATION_TOKEN_SECRET \?\? LOCAL_CONFIRMATION_TOKEN_SECRET/);
      // The loopback literal is long enough for the rule and says what it is.
      const literal = /LOCAL_CONFIRMATION_TOKEN_SECRET = "([^"]+)"/.exec(src)?.[1] ?? "";
      expect(literal.length).toBeGreaterThanOrEqual(MIN_DEDICATED_SECRET_LENGTH);
      expect(literal).toMatch(/not-for-production/);
    });
  }
});

describe("env: a blank CONVERSATION_TOKEN_SECRET is absent, not a boot failure", () => {
  it("lib/env.ts normalises the field with blankAsAbsent", () => {
    const src = readFileSync(join(__dirname, "..", "env.ts"), "utf8");
    expect(src).toContain(
      "CONVERSATION_TOKEN_SECRET: z.preprocess(blankAsAbsent, z.string().min(16).optional()),",
    );
  });
});
