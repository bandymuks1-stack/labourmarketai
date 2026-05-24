import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the server Supabase factory so the route handler can run in node
// without next/headers. The test controls what `exchangeCodeForSession`
// returns to exercise each branch.
const exchangeMock = vi.fn();
const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeMock,
      getUser: getUserMock,
    },
    from: fromMock,
  })),
}));

import { GET } from "@/app/[locale]/auth/callback/route";

const ORIGIN = "https://labourmarket.ai";

function buildRequest(qs: string): Request {
  return new Request(`${ORIGIN}/lt/auth/callback?${qs}`);
}

beforeEach(() => {
  exchangeMock.mockReset();
  getUserMock.mockReset();
  fromMock.mockReset();
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
});
