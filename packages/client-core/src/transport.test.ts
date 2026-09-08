import { describe, expect, it, vi } from "vitest";

import {
  CAPABILITY_PATH,
  DOMAIN_TRANSPORT_STATUS,
  callCapability,
  callDomain,
  failureMessageKey,
  type TransportStatus,
} from "./transport";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const deps = (fetchImpl: typeof fetch) => ({
  apiBaseUrl: "https://labourmarket.ai",
  fetch: fetchImpl,
});

describe("the gate is open, and the closed path still refuses honestly", () => {
  it("ships open — the bearer seam (#1331) merged and /api/mcp serves the domain", () => {
    expect(DOMAIN_TRANSPORT_STATUS.open).toBe(true);
  });

  it("an injected closed status refuses locally and never touches the network", async () => {
    // The closed variant stays real: a build that must refuse (broken config,
    // incident switch) says so in words rather than improvising a query.
    const closed: TransportStatus = { open: false, because: "incident switch" };
    const fetchSpy = vi.fn();
    const result = await callDomain(
      { ...deps(fetchSpy as unknown as typeof fetch), status: closed },
      { path: "/api/journal", accessToken: "a-real-token" },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure).toEqual({
      kind: "transport_unavailable",
      because: "incident switch",
    });
  });
});

