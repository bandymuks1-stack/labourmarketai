import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

/**
 * MCP OAUTH, ISOLATED — real OAuth tokens against a THROWAWAY LOCAL stack only.
 *
 * Owner decision 2026-10-26 (security task B5a): real OAuth tokens are tested
 * in a free GitHub Actions job on an isolated local Supabase stack. No paid
 * service, no production key, no production database, no user data, no
 * production API call. Synthetic person, test OAuth clients, test tokens.
 *
 * Runs ONLY from `.github/workflows/oauth-isolated.yml` (or by hand against a
 * local `supabase start`): it is opt-in (`OAUTH_ISOLATED=1`) and otherwise
 * skips by name, so `pnpm e2e` and every other workflow never pick it up.
 *
 * Built on the conformance walk of #2454 (`mcp-oauth-client.spec.ts`: DCR →
 * PKCE → consent → token → use → refresh → revoke) with three differences:
 *
 *  1. FAIL-CLOSED TARGET. Before the first request the origin must be
 *     loopback http, the authorization server named by the app's own RFC 9728
 *     document must be the LOCAL Supabase origin (127.0.0.1/localhost:54321),
 *     and every endpoint in its RFC 8414 document must be on that origin. A
 *     production default (lib/env.ts falls back to the cloud project URL) is
 *     therefore a refusal, never a run. All Node-side requests go through
 *     `safeFetch`, which refuses any other origin; every browser context
 *     aborts any non-loopback request and records the hostname.
 *  2. NEGATIVE CHECKS the security plan needs (N-1 … N-6, below).
 *  3. OUTPUT = VERDICT LINES ONLY. Each check prints one
 *     `VERDICT <id> <PASS|FAIL|REPORT|SKIP> <detail>` line and is written to
 *     a numbers-and-verdicts JSON (`OAUTH_ISOLATED_RESULT`); with
 *     OAUTH_ISOLATED_LOG_DETAIL=0 the public log shows id + verdict only. No token, code,
 *     verifier or confirmation token is ever printed or written: every detail
 *     passes `scrub()`, which removes JWT-shaped strings and every secret value
 *     this run has seen. No trace, no video, no screenshot.
 *
 * Verdict meaning: PASS/FAIL are asserted; REPORT is recorded for the owner and
 * never fails the run (e.g. the #2806 door check on a ref without #2806); SKIP
 * names why a check could not run. The final test fails if any FAIL exists.
 */

// ── Opt-in and target ───────────────────────────────────────────────────────
const ENABLED = process.env.OAUTH_ISOLATED === "1";
test.skip(!ENABLED, "mcp-oauth-isolated: opt-in only (OAUTH_ISOLATED=1, set by oauth-isolated.yml against a local Supabase stack)");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
// Traces and videos would hold token-endpoint bodies and session cookies.
test.use({ trace: "off", video: "off", screenshot: "off" });

const ORIGIN = (process.env.E2E_BASE_URL ?? "").replace(/\/$/, "");
const LOCAL_AS_ORIGINS = ["http://127.0.0.1:54321", "http://localhost:54321"] as const;
const isLoopbackHost = (hostname: string) => hostname === "127.0.0.1" || hostname === "localhost";
const PRODUCTION_HOSTS = [/(^|\.)supabase\.co$/i, /(^|\.)supabase\.com$/i, /(^|\.)labourmarket\.ai$/i, /\.vercel\.app$/i];
const stateFile = resolve(__dirname, ".storage-state.json");
const RESULT_FILE = process.env.OAUTH_ISOLATED_RESULT ?? resolve(__dirname, "..", "..", "test-results", "oauth-isolated-result.json");
const API_IDENTITY_SOURCE = resolve(__dirname, "..", "..", "lib", "api", "api-identity.ts");

