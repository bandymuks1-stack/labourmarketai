import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * EXTERNAL MCP CLIENT CONFORMANCE — the OAuth chain a real assistant runs,
 * scripted, against a real origin and its real authorization server.
 *
 * `prod-mcp-chain.spec.ts` proves the MCP SERVER with a bearer the walk
 * minted itself. This spec proves the half that only a CLIENT exercises and
 * that Claude's and ChatGPT's connector clients are strict about (their
 * documentation, read 2026-10-17; MCP authorization spec 2026-07-28):
 *
 *   1. discovery   — 401 + `WWW-Authenticate: Bearer resource_metadata=…`;
 *                    the RFC 9728 document (`resource` = the MCP URL entered,
 *                    path included; first `authorization_servers` entry);
 *                    the RFC 8414 document of that authorization server
 *                    (S256; `registration_endpoint`; CIMD flag; `iss` flag;
 *                    `token_endpoint_auth_methods_supported`);
 *   2. registration — Dynamic Client Registration as a PUBLIC native client
 *                    with a loopback redirect (what Claude Code does);
 *   3. authorization — PKCE S256 + RFC 8707 `resource`; the consent screen
 *                    approved by the SIGNED-IN synthetic person (a browser
 *                    context with their minted session — the one step that is
 *                    deliberately human-shaped);
 *   4. token        — form-urlencoded code exchange; RFC 9207 `iss` check when
 *                    advertised;
 *   5. use          — `initialize`, `tools/list` (count = the public GET),
 *                    one read, one draft → confirm → replay refused — as the
 *                    OAuth-issued bearer, never a minted one;
 *   6. refresh      — the refresh grant answers; whether the old refresh token
 *                    is rotated is RECORDED (Supabase has a reuse window);
 *   7. revoke       — Connected apps → disconnect → the next MCP call with the
 *                    still-unexpired access token is 401 `invalid_token`.
 *
 * Every endpoint latency is recorded against Claude's limits (10 s discovery /
 * registration / token, 30 s refresh). Nothing is uploaded but the Playwright
 * JSON the walk already keeps; no value of any token is written anywhere.
 *
 * WHERE IT RUNS
 *  - prod-qa-walk.yml, spec `mcp-oauth-client`: the walk sets E2E_BASE_URL to
 *    the public origin (PLAYWRIGHT_BASE_URL is honoured first when set), the
 *    signed-in context is the walk's minted `worker2` storage state (the
 *    review identity). Dispatch it only on a host that runs #2450: O-1 asserts
 *    the `/api/mcp` resource identity that PR introduces.
 *  - e2e:local (scripts/e2e-local.ts): E2E_BASE_URL is the local server, the
 *    signed-in context is tests/e2e/.storage-state.json from
 *    scripts/e2e-mint-session.ts, and the local Supabase must run the OAuth
 *    2.1 server (supabase/config.toml `[auth.oauth_server]`). Without
 *    `registration_endpoint` in the AS metadata the spec SKIPS by name.
 *
 * WHAT A RUN LEAVES BEHIND (stated, not hidden): (1) one journal entry for
 * the synthetic review identity, tagged QA-SYNTHETIC — the journal is
 * append-only and has no delete tool, the same class of write the
 * `journal-confirm` walk performs; (2) one dynamically registered OAuth
 * client row at the authorization server (every fresh Claude connection
 * creates one too — finding C-1); (3) one revoked grant. Nothing else.
 *
 * WHAT IT DOES NOT CLAIM: that ChatGPT or Claude work. Only their own client
 * connecting is that proof (programme document §H, walks W-1 / W-2).
 */

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "").replace(/\/$/, "");
const PROD = process.env.PROD_QA_WALK === "1";
const stateFile = PROD
  ? resolve(__dirname, ".storage-state.prod-qa.worker2.json")
  : resolve(__dirname, ".storage-state.json");
