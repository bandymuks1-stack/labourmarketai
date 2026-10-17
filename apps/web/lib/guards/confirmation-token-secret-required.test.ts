import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * ONE purpose, ONE key (owner direction 2026-10-16; audit SEC-15).
 *
 * Confirmation tokens — the single-use receipts behind every consequential
 * chat and capability write (decision 0024) — are signed with a DEDICATED
 * secret. The broad Supabase service-role key is never reused as HMAC
 * material: a rotation of that key would silently invalidate every pending
 * confirmation, and one credential would serve two trust domains. Without
 * `CONVERSATION_TOKEN_SECRET` the signers refuse, loudly.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: "sr_" + "x".repeat(200) },
}));

describe("confirmation token secret is dedicated", () => {
  it("the capability signer refuses without CONVERSATION_TOKEN_SECRET even when the service-role key is present", async () => {
    const { capabilityTokenSecret } = await import("@/lib/capabilities/confirmable");
    expect(() => capabilityTokenSecret()).toThrow(/CONVERSATION_TOKEN_SECRET is not set/);
  });

  it("neither signer names the service-role key as material (source pin)", () => {
    const web = join(__dirname, "../..");
    for (const rel of ["lib/conversation/dispatch.ts", "lib/capabilities/confirmable.ts"]) {
      const src = readFileSync(join(web, rel), "utf8");
      const fn = src.match(/function (?:tokenSecret|capabilityTokenSecret)\(\)[\s\S]*?\n\}/)?.[0] ?? "";
      expect(fn, rel).toContain("env.CONVERSATION_TOKEN_SECRET");
      expect(fn, rel).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(fn, rel).not.toMatch(/\|\|\s*env\./);
    }
  });

  it("the deployment contract lists the variable", () => {
    const deploy = readFileSync(join(__dirname, "../../../../docs/DEPLOYMENT.md"), "utf8");
    expect(deploy).toContain("CONVERSATION_TOKEN_SECRET");
  });
});