const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN} oauth-isolated`;
const MCP_URL = `${ORIGIN}/api/mcp`;
const REDIRECT_URI = "http://127.0.0.1:4455/callback";
const CLIENT_A = `LMAI isolated client A ${RUN}`;
const CLIENT_B = `LMAI isolated client B ${RUN}`;
const UNKNOWN_SCOPE = "lm.admin.all";
const LIMIT_MS = { discovery: 10_000, registration: 10_000, token: 10_000, refresh: 30_000 } as const;

type Json = Record<string, unknown>;
type Verdict = "PASS" | "FAIL" | "REPORT" | "SKIP";

// ── Verdicts, scrubbing, result file ────────────────────────────────────────
const results: { id: string; verdict: Verdict; detail: string }[] = [];
const latencyMs: Record<string, number> = {};
const blockedHosts = new Set<string>();
const seenSecrets = new Set<string>();
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const SECRET_PARAM = /\b(code|code_verifier|access_token|refresh_token|id_token|client_secret|confirmationToken)(["']?\s*[:=]\s*["']?)([^&\s"',}]+)/gi;

function secret(value: string | undefined | null): void {
  if (value && value.length >= 6) seenSecrets.add(value);
}
function scrub(text: string): string {
  let out = text.replace(JWT_LIKE, "[jwt]").replace(SECRET_PARAM, "$1$2[redacted]");
  for (const s of seenSecrets) out = out.split(s).join("[secret]");
  return out.replace(/\s+/g, " ").slice(0, 300);
}
/**
 * The repository is PUBLIC, and so are its Actions logs. With
 * OAUTH_ISOLATED_LOG_DETAIL=0 (the workflow's setting) the log carries only
 * `VERDICT <id> <verdict>`; the detail goes to the result file alone.
 */
const LOG_DETAIL = process.env.OAUTH_ISOLATED_LOG_DETAIL !== "0";
function verdict(id: string, v: Verdict, detail: string): void {
  const d = scrub(detail);
  results.push({ id, verdict: v, detail: d });
  console.log(LOG_DETAIL ? `VERDICT ${id} ${v} ${d}` : `VERDICT ${id} ${v}`);
}
/** PASS/FAIL by condition. Returns the condition so a step can stop the chain. */
function check(id: string, ok: boolean, detail: string): boolean {
  verdict(id, ok ? "PASS" : "FAIL", detail);
  return ok;
}
/** Stop the serial chain WITHOUT printing any value (the verdict line says why). */
function mustHold(ok: boolean, id: string): void {
  expect(ok, `${id} failed — see its VERDICT line`).toBe(true);
}
function writeResult(): void {
  const counts = { PASS: 0, FAIL: 0, REPORT: 0, SKIP: 0 } as Record<Verdict, number>;
  for (const r of results) counts[r.verdict] += 1;
  const body = {
    schema: "oauth-isolated-result/v1",
    run: RUN,
    sha: process.env.GITHUB_SHA ?? null,
    finished_at: new Date().toISOString(),
    target: { origin_is_loopback: ORIGIN !== "" && isLoopbackHost(new URL(ORIGIN).hostname), authorization_server_is_local: asIsLocal },
    door_2806_present: door2806Present(),
    counts,
    latency_ms: latencyMs,
    blocked_external_hosts: [...blockedHosts].sort(),
    verdicts: results,
  };
  const text = JSON.stringify(body, null, 2);
  // Last line of defence: refuse to write anything token-shaped.
  if (/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\./.test(text) || [...seenSecrets].some((s) => text.includes(s))) {
    throw new Error("refusing to write the result file: it would contain a token-shaped value");
  }
  mkdirSync(dirname(RESULT_FILE), { recursive: true });
  writeFileSync(RESULT_FILE, text);
}

// ── Network: only the local app and the local authorization server ─────────
function allowedOrigin(url: string): boolean {
  const o = new URL(url).origin;
  return o === ORIGIN || (LOCAL_AS_ORIGINS as readonly string[]).includes(o);
}
async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!allowedOrigin(url)) throw new Error(`REFUSED_NON_LOCAL_TARGET: ${new URL(url).origin} is neither the local app nor the local authorization server`);
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), ...init });
}
async function readBody(res: Response): Promise<{ json: Json | null; text: string }> {
  const text = await res.text();
  try {
    return { json: JSON.parse(text) as Json, text };
  } catch {
    return { json: null, text };
  }
}
async function getJson(url: string) {
  const res = await safeFetch(url, { headers: { accept: "application/json" } });
  return { status: res.status, headers: res.headers, ...(await readBody(res)) };
}
async function postForm(url: string, form: Record<string, string>) {
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const body = await readBody(res);
  // Every token any response carries is registered for scrubbing before anything can print it.
  for (const k of ["access_token", "refresh_token", "id_token"]) secret(body.json?.[k] as string | undefined);
  return { status: res.status, ...body };
}
/** The only parts of an OAuth error body a verdict may show. */
function oauthErrorOf(json: Json | null): string {
  return json && (json.error || json.error_description) ? `error=${String(json.error ?? "")}` : "no error field";
}

let rpcId = 0;
type ToolResult = { ok: boolean; code?: string; data?: Json; message?: string };
async function rpc(token: string | null, method: string, params: Json = {}) {
  const res = await safeFetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const { json, text } = await readBody(res);
  return { status: res.status, headers: res.headers, body: json as { result?: { structuredContent?: ToolResult; tools?: { name: string }[]; serverInfo?: Json } } | null, text };
}
async function tool(token: string, name: string, args: Json = {}): Promise<ToolResult> {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  return (r.body?.result?.structuredContent ?? { ok: false, code: `http_${r.status}` }) as ToolResult;
}
async function apiGet(path: string, token: string) {
  const res = await safeFetch(`${ORIGIN}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  await res.text();
  return res.status;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function jwtPart(jwt: string, i: 0 | 1): Json {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[i] ?? "", "base64url").toString("utf8")) as Json;
  } catch {
    return {};
  }
}

function door2806Present(): boolean {
  try {
    return readFileSync(API_IDENTITY_SOURCE, "utf8").includes("resolveFirstPartyIdentity");
  } catch {
    return false;
  }
}