const ENABLED = ORIGIN !== "" && existsSync(stateFile);
test.skip(!ENABLED, "mcp-oauth-client: needs an origin (PLAYWRIGHT_BASE_URL / E2E_BASE_URL) and a minted signed-in storage state");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN} oauth-client`;
const MCP_URL = `${ORIGIN}/api/mcp`;
/** Loopback redirect like Claude Code's: exact-match registered, never served. */
const REDIRECT_URI = "http://127.0.0.1:4455/callback";
const CLIENT_NAME = `LabourMarket.ai conformance client ${RUN}`;

const LIMIT_MS = { discovery: 10_000, registration: 10_000, token: 10_000, refresh: 30_000 } as const;

type Json = Record<string, unknown>;
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: "latency", description: `${label}: ${ms} ms` });
  return { value, ms };
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers }, redirect: "manual" });
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function postForm(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

let rpcId = 0;
type ToolResult = { ok: boolean; code?: string; data?: Json; message?: string };
async function rpc(token: string | null, method: string, params: Json = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  let body: { result?: { structuredContent?: ToolResult; tools?: { name: string }[]; serverInfo?: Json; protocolVersion?: string }; error?: Json } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body, text };
}
const tool = async (token: string, name: string, args: Json = {}): Promise<ToolResult> => {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  return (r.body?.result?.structuredContent ?? { ok: false, code: `http_${r.status}`, message: r.text.slice(0, 200) }) as ToolResult;
};

/** JWT payload without verification — for RECORDING claims (aud, iss, client_id), never for trust. */
function claimsOf(jwt: string): Json {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as Json;
  } catch {
    return {};
  }
}

// Shared across the serial steps.
let prm: Json;
let asMeta: Json;
let discoveryError: string | null = null;
let hasDcr = false;
let clientId: string;
let accessToken: string;
let refreshToken: string | undefined;
let verifier: string;
let confirmedEntryId: string | undefined;
const note = (type: string, description: string) => test.info().annotations.push({ type, description });

/**
 * Discovery runs ONCE before the steps: O-1 asserts it, and every later step
 * skips BY NAME when the authorization server offers no dynamic registration
 * (a local Supabase started without `[auth.oauth_server]`), instead of failing
 * on an undefined endpoint. In serial mode a skipped test does not skip its
 * successors, so each step carries its own skip.
 */
test.beforeAll(async () => {
  try {
    const unauth = await rpc(null, "initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "conformance", version: "0" } });
    const challenge = unauth.headers.get("www-authenticate") ?? "";
    const pointer = /resource_metadata="([^"]+)"/.exec(challenge)?.[1] ?? `${ORIGIN}/.well-known/oauth-protected-resource`;
    const d = await getJson(pointer);
    prm = d.json ?? {};
    const servers = (prm.authorization_servers as string[] | undefined) ?? [];
    if (servers.length === 0) {
      discoveryError = `no authorization_servers in ${pointer} (HTTP ${d.status})`;
      return;
    }
    const issuer = servers[0].replace(/\/$/, "");
    const u = new URL(issuer);
    const m = await getJson(`${u.origin}/.well-known/oauth-authorization-server${u.pathname}`);
    asMeta = m.json ?? {};
    hasDcr = typeof asMeta.registration_endpoint === "string";
  } catch (e) {
    discoveryError = e instanceof Error ? e.message : String(e);
  }
});
const NO_DCR = "authorization server has no registration_endpoint (DCR off — local Supabase needs [auth.oauth_server] allow_dynamic_registration = true)";

test("O-1. discovery: 401 pointer → protected resource metadata → authorization server metadata", async () => {
  expect(discoveryError, "discovery reached the origin").toBeNull();
  const unauth = await rpc(null, "initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "conformance", version: "0" } });
  expect(unauth.status, "an unauthenticated call must be 401 (Claude starts sign-in only on a 401)").toBe(401);
  const challenge = unauth.headers.get("www-authenticate") ?? "";
  expect(challenge).toMatch(/^Bearer /);
  expect(challenge, "no `error` attribute before any credential was tried").not.toMatch(/error=/);
  const pointer = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  expect(pointer, `challenge carries resource_metadata: ${challenge}`).toBeTruthy();
  expect(new URL(pointer!).origin, "the pointer must be on the PUBLIC origin, not a bind host").toBe(ORIGIN);

  const d = await timed("prm", () => getJson(pointer!));
  expect(d.value.status).toBe(200);
  prm = d.value.json!;
  expect(prm.resource, "RFC 9728 `resource` must equal the MCP URL the person enters, path included (PR #2450)").toBe(MCP_URL);
  const servers = prm.authorization_servers as string[];
  expect(Array.isArray(servers) && servers.length === 1, "exactly one authorization server (Claude reads only the first)").toBe(true);
  expect(prm.bearer_methods_supported).toEqual(["header"]);

  // Path-suffixed location (RFC 9728 §3; Claude probes it first without a pointer).
  const suffixed = await getJson(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`);
  expect(suffixed.status, "path-suffixed PRM location is served (PR #2450)").toBe(200);
  expect(suffixed.json).toEqual(prm);

  // Authorization server metadata: Supabase serves RFC 8414 at
  // /.well-known/oauth-authorization-server/<issuer path>.
  const issuer = servers[0].replace(/\/$/, "");
  const u = new URL(issuer);
  const metaUrl = `${u.origin}/.well-known/oauth-authorization-server${u.pathname}`;
  const m = await timed("as-metadata", () => getJson(metaUrl));
  expect(m.value.status, `AS metadata at ${metaUrl}`).toBe(200);
  expect(m.ms).toBeLessThan(LIMIT_MS.discovery);
  asMeta = m.value.json!;
  hasDcr = typeof asMeta.registration_endpoint === "string";
  expect(String(asMeta.issuer).replace(/\/$/, ""), "issuer equals the advertised authorization server").toBe(issuer);
  expect(asMeta.code_challenge_methods_supported as string[], "S256 must be advertised").toContain("S256");
  for (const k of ["authorization_endpoint", "token_endpoint"]) expect(typeof asMeta[k], k).toBe("string");
  note("as-metadata", JSON.stringify({
    registration_endpoint: asMeta.registration_endpoint ?? null,
    client_id_metadata_document_supported: asMeta.client_id_metadata_document_supported ?? null,
    authorization_response_iss_parameter_supported: asMeta.authorization_response_iss_parameter_supported ?? null,
    token_endpoint_auth_methods_supported: asMeta.token_endpoint_auth_methods_supported ?? null,
    scopes_supported: asMeta.scopes_supported ?? null,
    grant_types_supported: asMeta.grant_types_supported ?? null,
    revocation_endpoint: asMeta.revocation_endpoint ?? null,
  }));
  note("dcr", hasDcr ? "registration_endpoint advertised" : NO_DCR);
});

