import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { exposedCapabilities } from "@/lib/capabilities/registry";

import { toolDefsOf, toolsetVersionOf } from "./toolset";

/**
 * THE RELEASE PIN (owner 2026-09-30 §10). The MCP server reports its toolset
 * as `serverInfo.version = 0.1.0+t<count>.<schema hash>`. Every change to the
 * published tool list must be RECORDED in
 * docs/integrations/MCP_TOOLSET_FINGERPRINTS.md, so the owner can compare what
 * ChatGPT reports with what the server serves and tell SERVER CURRENT from
 * CHATGPT STALE. This test fails until the newest row there is the version
 * this tree publishes.
 */
describe("the published MCP toolset is documented", () => {
  it("the newest fingerprint in the register is the one this tree publishes", () => {
    const version = toolsetVersionOf(toolDefsOf(exposedCapabilities()));
    const doc = readFileSync(
      join(__dirname, "..", "..", "..", "..", "docs", "integrations", "MCP_TOOLSET_FINGERPRINTS.md"),
      "utf8",
    );
    const rows = [...doc.matchAll(/^\|\s*`(0\.1\.0\+t\d+\.[0-9a-f]{8})`\s*\|/gm)].map((m) => m[1]);
    expect(rows.length, "the register has no fingerprint rows").toBeGreaterThan(0);
    expect(rows[0], `add a row for ${version} at the TOP of the register`).toBe(version);
  });
});
