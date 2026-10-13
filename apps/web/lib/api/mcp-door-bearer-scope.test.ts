import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE DOOR ENTERS THE BEARER CALLER SCOPE. A tool call through the real
 * `/api/mcp` POST handler, authenticated by bearer, must reach the product's
 * own `createClient()` as THAT caller's client — the property every bridged
 * web action and workspace read depends on. And after the request, nothing of
 * it remains.
 */

const BEARER_CLIENT = { kind: "bearer-client-of-u-42" };
let identity: { userId: string; transport: "bearer" | "cookie"; supabase: unknown } = {
  userId: "u-42",
  transport: "bearer",
  supabase: BEARER_CLIENT,
};

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return { ...actual, resolveApiIdentity: vi.fn(async () => ({ ok: true, identity })) };
});

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ kind: "cookie-client", auth: { getUser: async () => ({ data: { user: null } }) } }) }));

// One probe capability that does what a server action does: ask
// `createClient()` who it is.
const seen: unknown[] = [];
vi.mock("@/lib/capabilities/registry", () => {
  const probe = {
    id: "probe.who",
    kind: "read",
    title: "probe",
    description: "probe",
    exposed: true,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { "~standard": {} },
  };
  return {
    exposedCapabilities: () => [probe],
    runCapability: vi.fn(async () => {
      const { createClient } = await import("@/lib/supabase/server");
      seen.push(await createClient());
      return { ok: true, data: {} };
    }),
  };
});
vi.mock("@/lib/mcp/toolset", () => ({
  toolName: (id: string) => id.replace(/\./g, "_"),
  toolDefsOf: () => [{ name: "probe_who", title: "probe", description: "probe", inputSchema: { type: "object" }, annotations: {} }],
  toolsetVersionOf: () => "0.1.0+t1.00000000",
}));
vi.mock("@/lib/capabilities/external-receipt", () => ({ recordExternalReceipt: async () => ({ state: "not_applicable" }) }));
vi.mock("@/lib/capabilities/presentation", () => ({ summarizeCapabilityResult: vi.fn(async () => null) }));

import { POST } from "@/app/api/mcp/route";
import { currentBearerCaller } from "@/lib/api/bearer-caller-scope";

function call(): Request {
  return new Request("https://labourmarket.ai/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "probe_who", arguments: {} } }),
  });
}

beforeEach(() => {
  seen.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("/api/mcp runs every tool inside the bearer caller scope", () => {
  it("a bearer tool call sees the caller's own client through createClient()", async () => {
    identity = { userId: "u-42", transport: "bearer", supabase: BEARER_CLIENT };
    const res = await POST(call());
    expect(res.status).toBe(200);
    expect(seen).toEqual([BEARER_CLIENT]);
    // Nothing leaks past the request.
    expect(currentBearerCaller()).toBeUndefined();
  });

  it("a cookie tool call is unchanged: createClient() is the cookie client", async () => {
    identity = { userId: "u-42", transport: "cookie", supabase: BEARER_CLIENT };
    await POST(call());
    expect(seen).toEqual([{ kind: "cookie-client", auth: expect.anything() }]);
  });
});