test("O-2. dynamic client registration as a public native client with a loopback redirect", async () => {
  test.skip(!hasDcr, NO_DCR);
  const r = await timed("registration", async () => {
    const res = await fetch(String(asMeta.registration_endpoint), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [REDIRECT_URI],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "native",
      }),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as Json | null };
  });
  expect([200, 201], `DCR answered ${r.value.status}: ${JSON.stringify(r.value.json)}`).toContain(r.value.status);
  expect(r.ms).toBeLessThan(LIMIT_MS.registration);
  clientId = String(r.value.json?.client_id ?? "");
  expect(clientId).toBeTruthy();
  expect(r.value.json?.client_secret, "a public client receives no secret").toBeUndefined();
  expect(r.value.json?.redirect_uris).toEqual([REDIRECT_URI]);
});

test("O-3. authorization: PKCE S256 + resource; the signed-in person approves on the consent screen", async ({ browser }) => {
  test.skip(!hasDcr, NO_DCR);
  verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  const scope = Array.isArray(asMeta.scopes_supported) && (asMeta.scopes_supported as string[]).length > 0
    ? (asMeta.scopes_supported as string[]).filter((s) => s !== "offline_access").join(" ") + ((asMeta.scopes_supported as string[]).includes("offline_access") ? " offline_access" : "")
    : "openid email profile offline_access";
  const authorize = new URL(String(asMeta.authorization_endpoint));
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope,
    state,
    resource: MCP_URL,
  }).toString();

  const ctx = await browser.newContext({ storageState: stateFile, locale: "en-GB" });
  const page = await ctx.newPage();
  // The loopback callback is never served: answer it ourselves and read the URL.
  await page.route("http://127.0.0.1:4455/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "callback received" }));
  // LOCAL STACK ONLY: Supabase sends the consent redirect to its configured
  // `site_url` (config.toml: localhost:3000) while the e2e server listens on
  // E2E_PORT (3100). Re-home that one hop onto the origin under test; nothing
  // else is intercepted, and on a public origin this route never matches.
  const originHost = new URL(ORIGIN).host;
  await page.route(/\/oauth\/consent(\?|$)/, (route) => {
    const u = new URL(route.request().url());
    if (u.host === originHost) return route.continue();
    return route.fulfill({ status: 302, headers: { location: `${ORIGIN}${u.pathname}${u.search}` } });
  });

  await page.goto(authorize.toString(), { waitUntil: "domcontentloaded" });
  // The AS redirects to the product's consent page (authorization_url_path /oauth/consent → /{locale}/oauth/consent).
  await page.waitForURL(/\/oauth\/consent\?authorization_id=/, { timeout: 30_000 });
  // The consent screen names the client and its redirect host (spec: display the redirect URI's hostname).
  await expect(page.getByText(CLIENT_NAME, { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("127.0.0.1", { exact: false })).toBeVisible();
  // Approve — the only human-shaped step of the chain.
  await page.locator('form button[name="decision"][value="approve"]').click();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:4455\/callback\?/, { timeout: 30_000 });
  const cb = new URL(page.url());
  await ctx.close();

  expect(cb.searchParams.get("error"), `authorization error: ${cb.searchParams.get("error_description") ?? ""}`).toBeNull();
  expect(cb.searchParams.get("state")).toBe(state);
  const code = cb.searchParams.get("code");
  expect(code).toBeTruthy();
  // RFC 9207 — when advertised, `iss` MUST be present and equal the issuer.
  const iss = cb.searchParams.get("iss");
  note("rfc9207", `advertised=${String(asMeta.authorization_response_iss_parameter_supported ?? null)} iss_present=${iss !== null}`);
  if (asMeta.authorization_response_iss_parameter_supported === true) {
    expect(iss).toBeTruthy();
    expect(String(iss).replace(/\/$/, "")).toBe(String(asMeta.issuer).replace(/\/$/, ""));
  }

  const t = await timed("token", () =>
    postForm(String(asMeta.token_endpoint), {
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource: MCP_URL,
    }),
  );
  expect(t.value.status, `token endpoint: ${t.value.text.slice(0, 200)}`).toBe(200);
  expect(t.ms).toBeLessThan(LIMIT_MS.token);
  accessToken = String(t.value.json?.access_token ?? "");
  refreshToken = t.value.json?.refresh_token ? String(t.value.json.refresh_token) : undefined;
  expect(accessToken).toBeTruthy();
  expect(String(t.value.json?.token_type ?? "").toLowerCase()).toBe("bearer");
  const claims = claimsOf(accessToken);
  // C-3 (audience binding) is RECORDED, not asserted: the MCP server validates
  // the token with the authorization server; whether `aud`/`resource` carry the
  // MCP URL decides the follow-up in the programme document.
  note("token-claims", JSON.stringify({ aud: claims.aud ?? null, client_id: claims.client_id ?? null, iss: claims.iss ?? null, scope: t.value.json?.scope ?? null, expires_in: t.value.json?.expires_in ?? null, refresh_token_issued: Boolean(refreshToken) }));
});

