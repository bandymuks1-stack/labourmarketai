/**
 * EXTERNAL-CLIENT CONTRACT CHECK — the release gate for the MCP door
 * (P0 brief §15), runnable by anyone against any environment.
 *
 *   CONNECT → AUTHENTICATE → PROFILE_GET → JOURNAL_CREATE_DRAFT
 *   → JOURNAL_CONFIRM → JOURNAL_READ_BACK → DUPLICATE_CONFIRM → PASS
 *
 * Usage:
 *   MCP_BEARER='<a real user access token>' \
 *   MCP_BASE_URL=https://labourmarket.ai \
 *   pnpm -F web exec tsx scripts/mcp-contract-check.ts
 *
 *   MCP_WRITE=0   → read-only: runs CONNECT/AUTH/PROFILE_GET/DRAFT, skips the
 *                   write, the read-back and the duplicate-confirm control.
 *
 * WHAT IT PROVES, AND WHAT IT CANNOT
 *
 *   - The resource-server half of the auth UX contract is asserted exactly:
 *     no credential → 401 + `WWW-Authenticate: Bearer resource_metadata=…`
 *     (CONNECT discovery); a rejected credential → 401 +
 *     `error="invalid_token"` + body `ACCESS_TOKEN_REJECTED /
 *     retry_after_refresh` (the refresh-then-retry hinge).
 *   - The domain contract is asserted end to end AS THE CALLER: profile read,
 *     draft (writes nothing), confirm (writes once), read-back (the entry is
 *     visible in the caller's own journal), duplicate confirm (the same token
 *     is rejected and the count does not move).
 *   - The AUTHORIZATION-SERVER half — access-token expiry → automatic refresh
 *     → retry, and revoked grant → RECONNECT_REQUIRED — lives in Supabase
 *     Auth's OAuth 2.1 server, behind a consent click that is a human's to
 *     make. This script does not fake it; the mapping a client applies to
 *     those answers is unit-tested in lib/api/external-client-auth.test.ts.
 *
 * SAFETY
 *   - The bearer is read from the environment and NEVER printed. Output shows
 *     classes, statuses and ids only.
 *   - The write is a real, append-only journal entry for the token's own
 *     user, clearly labelled as a contract check in its text. It is the same
 *     write a person would make — there is no test-only path.
 */

const BASE_URL = (process.env.MCP_BASE_URL ?? "https://labourmarket.ai").replace(/\/$/, "");
const BEARER = process.env.MCP_BEARER ?? "";
const WRITE = process.env.MCP_WRITE !== "0";
const DOOR = `${BASE_URL}/api/mcp`;

type Step = { name: string; ok: boolean; detail: string };
const steps: Step[] = [];
let rpcId = 0;

function record(name: string, ok: boolean, detail: string): void {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

async function post(body: unknown, auth?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "accept-language": "lt",
  };
  if (auth !== undefined) headers.authorization = auth;
  return fetch(DOOR, { method: "POST", headers, body: JSON.stringify(body) });
}

function rpc(method: string, params?: Record<string, unknown>) {
  rpcId += 1;
  return { jsonrpc: "2.0", id: rpcId, method, ...(params ? { params } : {}) };
}

type ToolResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  code?: string;
  [k: string]: unknown;
};

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const res = await post(rpc("tools/call", { name, arguments: args }), `Bearer ${BEARER}`);
  if (res.status !== 200) {
    return { ok: false, code: `http_${res.status}` };
  }
  const json = (await res.json()) as { result?: { structuredContent?: ToolResult } };
  return json.result?.structuredContent ?? { ok: false, code: "no_structured_content" };
}

