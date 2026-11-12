import { NextResponse } from "next/server";

import { anonymousApiClient, resolveApiIdentity } from "@/lib/api/api-identity";
import { runAsBearerCaller } from "@/lib/api/bearer-caller-scope";
import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";
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
import { recordExternalReceipt } from "@/lib/capabilities/external-receipt";
import {
  handleMcpMessage,
  parseErrorResponse,
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type McpResource,
  type McpSecurityScheme,
  type McpToolDef,
} from "@/lib/mcp/protocol";
import { localeFromAcceptLanguage } from "@/lib/mcp/accept-language";
import { requestPublicOrigin } from "@/lib/mcp/public-origin";
import { toolDefsOf, toolName, toolsetVersionOf } from "@/lib/mcp/toolset";
import { summarizeCapabilityResult } from "@/lib/capabilities/presentation";

/**
 * MCP DOOR — the ChatGPT (and any MCP client) adapter over the canonical
 * capability registry.
 *
 * ONE IMPLEMENTATION, SEVERAL ADDRESSES. `/api/mcp` publishes every exposed
 * capability; `/api/mcp/chatgpt` publishes the curated ChatGPT profile
 * (`lib/mcp/chatgpt-profile.ts`). Both are this factory: same identity, same
 * brake, same receipts, same draft→confirm. A door differs ONLY in which
 * tools it lists and accepts, its instructions, and the metadata document its
 * 401 points at.
 *
 * SHARED AUTHENTICATED API: identity comes from the ONE resolver
 * (`resolveApiIdentity`) exactly as on every other shared route — a Supabase
 * user JWT over `Authorization: Bearer` (what an OAuth-authorized ChatGPT
 * presents) or a browser cookie session. There is no MCP-specific identity,
 * no service-role proxy, and no anonymous mode on `/api/mcp`: every tool call
 * there runs on the caller's own RLS-scoped client. A door MAY name a few
 * public tools (`anonymousTools`) that a caller with NO credential at all
 * can run on the anonymous client — see `anonymousPost` below.
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

export type McpDoorConfig = {
  /** The path this door is served at, e.g. `/api/mcp`. Logged per event. */
  readonly door: string;
  /** Narrows the full tool list. Absent = every exposed capability. */
  readonly selectTools?: (all: readonly McpToolDef[]) => McpToolDef[];
  readonly instructions: string;
  /** Path of the RFC 9728 document the 401 points at (default: the root one). */
  readonly metadataPath?: string;
  /**
   * Tools this door also runs for a caller who sent NO credential, on the
   * anonymous client (database role `anon`). Absent = every call needs a
   * credential (the full door). When present, every listed tool states its
   * auth requirement (`securitySchemes`, OpenAI Apps SDK), and any other
   * tool called anonymously answers with `mcp/www_authenticate` instead of
   * running. A present-but-bad token is NEVER treated as anonymous.
   */
  readonly anonymousTools?: readonly string[];
  /**
   * Static resources this door serves (`resources/list`, `resources/read`),
   * built for the request's public origin — the curated door's widget.
   * Absent = no resources capability (the full door).
   */
  readonly resources?: (origin: string) => readonly McpResource[] | Promise<readonly McpResource[]>;
  /** Extra tool `_meta` by tool name (e.g. the widget's output template). */
  readonly toolMeta?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};

const PUBLIC_SCHEMES: readonly McpSecurityScheme[] = [{ type: "noauth" }, { type: "oauth2" }];
const SIGNED_IN_SCHEMES: readonly McpSecurityScheme[] = [{ type: "oauth2" }];

/** The instructions of the full door, `/api/mcp`. */
export const FULL_DOOR_INSTRUCTIONS =
  "LabourMarket.ai capabilities for the signed-in user. Reads return " +
  "recorded facts under the user's own permissions. Consequential writes " +
  "need an explicit draft→confirm step. The exceptions are single-step " +
  "and named: the evidence-import staging steps (evidence_import_create_session, " +
  "evidence_import_submit_rows, evidence_import_stage_file, evidence_import_resolve_row, " +
  "evidence_import_resolve_label, evidence_import_resolve_time_semantics) " +
  "write only staging rows that become records solely through the " +
  "confirmed evidence_import_commit; context_switch changes which " +
  "organization the session acts for; evidence_person_create adds one " +
  "unlinked roster person. Tools named after a web chat action " +
  "(worker_*, company_*, agency_*, engagement_*) run that SAME web action: " +
  "one without a _prepare/_confirm suffix is a reversible write the web " +
  "chat also runs in one step; a _prepare tool writes nothing and returns " +
  "a one-time token that its _confirm tool needs; call each _confirm once. " +
  "The remaining single-step tools are reversible changes the web also " +
  "makes in one click (creating a DRAFT offering, listing, proposal or " +
  "contract, editing one's own record, notification read/preferences, a " +
  "booking deadline, a task); like the web they may notify the person the " +
  "change concerns; " +
  "publishing, deciding, sending, deleting and legal data always go " +
  "through _draft/_confirm. Everything acts in the " +
  "caller's active workspace (context_list, context_switch).";

