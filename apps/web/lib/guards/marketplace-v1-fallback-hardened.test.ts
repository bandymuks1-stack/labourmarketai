import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The v1 write RPCs are revoked once v2 exists (20261003151400), so the app's
 * v1 fallback must trigger ONLY on "function missing" (42883 / PGRST202) and
 * never on a permission error or any other failure.
 */
const WEB = join(__dirname, "..", "..");
const SRC = readFileSync(join(WEB, "lib", "marketplace", "listings.ts"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("v1 fallback is function-missing only", () => {
  it("defines the function-missing predicate with exactly 42883 / PGRST202", () => {
    expect(code).toMatch(/FUNCTION_ABSENT = new Set\(\["42883", "PGRST202"\]\)/);
  });

  it("every v1 write fallback is guarded by isFunctionAbsent, never the broad isAbsent", () => {
    const lines = code.split("\n");
    let v1Calls = 0;
    lines.forEach((l, i) => {
      if (/rpc\("(create|update|set)_marketplace_listing(_status)?_v1"/.test(l)) {
        v1Calls++;
        const guard = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
        expect(guard, `guard before line ${i + 1}`).toMatch(/isFunctionAbsent\(error\)/);
        expect(guard).not.toMatch(/\bisAbsent\(/);
      }
    });
    expect(v1Calls).toBe(3);
  });

  it("a permission error (42501) is not an absence code", () => {
    expect(code).not.toMatch(/FUNCTION_ABSENT[^;]*42501/);
    expect(code).not.toMatch(/ABSENT = new Set\([^)]*42501/);
  });

  it("the v1 fallback never carries v2-only input (needsV2 gate stays)", () => {
    expect(code).toMatch(/isFunctionAbsent\(error\) && !needsV2\(input\)/);
    expect(code).toMatch(/isFunctionAbsent\(error\) && status !== "paused"/);
  });
});
