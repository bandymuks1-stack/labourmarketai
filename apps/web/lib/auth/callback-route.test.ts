import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the server Supabase factory so the route handler can run in node
// without next/headers. The test controls what `exchangeCodeForSession`
// returns to exercise each branch.
const exchangeMock = vi.fn();
const verifyOtpMock = vi.fn();
const getUserMock = vi.fn();
const getSessionMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeMock,
      verifyOtp: verifyOtpMock,
      getUser: getUserMock,
      getSession: getSessionMock,
    },
    from: fromMock,
  })),
}));

// The route reads the NEXT_LOCALE cookie (V8 W4-B item 2) via next/headers,
// which throws outside a request scope. Tests control the jar per case.
const cookieGetMock = vi.fn<(name: string) => { value: string } | undefined>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}));

import { GET } from "@/app/[locale]/auth/callback/route";

const ORIGIN = "https://labourmarket.ai";

function buildRequest(qs: string): Request {
  return new Request(`${ORIGIN}/lt/auth/callback?${qs}`);
}

beforeEach(() => {
  exchangeMock.mockReset();
  verifyOtpMock.mockReset();
  getUserMock.mockReset();
  getSessionMock.mockReset();
  fromMock.mockReset();
  cookieGetMock.mockReset();
  // Default: no fallback session unless a specific test opts in. This
  // keeps the existing error-path assertions valid after the PKCE-race
  // fallback was added (failed exchange + no session → exchange_failed).
  getSessionMock.mockResolvedValue({ data: { session: null } });
  // Default: no NEXT_LOCALE cookie on the device.
  cookieGetMock.mockReturnValue(undefined);
});

const HASH = "pkce_f94d2f53feea6de6a2a59e2b62b4c83d1e7044674ab049b75754c0a7";

function profile(onboardedAt: string | null) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { onboarded_at: onboardedAt } }),
      }),
    }),
  });
}

/** Train A slice 1 (2026-09-02): e-mail confirmation on any device + resume
 *  of a pending destination through the inbox round trip. */
