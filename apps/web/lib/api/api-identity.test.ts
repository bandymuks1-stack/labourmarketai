import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for the resolver's judgement/infrastructure distinction —
 * the one part of `resolveApiIdentity` that pure header tests
 * (lib/guards/api-auth-boundary.test.ts) cannot reach and the real-stack e2e
 * controls (tests/e2e/auth-core-bearer.spec.ts) cannot force: what happens
 * when the auth server ANSWERS "no" versus when it CANNOT BE ASKED.
 *
 * Only the two seams a live auth server would occupy are stubbed: the
 * supabase-js client the bearer path builds, and the cookie client. Header
 * classification, rate limiting and the resolver's control flow are real.
 *
 * Grafted from #1336's review (the second Codex finding): a transient auth
 * outage must never be reported as 401 — a client that believes "invalid
 * token" discards a perfectly valid credential. #1314's lesson at the
 * transport layer: a failed read is "unknown", never a fact.
 */

// A verdict about the token: HTTP 4xx from the auth server.
const verdictError = { name: "AuthApiError", message: "invalid JWT", status: 401 };
// The auth server could not be asked: gotrue-js retryable fetch failure.
const outageError = { name: "AuthRetryableFetchError", message: "fetch failed", status: undefined };
// The auth server broke while judging: 5xx is not a verdict either.
const serverError = { name: "AuthApiError", message: "internal", status: 502 };

let bearerAuthResult: { data: { user: unknown }; error: unknown } | "throw" = {
  data: { user: null },
  error: verdictError,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: async () => {
        if (bearerAuthResult === "throw") throw new Error("network down");
        return bearerAuthResult;
      },
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  })),
}));

vi.mock("@/lib/env", () => ({
  requireSupabaseClientEnv: () => ({
    url: "https://stub.invalid",
    anonKey: "stub-anon-key",
  }),
}));

import { audienceAccepts, audienceClaimsOf, refusalStatus, resolveApiIdentity } from "./api-identity";

