import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MIN_DEDICATED_SECRET_LENGTH,
  confirmationKeyMaterial,
} from "@/lib/security/confirmation-key-material";

const DEDICATED = "a".repeat(64); // the shape of `openssl rand -hex 32`
const SERVICE_ROLE = "service-role-key-value-that-is-long-enough";

describe("confirmation key material — production requires a dedicated key", () => {
  it("production signs with the dedicated key", () => {
    expect(
      confirmationKeyMaterial({ dedicated: DEDICATED, serviceRole: SERVICE_ROLE, production: true }),
    ).toEqual({ ok: true, material: DEDICATED });
  });

  it("production REFUSES the service-role fallback, with an error naming the variable", () => {
    const v = confirmationKeyMaterial({ dedicated: undefined, serviceRole: SERVICE_ROLE, production: true });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toContain("CONVERSATION_TOKEN_SECRET");
      // The refusal never echoes key material.
      expect(v.reason).not.toContain(SERVICE_ROLE);
    }
  });

  it("production treats a blank dashboard field as unset (refuses, never signs with '')", () => {
    for (const blank of ["", "   ", "\n"]) {
      expect(
        confirmationKeyMaterial({ dedicated: blank, serviceRole: SERVICE_ROLE, production: true }).ok,
      ).toBe(false);
    }
  });

  it(`production refuses a dedicated key shorter than ${MIN_DEDICATED_SECRET_LENGTH} characters`, () => {
    const short = "x".repeat(MIN_DEDICATED_SECRET_LENGTH - 1);
    const v = confirmationKeyMaterial({ dedicated: short, serviceRole: SERVICE_ROLE, production: true });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).not.toContain(short);
    expect(
      confirmationKeyMaterial({
        dedicated: "x".repeat(MIN_DEDICATED_SECRET_LENGTH),
        serviceRole: undefined,
        production: true,
      }).ok,
    ).toBe(true);
  });

  it("production with nothing configured refuses", () => {
    expect(
      confirmationKeyMaterial({ dedicated: undefined, serviceRole: undefined, production: true }).ok,
    ).toBe(false);
  });
});

describe("confirmation key material — local dev keeps working", () => {
  it("prefers the dedicated key", () => {
    expect(
      confirmationKeyMaterial({ dedicated: DEDICATED, serviceRole: SERVICE_ROLE, production: false }),
    ).toEqual({ ok: true, material: DEDICATED });
  });

  it("falls back to the service-role key outside production (a fresh checkout on a local stack)", () => {
    expect(
      confirmationKeyMaterial({ dedicated: undefined, serviceRole: SERVICE_ROLE, production: false }),
    ).toEqual({ ok: true, material: SERVICE_ROLE });
  });

  it("refuses when nothing is configured — never a hardcoded literal", () => {
    expect(
      confirmationKeyMaterial({ dedicated: undefined, serviceRole: undefined, production: false }).ok,
    ).toBe(false);
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
      expect(body).toContain('production: process.env.NODE_ENV === "production"');
      // No direct `||` fallback left inside the signer.
      expect(body).not.toMatch(/CONVERSATION_TOKEN_SECRET\s*\|\|/);
      expect(body).toMatch(/throw new Error/);
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
