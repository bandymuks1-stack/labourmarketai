import { NextResponse } from "next/server";

import { requireSupabaseClientEnv } from "@/lib/env";
import { protectedResourceMetadata } from "@/lib/mcp/protected-resource-metadata";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";

export const runtime = "nodejs";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata, root location.
 *
 * How an OAuth-capable MCP client (ChatGPT's connector flow, verified
 * 2026-08-29; Claude's, per its documentation read 2026-10-17) discovers WHO
 * issues tokens for this API: it reads this document, finds the authorization
 * server, and runs OAuth 2.1 + PKCE against it. The document itself —
 * including why `resource` is the MCP URL and not the bare origin — lives in
 * `lib/mcp/protected-resource-metadata.ts`; the path-suffixed sibling route
 * (`./api/mcp/route.ts`) serves the identical document.
 *
 * NOTE (owner gate): the Supabase OAuth 2.1 authorization server is a
 * project-level feature the OWNER must enable in the Supabase dashboard
 * before this discovery chain works end-to-end. Until then this document is
 * accurate but the referenced server does not answer — an honest 404 at the
 * authorization step, not a fake login.
 */
export async function GET(req: Request) {
  const { url } = requireSupabaseClientEnv();
  const origin = requestPublicOrigin(req);
  return NextResponse.json(protectedResourceMetadata(origin, url), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
