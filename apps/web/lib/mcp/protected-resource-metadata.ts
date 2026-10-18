/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata for THE ONE protected
 * resource this platform exposes to OAuth clients: the MCP door at
 * `/api/mcp`.
 *
 * WHY THE RESOURCE IS THE MCP URL AND NOT THE BARE ORIGIN (2026-10-17).
 * Until this module existed the document said `resource: <origin>`. ChatGPT
 * accepted that (proven 2026-08-30), but Claude's OAuth client is stricter and
 * says so in its connector documentation, fetched 2026-10-17:
 *
 *   "Make `resource` match your MCP server URL exactly: the document's
 *    `resource` field must equal the URL as the user enters it in Claude,
 *    including any path component."
 *
 * and, on discovery without a pointer:
 *
 *   "Claude can still infer the metadata location by probing your MCP
 *    server's origin: `/.well-known/oauth-protected-resource/<your-mcp-path>`
 *    first, then `/.well-known/oauth-protected-resource`."
 *
 * The MCP authorization specification (2026-07-28 revision) agrees: the
 * canonical URI the client sends as the RFC 8707 `resource` parameter is the
 * MCP server's own URI, which "aligns with the `resource` parameter in
 * RFC 9728", and a path component is valid "when the path component is
 * necessary to identify individual MCP server". A person enters
 * `https://labourmarket.ai/api/mcp`, so that is the resource.
 *
 * Both well-known locations serve the SAME document (RFC 9728 §3 puts the
 * metadata of a resource with a path under the path-suffixed location; the
 * root location is kept because the 401 challenge, ChatGPT's proven flow and
 * `llms.txt` all point there). One builder, two routes — the two can never
 * disagree.
 *
 * PUBLIC BY DESIGN: everything here is already public client configuration
 * (the Supabase project URL ships in every browser bundle). No key, no
 * secret, no user data. The authorization server is the platform's OWN
 * Supabase Auth — one user, one identity, many clients; no second credential
 * system.
 */

/** The path of the one protected resource. Pinned by the conformance guard. */
export const MCP_RESOURCE_PATH = "/api/mcp" as const;

/** RFC 9728 well-known paths at which the document is served. */
export const PROTECTED_RESOURCE_METADATA_PATHS = [
  "/.well-known/oauth-protected-resource",
  `/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`,
] as const;

export type ProtectedResourceMetadata = {
  readonly resource: string;
  readonly authorization_servers: readonly [string];
  readonly bearer_methods_supported: readonly ["header"];
  readonly resource_name: "LabourMarket.ai";
};

/**
 * @param origin        the deployment origin the request arrived at, e.g.
 *                      `https://labourmarket.ai` (no trailing slash)
 * @param supabaseUrl   `NEXT_PUBLIC_SUPABASE_URL`
 */
export function protectedResourceMetadata(
  origin: string,
  supabaseUrl: string,
): ProtectedResourceMetadata {
  return {
    resource: `${origin.replace(/\/$/, "")}${MCP_RESOURCE_PATH}`,
    // The AS identifier is the auth service path, not the bare project
    // origin: Supabase serves RFC 8414 discovery at
    // /.well-known/oauth-authorization-server/auth/v1, which clients derive
    // FROM this identifier (verified against the Supabase OAuth-server docs
    // 2026-08-29 — a bare origin would send them to a 404). Exactly ONE entry:
    // Claude "uses only the first entry in your metadata's
    // `authorization_servers` list and doesn't fall back to later entries".
    authorization_servers: [`${supabaseUrl.replace(/\/$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "LabourMarket.ai",
  };
}
