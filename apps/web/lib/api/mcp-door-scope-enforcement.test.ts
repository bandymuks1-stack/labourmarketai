import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP PERMISSION SCOPES AT THE ONE DISPATCH POINT (lib/mcp/scopes.ts).
 *
 * Drives the real `/api/mcp` POST handler with a stubbed identity and two
 * probe capabilities, and proves the flag's three states:
 *
 *   off      nothing changes — byte-identical responses, no log, no receipt
 *   log      the call runs; a would-be refusal writes one log line only
 *   enforce  the call is refused BEFORE the capability runs, with a
 *            structured `insufficient_scope` result and an audit receipt
 *
 * and that the person's own (first-party) session is never scoped.
 *
 * B3: the grant is the person's RECORDED choice, read once per request through
 * the caller's own client (`oauth_door_product_grant_v1`, stubbed here as the
 * identity's `supabase.rpc`). The token's own claims play no part.
 */

const mockEnv = vi.hoisted(() => ({ MCP_SCOPE_ENFORCEMENT: undefined as string | undefined }));

type Identity = {
  userId: string;
  transport: "bearer" | "cookie";
  supabase: unknown;
  oauthClientId?: string;
};

/** A caller client whose door read answers `data` (or `error`). */
function door(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) };
}
let identity: Identity = { userId: "u-1", transport: "bearer", supabase: {} };

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return { ...actual, resolveApiIdentity: vi.fn(async () => ({ ok: true, identity })) };
});
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  env: mockEnv,
  requireSupabaseClientEnv: () => ({ url: "http://x", anonKey: "k" }),
}));

const { ANN_READ, ANN_WRITE, ran } = vi.hoisted(() => ({
  ANN_READ: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ANN_WRITE: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ran: [] as string[],
}));

vi.mock("@/lib/capabilities/registry", () => {
  const caps = [
    { id: "journal.list", kind: "read", title: "t", description: "d", exposed: true, annotations: ANN_READ, inputSchema: {} },
    { id: "journal.confirm", kind: "confirm", title: "t", description: "d", exposed: true, annotations: ANN_WRITE, inputSchema: {} },
  ];
  return {
    exposedCapabilities: () => caps,
    runCapability: vi.fn(async (id: string) => {
      ran.push(id);
      return { ok: true, data: { entryId: "00000000-0000-4000-8000-000000000001" } };
    }),
  };
});
vi.mock("@/lib/mcp/toolset", () => ({
  toolName: (id: string) => id.replace(/\./g, "_"),
  toolDefsOf: () => [
    { name: "journal_list", title: "t", description: "d", inputSchema: { type: "object" }, annotations: {} },
    { name: "journal_confirm", title: "t", description: "d", inputSchema: { type: "object" }, annotations: {} },
  ],
  toolsetVersionOf: () => "0.1.0+t2.00000000",
}));

const receipts = vi.hoisted(() => ({
  write: vi.fn(async () => ({ state: "not_applicable" as const })),
  refusal: vi.fn(async () => ({ state: "recorded" as const, id: "r-1" })),
}));
vi.mock("@/lib/capabilities/external-receipt", () => ({
  recordExternalReceipt: receipts.write,
  recordScopeRefusalReceipt: receipts.refusal,
}));
vi.mock("@/lib/capabilities/presentation", () => ({ summarizeCapabilityResult: vi.fn(async () => null) }));

import { POST } from "@/app/api/mcp/route";

const logLines: string[] = [];

async function callTool(tool: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await POST(
    new Request("https://labourmarket.ai/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: { confirmationToken: "tok" } } }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function result(body: Record<string, unknown>) {
  return body.result as { isError: boolean; structuredContent: Record<string, unknown> };
}

const scopeLines = () => logLines.filter((l) => l.includes('"external_client.scope"')).map((l) => JSON.parse(l));

/** Legacy: a consent from before B3, no recorded choice. */
const OAUTH_UNSCOPED: Identity = {
  userId: "u-1",
  transport: "bearer",
  supabase: door({ state: "none" }),
  oauthClientId: "client-abc",
};
const OAUTH_READ_JOURNAL: Identity = {
  ...OAUTH_UNSCOPED,
  supabase: door({ state: "granted", scopes: ["read:journal"] }),
};
const OAUTH_WRITE_JOURNAL: Identity = {
  ...OAUTH_UNSCOPED,
  supabase: door({ state: "granted", scopes: ["write:journal"] }),
};
const FIRST_PARTY: Identity = { userId: "u-1", transport: "bearer", supabase: {} };

beforeEach(() => {
  ran.length = 0;
  logLines.length = 0;
  receipts.write.mockClear();
  receipts.refusal.mockClear();
  mockEnv.MCP_SCOPE_ENFORCEMENT = undefined;
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    logLines.push(String(line));
  });
});

