import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The MCP door's REFUSAL contract (2026-09-02 incident): an external client
 * must be able to read, from the wire alone, whether to authenticate,
 * refresh-then-retry, retry later or back off. The identity resolver is
 * stubbed per case; the header/body assembly under test is the route's own.
 */

type Refusal =
  | "no-credentials"
  | "malformed-bearer"
  | "invalid-bearer"
  | "rate-limited"
  | "identity-unavailable";

let nextResult:
  | { ok: false; reason: Refusal }
  | { ok: true; identity: { userId: string; transport: "bearer"; supabase: unknown } } = {
  ok: false,
  reason: "no-credentials",
};

vi.mock("@/lib/api/api-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/api-identity")>();
  return {
    ...actual,
    resolveApiIdentity: vi.fn(async () => nextResult),
  };
});

vi.mock("@/lib/capabilities/registry", () => ({
  exposedCapabilities: () => [],
  runCapability: vi.fn(),
}));

vi.mock("@/lib/capabilities/presentation", () => ({
  summarizeCapabilityResult: vi.fn(async () => null),
}));

import { POST } from "@/app/api/mcp/route";

const ORIGIN = "https://labourmarket.ai";
const RESOURCE = `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`;

function initialize(): Request {
  return new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
}

beforeEach(() => {
  nextResult = { ok: false, reason: "no-credentials" };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("/api/mcp refusals are machine-readable and keep the no-oracle rule", () => {
  it("no credential → 401, challenge WITHOUT error=, class CREDENTIALS_MISSING / authenticate", async () => {
    const res = await POST(initialize());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer ${RESOURCE}`);
    expect(await res.json()).toEqual({
      ok: false,
      error: "CREDENTIALS_MISSING",
      client_action: "authenticate",
      user_message: "reconnect_required",
    });
  });

  it("rejected credential → 401, error=\"invalid_token\", class ACCESS_TOKEN_REJECTED / retry_after_refresh", async () => {
    nextResult = { ok: false, reason: "invalid-bearer" };
    const res = await POST(initialize());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer error="invalid_token", ${RESOURCE}`);
    expect(await res.json()).toEqual({
      ok: false,
      error: "ACCESS_TOKEN_REJECTED",
      client_action: "retry_after_refresh",
      user_message: "retry_automatically",
    });
  });

  it("a malformed credential is indistinguishable from a rejected one on the wire", async () => {
    nextResult = { ok: false, reason: "invalid-bearer" };
    const a = await POST(initialize());
    nextResult = { ok: false, reason: "malformed-bearer" };
    const b = await POST(initialize());
    expect(a.status).toBe(b.status);
    expect(a.headers.get("www-authenticate")).toBe(b.headers.get("www-authenticate"));
    expect(await a.json()).toEqual(await b.json());
  });

  it("auth server unreachable → 503, no challenge, AUTH_PROVIDER_UNAVAILABLE / retry_later", async () => {
    nextResult = { ok: false, reason: "identity-unavailable" };
    const res = await POST(initialize());
    expect(res.status).toBe(503);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect((await res.json()).client_action).toBe("retry_later");
  });

  it("every response carries Server-Timing with the auth phase (durations only)", async () => {
    nextResult = { ok: false, reason: "invalid-bearer" };
    const refused = await POST(initialize());
    expect(refused.headers.get("server-timing")).toMatch(/^auth;dur=\d+(\.\d+)?$/);
    nextResult = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };
    const ok = await POST(initialize());
    const st = ok.headers.get("server-timing") ?? "";
    expect(st).toMatch(/auth;dur=/);
    expect(st).toMatch(/total;dur=/);
    expect(st).not.toContain("u-1");
  });

  it("rate limited → 429, no challenge, RATE_LIMITED / back_off", async () => {
    nextResult = { ok: false, reason: "rate-limited" };
    const res = await POST(initialize());
    expect(res.status).toBe(429);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect((await res.json()).client_action).toBe("back_off");
  });

  it("every refusal and every success is logged as a class-only JSON line with no credential", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    nextResult = { ok: false, reason: "invalid-bearer" };
    await POST(initialize());
    nextResult = { ok: true, identity: { userId: "u-1", transport: "bearer", supabase: {} } };
    await POST(initialize());
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('"outcome":"refused"') && l.includes("ACCESS_TOKEN_REJECTED"))).toBe(true);
    expect(lines.some((l) => l.includes('"outcome":"ok"') && l.includes('"transport":"bearer"'))).toBe(true);
    for (const l of lines) {
      expect(l).not.toContain("u-1");
      expect(l).not.toMatch(/eyJ/);
      expect(l).not.toMatch(/"token"/);
    }
  });
});

describe("/api/mcp per-person brake — a VALID token is not an unlimited token", () => {
  it("the 601st call in five minutes from one person is refused with back_off + Retry-After; another person is unaffected", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    nextResult = { ok: true, identity: { userId: "brake-user", transport: "bearer", supabase: {} } };
    for (let i = 0; i < 600; i += 1) {
      const res = await POST(initialize());
      expect(res.status).toBe(200);
    }
    const refused = await POST(initialize());
    expect(refused.status).toBe(429);
    expect(refused.headers.get("www-authenticate")).toBeNull();
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await refused.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.client_action).toBe("back_off");

    nextResult = { ok: true, identity: { userId: "someone-else", transport: "bearer", supabase: {} } };
    expect((await POST(initialize())).status).toBe(200);

    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('"error_class":"RATE_LIMITED"') && l.includes('"status":429'))).toBe(true);
    for (const l of lines) expect(l).not.toContain("brake-user");
  });
});
