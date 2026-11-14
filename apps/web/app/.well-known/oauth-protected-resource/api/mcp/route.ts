import { NextResponse } from "next/server";

import { env, requireSupabaseClientEnv } from "@/lib/env";
import { protectedResourceMetadata } from "@/lib/mcp/protected-resource-metadata";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";

export const runtime = "nodejs";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata, PATH-SUFFIXED location
 * for the resource `https://<origin>/api/mcp`.
 *
 * RFC 9728 §3 places the metadata of a resource that has a path component at
 * `/.well-known/oauth-protected-resource/<path>`. Claude's client probes this
 * location FIRST when a 401 carries no `resource_metadata` pointer (its
 * connector documentation, read 2026-10-17), and the MCP authorization
 * specification's canonical-URI rule points here as well. The document is
 * byte-for-byte the one the root location serves — same builder — so the two
 * discovery paths can never disagree about who issues tokens.
 */
export async function GET(req: Request) {
  const { url } = requireSupabaseClientEnv();
  const origin = requestPublicOrigin(req);
  const advertiseScopes = env.MCP_PRM_ADVERTISE_SCOPES === "on";
  return NextResponse.json(protectedResourceMetadata(origin, url, { advertiseScopes }), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