function logEvent(event: Parameters<typeof serializeAuthEvent>[0]): void {
  try {
    console.info(serializeAuthEvent(event));
  } catch {
    // Observability is additive and must never break the request. A throw
    // here means a forbidden key reached the event — that is a code defect
    // the unit tests catch, not something to surface to the caller.
  }
}

const MAX_BODY_BYTES = 64 * 1024;

/** Per verified person, across every tool: 600 calls / 5 min (2 per second
 *  sustained) — far above a person-driven assistant, low enough to stop a
 *  runaway loop. See the brake in POST. ONE limiter for every door, so a
 *  second address never doubles a person's budget. */
const MCP_CALLER_LIMIT = { limit: 600, windowMs: 5 * 60 * 1000 } as const;
const MCP_CALLER_LIMITER = "api-mcp-caller" as const;

/**
 * ANONYMOUS BRAKE: a caller with no credential has no user id to key on, so
 * it is keyed on the forwarded client key (a brake, not an identity — the
 * same honest limit as `api-bearer-verify`) and is tighter than a person's.
 */
const MCP_ANONYMOUS_LIMIT = { limit: 120, windowMs: 5 * 60 * 1000 } as const;
const MCP_ANONYMOUS_LIMITER = "api-mcp-anonymous" as const;

/**
 * CORS for browser-resident MCP clients (the Inspector, a web-hosted agent).
 *
 * `*` WITHOUT `Access-Control-Allow-Credentials`. That pairing is the whole
 * security argument and it is not an oversight: with a wildcard origin and no
 * credentials flag, a browser REFUSES to attach cookies, so the cookie-session
 * branch of `resolveApiIdentity` is unreachable cross-origin and no CSRF is
 * introduced. A cross-origin caller can only present a bearer token, which is
 * exactly what an MCP client has. Adding `Allow-Credentials: true` here would
 * turn this door into a CSRF hole against every signed-in browser session.
 *
 * `WWW-Authenticate` is EXPOSED because it carries the RFC 9728 pointer a
 * client needs to start OAuth; unexposed, a browser client sees a bare 401
 * and cannot discover where to authenticate.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Accept-Language",
  "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version, Server-Timing",
  "Access-Control-Max-Age": "86400",
};

/**
 * The protocol version this response is spoken in, echoed per 2026-07-28.
 *
 * A client that stated a version we serve gets its own back; one that stated
 * nothing gets the default. `handleMcpMessage` has already REFUSED anything
 * we do not serve, so this never echoes a version we cannot honour.
 */
