import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A token issued to a THIRD-PARTY OAuth client (it carries `client_id`) is
 * accepted only at the connector door `/api/mcp`. Every other `app/api`
 * route refuses it with 403. A `client_id` that is present but not a plain
 * string fails closed (401, like any rejected token) — it is never treated as
 * the person's own first-party session.
 *
 * Only the auth-server seams are stubbed (as in api-identity.test.ts); the
 * claim reading, the resolver and the refusal mapping are real.
 */

let bearerAuthResult: { data: { user: unknown }; error: unknown } = {
  data: { user: { id: "user-1" } },
  error: null,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: async () => bearerAuthResult } })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })),
}));
vi.mock("@/lib/env", () => ({
  requireSupabaseClientEnv: () => ({ url: "https://stub.invalid", anonKey: "stub-anon-key" }),
}));

import {
  firstPartyRefusalStatus,
  refusalStatus,
  resolveApiIdentity,
  resolveFirstPartyIdentity,
  tokenClientOf,
} from "./api-identity";

const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const jwt = (claims: unknown) => `${b64({ alg: "HS256" })}.${b64(claims)}.c2lnbmF0dXJl`;

let seq = 0;
function bearer(token: string): Request {
  seq += 1;
  return new Request("https://app.invalid/api/x", {
    headers: { authorization: `Bearer ${token}`, "x-forwarded-for": `door-only-${seq}` },
  });
}

beforeEach(() => {
  bearerAuthResult = { data: { user: { id: "user-1" } }, error: null };
});

describe("tokenClientOf reads the verified token's client, failing closed", () => {
  it("no client_id → first party", () => {
    expect(tokenClientOf(jwt({ sub: "x", role: "authenticated" }))).toEqual({ kind: "first_party" });
  });
  it("a plain client id → oauth client", () => {
    expect(tokenClientOf(jwt({ sub: "x", client_id: "9f1c2e4a-1b2c-4d5e-8f90-123456789abc" }))).toEqual({
      kind: "oauth",
      clientId: "9f1c2e4a-1b2c-4d5e-8f90-123456789abc",
    });
  });
  it.each([
    ["a number", 42],
    ["null", null],
    ["an empty string", ""],
    ["an array", ["a"]],
    ["an object", { id: "a" }],
    ["spaces", "a b"],
    ["a newline", "a\nb"],
    ["201 characters", "a".repeat(201)],
  ])("client_id that is %s → malformed", (_label, value) => {
    expect(tokenClientOf(jwt({ sub: "x", client_id: value }))).toEqual({ kind: "malformed" });
  });
  it("a payload that is not a JSON object → malformed", () => {
    expect(tokenClientOf(`${b64({ alg: "HS256" })}.${b64("not json")}.sig`)).toEqual({ kind: "malformed" });
    expect(tokenClientOf(jwt([1, 2]))).toEqual({ kind: "malformed" });
  });
});

describe("the resolver: door accepts third-party clients, other routes refuse them", () => {
  const OAUTH = jwt({ sub: "user-1", client_id: "9f1c2e4a-1b2c-4d5e-8f90-123456789abc" });
  const FIRST = jwt({ sub: "user-1" });
  const MALFORMED = jwt({ sub: "user-1", client_id: 7 });

  it("the door (resolveApiIdentity) carries the client id", async () => {
    const r = await resolveApiIdentity(bearer(OAUTH));
    expect(r.ok && r.identity.oauthClientId).toBe("9f1c2e4a-1b2c-4d5e-8f90-123456789abc");
  });
  it("a first-party bearer has no client id anywhere", async () => {
    const door = await resolveApiIdentity(bearer(FIRST));
    expect(door.ok && door.identity.oauthClientId).toBeUndefined();
    const route = await resolveFirstPartyIdentity(bearer(FIRST));
    expect(route.ok).toBe(true);
  });
  it("other routes refuse a third-party client's token with 403", async () => {
    const r = await resolveFirstPartyIdentity(bearer(OAUTH));
    expect(r).toEqual({ ok: false, reason: "client-not-permitted" });
    expect(firstPartyRefusalStatus("client-not-permitted")).toBe(403);
  });
  it("a malformed client_id is refused everywhere as a rejected token (401)", async () => {
    expect(await resolveApiIdentity(bearer(MALFORMED))).toEqual({ ok: false, reason: "invalid-bearer" });
    expect(await resolveFirstPartyIdentity(bearer(MALFORMED))).toEqual({ ok: false, reason: "invalid-bearer" });
  });
  it("every other refusal keeps the one shared status mapping", () => {
    for (const reason of ["no-credentials", "malformed-bearer", "invalid-bearer", "rate-limited", "identity-unavailable"] as const) {
      expect(firstPartyRefusalStatus(reason)).toBe(refusalStatus(reason));
    }
  });
});

describe("only the connector door uses the third-party-accepting resolver", () => {
  const API = resolve(__dirname, "../../app/api");
  const routes = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
    });

  it("resolveApiIdentity( is called only by app/api/mcp/route.ts", () => {
    const callers = routes(API)
      .filter((f) => readFileSync(f, "utf8").includes("resolveApiIdentity("))
      .map((f) => relative(API, f).replace(/\\/g, "/"));
    expect(callers).toEqual(["mcp/route.ts"]);
  });
});
