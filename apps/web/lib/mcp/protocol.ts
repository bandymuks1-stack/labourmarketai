/**
 * MCP PROTOCOL SUBSET — pure, dependency-free, fully unit-testable.
 *
 * The ChatGPT app platform (Apps SDK / developer-mode connectors, verified
 * 2026-08-29) connects to a Model Context Protocol server over streamable
 * HTTP: JSON-RPC 2.0 messages POSTed one per request, JSON responses,
 * OAuth 2.1 bearer authentication per request. This module implements the
 * stateless subset that serves tool-calling clients — `initialize`, `ping`,
 * `tools/list`, `tools/call`, and notification acceptance — and NOTHING
 * stateful (no sessions, no SSE, no subscriptions).
 *
 * WHY HAND-ROLLED AND NOT THE SDK: the official TS SDK's server transport is
 * session-oriented and built around Node streams; the adapter here is ~10
 * protocol decisions, each of which we want under this repo's own tests and
 * review (the same reason the guards exist). The capability contract on the
 * other side (`lib/capabilities/`) is adapter-agnostic — replacing this file
 * with the SDK later is an implementation swap, not a product change.
 *
 * VENDOR NEUTRALITY: nothing in here is ChatGPT-specific. Any MCP client — a
 * Claude connector, a future in-house agent runtime — speaks the same subset.
 * ChatGPT is a PRODUCT CLIENT; which LLM providers the platform itself uses
 * (`lib/ai/runtime/`) is a different concern this module never touches.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** Versions this server can answer for. Echo the client's if we support it. */
const SUPPORTED_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

export type McpToolDef = {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  /** JSON Schema (draft 2020-12) for the tool's arguments. */
  readonly inputSchema: Record<string, unknown>;
};

export type McpToolOutcome = {
  readonly isError: boolean;
  /** JSON-serializable payload shown to the model. */
  readonly payload: unknown;
};

export type McpServerDeps = {
  readonly serverInfo: { readonly name: string; readonly version: string };
  readonly instructions?: string;
  readonly tools: readonly McpToolDef[];
  readonly callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<McpToolOutcome>;
};

type JsonRpcId = string | number | null;

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
};

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function parseErrorResponse(): JsonRpcResponse {
  return rpcError(null, PARSE_ERROR, "Body is not valid JSON.");
}

/**
 * Handle ONE decoded JSON-RPC message. Returns `null` for notifications
 * (no id — the HTTP layer answers 202 Accepted with no body).
 */
export async function handleMcpMessage(
  message: unknown,
  deps: McpServerDeps,
): Promise<JsonRpcResponse | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return rpcError(null, INVALID_REQUEST, "Expected a single JSON-RPC message object.");
  }
  const msg = message as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };
  const hasId = "id" in msg && (typeof msg.id === "string" || typeof msg.id === "number");
  const id: JsonRpcId = hasId ? (msg.id as string | number) : null;

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(id, INVALID_REQUEST, "Not a JSON-RPC 2.0 request.");
  }

  // Notifications (initialized, cancelled, …) are accepted and produce no body.
  if (!hasId) return null;

  const params =
    typeof msg.params === "object" && msg.params !== null && !Array.isArray(msg.params)
      ? (msg.params as Record<string, unknown>)
      : {};

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: deps.serverInfo,
          ...(deps.instructions ? { instructions: deps.instructions } : {}),
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: deps.tools.map((t) => ({
            name: t.name,
            ...(t.title ? { title: t.title } : {}),
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!deps.tools.some((t) => t.name === name)) {
        return rpcError(id, INVALID_PARAMS, `Unknown tool "${name}".`);
      }
      const args =
        typeof params.arguments === "object" &&
        params.arguments !== null &&
        !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const outcome = await deps.callTool(name, args);
      // Tool-level failures are RESULTS with isError, not protocol errors —
      // the model is supposed to read them and adjust.
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(outcome.payload) }],
          structuredContent: outcome.payload,
          isError: outcome.isError,
        },
      };
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method "${msg.method}" is not supported.`);
  }
}
