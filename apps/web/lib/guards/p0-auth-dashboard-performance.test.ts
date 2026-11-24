import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

/**
 * P0 auth/dashboard performance guard (task
 * p0-performance-journal-cv-repair-v1, Track A).
 *
 * Production evidence (2026-07-19): ~30 Supabase REST calls and 3-4
 * sequential batch stages per authenticated navigation → 1.3-1.7 s server
 * TTFB; plus a 400-ing worker_skills query (nonexistent name columns) and
 * two 404-ing draft-migration tables re-queried on EVERY navigation; plus
 * a redundant middleware GoTrue validation per navigation.
 *
 * This suite pins each structural fix so the regressions cannot creep back.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

describe("middleware JWT-freshness fast path", () => {
  const mw = read("middleware.ts");

  it("has the cookie-parsed freshness check and uses it before the network refresh", () => {
    expect(mw).toMatch(/readAccessTokenExpSeconds/);
    expect(mw).toMatch(/hasFreshAccessToken\(request\)/);
    // Skip happens BEFORE createServerClient in the source order.
    expect(mw.indexOf("hasFreshAccessToken(request)")).toBeLessThan(
      mw.indexOf("createServerClient("),
    );
  });

  it("emits non-secret Server-Timing on both paths", () => {
    expect(mw).toMatch(/Server-Timing[\s\S]{0,60}jwt-fresh/);
    expect(mw).toMatch(/Server-Timing[\s\S]{0,120}desc=refresh/);
  });
});

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

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
  createServerClient: () => ({ auth: { getUser: getUserMock } }),
}));

describe("middleware fast-path behaviour", () => {
  function jwtWithExp(expSeconds: number): string {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "HS256" })}.${b64({ exp: expSeconds })}.sig`;
  }

  function sessionCookie(expSeconds: number): string {
    const session = { access_token: jwtWithExp(expSeconds), refresh_token: "r" };
    return `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  }

  beforeEach(() => {
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
  });

  it("fresh token → NO GoTrue round-trip on an authed navigation", async () => {
    const { middleware } = await import("@/middleware");
    const r = new NextRequest("https://labourmarket.ai/lt/dashboard", {
      headers: { host: "labourmarket.ai" },
    });
    r.cookies.set(
      "sb-example-auth-token",
      sessionCookie(Math.floor(Date.now() / 1000) + 3600),
    );
    const res = await middleware(r);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(res.headers.get("Server-Timing")).toContain("jwt-fresh");
  });

  it("stale token → full validation path still runs (rotation preserved)", async () => {
    const { middleware } = await import("@/middleware");
    const r = new NextRequest("https://labourmarket.ai/lt/dashboard", {
      headers: { host: "labourmarket.ai" },
    });
    r.cookies.set(
      "sb-example-auth-token",
      sessionCookie(Math.floor(Date.now() / 1000) + 30),
    );
    await middleware(r);
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it("unparseable cookie → full validation path (safe default)", async () => {
    const { middleware } = await import("@/middleware");
    const r = new NextRequest("https://labourmarket.ai/lt/dashboard", {
      headers: { host: "labourmarket.ai" },
    });
    r.cookies.set("sb-example-auth-token", "not-a-session");
    await middleware(r);
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });
});

describe("dashboard layout — single parallel stage", () => {
  const layout = read("app/[locale]/dashboard/layout.tsx");

  it("getUser fires inside the batch, never as a serial pre-await", () => {
    expect(layout).toMatch(/const userPromise = supabase\.auth\.getUser\(\)/);
    expect(layout).not.toMatch(/=\s*await supabase\.auth\.getUser\(\)/);
  });

  it("logs non-secret layout timing for Vercel observability", () => {
    expect(layout).toMatch(/\[perf\] dashboard-layout/);
  });
});

describe("dead per-navigation queries stay dead", () => {
  it("player-card never selects nonexistent skills name columns (was a 400 every nav)", () => {
    const pc = read("lib/player-card/player-card.ts");
    expect(pc).not.toMatch(/name_lt|name_en/);
  });

  it("absent seen-store is memoized per process (was a 404 every nav)", () => {
    const seen = read("lib/opportunities/seen.ts");
    expect(seen).toMatch(/seenStoreAbsent/);
    expect(seen).toMatch(/if \(seenStoreAbsent\) return/);
  });

  it("absent journal-templates registry is memoized per process (was a 404 every nav)", () => {
    const jt = read("lib/journal/journal-templates.ts");
    expect(jt).toMatch(/templatesStoreAbsent/);
    expect(jt).toMatch(/if \(templatesStoreAbsent\) return \[\]/);
  });
});

describe("request-cached worker core readers", () => {
  it("the canonical readers module exists and is React-cached", () => {
    const core = read("lib/data/worker-core.ts");
    expect(core).toMatch(/from "react"/);
    expect(core).toMatch(/cache\(/);
    expect(core).toMatch(/getWorkerCoreRow/);
    expect(core).toMatch(/getWorkerSkillRows/);
  });

  it("hot per-navigation consumers read through the cached core", () => {
    // W3 Package 4 deleted the premium hub (second dashboard), so its data
    // loader left this list; the surviving hot readers stay pinned.
    for (const rel of [
      "lib/opportunities/recommendations-model.ts",
      "lib/player-card/player-card.ts",
    ]) {
      expect(read(rel), rel).toMatch(/@\/lib\/data\/worker-core/);
    }
  });

  it("Living CV has its own loading boundary", () => {
    expect(read("app/[locale]/cv/loading.tsx")).toMatch(/cv-loading/);
  });
});