describe("MCP_SCOPE_ENFORCEMENT=off (the default) changes nothing", () => {
  for (const value of [undefined, "off"]) {
    it(`flag ${String(value)}: an unscoped OAuth client runs a write exactly like the person's own session`, async () => {
      mockEnv.MCP_SCOPE_ENFORCEMENT = value;
      identity = OAUTH_UNSCOPED;
      const oauth = await callTool("journal_confirm");
      identity = FIRST_PARTY;
      const own = await callTool("journal_confirm");
      expect(oauth).toEqual(own);
      expect(result(oauth.body).isError).toBe(false);
      expect(ran).toEqual(["journal.confirm", "journal.confirm"]);
      expect(scopeLines()).toEqual([]);
      expect(receipts.refusal).not.toHaveBeenCalled();
      // The ordinary write receipt still runs, unchanged.
      expect(receipts.write).toHaveBeenCalledTimes(2);
    });
  }
});

describe("a SCOPED grant is held to its scopes whatever the flag says (B2)", () => {
  for (const value of [undefined, "off", "log"]) {
    it(`flag ${String(value)}: a read:journal client calling a journal write is refused, nothing ran`, async () => {
      mockEnv.MCP_SCOPE_ENFORCEMENT = value;
      identity = OAUTH_READ_JOURNAL;
      const { body } = await callTool("journal_confirm");
      expect(result(body).isError).toBe(true);
      expect(ran).toEqual([]);
      expect(scopeLines()).toEqual([
        {
          event: "external_client.scope",
          door: "/api/mcp",
          tool: "journal_confirm",
          outcome: "refused",
          mode: "enforce",
          grant: "oauth_scoped",
          required_scope: "write:journal",
          oauth_client: "client-abc",
        },
      ]);
      expect(receipts.refusal).toHaveBeenCalledTimes(1);
    });
  }
});

describe("MCP_SCOPE_ENFORCEMENT=log records would-be refusals and refuses nothing", () => {
  it("an unscoped client calling a journal write: the write runs, one log line, no receipt", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "log";
    identity = OAUTH_UNSCOPED;
    const { body } = await callTool("journal_confirm");
    expect(result(body).isError).toBe(false);
    expect(ran).toEqual(["journal.confirm"]);
    expect(scopeLines()).toMatchObject([
      { event: "external_client.scope", outcome: "would_refuse", mode: "log", grant: "oauth_unscoped", required_scope: "write:journal" },
    ]);
    expect(receipts.refusal).not.toHaveBeenCalled();
  });

  it("a covered call logs nothing", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "log";
    identity = OAUTH_READ_JOURNAL;
    await callTool("journal_list");
    expect(scopeLines()).toEqual([]);
  });

  it("the log line never carries a token, argument, payload or user id", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "log";
    identity = OAUTH_UNSCOPED;
    await callTool("journal_confirm");
    const line = logLines.find((l) => l.includes('"external_client.scope"'))!;
    expect(line).not.toMatch(/u-1|tok|a\.b\.c|arguments|payload/);
  });
});