describe("auth/callback route — e-mail confirmation", () => {
  it("verifies a token_hash itself (no PKCE code involved) and lands a new user on onboarding with next", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u-new" } } });
    profile(null);

    const next = "/lt/oauth/consent?authorization_id=abc123";
    const res = await GET(
      buildRequest(`token_hash=${HASH}&type=signup&next=${encodeURIComponent(next)}`),
      { params: Promise.resolve({ locale: "lt" }) },
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: HASH, type: "signup" });
    expect(exchangeMock).not.toHaveBeenCalled();
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/onboarding");
    expect(loc).toContain(`next=${encodeURIComponent(next)}`);
    expect(loc).not.toContain(HASH);
  });

  it("an expired / used / garbage token_hash → login?error=link_expired, never a leaked hash", async () => {
    verifyOtpMock.mockResolvedValue({
      error: { name: "AuthApiError", code: "otp_expired", status: 403, message: "Token has expired or is invalid" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      buildRequest(`token_hash=${HASH}&type=signup&next=%2Flt%2Fdashboard`),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/auth/login");
    expect(loc).toContain("error=link_expired");
    expect(loc).toContain("next=%2Flt%2Fdashboard");
    expect(loc).not.toContain(HASH);
    const [, payload] = errorSpy.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ locale: "lt", trace: null, code: "otp_expired" });
    expect(JSON.stringify(payload)).not.toContain(HASH);
    errorSpy.mockRestore();
  });

  it("an unknown otp type is not a verification: falls through to missing_code", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(buildRequest(`token_hash=${HASH}&type=sms`), {
      params: Promise.resolve({ locale: "lt" }),
    });
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(res.headers.get("location") ?? "").toContain("error=missing_code");
    errorSpy.mockRestore();
  });

  it("GoTrue's expired-link redirect (access_denied + otp_expired) is link_expired, a bare access_denied stays cancelled", async () => {
    const expired = await GET(
      buildRequest("error=access_denied&error_code=otp_expired&next=%2Flt%2Fdashboard"),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    expect(expired.headers.get("location") ?? "").toContain("error=link_expired");

    const cancelled = await GET(buildRequest("error=access_denied"), {
      params: Promise.resolve({ locale: "lt" }),
    });
    expect(cancelled.headers.get("location") ?? "").toContain("error=cancelled");
  });

  it("a confirmation link opened on ANOTHER device (no PKCE verifier) → confirmed_sign_in, not a fault", async () => {
    exchangeMock.mockResolvedValue({
      error: { name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage", status: 500 },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      buildRequest("code=X&flow=email_confirm&next=%2Flt%2Fdashboard%2Fjournal"),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/auth/login");
    expect(loc).toContain("error=confirmed_sign_in");
    expect(loc).toContain("next=%2Flt%2Fdashboard%2Fjournal");
    errorSpy.mockRestore();
  });

  it("the same verifier failure on a Google return stays exchange_failed", async () => {
    exchangeMock.mockResolvedValue({
      error: { name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage", status: 500 },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(buildRequest("code=X"), {
      params: Promise.resolve({ locale: "lt" }),
    });
    expect(res.headers.get("location") ?? "").toContain("error=exchange_failed");
    errorSpy.mockRestore();
  });

  it("lifts locale + next from a same-origin rt hint (token_hash template), ignores a foreign one", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    profile("2025-01-01T00:00:00Z");

    const rt = `${ORIGIN}/en/auth/callback?flow=email_confirm&next=%2Fen%2Fdashboard%2Fjournal`;
    const res = await GET(
      buildRequest(`token_hash=${HASH}&type=signup&rt=${encodeURIComponent(rt)}`),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/en/dashboard/journal`);

    const foreign = `https://evil.example/en/auth/callback?next=%2Fen%2Fdashboard%2Fjournal`;
    const res2 = await GET(
      buildRequest(`token_hash=${HASH}&type=signup&rt=${encodeURIComponent(foreign)}`),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    expect(res2.headers.get("location")).toBe(`${ORIGIN}/lt/dashboard`);
  });
});

describe("auth/callback route", () => {
  it("redirects to localized login with error=missing_code when no ?code", async () => {
    const res = await GET(buildRequest("next=%2Flt%2Fdashboard"), {
      params: Promise.resolve({ locale: "lt" }),
    });
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/auth/login");
    expect(loc).toContain("error=missing_code");
    expect(loc).toContain("next=%2Flt%2Fdashboard");
  });

  it("redirects to localized login with error=exchange_failed on Supabase error", async () => {
    exchangeMock.mockResolvedValue({
      error: {
        name: "AuthApiError",
        code: "invalid_grant",
        status: 400,
        message: "invalid request: code already used",
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      buildRequest("code=AUTHCODE_ABC123&next=%2Flt%2Fdashboard"),
      { params: Promise.resolve({ locale: "lt" }) },
    );

    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/auth/login");
    expect(loc).toContain("error=exchange_failed");
    expect(loc).toContain("next=%2Flt%2Fdashboard");

    // No auth code, tokens, cookies, or full URL leaked into the redirect.
    expect(loc).not.toContain("AUTHCODE_ABC123");
    expect(loc).not.toMatch(/token|secret|cookie/i);

    // Diagnostic log was emitted with the Supabase error fields but not the
    // auth code itself.
    expect(errorSpy).toHaveBeenCalled();
    const [, payload] = errorSpy.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      locale: "lt",
      code: "invalid_grant",
      status: 400,
    });
    expect(JSON.stringify(payload)).not.toContain("AUTHCODE_ABC123");

    errorSpy.mockRestore();
  });

  it("preserves the en locale on the error redirect", async () => {
    exchangeMock.mockResolvedValue({
      error: {
        name: "AuthApiError",
        code: "invalid_grant",
        status: 400,
        message: "bad",
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      new Request(`${ORIGIN}/en/auth/callback?code=X&next=%2Fen%2Fdashboard`),
      { params: Promise.resolve({ locale: "en" }) },
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/en/auth/login");
    expect(loc).toContain("error=exchange_failed");
  });

  it("redirects to localized onboarding when profile.onboarded_at is null", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { onboarded_at: null } }),
        }),
      }),
    });

    const res = await GET(
      buildRequest("code=X&next=%2Flt%2Fdashboard%2Fjournal"),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/onboarding");
    expect(loc).toContain("next=%2Flt%2Fdashboard%2Fjournal");
  });

  it("redirects to the sanitized internal next on full success", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { onboarded_at: "2025-01-01T00:00:00Z" },
          }),
        }),
      }),
    });

    const res = await GET(
      buildRequest("code=X&next=%2Flt%2Fdashboard%2Fjournal"),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toBe(`${ORIGIN}/lt/dashboard/journal`);
  });

  it("rejects an external next on success and falls back to localized dashboard", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { onboarded_at: "2025-01-01T00:00:00Z" },
          }),
        }),
      }),
    });

    const res = await GET(
      buildRequest("code=X&next=https%3A%2F%2Fevil.example%2Fx"),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toBe(`${ORIGIN}/lt/dashboard`);
    expect(loc).not.toContain("evil.example");
  });

  // V8 W4-B item 2 — the account language on a fresh device.
  describe("account language preference (cookie > profile > URL)", () => {
    const profileWith = (locale: string | null) =>
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { onboarded_at: "2025-01-01T00:00:00Z", locale },
            }),
          }),
        }),
      });

    it("no cookie + differing profile locale → lands in the profile language and sets the cookie", async () => {
      exchangeMock.mockResolvedValue({ error: null });
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      profileWith("ru");

      const res = await GET(buildRequest("code=X"), {
        params: Promise.resolve({ locale: "lt" }),
      });
      expect(res.headers.get("location")).toBe(`${ORIGIN}/ru/dashboard`);
      expect(res.headers.get("set-cookie") ?? "").toContain("NEXT_LOCALE=ru");
    });

    it("an existing device cookie wins — no override, no cookie churn", async () => {
      exchangeMock.mockResolvedValue({ error: null });
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      cookieGetMock.mockReturnValue({ value: "lt" });
      profileWith("ru");

      const res = await GET(buildRequest("code=X"), {
        params: Promise.resolve({ locale: "lt" }),
      });
      expect(res.headers.get("location")).toBe(`${ORIGIN}/lt/dashboard`);
      expect(res.headers.get("set-cookie") ?? "").not.toContain("NEXT_LOCALE");
    });

    it("an inactive profile locale never overrides", async () => {
      exchangeMock.mockResolvedValue({ error: null });
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      profileWith("sv");

      const res = await GET(buildRequest("code=X"), {
        params: Promise.resolve({ locale: "lt" }),
      });
      expect(res.headers.get("location")).toBe(`${ORIGIN}/lt/dashboard`);
      expect(res.headers.get("set-cookie") ?? "").not.toContain("NEXT_LOCALE");
    });
  });

  it("logs unexpected exceptions and redirects with error=callback", async () => {
    exchangeMock.mockRejectedValue(new Error("boom: network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(buildRequest("code=X&next=%2Flt%2Fdashboard"), {
      params: Promise.resolve({ locale: "lt" }),
    });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/lt/auth/login");
    expect(loc).toContain("error=callback");
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  // PKCE-race fallback: a concurrent token_revoke / cookie overwrite
  // can make `exchangeCodeForSession` abort locally before /token even
  // though the SDK has already established a valid session. In that
  // case we proceed as if exchange succeeded, never strand the user on
  // ?error=exchange_failed.
  describe("PKCE-race fallback (failed exchange + valid getSession)", () => {
    it("proceeds to sanitized next when getSession returns a valid session", async () => {
      exchangeMock.mockResolvedValue({
        error: {
          name: "AuthApiError",
          code: "invalid_grant",
          status: 400,
          message: "race",
        },
      });
      getSessionMock.mockResolvedValue({
        data: {
          session: {
            access_token: "REDACTED_TEST_TOKEN",
            user: { id: "u1" },
          },
        },
      });
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      fromMock.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { onboarded_at: "2025-01-01T00:00:00Z" },
            }),
          }),
        }),
      });
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const res = await GET(
        buildRequest("code=AUTHCODE_RACE&next=%2Flt%2Fdashboard%2Fjournal"),
        { params: Promise.resolve({ locale: "lt" }) },
      );
      const loc = res.headers.get("location") ?? "";

      // Success path was honoured despite the exchange error.
      expect(loc).toBe(`${ORIGIN}/lt/dashboard/journal`);
      expect(loc).not.toContain("error=exchange_failed");

      // Diagnostic logs fired without leaking the auth code or token.
      expect(errorSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      const allLogged = JSON.stringify(
        errorSpy.mock.calls.concat(warnSpy.mock.calls),
      );
      expect(allLogged).not.toContain("AUTHCODE_RACE");
      expect(allLogged).not.toContain("REDACTED_TEST_TOKEN");

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("still redirects to exchange_failed when getSession also has no session", async () => {
      exchangeMock.mockResolvedValue({
        error: {
          name: "AuthApiError",
          code: "invalid_grant",
          status: 400,
          message: "no race recovery",
        },
      });
      getSessionMock.mockResolvedValue({ data: { session: null } });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await GET(
        buildRequest("code=X&next=%2Flt%2Fdashboard"),
        { params: Promise.resolve({ locale: "lt" }) },
      );
      const loc = res.headers.get("location") ?? "";
      expect(loc).toContain("/lt/auth/login");
      expect(loc).toContain("error=exchange_failed");
    });
  });
});
