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

/**
 * The version this server answers with when a client states none, or states
 * one we do not serve. It is deliberately NOT the newest: a client that says
 * nothing is an older client, and `2025-06-18` is the last revision whose
 * `initialize` handshake such a client expects.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/**
 * The current revision, published 2026-07-28. See `MCP_2026_CAPABILITIES`
 * below for exactly which of its requirements this server meets.
 */
export const MCP_PROTOCOL_VERSION_2026 = "2026-07-28";

/**
 * Versions this server can answer for, newest first. Echo the client's if we
 * support it.
 *
 * `2026-07-28` (SEP-2575) makes MCP statelessly request-scoped: the
 * `initialize` / `notifications/initialized` handshake is gone, the protocol
 * version travels on EVERY request, `Mcp-Session-Id` is removed, and
 * discovery moves to `server/discover`.
 *
 * THIS SERVER WAS ALREADY STATELESS — no sessions, no SSE, no subscriptions,
 * one JSON-RPC message per POST — so the revision is a naming and discovery
 * change here, not an architecture change. What it required us to ADD is
 * `server/discover`, per-request version acceptance, and cache directives on
 * list results. What it deprecates (roots, sampling, logging, HTTP+SSE) this
 * server never implemented.
 *
 * The older revisions stay listed for the spec's own 12-month deprecation
 * window (to ~2027-07). `initialize` therefore still answers — dropping it
 * would break every client that has not migrated, which is most of them.
 */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  "2026-07-28",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

const SUPPORTED_VERSIONS = new Set(SUPPORTED_PROTOCOL_VERSIONS);

/**
 * The `_meta` key carrying the per-request protocol version in 2026-07-28.
 * Over streamable HTTP the same value arrives as the `MCP-Protocol-Version`
 * header; the HTTP layer passes it in as `transportProtocolVersion` and the
 * `_meta` field wins when both are present and disagree, because `_meta` is
 * the protocol's own channel and the header is its transport encoding.
 */
export const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";

/** The `_meta` key carrying server identity in a `server/discover` result. */
export const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";

/**
 * What this server tells a 2026-era client it can do. Tools only — no
 * resources, no prompts, no completions. Declaring a capability we do not
 * serve would make the client offer a person something that then fails.
 */
const MCP_2026_CAPABILITIES = { tools: { listChanged: false } } as const;

/**
 * Cache directives for list-shaped results (2026-07-28).
 *
 * The tool list is derived from the capability registry, which is a static
 * module-level array — it cannot change without a deploy. `public` is
 * correct and load-bearing: the list contains no user data, no caller
 * identity and no authorization decision, only the capability descriptions
 * every authorized client is shown. A result that DID vary by caller would
 * have to say `private`, and none of these do.
 *
 * Five minutes, not a day: a deploy changes the list, and a client holding a
 * day-old list would offer tools this server no longer has.
 */
export const LIST_CACHE_TTL_MS = 300_000;
export const LIST_CACHE_SCOPE = "public";

/** MCP tool behavior hints (spec-optional, honesty-required here): clients
 *  use these to distinguish reads from writes without parsing prose. */
export type McpToolAnnotations = {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
};

export type McpToolDef = {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  /** JSON Schema (draft 2020-12) for the tool's arguments. */
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: McpToolAnnotations;
};

export type McpToolOutcome = {
  readonly isError: boolean;
  /** JSON-serializable payload shown to the model. */
  readonly payload: unknown;
  /**
   * Optional localized human presentation of a SUCCESSFUL payload. When
   * present it leads the text content so the client's model presents the
   * result as language, not JSON — the structured payload is still included
   * in full (both in the text and as `structuredContent`), never destroyed.
   */
  readonly humanText?: string;
};

export type McpServerDeps = {
  readonly serverInfo: { readonly name: string; readonly version: string };
  readonly instructions?: string;
  readonly tools: readonly McpToolDef[];
  readonly callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<McpToolOutcome>;
  /**
   * The `MCP-Protocol-Version` request header, when the transport carried
   * one (2026-07-28). `null`/absent for every older client. The transport
   * passes it through; this module decides what it means.
   */
  readonly transportProtocolVersion?: string | null;
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
/**
 * Read the per-request protocol version a 2026-era client states.
 *
 * Returns the version when the client named one we serve, `null` when it
 * named none, and the unsupported string itself when it named one we do not
 * — the caller needs those three apart to answer honestly rather than
 * silently pretending agreement.
 */
export function requestedProtocolVersion(
  params: Record<string, unknown>,
  transportProtocolVersion?: string | null,
): string | null {
  const meta =
    typeof params._meta === "object" && params._meta !== null && !Array.isArray(params._meta)
      ? (params._meta as Record<string, unknown>)
      : null;
  const fromMeta = meta && typeof meta[PROTOCOL_VERSION_META_KEY] === "string"
    ? (meta[PROTOCOL_VERSION_META_KEY] as string)
    : null;
  // `_meta` wins: the header is only its transport encoding.
  return fromMeta ?? (typeof transportProtocolVersion === "string" && transportProtocolVersion !== ""
    ? transportProtocolVersion
    : null);
}

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

  // 2026-07-28: the version travels on every request. A client that names a
  // version we do not serve is told so ONCE, plainly, instead of being
  // answered in a dialect it did not ask for — the spec's own failure mode
  // when a server silently downgrades.
  const stated = requestedProtocolVersion(params, deps.transportProtocolVersion);
  if (stated !== null && !SUPPORTED_VERSIONS.has(stated)) {
    return rpcError(
      id,
      INVALID_REQUEST,
      `Unsupported MCP protocol version "${stated}". This server serves ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`,
    );
  }

  switch (msg.method) {
    /**
     * 2026-07-28 (SEP-2575) — sessionless discovery. Answers before any
     * handshake and without minting anything, so a client learns what this
     * server offers in one exchange. Deliberately reports the SAME
     * capabilities and the SAME serverInfo as `initialize`: two discovery
     * routes that disagree is the duplicate-answer defect, not a feature.
     */
    case "server/discover":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          resultType: "complete",
          supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
          capabilities: MCP_2026_CAPABILITIES,
          ...(deps.instructions ? { instructions: deps.instructions } : {}),
          ttlMs: LIST_CACHE_TTL_MS,
          cacheScope: LIST_CACHE_SCOPE,
          _meta: { [SERVER_INFO_META_KEY]: deps.serverInfo },
        },
      };
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
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
          // 2026-07-28 cache directives. Additive: an older client ignores
          // unknown result fields, exactly as JSON has always worked.
          ttlMs: LIST_CACHE_TTL_MS,
          cacheScope: LIST_CACHE_SCOPE,
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
      const jsonText = JSON.stringify(outcome.payload);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              // Human summary FIRST (when the capability provides one), full
              // structured payload after — presentation is added, structure
              // is never removed.
              text: outcome.humanText ? `${outcome.humanText}\n\n${jsonText}` : jsonText,
            },
          ],
          structuredContent: outcome.payload,
          isError: outcome.isError,
        },
      };
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method "${msg.method}" is not supported.`);
  }
}
