import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE DOOR NARROWS AN OAUTH CLIENT TO THE CURATED SET (register 10.4).
 * A token issued to an OAuth client (`oauthClientId` set by the auth-core
 * boundary) is shown only the assistant toolset and cannot call outside it
 * by guessing a name; a first-party session keeps the whole list.
 */

let identity: { userId: string; transport: "bearer" | "cookie"; oauthClientId: string | null; supabase: unknown } = {
  userId: "u-1",
  transport: "bearer",
  oauthClientId: "dcr-client",
  supabase: {},
};

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return { ...actual, resolveApiIdentity: vi.fn(async () => ({ ok: true, identity })) };
});
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));

const ran: string[] = [];
vi.mock("@/lib/capabilities/registry", () => {
  const probe = (id: string) => ({
    id,
    kind: "read",
    title: id,
    description: id,
    exposed: true,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { "~standard": {} },
  });
  return {
    exposedCapabilities: () => [probe("profile.get"), probe("company.today")],
    runCapability: vi.fn(async (id: string) => {
      ran.push(id);
      return { ok: true, data: {} };
    }),
  };
});
vi.mock("@/lib/mcp/toolset", () => ({
  toolName: (id: string) => id.replace(/\./g, "_"),
  toolDefsOf: () => [
    { name: "profile_get", title: "p", description: "p", inputSchema: { type: "object" }, annotations: {} },
    { name: "company_today", title: "c", description: "c", inputSchema: { type: "object" }, annotations: {} },
  ],
  toolsetVersionOf: () => "0.1.0+t2.00000000",
}));
vi.mock("@/lib/capabilities/external-receipt", () => ({ recordExternalReceipt: async () => ({ state: "not_applicable" }) }));
vi.mock("@/lib/capabilities/presentation", () => ({ summarizeCapabilityResult: vi.fn(async () => null) }));

import { POST } from "@/app/api/mcp/route";

function rpc(method: string, params: Record<string, unknown> = {}): Request {
  return new Request("https://labourmarket.ai/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function names(): Promise<string[]> {
  const body = (await (await POST(rpc("tools/list"))).json()) as { result: { tools: { name: string }[] } };
  return body.result.tools.map((t) => t.name);
}

beforeEach(() => {
  ran.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("/api/mcp narrows OAuth clients to the assistant toolset", () => {
  it("an OAuth client is shown only curated tools", async () => {
    identity = { ...identity, transport: "bearer", oauthClientId: "dcr-client" };
    expect(await names()).toEqual(["profile_get"]);
  });

  it("an OAuth client cannot call a tool outside the set by name, and nothing runs", async () => {
    identity = { ...identity, transport: "bearer", oauthClientId: "dcr-client" };
    const res = await POST(rpc("tools/call", { name: "company_today", arguments: {} }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('"ok":true');
    expect(ran).toEqual([]);
  });

  it("the door never lets a shared cache keep its tool list (it varies by caller)", async () => {
    for (const oauthClientId of ["dcr-client", null]) {
      identity = { ...identity, transport: "bearer", oauthClientId };
      const body = (await (await POST(rpc("tools/list"))).json()) as { result: { cacheScope: string } };
      expect(body.result.cacheScope).toBe("private");
    }
  });

  it("a first-party bearer session (the phone) keeps the whole list", async () => {
    identity = { ...identity, transport: "bearer", oauthClientId: null };
    expect(await names()).toEqual(["profile_get", "company_today"]);
  });
});