describe("MCP_SCOPE_ENFORCEMENT=enforce refuses before the capability runs", () => {
  it("a read:journal client calling a journal write: insufficient_scope, nothing ran, a refusal receipt", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "enforce";
    identity = OAUTH_READ_JOURNAL;
    const { status, body } = await callTool("journal_confirm");
    expect(status).toBe(200); // a tool RESULT, not a transport error
    const r = result(body);
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({
      ok: false,
      code: "insufficient_scope",
      requiredScope: "write:journal",
      grantedScopes: ["read:journal"],
      receipt: { state: "recorded", id: "r-1" },
    });
    expect(ran).toEqual([]);
    expect(receipts.refusal).toHaveBeenCalledTimes(1);
    expect(receipts.refusal.mock.calls[0]).toEqual([
      expect.objectContaining({ userId: "u-1", actorKind: "agent" }),
      "journal.confirm",
      { confirmationToken: "tok" },
    ]);
    expect(receipts.write).not.toHaveBeenCalled();
    expect(scopeLines()).toEqual([expect.objectContaining({ outcome: "refused", mode: "enforce" })]);
  });

  it("an unscoped OAuth client (every Supabase token today) is refused even a read", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "enforce";
    identity = OAUTH_UNSCOPED;
    const r = result((await callTool("journal_list")).body);
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ code: "insufficient_scope", requiredScope: "read:journal", grantedScopes: [] });
    expect(ran).toEqual([]);
    expect(scopeLines()[0]).toMatchObject({ grant: "oauth_unscoped" });
  });

  it("write:journal covers the journal read and the journal write", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "enforce";
    identity = OAUTH_WRITE_JOURNAL;
    expect(result((await callTool("journal_list")).body).isError).toBe(false);
    expect(result((await callTool("journal_confirm")).body).isError).toBe(false);
    expect(ran).toEqual(["journal.list", "journal.confirm"]);
    expect(receipts.refusal).not.toHaveBeenCalled();
  });

  it("the person's own session (no OAuth client) is never scoped", async () => {
    mockEnv.MCP_SCOPE_ENFORCEMENT = "enforce";
    identity = FIRST_PARTY;
    expect(result((await callTool("journal_confirm")).body).isError).toBe(false);
    identity = { ...FIRST_PARTY, transport: "cookie" };
    expect(result((await callTool("journal_confirm")).body).isError).toBe(false);
    expect(ran).toEqual(["journal.confirm", "journal.confirm"]);
    expect(scopeLines()).toEqual([]);
  });
});

describe("B3: the recorded choice, read once per request, fails closed", () => {
  for (const value of [undefined, "off", "log", "enforce"]) {
    it(`flag ${String(value)}: an unreadable grant refuses the call — never runs it unscoped`, async () => {
      mockEnv.MCP_SCOPE_ENFORCEMENT = value;
      identity = { ...OAUTH_UNSCOPED, supabase: door(null, { code: "PGRST202" }) };
      const r = result((await callTool("journal_list")).body);
      expect(r.isError).toBe(true);
      expect(r.structuredContent).toMatchObject({ ok: false, code: "permission_check_unavailable" });
      expect(ran).toEqual([]);
      expect(scopeLines()).toEqual([
        expect.objectContaining({ outcome: "refused", grant: "oauth_unavailable", required_scope: null }),
      ]);
    });

    it(`flag ${String(value)}: a withdrawn choice refuses even a read`, async () => {
      mockEnv.MCP_SCOPE_ENFORCEMENT = value;
      identity = { ...OAUTH_UNSCOPED, supabase: door({ state: "revoked", scopes: [] }) };
      const r = result((await callTool("journal_list")).body);
      expect(r.structuredContent).toMatchObject({ code: "insufficient_scope", grantedScopes: [] });
      expect(ran).toEqual([]);
    });

    it(`flag ${String(value)}: an empty choice is scoped to nothing, not legacy`, async () => {
      mockEnv.MCP_SCOPE_ENFORCEMENT = value;
      identity = { ...OAUTH_UNSCOPED, supabase: door({ state: "granted", scopes: [] }) };
      expect(result((await callTool("journal_list")).body).isError).toBe(true);
      expect(ran).toEqual([]);
    });
  }

  it("the door read happens once per tool call request, through the caller's own client, with no arguments", async () => {
    const client = door({ state: "granted", scopes: ["read:journal"] });
    identity = { ...OAUTH_UNSCOPED, supabase: client };
    await callTool("journal_list");
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("oauth_door_product_grant_v1");
  });

  it("first-party callers never trigger the read", async () => {
    const client = door({ state: "granted", scopes: [] });
    identity = { ...FIRST_PARTY, supabase: client };
    expect(result((await callTool("journal_confirm")).body).isError).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("tools/list pays no read", async () => {
    const client = door({ state: "none" });
    identity = { ...OAUTH_UNSCOPED, supabase: client };
    await POST(
      new Request("https://labourmarket.ai/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("a change between two requests applies to the next call (no caching across requests)", async () => {
    let state: unknown = { state: "granted", scopes: ["read:journal"] };
    const client = { rpc: vi.fn(async () => ({ data: state, error: null })) };
    identity = { ...OAUTH_UNSCOPED, supabase: client };
    expect(result((await callTool("journal_list")).body).isError).toBe(false);
    state = { state: "revoked" };
    expect(result((await callTool("journal_list")).body).isError).toBe(true);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });
});
