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
  const r = new NextRequest(`https://labourmarket.ai${path}`);
  if (opts?.authed) r.cookies.set(AUTH_COOKIE, "token-value");
  return r;
}

beforeEach(() => {
  getUserMock.mockReset();
  fromSingleMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: null } });
  fromSingleMock.mockResolvedValue({ data: { onboarded_at: "2026-01-01" } });
});

describe("legacy host aliases (single-domain policy 2026-07-19)", () => {
  it("308s www + app hosts to the apex before any auth/session work", async () => {
    for (const host of ["www.labourmarket.ai", "app.labourmarket.ai"]) {
      const r = new NextRequest(`https://${host}/lt/dashboard?x=1`, {
        headers: { host },
      });
      const res = await middleware(r);
      expect(res.status, host).toBe(308);
      expect(res.headers.get("location"), host).toBe(
        "https://labourmarket.ai/lt/dashboard?x=1",
      );
      // Host redirect short-circuits: no Supabase call on legacy hosts.
      expect(getUserMock).not.toHaveBeenCalled();
    }
  });

  it("never redirects the apex itself (no loop)", async () => {
    const res = await middleware(req("/lt"));
    expect(res.status).not.toBe(308);
  });
});

describe("stray OAuth code forwarding (Site-URL fallback safety net)", () => {
  const CODE = "6f2d71e2-9b5a-4a01-8b8c-2f4f2b9a7d10";

  it("forwards a UUID code on the root to the default-locale callback", async () => {
    const res = await middleware(req(`/?code=${CODE}`));
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/lt/auth/callback");
    expect(loc).toContain(`code=${CODE}`);
  });

  it("forwards a UUID code on a bare locale path to that locale's callback", async () => {
    const res = await middleware(req(`/en?code=${CODE}`));
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/en/auth/callback");
    expect(loc).toContain(`code=${CODE}`);
  });

  it("ignores non-UUID codes (marketing/promo params stay untouched)", async () => {
    const res = await middleware(req("/lt?code=SUMMER24"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("ignores UUID codes on deeper paths (only the Site-URL root fallback)", async () => {
    const res = await middleware(req(`/lt/pricing?code=${CODE}`));
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not intercept the real callback route", async () => {
    const res = await middleware(req(`/lt/auth/callback?code=${CODE}`));
    expect(res.headers.get("location")).toBeNull();
  });
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