function negotiatedVersion(req: Request): string {
  const stated = req.headers.get("mcp-protocol-version");
  return stated && SUPPORTED_PROTOCOL_VERSIONS.includes(stated) ? stated : MCP_PROTOCOL_VERSION;
}

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
function serverInfo(origin: string, version: string) {
  return {
    name: "labourmarket-ai",
    version,
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

export function createMcpDoor(config: McpDoorConfig) {
  const DOOR = config.door;
  const ANONYMOUS = config.anonymousTools ? new Set(config.anonymousTools) : null;

  /**
   * The tool list is DERIVED FROM THE REGISTRY AND CONSTANT for the lifetime
   * of the process — `exposedCapabilities()` is a static array and every
   * schema is a module-level zod object. Converting all of them to JSON
   * Schema on every `tools/list` was pure repeated work on the hot path a
   * client hits on each new conversation. Computed once, lazily, so nothing
   * is paid at import time either (that would land on cold start, which the
   * 2026-09-10 trace already showed is this door's largest single cost).
   *
   * Memoizing a DERIVED VIEW is safe in a way memoizing a read never is: it
   * contains no user data, no caller identity and no authorization decision
   * — only the capability descriptions every authorized client is shown.
   */
  let TOOL_DEFS: McpToolDef[] | null = null;

  function toolDefs(): McpToolDef[] {
    if (TOOL_DEFS) return TOOL_DEFS;
    const all = toolDefsOf(exposedCapabilities());
    const picked = config.selectTools ? config.selectTools(all) : all;
    const extra = config.toolMeta;
    const selected = extra
      ? picked.map((d) => (extra[d.name] ? { ...d, _meta: { ...d._meta, ...extra[d.name] } } : d))
      : picked;
    TOOL_DEFS = ANONYMOUS
      ? selected.map((d) => {
          const schemes = ANONYMOUS.has(d.name) ? PUBLIC_SCHEMES : SIGNED_IN_SCHEMES;
          // Top level is the Apps SDK field; `_meta` mirrors it for hosts
          // that read tool metadata only from there.
          return { ...d, securitySchemes: schemes, _meta: { ...d._meta, securitySchemes: schemes } };
        })
      : selected;
    return TOOL_DEFS;
  }

  /**
   * Capability lookup by MCP tool name, memoized for the same reason. Built
   * from THIS door's list, so a narrower door cannot run a tool it does not
   * publish even if a client names one.
   */
  let BY_TOOL_NAME: Map<string, string> | null = null;

  function capabilityIdForTool(name: string): string | undefined {
    if (!BY_TOOL_NAME) {
      const listed = new Set(toolDefs().map((d) => d.name));
      BY_TOOL_NAME = new Map(
        exposedCapabilities()
          .filter((c) => listed.has(toolName(c.id)))
          .map((c) => [toolName(c.id), c.id]),
      );
    }
    return BY_TOOL_NAME.get(name);
  }

  /** The published toolset as a version (`lib/mcp/toolset.ts`), memoized. */
  let TOOLSET_VERSION: string | null = null;

  function toolsetVersion(): string {
    if (!TOOLSET_VERSION) TOOLSET_VERSION = toolsetVersionOf(toolDefs());
    return TOOLSET_VERSION;
  }

  async function POST(req: Request) {
    const t0 = performance.now();
    const auth = await resolveApiIdentity(req);
    const authMs = performance.now() - t0;
    // ONLY a request with no credential at all may be anonymous; a bad token
    // is a 401 below exactly as on the full door.
    if (!auth.ok && auth.reason === "no-credentials" && ANONYMOUS) {
      return anonymousPost(req, t0, authMs);
    }
    if (!auth.ok) {
      const refusal = classifyRefusal(auth.reason);
      const headers: Record<string, string> = {
        ...CORS_HEADERS,
        "MCP-Protocol-Version": negotiatedVersion(req),
        "Server-Timing": serverTiming({ auth: authMs }),
      };
      const challenge = wwwAuthenticateChallenge(
        requestPublicOrigin(req),
        refusal.errorClass,
        config.metadataPath,
      );
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

    // CSRF HARDENING for the cookie transport. A browser can send a
    // cross-site "simple" POST (text/plain) WITH cookies and no preflight;
    // only SameSite would stop it. MCP clients always send JSON, and a
    // cross-origin JSON POST needs a preflight this door never answers with
    // Allow-Credentials — so a cookie-identified call must be JSON. Bearer
    // callers are unaffected.
    if (
      auth.identity.transport === "cookie" &&
      !(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")
    ) {
      return NextResponse.json(
        { ok: false, code: "unsupported_media_type", message: "This MCP endpoint accepts application/json only." },
        { status: 415, headers: { ...CORS_HEADERS } },
      );
    }

    // PER-PERSON BRAKE. The failure limiter in api-identity only counts
    // REJECTED tokens; a VALID token had no ceiling at all on this door, so
    // one runaway assistant loop could drive unbounded tool calls (and their
    // database work) as one person. Keyed on the verified user id — never on
    // a header the caller controls. In-memory and per-instance
    // (lib/security/rate-limit.ts states that limit honestly): a brake on a
    // loop, not a quota.
    const brake = rateLimit({ name: MCP_CALLER_LIMITER, key: auth.identity.userId, ...MCP_CALLER_LIMIT });
    if (brake.limited) {
      logEvent({
        event: "external_client.auth",
        outcome: "refused",
        error_class: "RATE_LIMITED",
        status: 429,
        door: DOOR,
      });
      // The SAME wire contract as the resolver's own rate-limited refusal
      // (client_action "back_off", no WWW-Authenticate: the credential is
      // fine), plus Retry-After so a client knows when.
      const refusal = classifyRefusal("rate-limited");
      return NextResponse.json(refusalBody(refusal), {
        status: refusal.status,
        headers: {
          ...CORS_HEADERS,
          "MCP-Protocol-Version": negotiatedVersion(req),
          "Retry-After": String(brake.retryAfterSeconds),
        },
      });
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      // NAME the limit. A bare `{ ok: false }` here is how "your file was too
      // big for this door" reaches a user as "the import did not work" — the
      // §12 failure this product refuses to ship. The people-ingest tools can
      // carry a workforce list inline, so this is a boundary a real user
      // meets, and the answer has to say what to do instead.
      return NextResponse.json(
        {
          ok: false,
          code: "request_too_large",
          message:
            `This MCP endpoint accepts at most ${MAX_BODY_BYTES} bytes per request ` +
            "(roughly 48 KB of base64-encoded file). NOTHING was read or written. " +
            "Import a larger workforce list from the web people-import panel at " +
            "/dashboard/company/people#people-import.",
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
      // fetch sends literally `*`, which the live write proof measured
      // reaching the DB as a "locale" and tripping the original_language
      // constraint. Only an ACTIVE locale is accepted; everything else is
      // the default.
      locale: localeFromAcceptLanguage(req.headers.get("accept-language")),
      // Everything arriving here is an authorized assistant acting for the
      // person, never the person's own click — recorded as such wherever the
      // store keeps a performer (evidence import audit today).
      actorKind: "agent" as const,
    };

    const marks: Record<string, number> = { auth: authMs };
    const response = await handleMcpMessage(message, {
      // 2026-07-28 carries the protocol version per request. `Mcp-Session-Id`
      // is deliberately NOT read: the revision removed protocol-level
      // sessions, and a server on it must ignore the header an older client
      // may still send rather than mint or echo one. This door has never been
      // stateful, so there is nothing to stop doing — only something never
      // to start.
      transportProtocolVersion: req.headers.get("mcp-protocol-version"),
      serverInfo: serverInfo(requestPublicOrigin(req), toolsetVersion()),
      instructions: config.instructions,
      resources: await config.resources?.(requestPublicOrigin(req)),
      tools: toolDefs(),
      callTool: async (name, args) => {
        const capabilityId = capabilityIdForTool(name);
        // Unknown names are already refused by the protocol layer; this
        // guard is for the race where exposure changes between list and
        // call, and for a narrower door named a tool it does not publish.
        if (!capabilityId) {
          return { isError: true, payload: { ok: false, code: "unknown_capability" } };
        }
        const tCap = performance.now();
        // BEARER CALLER SCOPE: inside it the web's own domain entrypoints
        // (`createClient()`) resolve to THIS verified caller's RLS client, so
        // a capability that runs a canonical server action acts as the same
        // person, never as nobody and never as anyone else. A cookie caller
        // runs unchanged. See lib/api/bearer-caller-scope.ts.
        const result = await runAsBearerCaller(auth.identity, () =>
          runCapability(capabilityId, caller, args),
        );
        marks.capability = performance.now() - tCap;
        // AUDIT RECEIPT for every write through this door (confirm/execute):
        // who, which capability, which object, which confirmation, outcome.
        // Never undoes nor fails the write; the client is told its state.
        const descriptor = exposedCapabilities().find((c) => c.id === capabilityId);
        const receipt = descriptor
          ? await recordExternalReceipt(caller, descriptor, args, result)
          : ({ state: "not_applicable" } as const);
        logEvent({
          event: "external_client.tool",
          door: DOOR,
          tool: name,
          ok: result.ok,
          ...(result.ok
            ? {}
            : {
                result_code:
                  typeof (result as { code?: unknown }).code === "string"
                    ? (result as { code: string }).code
                    : "error",
              }),
        });
        // Human presentation is ADDITIVE and may never break the call: a
        // summarizer failure just means the client gets the structured
        // payload alone, exactly as before.
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
        return {
          isError: !result.ok,
          payload: receipt.state === "not_applicable" ? result : { ...result, receipt },
          humanText,
        };
      },
    });

    marks.total = performance.now() - t0;
    const headers = {
      ...CORS_HEADERS,
      "MCP-Protocol-Version": negotiatedVersion(req),
      "Server-Timing": serverTiming(marks),
    };
    // A notification produces no body — 202 per streamable-HTTP MCP.
    if (response === null) return new Response(null, { status: 202, headers });
    return NextResponse.json(response, { headers });
  }

  /**
   * A caller that presented NO credential, on a door with `anonymousTools`.
   * It may discover the door (initialize, tools/list) and run ONLY the
   * anonymous tools, on the anonymous client; any other tool answers with
   * the RFC 9728 challenge in `_meta["mcp/www_authenticate"]` so the host can
   * link the account — nothing runs. No receipt (nothing is written), no
   * bearer scope (there is no identity to enter).
   */
  async function anonymousPost(req: Request, t0: number, authMs: number): Promise<Response> {
    const headers = {
      ...CORS_HEADERS,
      "MCP-Protocol-Version": negotiatedVersion(req),
    };
    if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { ok: false, code: "unsupported_media_type", message: "This MCP endpoint accepts application/json only." },
        { status: 415, headers },
      );
    }
    const brake = rateLimit({
      name: MCP_ANONYMOUS_LIMITER,
      key: clientKeyFromHeaders(req.headers),
      ...MCP_ANONYMOUS_LIMIT,
    });
    if (brake.limited) {
      logEvent({ event: "external_client.auth", outcome: "refused", error_class: "RATE_LIMITED", status: 429, door: DOOR });
      const refusal = classifyRefusal("rate-limited");
      return NextResponse.json(refusalBody(refusal), {
        status: refusal.status,
        headers: { ...headers, "Retry-After": String(brake.retryAfterSeconds) },
      });
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, code: "request_too_large" }, { status: 413, headers });
    }
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return NextResponse.json(parseErrorResponse(), { status: 400, headers });
    }

    const origin = requestPublicOrigin(req);
    const challenge = wwwAuthenticateChallenge(
      origin,
      classifyRefusal("no-credentials").errorClass,
      config.metadataPath,
    );
    const marks: Record<string, number> = { auth: authMs };
    const response = await handleMcpMessage(message, {
      transportProtocolVersion: req.headers.get("mcp-protocol-version"),
      serverInfo: serverInfo(origin, toolsetVersion()),
      instructions: config.instructions,
      resources: await config.resources?.(requestPublicOrigin(req)),
      tools: toolDefs(),
      callTool: async (name, args) => {
        const capabilityId = capabilityIdForTool(name);
        if (!capabilityId) {
          return { isError: true, payload: { ok: false, code: "unknown_capability" } };
        }
        if (!ANONYMOUS?.has(name)) {
          logEvent({ event: "external_client.tool", door: DOOR, tool: name, ok: false, result_code: "sign_in_required" });
          return {
            isError: true,
            payload: {
              ok: false,
              code: "sign_in_required",
              message:
                "This tool acts for a signed-in LabourMarket.ai account. Connect the account, then try again. Nothing was run.",
            },
            ...(challenge ? { meta: { "mcp/www_authenticate": [challenge] } } : {}),
          };
        }
        const tCap = performance.now();
        const caller = {
          // No person is calling. The anonymous tools read only `supabase`
          // and `locale` (lib/capabilities/public-jobs-capabilities.ts); an
          // empty id matches no row if anything ever reads it.
          userId: "",
          transport: "bearer" as const,
          supabase: await anonymousApiClient(),
          locale: localeFromAcceptLanguage(req.headers.get("accept-language")),
          actorKind: "agent" as const,
        };
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
                result_code:
                  typeof (result as { code?: unknown }).code === "string"
                    ? (result as { code: string }).code
                    : "error",
              }),
        });
        return { isError: !result.ok, payload: result };
      },
    });
    marks.total = performance.now() - t0;
    const out = { ...headers, "Server-Timing": serverTiming(marks) };
    if (response === null) return new Response(null, { status: 202, headers: out });
    return NextResponse.json(response, { headers: out });
  }

  /**
   * CORS preflight. A browser-resident MCP client cannot POST here at all
   * without it — the request never leaves the browser, so the door looks
   * dead rather than protected.
   */
  async function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  /** No SSE stream: this server is deliberately stateless (single-response). */
  async function GET() {
    return NextResponse.json(
      {
        ok: false,
        message: "This MCP endpoint is POST-only (stateless streamable HTTP).",
        // The published toolset as a version — the same value `initialize`
        // reports as serverInfo.version. Public on purpose: it derives only
        // from the static tool descriptions every authorized client is shown,
        // so a release can be verified without a credential.
        toolsetVersion: toolsetVersion(),
        toolCount: toolDefs().length,
      },
      { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } },
    );
  }

  return { POST, OPTIONS, GET, toolDefs };
}