test("O-4. use the OAuth-issued bearer: initialize, tools/list, a read, a draft → confirm → replay refused", async () => {
  test.skip(!hasDcr, NO_DCR);
  const init = await rpc(accessToken, "initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "conformance", version: "0" } });
  expect(init.status, init.text.slice(0, 200)).toBe(200);
  const version = String(init.body?.result?.serverInfo?.version ?? "");
  expect(version).toMatch(/^0\.1\.0\+t\d+\./);
  note("serverInfo.version", version);

  const list = await rpc(accessToken, "tools/list");
  expect(list.status).toBe(200);
  const names = (list.body?.result?.tools ?? []).map((t) => t.name);
  const pub = await getJson(MCP_URL);
  expect(pub.status).toBe(405);
  expect(names.length, "tools/list count equals the public toolCount").toBe(Number(pub.json?.toolCount));
  for (const n of ["profile_get", "journal_create_draft", "journal_confirm", "context_list"]) expect(names, n).toContain(n);

  const profile = await tool(accessToken, "profile_get");
  expect(profile.ok, JSON.stringify(profile).slice(0, 200)).toBe(true);

  // One canonical write, tagged, through the OAuth bearer: the SAME two calls
  // the phone's composer makes (apps/mobile/src/screens/journal-composer.tsx).
  // The draft's input is workerLogWorkSchema; the confirm repeats the exact
  // preview the server returned plus the token (the token is hash-bound to it).
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const draftInput: Json = {
    workDate: yesterday,
    siteName: `${TAG} site`,
    notes: `${TAG}: one hour of conformance work, dictated through an OAuth client; synthetic record.`,
  };
  let draft = await tool(accessToken, "journal_create_draft", draftInput);
  if (draft.ok && Array.isArray(draft.data?.options) && !draft.data?.preview) {
    // Real ambiguity between the person's work contexts: a client asks the
    // person; here the first labelled option stands in for that answer.
    const first = (draft.data.options as { engagementContextId?: string; id?: string }[])[0];
    const chosen = first?.engagementContextId ?? first?.id;
    expect(chosen, `context choice offered without an id: ${JSON.stringify(draft.data).slice(0, 300)}`).toBeTruthy();
    draft = await tool(accessToken, "journal_create_draft", { ...draftInput, engagementContextId: chosen });
  }
  expect(draft.ok, `draft: ${JSON.stringify(draft).slice(0, 300)}`).toBe(true);
  const preview = draft.data?.preview as { engagementContextId: string; notes: string; workDate: string; siteName: string | null } | undefined;
  const confirmationToken = String(draft.data?.confirmationToken ?? "");
  expect(preview, `draft returned a preview: ${JSON.stringify(draft.data).slice(0, 300)}`).toBeTruthy();
  expect(confirmationToken).toBeTruthy();
  const confirmInput: Json = {
    engagementContextId: preview!.engagementContextId,
    notes: preview!.notes,
    workDate: preview!.workDate,
    siteName: preview!.siteName ?? null,
    confirmationToken,
  };
  const confirm = await tool(accessToken, "journal_confirm", confirmInput);
  expect(confirm.ok, `confirm: ${JSON.stringify(confirm).slice(0, 300)}`).toBe(true);
  confirmedEntryId = typeof confirm.data?.entryId === "string" ? (confirm.data.entryId as string) : undefined;
  const replay = await tool(accessToken, "journal_confirm", confirmInput);
  expect(replay.ok, "a spent confirmation is refused").toBe(false);
});

test("O-5. refresh: the refresh grant answers; rotation of the old token is recorded", async () => {
  test.skip(!hasDcr, NO_DCR);
  test.skip(!refreshToken, "no refresh token was issued (offline_access not granted)");
  const r = await timed("refresh", () =>
    postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: refreshToken!, client_id: clientId }),
  );
  expect(r.value.status, r.value.text.slice(0, 200)).toBe(200);
  expect(r.ms).toBeLessThan(LIMIT_MS.refresh);
  const newAccess = String(r.value.json?.access_token ?? "");
  const newRefresh = r.value.json?.refresh_token ? String(r.value.json.refresh_token) : undefined;
  expect(newAccess).toBeTruthy();
  const again = await postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: refreshToken!, client_id: clientId });
  note("refresh-rotation", JSON.stringify({ new_refresh_token_issued: Boolean(newRefresh), old_refresh_token_reuse_status: again.status, old_refresh_token_reuse_error: again.json?.error ?? null }));
  if (again.status !== 200) expect(again.json?.error, "a dead refresh token must answer invalid_grant (Claude's rule)").toBe("invalid_grant");
  accessToken = newAccess;
  refreshToken = newRefresh ?? refreshToken;
  const ping = await rpc(accessToken, "ping");
  expect(ping.status).toBe(200);
});

