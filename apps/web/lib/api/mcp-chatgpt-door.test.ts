import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE CURATED CHATGPT DOOR, THROUGH ITS REAL POST HANDLER. `/api/mcp/chatgpt`
 * lists and runs ONLY the profile; `/api/mcp` keeps every exposed tool. A
 * client naming a tool outside the profile on the curated door is refused
 * before anything runs, and its 401 points at its own metadata document.
 */

type Auth =
  | { ok: true; identity: { userId: string; transport: "bearer"; supabase: unknown } }
  | { ok: false; reason: "no-credentials" };
let auth: Auth = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return { ...actual, resolveApiIdentity: vi.fn(async () => auth) };
});
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));

const ran: string[] = [];
vi.mock("@/lib/capabilities/registry", () => {
  const cap = (id: string) => ({
    id,
    kind: "read",
    title: id,
    description: id,
    exposed: true,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { "~standard": {} },
  });
  // One tool inside the profile, one outside it.
  const caps = [cap("jobs.search"), cap("evidence.person.create")];
  return {
    exposedCapabilities: () => caps,
    runCapability: vi.fn(async (id: string) => {
      ran.push(id);
      return { ok: true, data: {} };
    }),
  };
});
vi.mock("@/lib/mcp/toolset", () => ({
  toolName: (id: string) => id.replace(/\./g, "_"),
  toolDefsOf: (caps: { id: string }[]) =>
    caps.map((c) => ({
      name: c.id.replace(/\./g, "_"),
      title: c.id,
      description: c.id,
      inputSchema: { type: "object" },
      annotations: {},
    })),
  toolsetVersionOf: (defs: unknown[]) => `0.1.0+t${defs.length}.00000000`,
}));
vi.mock("@/lib/capabilities/external-receipt", () => ({ recordExternalReceipt: async () => ({ state: "not_applicable" }) }));
vi.mock("@/lib/capabilities/presentation", () => ({ summarizeCapabilityResult: vi.fn(async () => null) }));

import { POST as curatedPost, GET as curatedGet } from "@/app/api/mcp/chatgpt/route";
import { POST as fullPost } from "@/app/api/mcp/route";

function rpc(path: string, method: string, params: unknown = {}): Request {
  return new Request(`https://labourmarket.ai${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function toolNames(post: (r: Request) => Promise<Response>, path: string): Promise<string[]> {
  const res = await post(rpc(path, "tools/list"));
  const body = (await res.json()) as { result: { tools: { name: string }[] } };
  return body.result.tools.map((t) => t.name);
}

beforeEach(() => {
  ran.length = 0;
  auth = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("the curated ChatGPT door (/api/mcp/chatgpt)", () => {
  it("lists only profile tools, while /api/mcp still lists every exposed tool", async () => {
    expect(await toolNames(curatedPost, "/api/mcp/chatgpt")).toEqual(["jobs_search"]);
    expect(await toolNames(fullPost, "/api/mcp")).toEqual(["jobs_search", "evidence_person_create"]);
  });

  it("refuses a tool outside the profile without running it; the full door runs the same tool", async () => {
    const refused = await curatedPost(rpc("/api/mcp/chatgpt", "tools/call", { name: "evidence_person_create", arguments: {} }));
    const body = (await refused.json()) as { error?: { message: string } };
    expect(body.error?.message).toContain("Unknown tool");
    expect(ran).toEqual([]);

    await fullPost(rpc("/api/mcp", "tools/call", { name: "evidence_person_create", arguments: {} }));
    expect(ran).toEqual(["evidence.person.create"]);
  });

  it("runs a profile tool", async () => {
    await curatedPost(rpc("/api/mcp/chatgpt", "tools/call", { name: "jobs_search", arguments: {} }));
    expect(ran).toEqual(["jobs.search"]);
  });

  it("a 401 points at the curated door's own metadata document; the full door's still points at the root one", async () => {
    auth = { ok: false, reason: "no-credentials" };
    const curated = await curatedPost(rpc("/api/mcp/chatgpt", "tools/list"));
    expect(curated.status).toBe(401);
    expect(curated.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://labourmarket.ai/.well-known/oauth-protected-resource/api/mcp/chatgpt"',
    );
    const full = await fullPost(rpc("/api/mcp", "tools/list"));
    expect(full.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://labourmarket.ai/.well-known/oauth-protected-resource"',
    );
  });

  it("its public GET reports the profile's own count", async () => {
    const body = (await (await curatedGet()).json()) as { toolCount: number };
    expect(body.toolCount).toBe(1);
  });
});