describe("callDomain over the open gate", () => {
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

  it("maps the bare statuses /api/mcp actually sends — the body carries no reason", async () => {
    // The boundary is deliberately anti-oracle: `{ ok: false }` and a status.
    const cases = [
      { status: 401, expected: "no_credentials" },
      // 403 is an AUTHORIZATION refusal. It used to mistranslate into
      // "no_profile" — a fabricated finding about the person's account.
      { status: 403, expected: "not_authorized" },
      // 429 is a brake, not a verdict — back off, keep the credentials.
      { status: 429, expected: "rate_limited" },
      { status: 503, expected: "identity_unavailable" },
    ] as const;
    for (const c of cases) {
      const fetchImpl = (async () => jsonResponse(c.status, { ok: false })) as unknown as typeof fetch;
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

  it("a named body reason still wins over the status mapping", async () => {
    const fetchImpl = (async () => jsonResponse(401, { reason: "invalid_token" })) as unknown as typeof fetch;
    const result = await callDomain(deps(fetchImpl), {
      path: "/api/journal",
      accessToken: "t",
    });
    expect(
      result.ok === false && result.failure.kind === "refused" && result.failure.reason,
    ).toBe("invalid_token");
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

describe("callCapability speaks JSON-RPC to /api/mcp", () => {
  const rpcSuccess = (payload: unknown, isError = false) => ({
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
      isError,
    },
  });

  it("frames a tools/call with the underscored tool name and the arguments", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse(200, rpcSuccess({ ok: true, data: {} }));
    }) as unknown as typeof fetch;

    await callCapability(deps(fetchImpl), {
      name: "living_cv.skills.get",
      args: { limit: 5 },
      accessToken: "t",
      locale: "lt",
    });

    expect(seenUrl).toBe("https://labourmarket.ai" + CAPABILITY_PATH);
    expect(seenInit?.method).toBe("POST");
    const body = JSON.parse(String(seenInit?.body));
    expect(body.jsonrpc).toBe("2.0");
    expect(typeof body.id).toBe("number");
    expect(body.method).toBe("tools/call");
    // Dots become underscores HERE, so no screen ever spells a wire name.
    expect(body.params).toEqual({
      name: "living_cv_skills_get",
      arguments: { limit: 5 },
    });
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers["Accept-Language"]).toBe("lt");
  });

  it("unwraps structuredContent and returns the capability's data on success", async () => {
    const payload = { ok: true, data: { profile: { id: "p1" } } };
    const fetchImpl = (async () => jsonResponse(200, rpcSuccess(payload))) as unknown as typeof fetch;
    const result = await callCapability<{ profile: { id: string } }>(
      deps(fetchImpl),
      { name: "profile.get", accessToken: "t" },
    );
    expect(result).toEqual({ ok: true, data: { profile: { id: "p1" } } });
  });

  it("falls back to the first content block when structuredContent is absent", async () => {
    const payload = { ok: true, data: { entries: [] } };
    const fetchImpl = (async () =>
      jsonResponse(200, {
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          isError: false,
        },
      })) as unknown as typeof fetch;
    const result = await callCapability(deps(fetchImpl), {
      name: "journal.list",
      accessToken: "t",
    });
    expect(result).toEqual({ ok: true, data: { entries: [] } });
  });

  it("isError inside a 200 is a capability_refused failure — NEVER ok", async () => {
    const payload = {
      ok: false,
      code: "no_worker_profile",
      message: "This account has no worker profile, so it has no Work Journal.",
    };
    const fetchImpl = (async () => jsonResponse(200, rpcSuccess(payload, true))) as unknown as typeof fetch;
    const result = await callCapability(deps(fetchImpl), {
      name: "journal.list",
      accessToken: "t",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure).toEqual({
      kind: "capability_refused",
      code: "no_worker_profile",
      message: "This account has no worker profile, so it has no Work Journal.",
    });
  });

  it("an ok:false payload is a refusal even if the server forgot the isError flag", async () => {
    const payload = { ok: false, code: "unavailable", message: "Read failed." };
    const fetchImpl = (async () => jsonResponse(200, rpcSuccess(payload, false))) as unknown as typeof fetch;
    const result = await callCapability(deps(fetchImpl), {
      name: "profile.get",
      accessToken: "t",
    });
    expect(result.ok === false && result.failure.kind).toBe("capability_refused");
  });

  it("a JSON-RPC error object is a refusal carrying the server's words", async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: 'Unknown tool "nope".' },
      })) as unknown as typeof fetch;
    const result = await callCapability(deps(fetchImpl), {
      name: "nope",
      accessToken: "t",
    });
    expect(result.ok === false && result.failure).toEqual({
      kind: "capability_refused",
      code: "rpc_error",
      message: 'Unknown tool "nope".',
    });
  });

  it("a 202 with an empty body is a failure, not a silent success", async () => {
    // 202-empty acknowledges a NOTIFICATION; a call that expected an answer
    // did not get one, and pretending otherwise would render invented data.
    const fetchImpl = (async () => new Response(null, { status: 202 })) as unknown as typeof fetch;
    const result = await callCapability(deps(fetchImpl), {
      name: "profile.get",
      accessToken: "t",
    });
    expect(result.ok === false && result.failure).toEqual({
      kind: "unreadable",
      status: 202,
    });
  });

  it("keeps callDomain's identity-refusal mapping for the HTTP statuses", async () => {
    for (const { status, expected } of [
      { status: 429, expected: "rate_limited" },
      { status: 403, expected: "not_authorized" },
    ] as const) {
      const fetchImpl = (async () => jsonResponse(status, { ok: false })) as unknown as typeof fetch;
      const result = await callCapability(deps(fetchImpl), {
        name: "profile.get",
        accessToken: "t",
      });
      expect(
        result.ok === false &&
          result.failure.kind === "refused" &&
          result.failure.reason,
      ).toBe(expected);
    }
  });

  it("without a token it refuses locally rather than asking anonymously", async () => {
    const fetchSpy = vi.fn();
    const result = await callCapability(
      deps(fetchSpy as unknown as typeof fetch),
      { name: "profile.get", accessToken: null },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok === false && result.failure.kind).toBe("not_authenticated");
  });
});

describe("every failure has a distinct message key", () => {
  it("no two failures collapse into the same sentence", () => {
    const keys = [
      failureMessageKey({ kind: "transport_unavailable", because: "x" }),
      failureMessageKey({ kind: "not_authenticated" }),
      failureMessageKey({ kind: "refused", reason: "no_profile", status: 403 }),
      failureMessageKey({ kind: "refused", reason: "invalid_token", status: 401 }),
      failureMessageKey({ kind: "refused", reason: "not_authorized", status: 403 }),
      failureMessageKey({ kind: "refused", reason: "rate_limited", status: 429 }),
      failureMessageKey({
        kind: "capability_refused",
        code: "unavailable",
        message: "x",
      }),
      failureMessageKey({ kind: "unreachable", detail: "x" }),
      failureMessageKey({ kind: "unreadable", status: 500 }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