/** The synthetic person's OWN first-party access token (no client_id), from the minted local session. */
function firstPartyToken(): string | null {
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8")) as { cookies: { name: string; value: string }[] };
    const parts = state.cookies
      .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
    const raw = parts.map((c) => c.value).join("").replace(/^base64-/, "");
    const session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { access_token?: string };
    secret(session.access_token);
    return session.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Browser: guarded contexts and one authorization round ──────────────────
async function guardedContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: stateFile, locale: "en-GB" });
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (isLoopbackHost(u.hostname)) return route.fallback();
    blockedHosts.add(u.hostname);
    return route.abort("blockedbyclient");
  });
  return ctx;
}

type AuthorizeOutcome = { code: string | null; error: string | null; consentShown: boolean; issPresent: boolean; issOk: boolean | null; landed: string };

async function authorizeInBrowser(browser: Browser, clientId: string, scope: string, challenge: string): Promise<AuthorizeOutcome> {
  const state = b64url(randomBytes(16));
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

  const ctx = await guardedContext(browser);
  const page = await ctx.newPage();
  await page.route("http://127.0.0.1:4455/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "callback received" }));
  // Local Site URL is http://localhost:3000 (supabase/config.toml [auth]); the app
  // listens on 127.0.0.1. Only a loopback→loopback consent hop is re-homed.
  const originHost = new URL(ORIGIN).host;
  await page.route(/\/oauth\/consent(\?|$)/, (route) => {
    const u = new URL(route.request().url());
    if (u.host === originHost) return route.continue();
    if (isLoopbackHost(u.hostname)) return route.fulfill({ status: 302, headers: { location: `${ORIGIN}${u.pathname}${u.search}` } });
    return route.abort("blockedbyclient");
  });

  let consentShown = false;
  try {
    await page.goto(authorize.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForURL(/(\/oauth\/consent\?authorization_id=|^http:\/\/127\.0\.0\.1:4455\/callback\?)/, { timeout: 30_000 }).catch(() => undefined);
    if (/\/oauth\/consent\?authorization_id=/.test(page.url())) {
      consentShown = true;
      await expect(page.locator("dl dd").filter({ hasText: REDIRECT_URI })).toHaveCount(1, { timeout: 15_000 });
      await page.locator('form button[name="decision"][value="approve"]').click();
      await page.waitForURL(/^http:\/\/127\.0\.0\.1:4455\/callback\?/, { timeout: 30_000 }).catch(() => undefined);
    }
    const url = new URL(page.url());
    const landed = `${url.origin}${url.pathname}`;
    if (!landed.startsWith("http://127.0.0.1:4455/callback")) return { code: null, error: `no callback (landed ${landed})`, consentShown, issPresent: false, issOk: null, landed };
    const code = url.searchParams.get("code");
    secret(code);
    const iss = url.searchParams.get("iss");
    return {
      code: url.searchParams.get("state") === state ? code : null,
      error: url.searchParams.get("error") ?? (url.searchParams.get("state") === state ? null : "state mismatch"),
      consentShown,
      issPresent: iss !== null,
      issOk: iss === null ? null : iss.replace(/\/$/, "") === String(asMeta.issuer).replace(/\/$/, ""),
      landed,
    };
  } finally {
    await ctx.close();
  }
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  secret(verifier);
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

async function exchange(code: string, clientId: string, verifier: string) {
  const t0 = Date.now();
  const r = await postForm(String(asMeta.token_endpoint), {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
    resource: MCP_URL,
  });
  const ms = Date.now() - t0;
  secret(r.json?.access_token as string | undefined);
  secret(r.json?.refresh_token as string | undefined);
  return { ...r, ms };
}

// ── Shared state across the serial steps ────────────────────────────────────
let asIsLocal = false;
let asMeta: Json = {};
let baseScope = "openid email profile";
let clientA = "";
let clientB = "";
let accessToken = "";
let refreshToken: string | undefined;
const extraClientATokens: string[] = [];

test.beforeAll(() => {
  if (!ENABLED) return;
  // Hard refusals — these FAIL the run instead of skipping it.
  if (process.env.PROD_QA_WALK === "1") throw new Error("REFUSED: mcp-oauth-isolated never runs inside the production walk");
  if (!ORIGIN) throw new Error("REFUSED: E2E_BASE_URL is not set (expected the local app, e.g. http://127.0.0.1:3000)");
  const o = new URL(ORIGIN);
  if (o.protocol !== "http:" || !isLoopbackHost(o.hostname)) throw new Error(`REFUSED_NON_LOCAL_TARGET: ${o.origin} is not a loopback http origin`);
  if (process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.replace(/\/$/, "") !== ORIGIN) throw new Error("REFUSED: PLAYWRIGHT_BASE_URL differs from E2E_BASE_URL");
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (sb && !(LOCAL_AS_ORIGINS as readonly string[]).includes(new URL(sb).origin)) throw new Error("REFUSED_NON_LOCAL_TARGET: NEXT_PUBLIC_SUPABASE_URL is not the local stack");
  if (!existsSync(stateFile)) throw new Error("REFUSED: no local storage state (run scripts/e2e-mint-session.ts against the local stack first)");
});

test.afterAll(() => {
  if (ENABLED) writeResult();
});

// ── I-1 discovery + target proof ────────────────────────────────────────────
test("I-1. discovery: 401 pointer → RFC 9728 → RFC 8414, and every endpoint is the LOCAL stack", async () => {
  const t0 = Date.now();
  const unauth = await rpc(null, "initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "isolated", version: "0" } });
  latencyMs.challenge = Date.now() - t0;
  const challenge = unauth.headers.get("www-authenticate") ?? "";
  check("I-1.challenge", unauth.status === 401 && /^Bearer /.test(challenge) && !/error=/.test(challenge), `unauthenticated initialize → ${unauth.status}, Bearer challenge without error attribute`);
  const pointer = /resource_metadata="([^"]+)"/.exec(challenge)?.[1] ?? "";
  mustHold(check("I-1.pointer-local", pointer !== "" && new URL(pointer).origin === ORIGIN, `resource_metadata pointer origin ${pointer ? new URL(pointer).origin : "(none)"} (must be ${ORIGIN})`), "I-1.pointer-local");

  const prm = await getJson(pointer);
  const servers = (prm.json?.authorization_servers as string[] | undefined) ?? [];
  check("I-1.prm", prm.status === 200 && prm.json?.resource === MCP_URL && servers.length === 1, `PRM ${prm.status}, resource = MCP URL, ${servers.length} authorization server(s)`);
  const issuer = (servers[0] ?? "").replace(/\/$/, "");
  asIsLocal = issuer !== "" && (LOCAL_AS_ORIGINS as readonly string[]).includes(new URL(issuer).origin);
  // THE GATE: an app built or started with the production default would name the cloud project here.
  mustHold(check("I-1.issuer-local", asIsLocal, `authorization server origin ${issuer ? new URL(issuer).origin : "(none)"} (must be ${LOCAL_AS_ORIGINS.join(" or ")})`), "I-1.issuer-local");

  const u = new URL(issuer);
  const candidates = [`${u.origin}/.well-known/oauth-authorization-server${u.pathname}`, `${u.origin}/.well-known/oauth-authorization-server`, `${issuer}/.well-known/openid-configuration`];
  let found: Json | null = null;
  for (const c of candidates) {
    const t1 = Date.now();
    const r = await getJson(c).catch(() => null);
    if (r && r.status === 200 && r.json && typeof r.json.issuer === "string") {
      latencyMs.as_metadata = Date.now() - t1;
      found = r.json;
      break;
    }
  }
  mustHold(check("I-1.as-metadata", found !== null, "RFC 8414 / OIDC metadata found on the local issuer"), "I-1.as-metadata");
  asMeta = found!;
  const endpoints = ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"].filter((k) => typeof asMeta[k] === "string");
  const offOrigin = endpoints.filter((k) => !allowedOrigin(String(asMeta[k])));
  mustHold(check("I-1.endpoints-local", offOrigin.length === 0 && typeof asMeta.registration_endpoint === "string", `endpoints on the local stack: ${endpoints.join(",")}; off-origin: ${offOrigin.join(",") || "none"}; DCR advertised: ${typeof asMeta.registration_endpoint === "string"}`), "I-1.endpoints-local");
  check("I-1.s256", ((asMeta.code_challenge_methods_supported as string[] | undefined) ?? []).includes("S256"), "S256 advertised");
  const scopes = (asMeta.scopes_supported as string[] | undefined) ?? [];
  if (scopes.length > 0) baseScope = scopes.filter((s) => s !== "offline_access").join(" ") + (scopes.includes("offline_access") ? " offline_access" : "");
  verdict("I-1.as-shape", "REPORT", JSON.stringify({
    scopes_supported: scopes,
    revocation_endpoint: typeof asMeta.revocation_endpoint === "string",
    iss_parameter: asMeta.authorization_response_iss_parameter_supported ?? null,
    token_auth_methods: asMeta.token_endpoint_auth_methods_supported ?? null,
    cimd: asMeta.client_id_metadata_document_supported ?? null,
  }));
});

// ── I-2 registration (two self-registered clients) ──────────────────────────
async function register(name: string, redirect: string) {
  const t0 = Date.now();
  const res = await safeFetch(String(asMeta.registration_endpoint), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_name: name, redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", application_type: "native" }),
  });
  const { json } = await readBody(res);
  secret(json?.client_secret as string | undefined);
  return { status: res.status, json, ms: Date.now() - t0 };
}

test("I-2. DCR: two public native clients; N-1c non-loopback http redirect", async () => {
  const a = await register(CLIENT_A, REDIRECT_URI);
  latencyMs.registration = a.ms;
  clientA = String(a.json?.client_id ?? "");
  mustHold(check("I-2.client-a", [200, 201].includes(a.status) && clientA !== "" && !(a.json && "client_secret" in a.json), `client A ${a.status}, public (no secret issued), ${a.ms} ms`), "I-2.client-a");
  const b = await register(CLIENT_B, REDIRECT_URI);
  clientB = String(b.json?.client_id ?? "");
  mustHold(check("I-2.client-b", [200, 201].includes(b.status) && clientB !== "" && clientB !== clientA, `client B ${b.status}, distinct id`), "I-2.client-b");
  // OAuth 2.1 §2.3.1 / RFC 8252: a redirect must be https or loopback. Recorded, not asserted.
  const c = await register(`LMAI isolated client C ${RUN}`, "http://redirect.invalid/cb");
  verdict("N-1c.dcr-non-loopback-http-redirect", "REPORT", `registration with a non-loopback http redirect → ${c.status} (${[200, 201].includes(c.status) ? "ACCEPTED — the authorization server stores plain-http redirects" : "refused"})`);
});

// ── I-3 N-1 malformed / unknown client_id ───────────────────────────────────
test("I-3. N-1: malformed and unknown client_id are refused without a redirect to the client", async () => {
  const { challenge } = pkce();
  for (const [label, id] of [["malformed", "not-a-client-id"], ["injection-shaped", "x' OR '1'='1"], ["unknown-uuid", randomUUID()]] as const) {
    const url = new URL(String(asMeta.authorization_endpoint));
    url.search = new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: REDIRECT_URI, code_challenge: challenge, code_challenge_method: "S256", scope: baseScope, state: "s", resource: MCP_URL }).toString();
    const res = await safeFetch(url.toString());
    await res.text();
    const loc = res.headers.get("location") ?? "";
    const toClient = loc.startsWith(REDIRECT_URI);
    const toConsent = /\/oauth\/consent/.test(loc);
    // Refused = never sent on to the client's redirect_uri (open redirect) nor to the consent page.
    const authVerdict: Verdict = toClient || toConsent ? "FAIL" : res.status >= 500 ? "REPORT" : "PASS";
    verdict(`N-1.authorize-${label}`, authVerdict, `authorize with ${label} client_id → ${res.status}${loc ? `, redirect to ${toClient ? "CLIENT redirect_uri" : toConsent ? "CONSENT page" : "elsewhere (error page)"}` : ""}${res.status >= 500 ? " (server error on hostile input)" : ""}`);
    const tok = await postForm(String(asMeta.token_endpoint), { grant_type: "authorization_code", code: "invalid-code", redirect_uri: REDIRECT_URI, client_id: id, code_verifier: "v".repeat(43) });
    const verdictFor: Verdict = tok.status === 200 ? "FAIL" : tok.status >= 500 ? "REPORT" : "PASS";
    verdict(`N-1.token-${label}`, verdictFor, `token endpoint with ${label} client_id → ${tok.status} ${oauthErrorOf(tok.json)}${tok.status >= 500 ? " (server error on hostile input)" : ""}`);
  }
});

