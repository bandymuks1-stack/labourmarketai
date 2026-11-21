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
  env: { PUBLIC_ORIGIN: "https://labourmarket.ai" },
}));

import { audienceAccepted, refusalStatus, resolveApiIdentity, tokenAudiences } from "./api-identity";

/** A JWS-shaped token with these claims (the stubbed auth server judges it). */
function jwt(claims: Record<string, unknown>): string {
  const seg = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${seg({ alg: "HS256" })}.${seg(claims)}.c2lnbmF0dXJl`;
}

// Every user token Supabase Auth issues carries the platform audience.
const WELL_FORMED = `Bearer ${jwt({ sub: "x", aud: "authenticated" })}`;

// Each request gets its own forwarded-for so the failure limiter judges each
// test alone — the limiter itself is real and stays in the path on purpose.
let requestSeq = 0;
function bearerRequest(authorization = WELL_FORMED, url = "https://app.invalid/api/x"): Request {
  requestSeq += 1;
  const headers = new Headers();
  headers.set("authorization", authorization);
  headers.set("x-forwarded-for", `test-client-${requestSeq}`);
  return new Request(url, { headers });
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

describe("the token's audience (C-3): a verified token is admitted only where it was meant for", () => {
  const verifiedUser = { data: { user: { id: "00000000-0000-4000-8000-000000000003" } }, error: null };
  const MCP = "https://labourmarket.ai/api/mcp";
  beforeEach(() => {
    bearerAuthResult = verifiedUser;
  });

  it("positive control: the platform audience every existing client carries, as a string or a list", async () => {
    expect((await resolveApiIdentity(bearerRequest(`Bearer ${jwt({ sub: "x", aud: "authenticated" })}`, MCP))).ok).toBe(true);
    expect((await resolveApiIdentity(bearerRequest(`Bearer ${jwt({ sub: "x", aud: ["authenticated"] })}`, MCP))).ok).toBe(true);
  });

  it("positive control: a token bound to THIS door's public URL", async () => {
    const r = await resolveApiIdentity(bearerRequest(`Bearer ${jwt({ sub: "x", aud: MCP })}`, MCP));
    expect(r.ok).toBe(true);
  });

  it.each<[Record<string, unknown>, string]>([
    [{ sub: "x" }, "no audience at all"],
    [{ sub: "x", aud: [] }, "an empty audience"],
    [{ sub: "x", aud: "anon" }, "a different platform audience"],
    [{ sub: "x", aud: "https://labourmarket.ai/api/mcp/chatgpt" }, "another door of ours"],
    [{ sub: "x", aud: "https://other.example/api/mcp" }, "another server's resource"],
    [{ sub: "x", aud: 42 }, "a non-string audience"],
  ])("NEGATIVE CONTROL: a token the auth server verified is still refused for %j (%s)", async (claims, _why) => {
    const r = await resolveApiIdentity(bearerRequest(`Bearer ${jwt(claims)}`, MCP));
    expect(r).toEqual({ ok: false, reason: "invalid-bearer" });
  });

  it("the bind host is never the resource: the public origin decides, not req.url", async () => {
    const r = await resolveApiIdentity(
      bearerRequest(`Bearer ${jwt({ sub: "x", aud: "http://0.0.0.0:3000/api/mcp" })}`, "http://0.0.0.0:3000/api/mcp"),
    );
    expect(r).toEqual({ ok: false, reason: "invalid-bearer" });
  });

  it("the pure pieces: unreadable payloads are null, and null is never accepted", () => {
    expect(tokenAudiences("a.%%%.c")).toBeNull();
    expect(tokenAudiences(jwt({ aud: ["authenticated", "x"] }))).toEqual(["authenticated", "x"]);
    expect(audienceAccepted(null, () => MCP)).toBe(false);
    expect(audienceAccepted([`${MCP}/`], () => MCP)).toBe(true);
  });
});
