import { NextResponse } from "next/server";
import { z } from "zod";

import { refusalStatus, resolveApiIdentity } from "@/lib/api/api-identity";
import {
  exposedCapabilities,
  runCapability,
} from "@/lib/capabilities/registry";
import {
  handleMcpMessage,
  parseErrorResponse,
  type McpToolDef,
} from "@/lib/mcp/protocol";
import { activeLocales, defaultLocale } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP DOOR — the ChatGPT (and any MCP client) adapter over the canonical
 * capability registry.
 *
 * SHARED AUTHENTICATED API: identity comes from the ONE resolver
 * (`resolveApiIdentity`) exactly as on every other shared route — a Supabase
 * user JWT over `Authorization: Bearer` (what an OAuth-authorized ChatGPT
 * presents) or a browser cookie session. There is no MCP-specific identity,
 * no service-role proxy, and no anonymous mode: every tool call below runs
 * on the caller's own RLS-scoped client.
 *
 * A 401 carries the RFC 9728 pointer (`WWW-Authenticate: … resource_metadata`)
 * so an OAuth-capable client can discover the authorization server — see
 * `app/.well-known/oauth-protected-resource/route.ts`.
 *
 * The protocol layer is `lib/mcp/protocol.ts` (pure, tested); the product
 * lives in `lib/capabilities/` and does not know MCP exists.
 */

/** MCP tool names allow [a-zA-Z0-9_-]; capability ids use dots. */
const toolName = (capabilityId: string): string => capabilityId.replace(/\./g, "_");

function toolDefs(): McpToolDef[] {
  return exposedCapabilities().map((c) => ({
    name: toolName(c.id),
    title: c.title,
    description: c.description,
    inputSchema: z.toJSONSchema(c.inputSchema) as Record<string, unknown>,
  }));
}

const MAX_BODY_BYTES = 64 * 1024;

/** First ACTIVE locale named by the header, else the default. Handles
 *  quality-tagged lists ("lt-LT;q=0.9,en;q=0.8") and refuses wildcards. */
function localeFromAcceptLanguage(header: string | null): string {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if ((activeLocales as readonly string[]).includes(base)) return base;
  }
  return defaultLocale;
}

export async function POST(req: Request) {
  const auth = await resolveApiIdentity(req);
  if (!auth.ok) {
    const status = refusalStatus(auth.reason);
    const headers: Record<string, string> = {};
    if (status === 401) {
      const origin = new URL(req.url).origin;
      headers["WWW-Authenticate"] =
        `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
    }
    return NextResponse.json({ ok: false }, { status, headers });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return NextResponse.json(parseErrorResponse(), { status: 400 });
  }

  const caller = {
    userId: auth.identity.userId,
    transport: auth.identity.transport,
    supabase: auth.identity.supabase,
    // Accept-Language is untrusted client data with wildcards — Node's own
    // fetch sends literally `*`, which the live write proof measured reaching
    // the DB as a "locale" and tripping the original_language constraint.
    // Only an ACTIVE locale is accepted; everything else is the default.
    locale: localeFromAcceptLanguage(req.headers.get("accept-language")),
  };

  const response = await handleMcpMessage(message, {
    serverInfo: { name: "labourmarket-ai", version: "0.1.0" },
    instructions:
      "LabourMarket.ai capabilities for the signed-in user. Reads return " +
      "recorded facts under the user's own permissions. Nothing here writes " +
      "without an explicit draft→confirm step.",
    tools: toolDefs(),
    callTool: async (name, args) => {
      const capability = exposedCapabilities().find((c) => toolName(c.id) === name);
      // Unknown names are already refused by the protocol layer; this guard
      // is for the race where exposure changes between list and call.
      if (!capability) {
        return { isError: true, payload: { ok: false, code: "unknown_capability" } };
      }
      const result = await runCapability(capability.id, caller, args);
      return { isError: !result.ok, payload: result };
    },
  });

  // A notification produces no body — 202 per streamable-HTTP MCP.
  if (response === null) return new Response(null, { status: 202 });
  return NextResponse.json(response);
}

/** No SSE stream: this server is deliberately stateless (single-response). */
export async function GET() {
  return NextResponse.json(
    { ok: false, message: "This MCP endpoint is POST-only (stateless streamable HTTP)." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