// ── I-4 the real chain: authorize + token, claims ───────────────────────────
test("I-4. authorization (PKCE S256 + resource) → consent by the synthetic person → token; N-6 claims", async ({ browser }) => {
  const { verifier, challenge } = pkce();
  const out = await authorizeInBrowser(browser, clientA, baseScope, challenge);
  mustHold(check("I-4.authorize", out.code !== null && out.error === null, `consent shown: ${out.consentShown}; callback ${out.code ? "with code" : `without code (${out.error ?? "?"})`}`), "I-4.authorize");
  if (asMeta.authorization_response_iss_parameter_supported === true) check("I-4.rfc9207", out.issOk === true, `iss present: ${out.issPresent}, equals issuer: ${out.issOk}`);
  else verdict("I-4.rfc9207", "REPORT", `iss not advertised; present: ${out.issPresent}`);

  const t = await exchange(out.code!, clientA, verifier);
  latencyMs.token = t.ms;
  accessToken = String(t.json?.access_token ?? "");
  refreshToken = t.json?.refresh_token ? String(t.json.refresh_token) : undefined;
  mustHold(check("I-4.token", t.status === 200 && accessToken !== "" && String(t.json?.token_type ?? "").toLowerCase() === "bearer", `token ${t.status} ${t.status === 200 ? "" : oauthErrorOf(t.json)}, ${t.ms} ms, refresh issued: ${Boolean(refreshToken)}`), "I-4.token");
  check("I-4.token-latency", t.ms < LIMIT_MS.token, `token endpoint ${t.ms} ms (limit ${LIMIT_MS.token})`);

  // N-6 — what the access token carries. Values shown are non-secret claim values only.
  const header = jwtPart(accessToken, 0);
  const c = jwtPart(accessToken, 1);
  const aud = c.aud ?? null;
  const audList = Array.isArray(aud) ? aud.map(String) : aud === null ? [] : [String(aud)];
  verdict("N-6.claims", "REPORT", JSON.stringify({
    alg: header.alg ?? null,
    has_scope_claim: "scope" in c,
    scope_claim: typeof c.scope === "string" ? c.scope : null,
    token_response_scope: typeof t.json?.scope === "string" ? t.json.scope : null,
    aud: audList,
    aud_includes_mcp_url: audList.includes(MCP_URL),
    has_client_id_claim: typeof c.client_id === "string",
    client_id_matches_registered_client: c.client_id === clientA,
    has_session_id: typeof c.session_id === "string",
    role: c.role ?? null,
    iss_is_local_issuer: typeof c.iss === "string" && String(c.iss).replace(/\/$/, "") === String(asMeta.issuer).replace(/\/$/, ""),
    expires_in: t.json?.expires_in ?? null,
  }));
  // #2806 (B1a) classifies third-party tokens by `client_id`. Without the claim it cannot tell them apart.
  verdict("N-6.b1a-precondition", typeof c.client_id === "string" ? "PASS" : "FAIL", `OAuth access token ${typeof c.client_id === "string" ? "carries" : "does NOT carry"} a client_id claim (required for the #2806 door rule)`);
});

