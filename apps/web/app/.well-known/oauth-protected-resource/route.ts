import { NextResponse } from "next/server";

import { requireSupabaseClientEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * How an OAuth-capable MCP client (ChatGPT's connector flow, verified
 * 2026-08-29) discovers WHO issues tokens for this API: it reads this
 * document, finds the authorization server, and runs OAuth 2.1 + PKCE
 * against it. The authorization server is the platform's OWN Supabase Auth
 * — the same identity every other client resolves to. One user, one
 * identity, multiple clients; no second credential system.
 *
 * PUBLIC BY DESIGN: everything here is already public client configuration
 * (the Supabase project URL ships in every browser bundle). No key, no
 * secret, no user data.
 *
 * NOTE (owner gate): the Supabase OAuth 2.1 authorization server is a
 * project-level feature the OWNER must enable in the Supabase dashboard
 * before this discovery chain works end-to-end. Until then this document is
 * accurate but the referenced server does not answer — an honest 404 at the
 * authorization step, not a fake login.
 */
export async function GET(req: Request) {
  const { url } = requireSupabaseClientEnv();
  const origin = new URL(req.url).origin;
  return NextResponse.json(
    {
      resource: origin,
      authorization_servers: [url],
      bearer_methods_supported: ["header"],
      resource_name: "LabourMarket.ai",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
