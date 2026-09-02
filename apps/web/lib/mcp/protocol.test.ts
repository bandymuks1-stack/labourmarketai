import { describe, expect, it } from "vitest";

import {
  handleMcpMessage,
  MCP_PROTOCOL_VERSION,
  type McpServerDeps,
} from "./protocol";

const TOOLS = [
  {
    name: "profile_get",
    title: "My profile",
    description: "Own profile facts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function deps(overrides?: Partial<McpServerDeps>): McpServerDeps {
  return {
    serverInfo: { name: "labourmarket-ai", version: "0.1.0" },
    tools: TOOLS,
    callTool: async () => ({ isError: false, payload: { ok: true, data: {} } }),
    ...overrides,
  };
}

const req = (method: string, params?: unknown, id: string | number = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params !== undefined ? { params } : {}),
});

describe("initialize", () => {
  it("echoes a supported requested version", async () => {
    const r = await handleMcpMessage(
      req("initialize", { protocolVersion: "2025-03-26" }),
      deps(),
    );
    expect(r?.result).toMatchObject({ protocolVersion: "2025-03-26" });
  });

  it("answers its own version for an unknown requested version", async () => {
    const r = await handleMcpMessage(
      req("initialize", { protocolVersion: "1999-01-01" }),
      deps(),
    );
    expect(r?.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "labourmarket-ai" },
    });
  });
});

describe("notifications and malformed messages", () => {
  it("a notification (no id) produces NO response body", async () => {
    const r = await handleMcpMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      deps(),
    );
    expect(r).toBeNull();
  });

  it("a non-object message is an invalid request, not a crash", async () => {
    for (const bad of [null, 42, "x", [req("ping")]]) {
      const r = await handleMcpMessage(bad, deps());
      expect(r?.error?.code).toBe(-32600);
    }
  });

  it("an unknown method is -32601", async () => {
    const r = await handleMcpMessage(req("resources/list"), deps());
    expect(r?.error?.code).toBe(-32601);
  });
});

describe("tools", () => {
  it("tools/list returns exactly the declared tools", async () => {
    const r = await handleMcpMessage(req("tools/list"), deps());
    expect(r?.result).toEqual({
      tools: [
        {
          name: "profile_get",
          title: "My profile",
          description: "Own profile facts.",
          inputSchema: TOOLS[0].inputSchema,
        },
      ],
    });
  });

  it("tools/list emits declared annotations verbatim (and omits the key when absent)", async () => {
    const annotated = {
      ...TOOLS[0],
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    };
    const r = await handleMcpMessage(req("tools/list"), deps({ tools: [annotated] }));
    expect(r?.result).toEqual({
      tools: [
        {
          name: "profile_get",
          title: "My profile",
          description: "Own profile facts.",
          inputSchema: TOOLS[0].inputSchema,
          annotations: annotated.annotations,
        },
      ],
    });
    // Without annotations the key is absent, not null — the first assertion
    // in this file already pins that shape.
  });

  it("tools/call leads with humanText when provided, keeping the FULL payload in both channels", async () => {
    const payload = { ok: true, data: { entryId: "e-1" } };
    const r = await handleMcpMessage(
      req("tools/call", { name: "profile_get", arguments: {} }),
      deps({
        callTool: async () => ({
          isError: false,
          payload,
          humanText: "Žurnalo įrašas išsaugotas.",
        }),
      }),
    );
    expect(r?.result).toEqual({
      content: [
        {
          type: "text",
          text: `Žurnalo įrašas išsaugotas.\n\n${JSON.stringify(payload)}`,
        },
      ],
      structuredContent: payload,
      isError: false,
    });
  });

  it("tools/call runs the tool and wraps the payload as text + structuredContent", async () => {
    const r = await handleMcpMessage(
      req("tools/call", { name: "profile_get", arguments: {} }),
      deps({
        callTool: async (name) => ({
          isError: false,
          payload: { ok: true, data: { called: name } },
        }),
      }),
    );
    expect(r?.result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ ok: true, data: { called: "profile_get" } }) }],
      structuredContent: { ok: true, data: { called: "profile_get" } },
      isError: false,
    });
  });

  it("a failing tool is an isError RESULT the model can read, not a protocol error", async () => {
    const r = await handleMcpMessage(
      req("tools/call", { name: "profile_get", arguments: {} }),
      deps({
        callTool: async () => ({
          isError: true,
          payload: { ok: false, code: "unavailable" },
        }),
      }),
    );
    expect(r?.error).toBeUndefined();
    expect(r?.result).toMatchObject({ isError: true });
  });

  it("an unknown tool is refused at the protocol layer (-32602)", async () => {
    const r = await handleMcpMessage(
      req("tools/call", { name: "drop_tables", arguments: {} }),
      deps(),
    );
    expect(r?.error?.code).toBe(-32602);
  });
});