// ── I-5 N-2 code theft / PKCE / replay / unknown client ─────────────────────
test("I-5. N-2: another self-registered client cannot redeem this code; wrong verifier refused; code replay refused; forged unknown-client token", async ({ browser }) => {
  const { verifier, challenge } = pkce();
  const out = await authorizeInBrowser(browser, clientA, baseScope, challenge);
  if (!out.code) {
    verdict("N-2", "SKIP", `second authorization yielded no code (${out.error ?? "?"})`);
    return;
  }
  verdict("N-2.second-consent", "REPORT", `second authorization for the same client and scope: consent screen ${out.consentShown ? "shown again" : "skipped (remembered grant)"}`);
  const stolen = await exchange(out.code, clientB, verifier);
  check("N-2.code-other-client", stolen.status !== 200, `client B redeeming client A's code → ${stolen.status} ${oauthErrorOf(stolen.json)}`);
  const wrong = await exchange(out.code, clientA, pkce().verifier);
  check("N-2.wrong-verifier", wrong.status !== 200, `client A with a wrong PKCE verifier → ${wrong.status} ${oauthErrorOf(wrong.json)}`);
  const right = await exchange(out.code, clientA, verifier);
  verdict("N-2.code-after-failed-attempts", "REPORT", `correct redemption after two failed attempts → ${right.status} (${right.status === 200 ? "code survived failed attempts" : "code invalidated by failed attempts — stricter"})`);
  if (right.status === 200) {
    const second = String(right.json?.access_token ?? "");
    if (second) extraClientATokens.push(second);
    const replay = await exchange(out.code, clientA, verifier);
    check("N-2.code-replay", replay.status !== 200, `same code redeemed twice → ${replay.status} ${oauthErrorOf(replay.json)}`);
    if (second) {
      const after = await rpc(second, "ping");
      verdict("N-2.replay-revokes-issued", "REPORT", `token from the replayed code after the replay attempt → MCP ${after.status} (RFC 6749 §4.1.2: SHOULD be revoked)`);
    }
  }

  // Unknown client: a token with a VALID LOCAL signature naming a client and session that do not exist.
  const secretKey = process.env.E2E_LOCAL_JWT_SECRET ?? "";
  const header = jwtPart(accessToken, 0);
  if (header.alg !== "HS256" || secretKey === "") {
    verdict("N-2.forged-unknown-client", "SKIP", header.alg !== "HS256" ? `tokens are ${String(header.alg)}-signed (asymmetric): cannot be forged with the local secret` : "E2E_LOCAL_JWT_SECRET not provided");
    return;
  }
  const sign = (claims: Json) => {
    const h = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const p = b64url(Buffer.from(JSON.stringify(claims)));
    const s = b64url(createHmac("sha256", secretKey).update(`${h}.${p}`).digest());
    const jwt = `${h}.${p}.${s}`;
    secret(jwt);
    return jwt;
  };
  const claims = jwtPart(accessToken, 1);
  const forgedUnknown = sign({ ...claims, client_id: randomUUID(), session_id: randomUUID() });
  const r1 = await rpc(forgedUnknown, "ping");
  verdict("N-2.forged-unknown-client-unknown-session", r1.status === 401 ? "PASS" : "REPORT", `locally-signed token, unknown client_id + unknown session → MCP ${r1.status}${r1.status === 401 ? "" : " (accepted: validity rests on signature alone)"}`);
  const forgedClientOnly = sign({ ...claims, client_id: randomUUID() });
  const r2 = await rpc(forgedClientOnly, "ping");
  verdict("N-2.forged-client-id-live-session", "REPORT", `locally-signed token, live session but a client_id no client has → MCP ${r2.status} (${r2.status === 200 ? "client_id is trusted from the signed token, not cross-checked with the grant" : "refused"})`);
});