/** A well-formed compact JWS with the given payload. The signature is not
 *  real — verification is the stubbed auth server's job. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "ES256" })}.${b64(payload)}.c2lnbmF0dXJl`;
}

// A first-party Supabase session token: `aud: authenticated`, no `client_id`.
const WELL_FORMED = `Bearer ${jwt({ sub: "x", aud: "authenticated" })}`;

// Each request gets its own forwarded-for so the failure limiter judges each
// test alone — the limiter itself is real and stays in the path on purpose.
let requestSeq = 0;
function bearerRequest(): Request {
  requestSeq += 1;
  const headers = new Headers();
  headers.set("authorization", WELL_FORMED);
  headers.set("x-forwarded-for", `test-client-${requestSeq}`);
  return new Request("https://app.invalid/api/x", { headers });
}

beforeEach(() => {
  bearerAuthResult = { data: { user: null }, error: verdictError };
});

describe("an auth-server VERDICT is invalid-bearer (401)", () => {
  it("a 4xx answer about the token", async () => {
    const r = await resolveApiIdentity(bearerRequest());
    expect(r).toEqual({ ok: false, reason: "invalid-bearer" });
  });

  it("a clean answer with no user (defence in depth)", async () => {
    bearerAuthResult = { data: { user: null }, error: null };
    const r = await resolveApiIdentity(bearerRequest());
    expect(r).toEqual({ ok: false, reason: "invalid-bearer" });
  });
});

describe("an auth-server FAILURE is identity-unavailable (503), never a fact about the caller", () => {
  it("a retryable fetch failure (server unreachable)", async () => {
    bearerAuthResult = { data: { user: null }, error: outageError };
    const r = await resolveApiIdentity(bearerRequest());
    expect(r).toEqual({ ok: false, reason: "identity-unavailable" });
  });

  it("a 5xx from the auth server (it did not judge)", async () => {
    bearerAuthResult = { data: { user: null }, error: serverError };
    const r = await resolveApiIdentity(bearerRequest());
    expect(r).toEqual({ ok: false, reason: "identity-unavailable" });
  });

  it("an outright thrown network error", async () => {
    bearerAuthResult = "throw";
    const r = await resolveApiIdentity(bearerRequest());
    expect(r).toEqual({ ok: false, reason: "identity-unavailable" });
  });

  it("positive control: a verified user still resolves (the stubs are not fail-everything)", async () => {
    bearerAuthResult = {
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    };
    const r = await resolveApiIdentity(bearerRequest());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.identity.userId).toBe("00000000-0000-4000-8000-000000000001");
      expect(r.identity.transport).toBe("bearer");
    }
  });

  it("the bearer client answers the no-argument getUser() with THIS verification (the cookie client's idiom)", async () => {
    const user = { id: "00000000-0000-4000-8000-000000000002" };
    bearerAuthResult = { data: { user }, error: null };
    const r = await resolveApiIdentity(bearerRequest());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A later answer from the auth server cannot change who THIS request is:
    // the domain helpers asking `auth.getUser()` see the verified caller.
    bearerAuthResult = { data: { user: null }, error: verdictError };
    const asked = await r.identity.supabase.auth.getUser();
    expect(asked.data.user).toBe(user);
    // An explicit-JWT call still goes to the auth server untouched.
    const explicit = await r.identity.supabase.auth.getUser("some.other.jwt");
    expect(explicit.data.user).toBeNull();
  });
});

describe("the failure limiter meters FAILURES, never legitimate traffic", () => {
  const VALID_USER = { id: "00000000-0000-4000-8000-000000000002" };

  function keyedRequest(key: string): Request {
    const headers = new Headers();
    headers.set("authorization", WELL_FORMED);
    headers.set("x-forwarded-for", key);
    return new Request("https://app.invalid/api/x", { headers });
  }

  it("a client with a real token is never locked out, however often it calls", async () => {
    bearerAuthResult = { data: { user: VALID_USER }, error: null };
    for (let i = 0; i < 70; i += 1) {
      const r = await resolveApiIdentity(keyedRequest("steady-valid-client"));
      expect(r.ok, `call ${i + 1} must not be limited`).toBe(true);
    }
  });

  it("rejected tokens spend budget; an exhausted budget refuses BEFORE verifying", async () => {
    bearerAuthResult = { data: { user: null }, error: verdictError };
    for (let i = 0; i < 60; i += 1) {
      const r = await resolveApiIdentity(keyedRequest("flooding-client"));
      expect(r).toEqual({ ok: false, reason: "invalid-bearer" });
    }
    const before = vi.mocked(
      (await import("@supabase/supabase-js")).createClient,
    ).mock.calls.length;
    const r = await resolveApiIdentity(keyedRequest("flooding-client"));
    expect(r).toEqual({ ok: false, reason: "rate-limited" });
    const after = vi.mocked(
      (await import("@supabase/supabase-js")).createClient,
    ).mock.calls.length;
    expect(after, "no verification round-trip once the budget is gone").toBe(before);
  });

  it("our own outage never spends the caller's budget", async () => {
    bearerAuthResult = { data: { user: null }, error: outageError };
    for (let i = 0; i < 65; i += 1) {
      const r = await resolveApiIdentity(keyedRequest("unlucky-client"));
      expect(r).toEqual({ ok: false, reason: "identity-unavailable" });
    }
  });
});

describe("refusalStatus — the one refusal→HTTP mapping", () => {
  it("every credential judgement is the same 401 (no oracle)", () => {
    expect(refusalStatus("no-credentials")).toBe(401);
    expect(refusalStatus("malformed-bearer")).toBe(401);
    expect(refusalStatus("invalid-bearer")).toBe(401);
  });

  it("a brake is 429 and an unasked question is 503 — neither says anything about the token", () => {
    expect(refusalStatus("rate-limited")).toBe(429);
    expect(refusalStatus("identity-unavailable")).toBe(503);
  });
});

describe("audience binding (C-3): a verified token is spent only where it was issued for", () => {
  const MCP = "https://labourmarket.ai/api/mcp";
  const USER = { id: "00000000-0000-4000-8000-000000000003" };

  function request(token: string, key: string): Request {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-forwarded-for", `aud-${key}`);
    return new Request("https://app.invalid/api/x", { headers });
  }

  beforeEach(() => {
    bearerAuthResult = { data: { user: USER }, error: null };
  });

  const firstParty = jwt({ sub: USER.id, aud: "authenticated" });
  const oauthClient = jwt({ sub: USER.id, aud: "authenticated", client_id: "chatgpt-dcr-client" });
  const boundToMcp = jwt({ sub: USER.id, aud: [MCP], client_id: "chatgpt-dcr-client" });
  const boundElsewhere = jwt({ sub: USER.id, aud: "https://other.example/api", client_id: "c" });
  const mixedAud = jwt({ sub: USER.id, aud: ["authenticated", "https://other.example/api"], client_id: "c" });
  const noAud = jwt({ sub: USER.id });

  it("a first-party session is accepted at an app route and at the MCP door (unchanged)", async () => {
    expect((await resolveApiIdentity(request(firstParty, "fp-app"))).ok).toBe(true);
    expect((await resolveApiIdentity(request(firstParty, "fp-mcp"), { resource: MCP })).ok).toBe(true);
  });

  it("an OAuth-client token is accepted at the MCP door", async () => {
    expect((await resolveApiIdentity(request(oauthClient, "oc-mcp"), { resource: MCP })).ok).toBe(true);
    expect((await resolveApiIdentity(request(boundToMcp, "bm-mcp"), { resource: MCP })).ok).toBe(true);
    // trailing slash on either side is the same resource
    expect((await resolveApiIdentity(request(boundToMcp, "bm-mcp2"), { resource: `${MCP}/` })).ok).toBe(true);
  });

  it("an OAuth-client token is REFUSED at every route that is not an OAuth protected resource", async () => {
    expect(await resolveApiIdentity(request(oauthClient, "oc-app"))).toEqual({ ok: false, reason: "wrong-audience" });
    expect(await resolveApiIdentity(request(boundToMcp, "bm-app"))).toEqual({ ok: false, reason: "wrong-audience" });
  });

  it("a token bound to ANOTHER resource is refused, even at the MCP door", async () => {
    expect(await resolveApiIdentity(request(boundElsewhere, "be-mcp"), { resource: MCP })).toEqual({
      ok: false,
      reason: "wrong-audience",
    });
    expect(await resolveApiIdentity(request(mixedAud, "mx-mcp"), { resource: MCP })).toEqual({
      ok: false,
      reason: "wrong-audience",
    });
    // a different path on the same origin is a different resource
    const sibling = jwt({ sub: USER.id, aud: "https://labourmarket.ai/api/other", client_id: "c" });
    expect(await resolveApiIdentity(request(sibling, "sib-mcp"), { resource: MCP })).toEqual({
      ok: false,
      reason: "wrong-audience",
    });
  });

  it("a verified token with no readable audience is refused (fail closed)", async () => {
    expect(await resolveApiIdentity(request(noAud, "na-app"))).toEqual({ ok: false, reason: "wrong-audience" });
    expect(await resolveApiIdentity(request(noAud, "na-mcp"), { resource: MCP })).toEqual({
      ok: false,
      reason: "wrong-audience",
    });
  });

  it("an auth-server rejection still wins: claims are never read for an unverified token", async () => {
    bearerAuthResult = { data: { user: null }, error: verdictError };
    expect(await resolveApiIdentity(request(boundToMcp, "rej-mcp"), { resource: MCP })).toEqual({
      ok: false,
      reason: "invalid-bearer",
    });
  });

  it("wrong-audience is the same 401 as every other credential judgement (no oracle)", () => {
    expect(refusalStatus("wrong-audience")).toBe(401);
  });

  it("the pure rule: empty or non-string audiences never pass", () => {
    expect(audienceAccepts({ aud: [], clientId: null }, {})).toBe(false);
    expect(audienceAccepts(null, { resource: MCP })).toBe(false);
    expect(audienceClaimsOf(jwt({ aud: [1, 2] }))).toBeNull();
    expect(audienceClaimsOf("not.a-jwt.x")).toBeNull();
    expect(audienceClaimsOf(jwt({ aud: "authenticated", client_id: "" }))).toEqual({ aud: ["authenticated"], clientId: null });
  });
});
