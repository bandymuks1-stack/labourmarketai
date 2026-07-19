import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Behaviour tests for POST /api/auth/google (first-party Google
 * ID-token sign-in). Google's tokeninfo endpoint and the Supabase SSR
 * client are mocked; the invariants locked here:
 *   - cross-origin / missing-Origin POSTs are refused (CSRF);
 *   - malformed bodies are refused before any network call;
 *   - claim failures (audience/nonce) return 401 and never reach
 *     Supabase;
 *   - a valid credential performs signInWithIdToken WITH the nonce and
 *     routes onboarded users to the sanitised next, new users to
 *     onboarding;
 *   - repeated hammering from one IP is rate limited.
 */

const signInWithIdTokenMock = vi.fn();
const profileSingleMock = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: "313295493545-test.apps.googleusercontent.com",
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithIdToken: signInWithIdTokenMock },
    from: () => ({
      select: () => ({ eq: () => ({ single: profileSingleMock }) }),
    }),
  })),
}));

import { POST } from "@/app/api/auth/google/route";

const ORIGIN = "https://labourmarket.ai";
const CLIENT_ID = "313295493545-test.apps.googleusercontent.com";
const NONCE = "c".repeat(32);
const JWT = `${"h".repeat(24)}.${"p".repeat(24)}.${"s".repeat(24)}`;

let ipCounter = 0;

function makeReq(opts: {
  body?: unknown;
  origin?: string | null;
  ip?: string;
  locale?: string;
}): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? `10.0.0.${++ipCounter}`,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  return new NextRequest(
    `${ORIGIN}/api/auth/google?locale=${opts.locale ?? "lt"}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(
        opts.body ?? { credential: JWT, nonce: NONCE, next: null },
      ),
    },
  );
}

function mockTokeninfo(claims: Record<string, unknown> | null, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: ok && claims !== null,
      json: async () => claims ?? {},
    })),
  );
}

const GOOD_CLAIMS = {
  aud: CLIENT_ID,
  iss: "https://accounts.google.com",
  exp: String(Math.floor(Date.now() / 1000) + 300),
  nonce: NONCE,
  sub: "google-user-1",
};

beforeEach(() => {
  signInWithIdTokenMock.mockReset();
  profileSingleMock.mockReset();
  signInWithIdTokenMock.mockResolvedValue({
    data: { user: { id: "u1" } },
    error: null,
  });
  profileSingleMock.mockResolvedValue({ data: { onboarded_at: "2026-01-01" } });
  mockTokeninfo(GOOD_CLAIMS);
});

describe("origin gate (CSRF)", () => {
  it("refuses a cross-site origin", async () => {
    const res = await POST(makeReq({ origin: "https://evil.example.com" }));
    expect(res.status).toBe(403);
    expect(signInWithIdTokenMock).not.toHaveBeenCalled();
  });

  it("refuses a missing Origin header", async () => {
    const res = await POST(makeReq({ origin: null }));
    expect(res.status).toBe(403);
  });
});

describe("body validation", () => {
  it("refuses a malformed credential before any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(
      makeReq({ body: { credential: "garbage", nonce: NONCE } }),
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(signInWithIdTokenMock).not.toHaveBeenCalled();
  });
});

describe("claim validation", () => {
  it("401s on audience mismatch and never reaches Supabase", async () => {
    mockTokeninfo({ ...GOOD_CLAIMS, aud: "other.apps.googleusercontent.com" });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("audience_mismatch");
    expect(signInWithIdTokenMock).not.toHaveBeenCalled();
  });

  it("401s on nonce mismatch (replay)", async () => {
    mockTokeninfo({ ...GOOD_CLAIMS, nonce: "d".repeat(32) });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("nonce_mismatch");
  });

  it("401s when tokeninfo rejects the token outright", async () => {
    mockTokeninfo(null, false);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_token");
  });
});

describe("successful exchange", () => {
  it("passes the nonce to signInWithIdToken and routes onboarded users", async () => {
    const res = await POST(
      makeReq({ body: { credential: JWT, nonce: NONCE, next: "/lt/dashboard/journal" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, next: "/lt/dashboard/journal" });
    expect(signInWithIdTokenMock).toHaveBeenCalledWith({
      provider: "google",
      token: JWT,
      nonce: NONCE,
    });
  });

  it("routes a not-yet-onboarded user to onboarding (locale preserved)", async () => {
    profileSingleMock.mockResolvedValue({ data: { onboarded_at: null } });
    const res = await POST(makeReq({ locale: "en" }));
    expect((await res.json()).next).toBe("/en/onboarding");
  });

  it("sanitises a hostile next path", async () => {
    const res = await POST(
      makeReq({ body: { credential: JWT, nonce: NONCE, next: "https://evil.example.com" } }),
    );
    expect((await res.json()).next).toBe("/lt/dashboard");
  });

  it("401s when the Supabase exchange fails", async () => {
    signInWithIdTokenMock.mockResolvedValue({
      data: null,
      error: { code: "bad_id_token", status: 400, name: "AuthApiError", message: "x" },
    });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("exchange_failed");
  });
});

describe("rate limiting", () => {
  it("429s after repeated attempts from one IP", async () => {
    const ip = "203.0.113.77";
    let last: Response | null = null;
    for (let i = 0; i < 25; i++) {
      last = await POST(makeReq({ ip }));
    }
    expect(last!.status).toBe(429);
  });
});