// ── I-6 use the OAuth bearer (from #2454 O-4) ───────────────────────────────
test("I-6. use: initialize, tools/list, a read, a draft → confirm → replay refused", async () => {
  const init = await rpc(accessToken, "initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "isolated", version: "0" } });
  mustHold(check("I-6.initialize", init.status === 200 && /^0\.1\.0\+t\d+\./.test(String(init.body?.result?.serverInfo?.version ?? "")), `initialize ${init.status}`), "I-6.initialize");
  const list = await rpc(accessToken, "tools/list");
  const names = (list.body?.result?.tools ?? []).map((t) => t.name);
  const pub = await getJson(MCP_URL);
  check("I-6.tools-list", list.status === 200 && names.length === Number(pub.json?.toolCount) && ["profile_get", "journal_create_draft", "journal_confirm"].every((n) => names.includes(n)), `tools/list ${names.length} tools, public toolCount ${String(pub.json?.toolCount)}`);
  const profile = await tool(accessToken, "profile_get");
  check("I-6.read", profile.ok, `profile_get ok=${profile.ok}${profile.ok ? "" : ` code=${profile.code ?? "?"}`}`);

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const draftInput: Json = { workDate: yesterday, siteName: `${TAG} site`, notes: `${TAG}: one hour of synthetic conformance work through an OAuth client.` };
  let draft = await tool(accessToken, "journal_create_draft", draftInput);
  if (draft.ok && Array.isArray(draft.data?.options) && !draft.data?.preview) {
    const first = (draft.data.options as { id?: string; engagementContextId?: string }[])[0];
    draft = await tool(accessToken, "journal_create_draft", { ...draftInput, engagementContextId: first?.engagementContextId ?? first?.id });
  }
  const preview = draft.data?.preview as { engagementContextId: string; notes: string; workDate: string; siteName: string | null } | undefined;
  const confirmationToken = String(draft.data?.confirmationToken ?? "");
  secret(confirmationToken);
  if (!check("I-6.draft", draft.ok && preview !== undefined && confirmationToken !== "", `journal_create_draft ok=${draft.ok}${draft.ok ? "" : ` code=${draft.code ?? "?"}`}`)) return;
  const confirmInput: Json = { engagementContextId: preview!.engagementContextId, notes: preview!.notes, workDate: preview!.workDate, siteName: preview!.siteName ?? null, confirmationToken };
  const confirm = await tool(accessToken, "journal_confirm", confirmInput);
  check("I-6.confirm", confirm.ok, `journal_confirm ok=${confirm.ok}${confirm.ok ? "" : ` code=${confirm.code ?? "?"}`}`);
  const replay = await tool(accessToken, "journal_confirm", confirmInput);
  check("I-6.confirm-replay", !replay.ok, `spent confirmation replayed → ok=${replay.ok}`);
});

// ── I-7 refresh (from #2454 O-5) ────────────────────────────────────────────
test("I-7. refresh grant; rotation recorded", async () => {
  if (!refreshToken) {
    verdict("I-7.refresh", "SKIP", "no refresh token issued (offline_access not granted)");
    return;
  }
  const t0 = Date.now();
  const r = await postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientA });
  latencyMs.refresh = Date.now() - t0;
  secret(r.json?.access_token as string | undefined);
  secret(r.json?.refresh_token as string | undefined);
  mustHold(check("I-7.refresh", r.status === 200 && typeof r.json?.access_token === "string", `refresh ${r.status} ${r.status === 200 ? "" : oauthErrorOf(r.json)}, ${latencyMs.refresh} ms`), "I-7.refresh");
  const crossClient = await postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: String(r.json?.refresh_token ?? refreshToken), client_id: clientB });
  check("N-2.refresh-other-client", crossClient.status !== 200, `client B using client A's refresh token → ${crossClient.status} ${oauthErrorOf(crossClient.json)}`);
  const again = await postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientA });
  secret(again.json?.access_token as string | undefined);
  secret(again.json?.refresh_token as string | undefined);
  verdict("I-7.rotation", again.status === 200 || again.json?.error === "invalid_grant" ? "REPORT" : "FAIL", `old refresh token reused → ${again.status} ${oauthErrorOf(again.json)}; new refresh issued: ${typeof r.json?.refresh_token === "string"}`);
  if (typeof again.json?.access_token === "string") extraClientATokens.push(String(again.json.access_token));
  accessToken = String(r.json?.access_token);
  refreshToken = typeof r.json?.refresh_token === "string" ? String(r.json.refresh_token) : refreshToken;
  const ping = await rpc(accessToken, "ping");
  check("I-7.ping", ping.status === 200, `refreshed bearer → MCP ${ping.status}`);
});

