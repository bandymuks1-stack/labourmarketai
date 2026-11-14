/**
 * Guard: every test in the isolated sign-up walk that REGISTERS a person
 * through the sign-up helper uses its own address.
 *
 * The walk derives addresses from one per-run stamp (`email("<key>")`), so two
 * tests that register with the same key register the same address. The second
 * registration is then (correctly) sent to sign in — S-4 proves exactly that —
 * and never reaches onboarding, so that test waits out its 60 s and fails.
 *
 * That happened on 2026-11-14: S-3b (#3334) and ST-1 (#3341) were each green on
 * their own branch, merged 15 s apart, and both registered `email("student")`.
 * Every branch carrying both then failed ST-1 in the `signup-isolated` job.
 *
 * Tests that deliberately reuse an address to SIGN IN (S-4..S-8) are not
 * registrations through the helper and are not counted here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC = resolve(__dirname, "..", "..", "tests", "e2e", "signup-isolated.spec.ts");

/** The `email("<key>")` keys each test registers through `signUp(...)`. */
export function registeredKeys(src: string): string[] {
  const keys: string[] = [];
  // One block per test (also the ones declared inside a loop).
  for (const block of src.split(/\n(?=\s*test\()/)) {
    // signUp(page, email("key") …)
    for (const m of block.matchAll(/signUp\(\s*\w+\s*,\s*email\((["'`])(.+?)\1\)/g)) keys.push(m[2]!);
    // const address = email("key"); … signUp(page, address …)
    if (/signUp\(\s*\w+\s*,\s*address\b/.test(block)) {
      const m = block.match(/const address = email\((["'`])(.+?)\1\)/);
      if (m) keys.push(m[2]!);
    }
  }
  return keys;
}

describe("isolated sign-up walk: one address per registration", () => {
  it("finds the registrations it is meant to check", () => {
    const keys = registeredKeys(readFileSync(SPEC, "utf8"));
    // S-1, S-2, S-3, S-3b, P-1 (one block, three phones), P-3, P-2, ST-1 at least.
    expect(keys.length).toBeGreaterThanOrEqual(8);
  });

  it("no two tests register the same address", () => {
    const keys = registeredKeys(readFileSync(SPEC, "utf8"));
    const seen = new Set<string>();
    const dup = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    expect(dup, `registered twice in one run: ${dup.join(", ")}`).toEqual([]);
  });

  it("would have caught the 2026-11-14 collision", () => {
    const collided = [
      'test("S-3b. …", async ({ page }) => {\n  const address = email("student");\n  await signUp(page, address);\n});',
      'test("ST-1. …", async ({ page }) => {\n  const address = email("student");\n  await signUp(page, address);\n});',
    ].join("\n");
    expect(registeredKeys(collided)).toEqual(["student", "student"]);
  });
});
