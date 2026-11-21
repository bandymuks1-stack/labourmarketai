import { NextResponse } from "next/server";

import { requireSupabaseClientEnv } from "@/lib/env";
import { MCP_READ_RESOURCE_PATH, protectedResourceMetadata } from "@/lib/mcp/protected-resource-metadata";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";

export const runtime = "nodejs";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata, PATH-SUFFIXED location
 * for the read-only resource `https://<origin>/api/mcp/read`.
 *
 * Its own document because Claude requires `resource` to equal the URL a
 * person enters, path included. Same builder and the same authorization
 * server as `/api/mcp`: one identity, two resources.
 */
export async function GET(req: Request) {
  const { url } = requireSupabaseClientEnv();
  const origin = requestPublicOrigin(req);
  return NextResponse.json(protectedResourceMetadata(origin, url, MCP_READ_RESOURCE_PATH), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
