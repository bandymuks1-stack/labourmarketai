import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveApiIdentity } from "@/lib/api/api-identity";
import {
  classifyRefusal,
  refusalBody,
  serializeAuthEvent,
  wwwAuthenticateChallenge,
} from "@/lib/api/external-client-auth";
import {
  exposedCapabilities,
  runCapability,
} from "@/lib/capabilities/registry";
import {
  handleMcpMessage,
  parseErrorResponse,
  type McpToolDef,
} from "@/lib/mcp/protocol";
import { localeFromAcceptLanguage } from "@/lib/mcp/accept-language";
import { summarizeCapabilityResult } from "@/lib/capabilities/presentation";

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
 * REFUSALS ARE MACHINE-READABLE (2026-09-02 incident). A rejected token
 * answers `WWW-Authenticate: Bearer error="invalid_token" …` (RFC 6750's own
 * "refresh and retry" signal) and a JSON body naming the class and the
 * client's next action — so a client can tell RETRY AUTOMATICALLY from
 * RECONNECT REQUIRED instead of showing a generic wall. The vocabulary and
 * the no-oracle rule live in `lib/api/external-client-auth.ts`.
 *
 * EVERY auth and tool outcome is logged as one privacy-safe JSON line
 * (classes and names only — never a token, argument, payload or user id) so a
 * connector regression is countable in the platform logs before anyone finds
 * it by hand.
 *
 * The protocol layer is `lib/mcp/protocol.ts` (pure, tested); the product
 * lives in `lib/capabilities/` and does not know MCP exists.
 */

const DOOR = "/api/mcp";

function logEvent(event: Parameters<typeof serializeAuthEvent>[0]): void {
  try {
    console.info(serializeAuthEvent(event));
  } catch {
    // Observability is additive and must never break the request. A throw
    // here means a forbidden key reached the event — that is a code defect
    // the unit tests catch, not something to surface to the caller.
  }
}

/** MCP tool names allow [a-zA-Z0-9_-]; capability ids use dots. */
const toolName = (capabilityId: string): string => capabilityId.replace(/\./g, "_");

/**
 * The tool list is DERIVED FROM THE REGISTRY AND CONSTANT for the lifetime of
 * the process — `exposedCapabilities()` is a static array and every schema is
 * a module-level zod object. Converting all of them to JSON Schema on every
 * `tools/list` was pure repeated work on the hot path a client hits on each
 * new conversation. Computed once, lazily, so nothing is paid at import time
 * either (that would land on cold start, which the 2026-09-10 trace already
 * showed is this door's largest single cost).
 *
 * Memoizing a DERIVED VIEW is safe in a way memoizing a read never is: it
 * contains no user data, no caller identity and no authorization decision —
 * only the capability descriptions every authorized client is shown.
 */
let TOOL_DEFS: McpToolDef[] | null = null;

function toolDefs(): McpToolDef[] {
  if (TOOL_DEFS) return TOOL_DEFS;
  TOOL_DEFS = exposedCapabilities().map((c) => ({
    name: toolName(c.id),
    title: c.title,
    description: c.description,
    inputSchema: z.toJSONSchema(c.inputSchema) as Record<string, unknown>,
    // Honest behavior hints declared per capability in review — clients can
    // tell reads from writes without parsing prose.
    annotations: c.annotations,
  }));
  return TOOL_DEFS;
}

/** Capability lookup by MCP tool name, memoized for the same reason. */
let BY_TOOL_NAME: Map<string, string> | null = null;

function capabilityIdForTool(name: string): string | undefined {
  if (!BY_TOOL_NAME) {
    BY_TOOL_NAME = new Map(exposedCapabilities().map((c) => [toolName(c.id), c.id]));
  }
  return BY_TOOL_NAME.get(name);
}

/**
 * THE CANONICAL BRAND, DECLARED TO THE CLIENT.
 *
 * The mark is the owner's original vector — `docs/brand/source/LM_Color
 * Single.svg` — served at these paths as geometry-verbatim derivations
 * (`public/brand/lm-mark.svg`, `public/app-icon.svg`). Nothing here draws,
 * re-traces or substitutes a logo, and the ChatGPT-side fallback letter avatar
 * is not ours.
 *
 * `title`, `websiteUrl` and `icons` are the MCP spec's own identity fields.
 * They are additive: a client that predates them ignores them, exactly as
 * JSON has always worked, so declaring them cannot regress an older client.
 * Whether a given host actually renders a server-declared icon is the HOST's
 * decision — see docs/integrations/CHATGPT_MCP_CLIENT_V1.md for what remains
 * an owner action inside ChatGPT itself.
 */
