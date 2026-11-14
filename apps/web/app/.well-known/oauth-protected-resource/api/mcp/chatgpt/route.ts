import { NextResponse } from "next/server";

import { requireSupabaseClientEnv } from "@/lib/env";
import { CHATGPT_PROFILE_PATH } from "@/lib/mcp/chatgpt-profile";
import { protectedResourceMetadata } from "@/lib/mcp/protected-resource-metadata";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";

export const runtime = "nodejs";

/**
 * RFC 9728 metadata for the curated ChatGPT door, `/api/mcp/chatgpt`, at the
 * path-suffixed location RFC 9728 §3 assigns it. Same builder and the same
 * authorization server as `/api/mcp`; only `resource` differs — it is the URL
 * the person enters, as the MCP authorization specification requires.
 */
export async function GET(req: Request) {
  const { url } = requireSupabaseClientEnv();
  const origin = requestPublicOrigin(req);
  return NextResponse.json(protectedResourceMetadata(origin, url, CHATGPT_PROFILE_PATH), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
