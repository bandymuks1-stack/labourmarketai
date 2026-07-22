import { describe, expect, it } from "vitest";
import { z } from "zod";
import { blankAsAbsent } from "../env";

/**
 * Regression guard — `BILLING_PROVIDER` env normalisation.
 *
 * INCIDENT (2026-07-22): `BILLING_PROVIDER` was set to an empty string in the
 * Vercel dashboard for both Production and Preview. The schema was
 * `z.enum(["stripe","none"]).default("none")`, and a Zod `.default()` fires ONLY
 * on `undefined` — an empty string is present, so the enum rejected it:
 *
 *     Invalid environment variables: { BILLING_PROVIDER: [ 'Invalid input' ] }
 *
 * Every `main` deploy failed for ~19 hours. The live site stayed up on the last
 * good build, which is exactly why it went unnoticed: nothing was "down", only
 * every new deploy was blocked.
 *
 * The contract encoded here:
 *   - blank / whitespace-only  → treated as ABSENT, so the default applies;
 *   - surrounding whitespace   → trimmed, then validated;
 *   - `stripe` / `none`        → the only accepted values;
 *   - anything else            → STILL FAILS. Never silently coerced.
 *
 * That last rule is the important one. Rewriting an unrecognised provider to
 * `none` would convert a visible misconfiguration into an invisible
 * payments-are-off state — a worse outcome than a red build.
 */

/** The exact shape used by `lib/env.ts` for BILLING_PROVIDER. */
const billingProvider = z.preprocess(
  blankAsAbsent,
  z.enum(["stripe", "none"]).default("none"),
);

function parse(input: unknown) {
  return billingProvider.safeParse(input);
}

describe("blankAsAbsent", () => {
  it("maps blank and whitespace-only strings to undefined", () => {
    expect(blankAsAbsent("")).toBeUndefined();
    expect(blankAsAbsent("   ")).toBeUndefined();
    expect(blankAsAbsent("\t")).toBeUndefined();
    expect(blankAsAbsent("\n")).toBeUndefined();
    expect(blankAsAbsent(" \t\r\n ")).toBeUndefined();
  });

  it("trims surrounding whitespace but preserves the value", () => {
    expect(blankAsAbsent(" none ")).toBe("none");
    expect(blankAsAbsent("\tstripe\n")).toBe("stripe");
  });

  it("passes non-strings through untouched", () => {
    expect(blankAsAbsent(undefined)).toBeUndefined();
    expect(blankAsAbsent(null)).toBeNull();
    expect(blankAsAbsent(42)).toBe(42);
  });
});

describe("BILLING_PROVIDER normalisation", () => {
  it.each([
    ["undefined (variable not set)", undefined],
    ["empty string (the 2026-07-22 incident)", ""],
    ["whitespace only", "   "],
    ["newline only (copy-paste artifact)", "\n"],
    ["tab only", "\t"],
  ])("%s → none", (_label, input) => {
    const result = parse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("none");
  });

  it.each([
    ["none", "none"],
    [" none ", "none"],
    ["\nnone\t", "none"],
    ["stripe", "stripe"],
    [" stripe ", "stripe"],
    ["\tstripe\n", "stripe"],
  ])("%s → %s", (input, expected) => {
    const result = parse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(expected);
  });

  it.each([
    ["unknown provider", "paypal"],
    ["legacy provider name", "stripe_test"],
    ["case variant is not silently accepted", "Stripe"],
    ["partial match", "strip"],
    ["value with inner whitespace", "no ne"],
  ])("%s → validation ERROR, never coerced to none", (_label, input) => {
    const result = parse(input);
    expect(
      result.success,
      `"${input}" must fail loudly rather than silently becoming "none"`,
    ).toBe(false);
  });

  it("never coerces an unknown value into a valid provider", () => {
    // The whole point: a misconfigured provider must not read as a deliberate
    // decision to turn payments off.
    for (const bad of ["paypal", "adyen", "STRIPE", "none;", "0"]) {
      const result = parse(bad);
      if (result.success) {
        throw new Error(
          `"${bad}" was silently accepted as "${result.data}" — it must fail instead`,
        );
      }
    }
  });

  it("does not widen the accepted set beyond stripe|none", () => {
    const accepted = ["stripe", "none", " stripe ", " none ", "", "   ", "\n"]
      .map((v) => parse(v))
      .filter((r) => r.success)
      .map((r) => (r.success ? r.data : null));
    expect(new Set(accepted)).toEqual(new Set(["stripe", "none"]));
  });
});
