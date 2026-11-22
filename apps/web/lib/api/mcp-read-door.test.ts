import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * THE READ DOOR REFUSES EVERY WRITE. Through the real `/api/mcp/read` POST
 * handler with a registry of one read and one confirm: the list shows only
 * the read, the confirm is refused and never runs, and `/api/mcp` still
 * lists both.
 */

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return {
    ...actual,
    resolveApiIdentity: vi.fn(async () => ({
      ok: true,
      identity: { userId: "u-7", transport: "bearer", supabase: {} },
    })),
  };
});
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));

const ran: string[] = [];
vi.mock("@/lib/capabilities/registry", () => {
  const base = { title: "t", description: "d", exposed: true, inputSchema: z.object({}) };
  const read = {
    ...base,
    id: "probe.read",
    kind: "read",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  };
  const confirm = {
    ...base,
    id: "probe.write_confirm",
    kind: "confirm",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  };
  return {
    exposedCapabilities: () => [read, confirm],
    runCapability: vi.fn(async (id: string) => {
      ran.push(id);
      return { ok: true, data: {} };
    }),
  };
});
vi.mock("@/lib/capabilities/external-receipt", () => ({ recordExternalReceipt: async () => ({ state: "not_applicable" }) }));
vi.mock("@/lib/capabilities/presentation", () => ({ summarizeCapabilityResult: vi.fn(async () => null) }));

import { POST as fullPost } from "@/app/api/mcp/route";
import { GET as readGet, POST as readPost } from "@/app/api/mcp/read/route";

function rpc(path: string, method: string, params: Record<string, unknown> = {}): Request {
  return new Request(`https://labourmarket.ai${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function toolNames(post: (r: Request) => Promise<Response>, path: string): Promise<string[]> {
  const body = await (await post(rpc(path, "tools/list"))).json();
  return body.result.tools.map((t: { name: string }) => t.name);
}

beforeEach(() => {
  ran.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("/api/mcp/read", () => {
  it("lists only the read; /api/mcp lists both", async () => {
    expect(await toolNames(readPost, "/api/mcp/read")).toEqual(["probe_read"]);
    expect(await toolNames(fullPost, "/api/mcp")).toEqual(["probe_read", "probe_write_confirm"]);
  });

  it("runs a read", async () => {
    const body = await (await readPost(rpc("/api/mcp/read", "tools/call", { name: "probe_read", arguments: {} }))).json();
    expect(body.result.isError).toBe(false);
    expect(ran).toEqual(["probe.read"]);
  });

  it("refuses a write name and runs nothing", async () => {
    const body = await (
      await readPost(rpc("/api/mcp/read", "tools/call", { name: "probe_write_confirm", arguments: {} }))
    ).json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(ran).toEqual([]);
  });

  it("its public GET reports its own, smaller toolset", async () => {
    const body = await (await readGet()).json();
    expect(body.toolCount).toBe(1);
  });
});