async function main(): Promise<void> {
  console.log(`MCP contract check → ${DOOR}  (write=${WRITE ? "on" : "off"})`);

  // ---- CONNECT: discovery without any credential ---------------------------
  {
    const res = await post(rpc("initialize", { protocolVersion: "2025-06-18" }));
    const www = res.headers.get("www-authenticate") ?? "";
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    record(
      "CONNECT (no credential → 401 + resource_metadata, class CREDENTIALS_MISSING)",
      res.status === 401 &&
        www.includes("resource_metadata=") &&
        !www.includes("error=") &&
        body.error === "CREDENTIALS_MISSING" &&
        body.client_action === "authenticate",
      `status=${res.status} www=${www ? "present" : "absent"} class=${String(body.error)}`,
    );
  }

  // ---- AUTHENTICATE (negative): a rejected credential must say "refresh then retry"
  {
    const bogus = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb250cmFjdC1jaGVjayJ9.bm90LWEtcmVhbC1zaWduYXR1cmU";
    const res = await post(rpc("initialize", { protocolVersion: "2025-06-18" }), bogus);
    const www = res.headers.get("www-authenticate") ?? "";
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    record(
      "AUTHENTICATE negative (rejected token → 401 + error=\"invalid_token\", class ACCESS_TOKEN_REJECTED)",
      res.status === 401 &&
        www.includes('error="invalid_token"') &&
        body.error === "ACCESS_TOKEN_REJECTED" &&
        body.client_action === "retry_after_refresh",
      `status=${res.status} class=${String(body.error)} action=${String(body.client_action)}`,
    );
  }

  // ---- AS_TOKEN_ERROR_SHAPE (non-fatal): can a standards-only client classify a dead grant?
  //
  // 2026-09-02: the owner's reconnect in ChatGPT ran discovery and then a
  // refresh_token grant at Supabase Auth's /oauth/token, which answered 400
  // with the LEGACY body {"error_code":"refresh_token_not_found","msg":…} —
  // no RFC 6749 §5.2 `error` member. A conforming client cannot read that as
  // `invalid_grant`, so it never restarts authorization and shows a generic
  // wall instead. The authorization_code path on the same endpoint IS
  // RFC-shaped. This step follows the real discovery chain
  // (protected-resource → RFC 8414 → token_endpoint) and reports the shape.
  // WARN, not FAIL: the endpoint is Supabase-managed, so a red gate here
  // would be permanently red for something no PR in this repo can change —
  // but the day it turns green is the day this class of failure heals.
  {
    let detail = "skipped";
    try {
      const prm = (await (await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`)).json()) as {
        authorization_servers?: string[];
      };
      const as = (prm.authorization_servers ?? [])[0] ?? "";
      const asUrl = new URL(as);
      const meta = (await (
        await fetch(`${asUrl.origin}/.well-known/oauth-authorization-server${asUrl.pathname}`)
      ).json()) as { token_endpoint?: string };
      const tokenEndpoint = meta.token_endpoint ?? "";
      const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: "contract-check-not-a-token" });
      if (process.env.MCP_OAUTH_CLIENT_ID) form.set("client_id", process.env.MCP_OAUTH_CLIENT_ID);
      const res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const rfcShaped = typeof body.error === "string" && body.error.length > 0;
      detail = `token_endpoint=${tokenEndpoint ? "discovered" : "missing"} status=${res.status} rfc_error_member=${rfcShaped ? "present" : "ABSENT"}${
        typeof body.error_code === "string" ? ` legacy_error_code=${body.error_code}` : ""
      }`;
      console.log(`${rfcShaped ? "PASS" : "WARN"}  AS_TOKEN_ERROR_SHAPE (dead refresh grant → RFC 6749 error member)  ${detail}`);
    } catch (e) {
      console.log(`WARN  AS_TOKEN_ERROR_SHAPE  could not follow discovery: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  if (!BEARER) {
    record("AUTHENTICATE", false, "MCP_BEARER is not set — authenticated steps cannot run");
    finish();
    return;
  }

  // ---- AUTHENTICATE (positive) + tool discovery ----------------------------
  {
    const res = await post(rpc("initialize", { protocolVersion: "2025-06-18" }), `Bearer ${BEARER}`);
    record("AUTHENTICATE (valid token → 200 initialize)", res.status === 200, `status=${res.status}`);
    if (res.status !== 200) {
      finish();
      return;
    }
    const list = await post(rpc("tools/list"), `Bearer ${BEARER}`);
    const json = (await list.json()) as { result?: { tools?: { name: string }[] } };
    const names = new Set((json.result?.tools ?? []).map((t) => t.name));
    const required = ["profile_get", "journal_create_draft", "journal_confirm", "journal_list"];
    const missing = required.filter((n) => !names.has(n));
    record("TOOLS (required tools discovered)", missing.length === 0, missing.length ? `missing=${missing.join(",")}` : `${names.size} tools`);
  }

  // ---- PROFILE_GET ----------------------------------------------------------
  {
    const r = await callTool("profile_get", {});
    record("PROFILE_GET", r.ok === true, r.ok ? "ok" : `code=${String(r.code)}`);
  }

  // ---- JOURNAL_CREATE_DRAFT (writes nothing) --------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const draftArgs: Record<string, unknown> = {
    workDate: today,
    notes: `Contract check ${stamp} — external-client gate (safe to keep, append-only)`,
    siteName: null,
  };
  const draft = await callTool("journal_create_draft", draftArgs);
  const data = draft.data ?? {};
  const token = typeof data.confirmationToken === "string" ? data.confirmationToken : "";
  const choice = data.status === "engagement_choice_required";
  record(
    "JOURNAL_CREATE_DRAFT (preview + one-time token, nothing written)",
    draft.ok === true && (token.length > 10 || choice),
    draft.ok ? (choice ? "engagement_choice_required (caller must pick a context by name)" : "token minted") : `code=${String(draft.code)}`,
  );
  if (choice) {
    record("JOURNAL_CONFIRM", false, "skipped — the caller holds several contexts; pass engagementContextId to continue");
    finish();
    return;
  }
  if (!WRITE) {
    record("JOURNAL_CONFIRM / READ_BACK / DUPLICATE_CONFIRM", true, "skipped by MCP_WRITE=0");
    finish();
    return;
  }

  // ---- count before, CONFIRM, count after ------------------------------------
  const preview = (data.preview ?? {}) as Record<string, unknown>;
  const confirmArgs: Record<string, unknown> = {
    workDate: preview.workDate ?? draftArgs.workDate,
    notes: preview.notes ?? draftArgs.notes,
    siteName: preview.siteName ?? null,
    engagementContextId: preview.engagementContextId,
    confirmationToken: token,
  };
  const before = await callTool("journal_list", { limit: 50 });
  const beforeIds = new Set(entryIds(before));

  const confirm = await callTool("journal_confirm", confirmArgs);
  const entryId = typeof confirm.data?.entryId === "string" ? confirm.data.entryId : "";
  record("JOURNAL_CONFIRM (canonical append-only write, receipt returned)", confirm.ok === true && entryId.length > 0, confirm.ok ? `entryId=${entryId}` : `code=${String(confirm.code)}`);

  // ---- READ_BACK -------------------------------------------------------------
  const after = await callTool("journal_list", { limit: 50 });
  const afterIds = new Set(entryIds(after));
  record(
    "JOURNAL_READ_BACK (the receipt id is visible in the caller's own journal)",
    entryId.length > 0 && afterIds.has(entryId) && !beforeIds.has(entryId),
    `visible=${afterIds.has(entryId)} new=${!beforeIds.has(entryId)}`,
  );

  // ---- DUPLICATE_CONFIRM: same token again must NOT write twice -------------
  const dup = await callTool("journal_confirm", confirmArgs);
  const again = await callTool("journal_list", { limit: 50 });
  const againIds = entryIds(again);
  const duplicates = againIds.filter((id) => id === entryId).length;
  record(
    "DUPLICATE_CONFIRM (same token rejected; exactly one logical entry)",
    dup.ok === false && duplicates === 1 && againIds.length === afterIds.size,
    `second_confirm=${dup.ok ? "ACCEPTED (defect)" : String(dup.code)} copies=${duplicates} count_delta=${againIds.length - afterIds.size}`,
  );

  finish();
}

function entryIds(list: ToolResult): string[] {
  const rows = (list.data?.entries ?? list.data?.items ?? []) as { id?: unknown }[];
  return rows.map((r) => (typeof r.id === "string" ? r.id : "")).filter(Boolean);
}

function finish(): void {
  const failed = steps.filter((s) => !s.ok);
  console.log("");
  console.log(failed.length === 0 ? "MCP_CONTRACT: PASS" : `MCP_CONTRACT: FAIL (${failed.length} step(s))`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  // Never print the error object wholesale — a fetch error can echo headers.
  console.error("MCP_CONTRACT: ERROR", e instanceof Error ? e.message : "unknown");
  process.exit(2);
});