// ── I-8 N-3 non-MCP /api routes with an OAuth token ─────────────────────────
test("I-8. N-3: an OAuth token is refused on non-MCP /api routes (403 once #2806 lands)", async () => {
  const has2806 = door2806Present();
  const fp = firstPartyToken();
  const routes = [
    { id: "professions-skills", path: `/api/professions/${randomUUID()}/skills`, controlOk: (s: number) => s === 200 },
    { id: "documents-file", path: `/api/documents/file/${randomUUID()}`, controlOk: (s: number) => s !== 401 && s !== 403 && s < 500 },
  ];
  for (const r of routes) {
    const control = fp ? await apiGet(r.path, fp) : null;
    const controlHolds = control !== null && r.controlOk(control);
    verdict(`N-3.${r.id}.first-party-control`, controlHolds ? "PASS" : "REPORT", `first-party bearer (no client_id) → ${control ?? "no first-party token"}`);
    const status = await apiGet(r.path, accessToken);
    if (has2806) check(`N-3.${r.id}.oauth`, status === 403, `OAuth bearer → ${status} (expected 403 — #2806 present on this ref)`);
    else verdict(`N-3.${r.id}.oauth`, "REPORT", `OAuth bearer → ${status} (${status === 403 ? "refused" : "ACCEPTED"}; #2806 not on this ref — expected 403 once it lands)`);
  }
});

