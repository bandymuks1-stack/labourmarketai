import { describe, expect, it, vi } from "vitest";

import {
  DOMAIN_TRANSPORT_STATUS,
  callDomain,
  failureMessageKey,
  type TransportStatus,
} from "./transport";

const OPEN: TransportStatus = { open: true };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the gate is shut, and shut means shut", () => {
  it("ships closed", () => {
    // If this ever fails, the owner-gated bearer resolver had better be merged
    // and docs/APP_READINESS_MAP.md §6 updated in the same pull request.
    expect(DOMAIN_TRANSPORT_STATUS.open).toBe(false);
  });

  it("refuses even with a perfectly good token, and never touches the network", async () => {
    const fetchSpy = vi.fn();
    const result = await callDomain(
      { apiBaseUrl: "https://labourmarket.ai", fetch: fetchSpy as unknown as typeof fetch },
      { path: "/api/journal", accessToken: "a-real-token" },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe(
      "transport_unavailable",
    );
  });

  it("says WHY, in a sentence that names the gate", async () => {
    const result = await callDomain(
      { apiBaseUrl: "https://labourmarket.ai", fetch: (() => {}) as unknown as typeof fetch },
      { path: "/api/journal", accessToken: "t" },
    );
    const because =
      result.ok === false && result.failure.kind === "transport_unavailable"
        ? result.failure.because
        : "";
    expect(because).toMatch(/#1336/);
    expect(because).toMatch(/cookie/i);
  });
});

describe("with the gate open — implemented and tested before it is switched on", () => {
  const deps = (fetchImpl: typeof fetch) => ({
    apiBaseUrl: "https://labourmarket.ai",
    fetch: fetchImpl,
    status: OPEN,
  });

  it("carries the caller's token in an Authorization header and nothing else", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return jsonResponse(200, { entries: [] });
    }) as unknown as typeof fetch;

    await callDomain(deps(fetchImpl), {
      path: "/api/journal",
      accessToken: "the-token",
      locale: "lt",
    });

    const headers = seen?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer the-token");
    expect(headers["Accept-Language"]).toBe("lt");
    // No cookie is ever synthesised. The web transport is not imitated.
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
      "cookie",
    );
  });

  it("without a token it refuses locally rather than asking anonymously", async () => {
    // An anonymous request would succeed with an empty body under RLS, and an
    // empty body is indistinguishable from "this person has recorded nothing".
    const fetchSpy = vi.fn();
    const result = await callDomain(
      deps(fetchSpy as unknown as typeof fetch),
      { path: "/api/journal", accessToken: null },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok === false && result.failure.kind).toBe("not_authenticated");
  });

  it("keeps the server's four refusals apart", async () => {
    const cases = [
      { status: 401, body: { reason: "no_credentials" }, expected: "no_credentials" },
      { status: 401, body: { reason: "invalid_token" }, expected: "invalid_token" },
      { status: 403, body: { reason: "no_profile" }, expected: "no_profile" },
      {
        status: 503,
        body: { reason: "identity_unavailable" },
        expected: "identity_unavailable",
      },
    ] as const;
    for (const c of cases) {
      const fetchImpl = (async () => jsonResponse(c.status, c.body)) as unknown as typeof fetch;
      const result = await callDomain(deps(fetchImpl), {
        path: "/api/journal",
        accessToken: "t",
      });
      expect(result.ok === false && result.failure).toEqual({
        kind: "refused",
        reason: c.expected,
        status: c.status,
      });
    }
  });

  it("a 503 with no named reason is 'we could not check', never 'you may not'", async () => {
    const fetchImpl = (async () => jsonResponse(503, {})) as unknown as typeof fetch;
    const result = await callDomain(deps(fetchImpl), {
      path: "/api/journal",
      accessToken: "t",
    });
    expect(
      result.ok === false && result.failure.kind === "refused" && result.failure.reason,
    ).toBe("identity_unavailable");
  });

  it("an unrecognised error status is unreadable, not invented into a refusal", async () => {
    const fetchImpl = (async () => jsonResponse(500, { oops: true })) as unknown as typeof fetch;
    const result = await callDomain(deps(fetchImpl), {
      path: "/api/journal",
      accessToken: "t",
    });
    expect(result.ok === false && result.failure).toEqual({
      kind: "unreadable",
      status: 500,
    });
  });

  it("a network failure is unreachable — it asserts nothing about the user", async () => {
    const fetchImpl = (async () => {
      throw new Error("Network request failed");
    }) as unknown as typeof fetch;
    const result = await callDomain(deps(fetchImpl), {
      path: "/api/journal",
      accessToken: "t",
    });
    expect(result.ok === false && result.failure.kind).toBe("unreachable");
  });

  it("returns the payload on success", async () => {
    const fetchImpl = (async () => jsonResponse(200, { entries: [1, 2] })) as unknown as typeof fetch;
    const result = await callDomain<{ entries: number[] }>(deps(fetchImpl), {
      path: "/api/journal",
      accessToken: "t",
    });
    expect(result).toEqual({ ok: true, data: { entries: [1, 2] } });
  });
});

describe("every failure has a distinct message key", () => {
  it("no two failures collapse into the same sentence", () => {
    const keys = [
      failureMessageKey({ kind: "transport_unavailable", because: "x" }),
      failureMessageKey({ kind: "not_authenticated" }),
      failureMessageKey({ kind: "refused", reason: "no_profile", status: 403 }),
      failureMessageKey({ kind: "refused", reason: "invalid_token", status: 401 }),
      failureMessageKey({ kind: "unreachable", detail: "x" }),
      failureMessageKey({ kind: "unreadable", status: 500 }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
