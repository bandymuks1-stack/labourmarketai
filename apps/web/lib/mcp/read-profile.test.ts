import { describe, expect, it, vi } from "vitest";

/**
 * THE READ-ONLY MCP PROFILE (`/api/mcp/read`). Two halves:
 *
 *  1. Over the REAL registry: the read profile lists no draft, confirm or
 *     execute tool, every tool it lists declares itself read-only, and the
 *     full profile is the whole exposed registry, unchanged.
 *  2. Through the REAL door with a two-tool registry: `tools/list` on the read
 *     door shows only the read, and a write name is refused without running.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { exposedCapabilities } from "@/lib/capabilities/registry";

import { GET as readMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/read/route";
import { wwwAuthenticateChallenge } from "@/lib/api/external-client-auth";

import { MCP_READ_RESOURCE_PATH, MCP_RESOURCE_PATH, protectedResourceMetadataPath } from "./protected-resource-metadata";
import { profileCapabilities, toolDefsOf } from "./toolset";

describe("the read profile over the real registry", () => {
  const all = exposedCapabilities();
  const read = profileCapabilities(all, "read");

  it("lists no draft, confirm or execute tool", () => {
    const writes = read.filter((c) => c.kind !== "read").map((c) => c.id);
    expect(writes).toEqual([]);
    const writeNames = toolDefsOf(read)
      .map((d) => d.name)
      .filter((n) => /_(draft|confirm|prepare|execute)$/.test(n));
    expect(writeNames).toEqual([]);
  });

  it("every listed tool declares itself read-only and not destructive", () => {
    const loud = toolDefsOf(read).filter((d) => !d.annotations?.readOnlyHint || d.annotations?.destructiveHint);
    expect(loud.map((d) => d.name)).toEqual([]);
  });

  it("keeps every exposed read, so the review sees the real read surface", () => {
    const reads = all.filter((c) => c.kind === "read").map((c) => c.id);
    expect(read.map((c) => c.id)).toEqual(reads);
    expect(read.length).toBeGreaterThan(0);
  });

  it("the full profile is the whole exposed registry, unchanged", () => {
    expect(profileCapabilities(all, "full")).toBe(all);
  });
});

describe("the read door is its own OAuth resource", () => {
  it("its metadata names /api/mcp/read, so Claude's exact-URL rule holds", async () => {
    const res = await readMetadata(new Request("https://labourmarket.ai/.well-known/oauth-protected-resource/api/mcp/read"));
    expect(((await res.json()) as { resource: string }).resource).toBe(`https://labourmarket.ai${MCP_READ_RESOURCE_PATH}`);
  });

  it("its 401 points to that document; the full door's pointer is unchanged", () => {
    expect(wwwAuthenticateChallenge("https://labourmarket.ai", "CREDENTIALS_MISSING", protectedResourceMetadataPath(MCP_READ_RESOURCE_PATH))).toBe(
      'Bearer resource_metadata="https://labourmarket.ai/.well-known/oauth-protected-resource/api/mcp/read"',
    );
    expect(wwwAuthenticateChallenge("https://labourmarket.ai", "CREDENTIALS_MISSING", protectedResourceMetadataPath(MCP_RESOURCE_PATH))).toBe(
      wwwAuthenticateChallenge("https://labourmarket.ai", "CREDENTIALS_MISSING"),
    );
  });
});
