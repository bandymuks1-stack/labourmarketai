import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Auth middleware behaviour guard.
 *
 * Locks in the session-reliability contract the login P0 fix introduced:
 *   - a logged-in user's session is REFRESHED on every navigation (not only on
 *     /dashboard), so an access token can't silently expire while browsing
 *     public pages and bounce the user back to login;
 *   - anonymous public traffic never triggers a Supabase round-trip;
 *   - protected routes still gate unauthenticated users to /auth/login with a
 *     safe `next`;
 *   - middleware does NOT read the profiles row (P0 interaction-latency
 *     audit): the not-yet-onboarded → /onboarding bounce is the dashboard
 *     layout's job (it already reads the profile for the auth shell), so the
 *     middleware never adds a second Supabase round-trip per navigation.
 */

const getUserMock = vi.fn();
const fromSingleMock = vi.fn();

// next-intl middleware → a passthrough that returns NextResponse.next() (no
// locale redirect) so we exercise the session/auth branch directly.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
    from: () => ({
      select: () => ({
        eq: () => ({ single: fromSingleMock }),
      }),
    }),
  }),
}));

import { middleware } from "@/middleware";

const AUTH_COOKIE = "sb-example-auth-token";

function req(path: string, opts?: { authed?: boolean }): NextRequest {
  const r = new NextRequest(`https://app.labourmarket.ai${path}`);
  if (opts?.authed) r.cookies.set(AUTH_COOKIE, "token-value");
  return r;
}

beforeEach(() => {
  getUserMock.mockReset();
  fromSingleMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: null } });
  fromSingleMock.mockResolvedValue({ data: { onboarded_at: "2026-01-01" } });
});

describe("anonymous traffic", () => {
  it("does NOT hit Supabase on a public route with no auth cookie", async () => {
    const res = await middleware(req("/lt"));
    expect(getUserMock).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects an unauthenticated user off a protected route to login", async () => {
    const res = await middleware(req("/lt/dashboard"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/lt/auth/login");
    expect(loc).toContain("next=%2Flt%2Fdashboard");
  });

  it("protects market-map + communication too", async () => {
    for (const p of ["/lt/dashboard/market-map", "/lt/dashboard/communication"]) {
      const res = await middleware(req(p));
      expect(res.headers.get("location"), p).toContain("/lt/auth/login");
    }
  });
});

describe("logged-in session refresh", () => {
  it("refreshes the session on a PUBLIC route when an auth cookie is present", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await middleware(req("/lt", { authed: true }));
    // The whole point: session refresh runs app-wide, not only on /dashboard.
    expect(getUserMock).toHaveBeenCalledTimes(1);
    // Public route is never gated.
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets an authed user through to the dashboard", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await middleware(req("/lt/dashboard", { authed: true }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("never reads the profiles row (onboarding gating is the layout's job)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    for (const p of ["/lt/dashboard", "/lt/dashboard/journal", "/lt/onboarding"]) {
      await middleware(req(p, { authed: true }));
    }
    // One getUser (session refresh) per navigation, ZERO profile reads —
    // the extra per-navigation Supabase round-trip is what the P0 latency
    // audit removed. The dashboard layout owns the onboarded_at bounce.
    expect(fromSingleMock).not.toHaveBeenCalled();
  });

  it("does not gate /onboarding itself", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await middleware(req("/lt/onboarding", { authed: true }));
    expect(res.headers.get("location")).toBeNull();
    expect(fromSingleMock).not.toHaveBeenCalled();
  });
});
