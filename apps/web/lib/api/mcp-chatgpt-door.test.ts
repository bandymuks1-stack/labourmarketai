import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE CURATED CHATGPT DOOR, THROUGH ITS REAL POST HANDLER. `/api/mcp/chatgpt`
 * lists and runs ONLY the profile; `/api/mcp` keeps every exposed tool. A
 * client naming a tool outside the profile on the curated door is refused
 * before anything runs, and its 401 points at its own metadata document.
 */

type Auth =
  | { ok: true; identity: { userId: string; transport: "bearer"; supabase: unknown } }
  | { ok: false; reason: "no-credentials" | "invalid-bearer" };
const ANON_CLIENT = { anonymous: true };
let auth: Auth = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return { ...actual, resolveApiIdentity: vi.fn(async () => auth), anonymousApiClient: vi.fn(async () => ANON_CLIENT) };
});
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));

const ran: string[] = [];
const callers: { userId: string; supabase: unknown }[] = [];
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
  // A public profile tool, a signed-in profile tool, and one outside it.
  const caps = [cap("jobs.search"), cap("demand.list"), cap("evidence.person.create")];
  return {
    exposedCapabilities: () => caps,
    runCapability: vi.fn(async (id: string, caller: { userId: string; supabase: unknown }) => {
      ran.push(id);
      callers.push(caller);
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
  callers.length = 0;
  auth = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("the curated ChatGPT door (/api/mcp/chatgpt)", () => {
  it("lists only profile tools, while /api/mcp still lists every exposed tool", async () => {
    expect(await toolNames(curatedPost, "/api/mcp/chatgpt")).toEqual(["jobs_search", "demand_list"]);
    expect(await toolNames(fullPost, "/api/mcp")).toEqual(["jobs_search", "demand_list", "evidence_person_create"]);
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
    // With no credential at all the curated door answers anonymously (below);
    // a rejected token is its 401.
    auth = { ok: false, reason: "invalid-bearer" };
    const curated = await curatedPost(rpc("/api/mcp/chatgpt", "tools/list"));
    expect(curated.status).toBe(401);
    expect(curated.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://labourmarket.ai/.well-known/oauth-protected-resource/api/mcp/chatgpt"',
    );
    auth = { ok: false, reason: "no-credentials" };
    const full = await fullPost(rpc("/api/mcp", "tools/list"));
    expect(full.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://labourmarket.ai/.well-known/oauth-protected-resource"',
    );
  });

  it("its public GET reports the profile's own count", async () => {
    const body = (await (await curatedGet()).json()) as { toolCount: number };
    expect(body.toolCount).toBe(2);
  });
});

type ListedTool = { name: string; securitySchemes?: { type: string }[]; _meta?: { securitySchemes?: unknown } };
type CallResult = { result: { isError: boolean; structuredContent: { code?: string }; _meta?: Record<string, unknown> } };

describe("public job search without sign-in (curated door only; owner approval needed)", () => {
  beforeEach(() => {
    auth = { ok: false, reason: "no-credentials" };
  });

  it("a caller with no credential can discover the door; every tool states its auth requirement", async () => {
    const res = await curatedPost(rpc("/api/mcp/chatgpt", "tools/list"));
    expect(res.status).toBe(200);
    const tools = ((await res.json()) as { result: { tools: ListedTool[] } }).result.tools;
    const schemes = Object.fromEntries(tools.map((t) => [t.name, t.securitySchemes?.map((s) => s.type)]));
    expect(schemes).toEqual({ jobs_search: ["noauth", "oauth2"], demand_list: ["oauth2"] });
    expect(tools.every((t) => t._meta?.securitySchemes !== undefined)).toBe(true);
  });

  it("runs a public tool on the ANONYMOUS client, as nobody", async () => {
    const res = await curatedPost(rpc("/api/mcp/chatgpt", "tools/call", { name: "jobs_search", arguments: {} }));
    expect(res.status).toBe(200);
    expect(ran).toEqual(["jobs.search"]);
    expect(callers[0]).toMatchObject({ userId: "", supabase: ANON_CLIENT });
  });

  it("NEGATIVE CONTROL: a signed-in tool runs nothing and asks the host to link the account", async () => {
    const res = await curatedPost(rpc("/api/mcp/chatgpt", "tools/call", { name: "demand_list", arguments: {} }));
    const body = (await res.json()) as CallResult;
    expect(ran).toEqual([]);
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.code).toBe("sign_in_required");
    expect(body.result._meta?.["mcp/www_authenticate"]).toEqual([
      'Bearer resource_metadata="https://labourmarket.ai/.well-known/oauth-protected-resource/api/mcp/chatgpt"',
    ]);
  });

  it("NEGATIVE CONTROL: a tool outside the profile is still unknown, anonymously too", async () => {
    const res = await curatedPost(rpc("/api/mcp/chatgpt", "tools/call", { name: "evidence_person_create", arguments: {} }));
    expect(((await res.json()) as { error?: { message: string } }).error?.message).toContain("Unknown tool");
    expect(ran).toEqual([]);
  });

  it("NEGATIVE CONTROL: a present-but-bad token is a 401, never anonymous", async () => {
    auth = { ok: false, reason: "invalid-bearer" };
    const res = await curatedPost(rpc("/api/mcp/chatgpt", "tools/call", { name: "jobs_search", arguments: {} }));
    expect(res.status).toBe(401);
    expect(ran).toEqual([]);
  });

  it("NEGATIVE CONTROL: the full door has no anonymous mode and no securitySchemes", async () => {
    expect((await fullPost(rpc("/api/mcp", "tools/call", { name: "jobs_search", arguments: {} }))).status).toBe(401);
    expect(ran).toEqual([]);
    auth = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };
    const tools = ((await (await fullPost(rpc("/api/mcp", "tools/list"))).json()) as { result: { tools: ListedTool[] } })
      .result.tools;
    expect(tools.some((t) => t.securitySchemes !== undefined)).toBe(false);
  });
});