function serverInfo(origin: string) {
  return {
    name: "labourmarket-ai",
    version: "0.1.0",
    title: "LabourMarket.ai",
    websiteUrl: origin,
    icons: [
      // The full metallic-gold mark, for anywhere with room to render it.
      { src: `${origin}/brand/lm-mark.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
      // The tile: same geometry, flat #D4AF37 on the ink plate, for small
      // sizes where a five-stop gradient resolves into mud.
      { src: `${origin}/app-icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ],
  };
}

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Server-Timing (RFC-standard header) for the three server-side phases a
 * client can otherwise only guess at: bearer verification against the auth
 * server, the capability (including its DB reads), and the presentation
 * summary. Durations only — no identity, no arguments. Any HTTP client can
 * read it, which is what makes "is it us or the assistant?" answerable.
 */
function serverTiming(marks: Record<string, number>): string {
  return Object.entries(marks)
    .map(([k, v]) => `${k};dur=${v.toFixed(1)}`)
    .join(", ");
}

export async function POST(req: Request) {
  const t0 = performance.now();
  const auth = await resolveApiIdentity(req);
  const authMs = performance.now() - t0;
  if (!auth.ok) {
    const refusal = classifyRefusal(auth.reason);
    const headers: Record<string, string> = { "Server-Timing": serverTiming({ auth: authMs }) };
    const challenge = wwwAuthenticateChallenge(new URL(req.url).origin, refusal.errorClass);
    if (challenge) headers["WWW-Authenticate"] = challenge;
    logEvent({
      event: "external_client.auth",
      outcome: "refused",
      error_class: refusal.errorClass,
      status: refusal.status,
      door: DOOR,
    });
    return NextResponse.json(refusalBody(refusal), { status: refusal.status, headers });
  }
  logEvent({
    event: "external_client.auth",
    outcome: "ok",
    transport: auth.identity.transport,
    door: DOOR,
  });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    // NAME the limit. A bare `{ ok: false }` here is how "your file was too
    // big for this door" reaches a user as "the import did not work" — the
    // §12 failure this product refuses to ship. The people-ingest tools can
    // carry a workforce list inline, so this is a boundary a real user meets,
    // and the answer has to say what to do instead.
    return NextResponse.json(
      {
        ok: false,
        code: "request_too_large",
        message:
          `This MCP endpoint accepts at most ${MAX_BODY_BYTES} bytes per request ` +
          "(roughly 48 KB of base64-encoded file). NOTHING was read or written. " +
          "Import a larger workforce list from the web people-import panel at " +
          "/dashboard/company#people-import.",
      },
      { status: 413 },
    );
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

  const marks: Record<string, number> = { auth: authMs };
  const response = await handleMcpMessage(message, {
    serverInfo: serverInfo(new URL(req.url).origin),
    instructions:
      "LabourMarket.ai capabilities for the signed-in user. Reads return " +
      "recorded facts under the user's own permissions. Nothing here writes " +
      "without an explicit draft→confirm step.",
    tools: toolDefs(),
    callTool: async (name, args) => {
      const capabilityId = capabilityIdForTool(name);
      // Unknown names are already refused by the protocol layer; this guard
      // is for the race where exposure changes between list and call.
      if (!capabilityId) {
        return { isError: true, payload: { ok: false, code: "unknown_capability" } };
      }
      const tCap = performance.now();
      const result = await runCapability(capabilityId, caller, args);
      marks.capability = performance.now() - tCap;
      logEvent({
        event: "external_client.tool",
        door: DOOR,
        tool: name,
        ok: result.ok,
        ...(result.ok
          ? {}
          : {
              code:
                typeof (result as { code?: unknown }).code === "string"
                  ? (result as { code: string }).code
                  : "error",
            }),
      });
      // Human presentation is ADDITIVE and may never break the call: a
      // summarizer failure just means the client gets the structured payload
      // alone, exactly as before.
      let humanText: string | undefined;
      if (result.ok) {
        const tPres = performance.now();
        try {
          humanText =
            (await summarizeCapabilityResult(
              capabilityId,
              result.data ?? {},
              caller.locale,
            )) ?? undefined;
        } catch {
          humanText = undefined;
        }
        marks.presentation = performance.now() - tPres;
      }
      return { isError: !result.ok, payload: result, humanText };
    },
  });

  marks.total = performance.now() - t0;
  const timing = { "Server-Timing": serverTiming(marks) };
  // A notification produces no body — 202 per streamable-HTTP MCP.
  if (response === null) return new Response(null, { status: 202, headers: timing });
  return NextResponse.json(response, { headers: timing });
}

/** No SSE stream: this server is deliberately stateless (single-response). */
export async function GET() {
  return NextResponse.json(
    { ok: false, message: "This MCP endpoint is POST-only (stateless streamable HTTP)." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
