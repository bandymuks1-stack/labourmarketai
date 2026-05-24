import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behaviour tests for the logout route handler.
 *
 * The fix locks two invariants:
 *   1. Logout must redirect with HTTP **303 See Other** so that a POST
 *      from the AccountMenu sign-out form is followed by the browser
 *      as a GET on /[locale]/auth/login. With the prior default of 307
 *      the browser preserved POST and Vercel responded
 *      `405 INVALID_REQUEST_METHOD`.
 *   2. Logout must call only `supabase.auth.signOut()` — no profile /
 *      role / skill / company / draft mutation.
 */

const signOutMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signOut: signOutMock },
  })),
}));

import {
  GET,
  POST,
} from "@/app/[locale]/auth/logout/route";

const ORIGIN = "https://app.labourmarket.ai";

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue({ error: null });
});

describe("auth/logout route — 303 redirect to localized login", () => {
  it("POST /lt/auth/logout returns 303 with Location /lt/auth/login", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/lt/auth/logout`, { method: "POST" }),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    expect(res.status).toBe(303);
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(308);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/lt/auth/login`);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("POST /en/auth/logout returns 303 with Location /en/auth/login", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/en/auth/logout`, { method: "POST" }),
      { params: Promise.resolve({ locale: "en" }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/en/auth/login`);
  });

  it("GET /lt/auth/logout returns 303 too (direct-link path)", async () => {
    const res = await GET(
      new Request(`${ORIGIN}/lt/auth/logout`),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/lt/auth/login`);
  });

  it("still redirects (and does not crash) if signOut throws", async () => {
    signOutMock.mockRejectedValue(new Error("network down"));
    const res = await POST(
      new Request(`${ORIGIN}/lt/auth/logout`, { method: "POST" }),
      { params: Promise.resolve({ locale: "lt" }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/lt/auth/login`);
  });
});

describe("auth/logout route — no data mutation", () => {
  it("only calls supabase.auth.signOut, never .from(...) / .rpc(...) / .delete(...)", async () => {
    // The createClient mock exposes ONLY .auth.signOut. Any attempt to
    // read `.from` or `.rpc` would throw a TypeError. The assertions in
    // the redirect tests above already prove the route completes with
    // only signOut. This test reinforces by reading the route source.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const route = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "app",
        "[locale]",
        "auth",
        "logout",
        "route.ts",
      ),
      "utf8",
    );
    expect(route).toMatch(/supabase\.auth\.signOut\(\)/);
    for (const banned of [
      ".delete(",
      ".rpc(",
      ".upsert(",
      ".insert(",
      'from("profiles")',
      "from('profiles')",
      "deleteUser",
    ]) {
      expect(route, `logout must not contain '${banned}'`).not.toContain(
        banned,
      );
    }
  });
});