// ── I-9 N-5 unknown requested scope ─────────────────────────────────────────
test("I-9. N-5: an unknown requested scope is refused or not granted", async ({ browser }) => {
  const { verifier, challenge } = pkce();
  const out = await authorizeInBrowser(browser, clientA, `${baseScope} ${UNKNOWN_SCOPE}`, challenge);
  if (!out.code) {
    check("N-5.unknown-scope", true, `authorization refused (${out.error ?? "no code"}); consent shown: ${out.consentShown}`);
    return;
  }
  const t = await exchange(out.code, clientA, verifier);
  if (t.status !== 200) {
    check("N-5.unknown-scope", true, `code issued but token refused → ${t.status} ${oauthErrorOf(t.json)}`);
    return;
  }
  const tok = String(t.json?.access_token ?? "");
  extraClientATokens.push(tok);
  const claimScope = jwtPart(tok, 1).scope;
  const granted = [typeof t.json?.scope === "string" ? t.json.scope : "", typeof claimScope === "string" ? claimScope : ""].join(" ").split(/\s+/).filter(Boolean);
  if (granted.length === 0) verdict("N-5.unknown-scope", "REPORT", `token issued for a request with an unknown scope; neither response nor token states a scope (consent shown: ${out.consentShown})`);
  else check("N-5.unknown-scope", !granted.includes(UNKNOWN_SCOPE), `token issued; granted scope ${granted.includes(UNKNOWN_SCOPE) ? "INCLUDES" : "excludes"} the unknown scope (consent shown: ${out.consentShown})`);
});

// ── I-10 revoke (from #2454 O-6) + N-4 refused at the door ─────────────────
test("I-10. revoke in Connected apps; N-4: every client-A token is refused at the door afterwards", async ({ browser }) => {
  const ctx = await guardedContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/en/dashboard/account#connected-apps`, { waitUntil: "domcontentloaded" });
  const section = page.getByTestId("account-connected-apps");
  await expect(section).toBeVisible({ timeout: 30_000 });
  const row = section.getByTestId("connected-apps-list").locator("li", { hasText: CLIENT_A }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTestId("connected-app-disconnect").click();
  await page.getByTestId("connected-app-confirm-yes").click();
  await expect(page.getByTestId("connected-apps-revoked")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
  verdict("I-10.revoke-ui", "PASS", "grant for client A disconnected in Connected apps");

  const after = await rpc(accessToken, "ping");
  check("N-4.mcp-after-revoke", after.status === 401 && /error="invalid_token"/.test(after.headers.get("www-authenticate") ?? ""), `current access token after revoke → MCP ${after.status}`);
  let i = 0;
  for (const t of extraClientATokens) {
    const r = await rpc(t, "ping");
    check(`N-4.other-token-${++i}`, r.status === 401, `another client-A access token after revoke → MCP ${r.status}`);
  }
  const route = await apiGet(`/api/professions/${randomUUID()}/skills`, accessToken);
  check("N-4.api-after-revoke", route === 401 || route === 403, `revoked token on a non-MCP route → ${route}`);
  if (refreshToken) {
    const dead = await postForm(String(asMeta.token_endpoint), { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientA });
    secret(dead.json?.access_token as string | undefined);
    check("N-4.refresh-after-revoke", dead.status !== 200, `revoked grant's refresh token → ${dead.status} ${oauthErrorOf(dead.json)}`);
  }
});

// ── I-11 summary ────────────────────────────────────────────────────────────
test("I-11. egress and verdict summary: no production host attempted, no FAIL", async () => {
  const hosts = [...blockedHosts];
  const prodHits = hosts.filter((h) => PRODUCTION_HOSTS.some((rx) => rx.test(h)));
  check("I-11.no-production-egress", prodHits.length === 0, `browser requests blocked: ${hosts.length} host(s)${hosts.length ? ` [${hosts.join(", ")}]` : ""}; production hosts among them: ${prodHits.length}`);
  const failed = results.filter((r) => r.verdict === "FAIL").map((r) => r.id);
  expect(failed.length, `FAIL verdicts: ${failed.join(", ")}`).toBe(0);
});