test("O-6. revoke in Connected apps: the next call with the still-unexpired access token is 401 invalid_token", async ({ browser }) => {
  test.skip(!hasDcr, NO_DCR);
  const ctx = await browser.newContext({ storageState: stateFile, locale: "en-GB" });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/en/dashboard/account#connected-apps`, { waitUntil: "domcontentloaded" });
  const section = page.getByTestId("account-connected-apps");
  await expect(section).toBeVisible({ timeout: 30_000 });
  const row = section.getByTestId("connected-apps-list").locator("li", { hasText: CLIENT_NAME }).first();
  await expect(row, "the grant for this run's client is listed").toBeVisible({ timeout: 15_000 });
  await row.getByTestId("connected-app-disconnect").click();
  await page.getByTestId("connected-app-confirm-yes").click();
  await expect(page.getByTestId("connected-apps-revoked")).toBeVisible({ timeout: 30_000 });
  await ctx.close();

  const after = await rpc(accessToken, "ping");
  expect(after.status, `after revoke: ${after.text.slice(0, 200)}`).toBe(401);
  expect(after.headers.get("www-authenticate") ?? "").toMatch(/error="invalid_token"/);
  if (refreshToken) {
    const dead = await postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
    expect(dead.status, "a revoked grant's refresh token is refused").not.toBe(200);
  }
});

test.afterAll(async () => {
  // The journal is append-only and has no delete tool: the one tagged entry
  // stays, exactly as the `journal-confirm` walk's entries do (see the header,
  // "what a run leaves behind"). The artefact names it.
  test.info().annotations.push({
    type: "residue",
    description: [
      confirmedEntryId ? `journal entry ${confirmedEntryId} (QA-SYNTHETIC, ${TAG})` : "no journal entry written",
      clientId ? `DCR client ${clientId} (public client, no secret)` : "no client registered",
      "one revoked grant",
    ].join("; "),
  });
});
