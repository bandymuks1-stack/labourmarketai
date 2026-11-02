import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CANONICAL_HOST } from "../../lib/domain/canonical";
import { PRODUCTION_ORIGIN, PROD_QA_IDENTITIES } from "../../lib/testing/prod-qa-guard";

/**
 * THE ONE PLACE A PRODUCTION WALK SENDS A SESSION TOKEN TO AN API.
 *
 * The API-level walks (identity split, company chain, brigade B2B-9b) prove
 * permissions by calling PostgREST with each synthetic person's OWN token —
 * the only honest way to show "this organization can read X, that one cannot".
 * A bearer token is a credential, so the rules live here, once:
 *
 *   1. ONLY allowlisted synthetic identities. The token's `email` claim must be
 *      one of `PROD_QA_IDENTITIES` (lib/testing/prod-qa-guard.ts) — the same
 *      allowlist the mint script refuses everything else with.
 *   2. ONLY the production project's own API, over HTTPS. The base URL is the
 *      hard-coded `PRODUCTION_ORIGIN`; the environment value (a repository
 *      secret, never a dispatch input) must EQUAL it, and the token's issuer
 *      must be that same origin. Anything else throws BEFORE a request is made.
 *   3. NO redirect may carry the token elsewhere (`redirect: "error"`).
 *   (The MCP walks send the same token to the APP's own MCP endpoint — the
 *   same rules, with the app's fixed production origin: `qaMcp`.)
 *   4. The token is never logged, never put in an assertion message and never
 *      written anywhere; failures name the rule, not the value.
 *
 * Sessions are revoked and their files deleted after every walk
 * (`scripts/prod-qa-revoke-sessions.ts`, the workflow's `if: always()` step).
 */

/** The app's own production origin — the only place `qaMcp` sends a token. */
export const PRODUCTION_APP_ORIGIN = `https://${CANONICAL_HOST}`;

const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);

/** The vetted API origin — throws unless the configured one is exactly production over HTTPS. */
export function qaApiOrigin(): string {
  const configured = (process.env.PROD_QA_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("prod-qa-api: PROD_QA_SUPABASE_URL is not a URL");
  }
  if (parsed.protocol !== "https:") throw new Error("prod-qa-api: the API must be HTTPS");
  if (parsed.origin !== PRODUCTION_ORIGIN) {
    throw new Error("prod-qa-api: PROD_QA_SUPABASE_URL is not the production project's own API");
  }
  return PRODUCTION_ORIGIN;
}

function claimsOf(token: string): { email?: string; iss?: string; exp?: number } {
  const part = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** The access token of one minted synthetic session — refused unless it is an allowlisted identity issued by production. */
export function bearerOf(slot: string): string {
  const st = JSON.parse(readFileSync(state(slot), "utf8")) as { cookies: { name: string; value: string }[] };
  const raw = st.cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map((c) => c.value)
    .join("");
  const b64 = raw.startsWith("base64-") ? raw.slice(7) : raw;
  const token = JSON.parse(Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
    .access_token as string;
  const claims = claimsOf(token);
  if (!claims.email || !PROD_QA_IDENTITIES.includes(claims.email)) {
    throw new Error(`prod-qa-api: the ${slot} session is not an allowlisted synthetic identity`);
  }
  if (!claims.iss || !claims.iss.startsWith(`${PRODUCTION_ORIGIN}/`)) {
    throw new Error(`prod-qa-api: the ${slot} session was not issued by the production project`);
  }
  return token;
}

/** A PostgREST / Auth call with a vetted token to the vetted origin. `token: null` = anonymous. */
export async function qaApi(
  path: `/${string}`,
  token: string | null,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<Response> {
  const origin = qaApiOrigin();
  const anon = process.env.PROD_QA_ANON_KEY ?? "";
  if (!anon) throw new Error("prod-qa-api: PROD_QA_ANON_KEY is not set");
  return fetch(`${origin}${path}`, {
    method: init.method ?? "GET",
    redirect: "error",
    headers: {
      apikey: anon,
      authorization: `Bearer ${token ?? anon}`,
      "content-type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

/** The vetted app origin — `PLAYWRIGHT_BASE_URL`, when set, must be exactly production over HTTPS. */
export function qaAppOrigin(): string {
  const configured = (process.env.PLAYWRIGHT_BASE_URL ?? PRODUCTION_APP_ORIGIN).trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("prod-qa-api: PLAYWRIGHT_BASE_URL is not a URL");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== PRODUCTION_APP_ORIGIN) {
    throw new Error("prod-qa-api: the MCP endpoint must be the production app over HTTPS");
  }
  return PRODUCTION_APP_ORIGIN;
}

/** One JSON-RPC call to the app's own MCP endpoint with a vetted token (`null` = no token). */
export async function qaMcp(token: string | null, payload: unknown): Promise<Response> {
  return fetch(`${qaAppOrigin()}/api/mcp`, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}
