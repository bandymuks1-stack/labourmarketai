import { describe, expect, it } from "vitest";

import {
  handleMcpMessage,
  requestedProtocolVersion,
  LIST_CACHE_SCOPE,
  LIST_CACHE_TTL_MS,
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_2026,
  PROTOCOL_VERSION_META_KEY,
  SERVER_INFO_META_KEY,
  SUPPORTED_PROTOCOL_VERSIONS,
  type McpServerDeps,
} from "@/lib/mcp/protocol";

/**
 * WHAT THIS PROTECTS — that this server can still be reached by an MCP client
 * on the CURRENT protocol revision, and that it never claims a revision it
 * does not serve.
 *
 * The 2026-07-28 revision (published 2026-07-28, SEP-2575) made MCP
 * statelessly request-scoped: the `initialize` handshake is gone, the version
 * travels on every request, `Mcp-Session-Id` is removed, and discovery moves
 * to `server/discover`. This server had been pinned to `2025-06-18` and knew
 * nothing of it — a client negotiating the current revision was silently
 * answered in an older one, which is the exact "confident wrong answer"
 * failure the product-truth apparatus exists to stop.
 *
 * THIS GUARD EXECUTES THE PROTOCOL. It calls `handleMcpMessage` and asserts
 * over the returned objects. It does not read this repository's source as
 * text and it does not assert that a string appears in a file — a guard of
 * that kind would have passed throughout the period the server was stale,
 * because the stale value was itself spelled correctly.
 */

const TOOL = {
  name: "journal_list",
  title: "List journal entries",
  description: "Recorded work under the caller's own permissions.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
} as const;

function deps(over: Partial<McpServerDeps> = {}): McpServerDeps {
  return {
    serverInfo: { name: "labourmarket-ai", version: "0.1.0" },
    instructions: "Capabilities for the signed-in user.",
    tools: [TOOL],
    callTool: async () => ({ isError: false, payload: { ok: true } }),
    ...over,
  };
}

const req = (method: string, params?: Record<string, unknown>) => ({
  jsonrpc: "2.0" as const,
  id: 1,
  method,
  ...(params ? { params } : {}),
});

const resultOf = (r: Awaited<ReturnType<typeof handleMcpMessage>>) =>
  (r as { result: Record<string, unknown> }).result;

describe("MCP 2026-07-28 — the current revision is served", () => {
  it("declares the current revision as supported, newest first", () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe(MCP_PROTOCOL_VERSION_2026);
    expect(MCP_PROTOCOL_VERSION_2026).toBe("2026-07-28");
  });

  it("keeps the older revisions inside the spec's 12-month deprecation window", () => {
    // Dropping these breaks every client that has not migrated, which as of
    // this revision's publication is most of them. Removing one is a
    // deliberate act with a date attached, not a tidy-up.
    for (const v of ["2025-06-18", "2025-03-26", "2024-11-05"]) {
      expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(v);
    }
  });

  it("answers server/discover without any handshake", async () => {
    const r = resultOf(await handleMcpMessage(req("server/discover"), deps()));
    expect(r.resultType).toBe("complete");
    expect(r.supportedVersions).toEqual([...SUPPORTED_PROTOCOL_VERSIONS]);
    expect(r.capabilities).toEqual({ tools: { listChanged: false } });
    expect((r._meta as Record<string, unknown>)[SERVER_INFO_META_KEY]).toEqual({
      name: "labourmarket-ai",
      version: "0.1.0",
    });
    expect(r.ttlMs).toBe(LIST_CACHE_TTL_MS);
    expect(r.cacheScope).toBe(LIST_CACHE_SCOPE);
  });

  it("server/discover and initialize report the SAME capabilities and identity", async () => {
    // Two discovery routes that disagree is the duplicate-answer defect this
    // repository keeps finding (one function, two readers, two answers).
    const d = resultOf(await handleMcpMessage(req("server/discover"), deps()));
    const i = resultOf(await handleMcpMessage(req("initialize"), deps()));
    expect(d.capabilities).toEqual(i.capabilities);
    expect((d._meta as Record<string, unknown>)[SERVER_INFO_META_KEY]).toEqual(i.serverInfo);
    expect(d.instructions).toBe(i.instructions);
  });

  it("accepts the per-request version from _meta", async () => {
    const r = await handleMcpMessage(
      req("tools/list", { _meta: { [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION_2026 } }),
      deps(),
    );
    expect((r as { error?: unknown }).error).toBeUndefined();
  });

  it("accepts the per-request version from the transport header", async () => {
    const r = await handleMcpMessage(
      req("tools/list"),
      deps({ transportProtocolVersion: MCP_PROTOCOL_VERSION_2026 }),
    );
    expect((r as { error?: unknown }).error).toBeUndefined();
  });

  it("REFUSES a version it does not serve instead of silently downgrading", async () => {
    // The dangerous direction. A server that answers a future revision in an
    // old dialect looks healthy and returns subtly wrong shapes; a refusal is
    // one clear failure the client can act on.
    const r = await handleMcpMessage(
      req("tools/list", { _meta: { [PROTOCOL_VERSION_META_KEY]: "2099-01-01" } }),
      deps(),
    );
    const err = (r as { error: { code: number; message: string } }).error;
    expect(err.code).toBe(-32600);
    expect(err.message).toContain("2099-01-01");
  });

  it("_meta wins over the header when they disagree", () => {
    // The header is the transport's encoding of the same fact; `_meta` is the
    // protocol's own channel.
    expect(
      requestedProtocolVersion(
        { _meta: { [PROTOCOL_VERSION_META_KEY]: "2025-06-18" } },
        "2026-07-28",
      ),
    ).toBe("2025-06-18");
  });

  it("reports no stated version as null, not as the default", () => {
    // Three states, not two: stated-and-served, stated-and-not-served, and
    // not stated. Collapsing the third into a default is how a refusal turns
    // into a silent downgrade.
    expect(requestedProtocolVersion({}, null)).toBeNull();
    expect(requestedProtocolVersion({}, "")).toBeNull();
  });

  it("puts cache directives on tools/list", async () => {
    const r = resultOf(await handleMcpMessage(req("tools/list"), deps()));
    expect(r.ttlMs).toBe(LIST_CACHE_TTL_MS);
    // `public` is a claim that the list carries no caller-specific data. It
    // is true only while the tool list stays derived from the static
    // capability registry. If a tool list ever varies by caller, this MUST
    // become `private` — a shared cache would otherwise hand one user's tool
    // list to another.
    expect(r.cacheScope).toBe("public");
  });

  it("never mints or echoes a session id, on any method", async () => {
    // 2026-07-28 removed protocol-level sessions. This server was already
    // stateless, so the rule is "never start", and it is worth pinning
    // because a session id is the natural thing to add when someone later
    // wants per-client state.
    for (const method of ["server/discover", "initialize", "ping", "tools/list"]) {
      const r = await handleMcpMessage(req(method), deps());
      const json = JSON.stringify(r).toLowerCase();
      expect(json).not.toContain("sessionid");
      expect(json).not.toContain("mcp-session-id");
    }
  });

  it("still serves a legacy client that states nothing", async () => {
    const r = resultOf(await handleMcpMessage(req("initialize"), deps()));
    expect(r.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(r.serverInfo).toEqual({ name: "labourmarket-ai", version: "0.1.0" });
  });

  it("echoes a legacy client's own revision back to it", async () => {
    const r = resultOf(
      await handleMcpMessage(req("initialize", { protocolVersion: "2024-11-05" }), deps()),
    );
    expect(r.protocolVersion).toBe("2024-11-05");
  });
});
