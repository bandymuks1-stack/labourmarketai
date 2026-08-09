import { describe, expect, it } from "vitest";
import {
  buildReturnValue,
  getSafeReturnPath,
  isSafeReturnPath,
} from "./redirect";

describe("getSafeReturnPath", () => {
  it("falls back to /<locale>/dashboard on null / empty / missing input", () => {
    expect(getSafeReturnPath(null, "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath(undefined, "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("   ", "lt")).toBe("/lt/dashboard");
  });

  it("blocks open-redirect attempts (protocol + protocol-relative)", () => {
    expect(getSafeReturnPath("https://evil.example/x", "lt")).toBe(
      "/lt/dashboard",
    );
    expect(getSafeReturnPath("http://evil.example/x", "lt")).toBe(
      "/lt/dashboard",
    );
    expect(getSafeReturnPath("//evil.example/x", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("javascript:alert(1)", "lt")).toBe(
      "/lt/dashboard",
    );
  });

  it("blocks paths that re-enter the auth flow (no login → login loop)", () => {
    expect(getSafeReturnPath("/auth/login", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/auth/signup", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/lt/auth/login", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/en/auth/callback", "lt")).toBe("/lt/dashboard");
  });

  it("rejects relative paths", () => {
    expect(getSafeReturnPath("dashboard/profile", "lt")).toBe(
      "/lt/dashboard",
    );
    expect(getSafeReturnPath("./profile", "lt")).toBe("/lt/dashboard");
  });

  it("accepts a locale-prefixed internal path verbatim", () => {
    expect(getSafeReturnPath("/lt/dashboard", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/lt/dashboard/journal", "lt")).toBe(
      "/lt/dashboard/journal",
    );
    expect(getSafeReturnPath("/en/dashboard/profile", "lt")).toBe(
      "/en/dashboard/profile",
    );
  });

  it("prefixes the locale when the input is a bare /dashboard path", () => {
    expect(getSafeReturnPath("/dashboard", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/dashboard/journal", "en")).toBe(
      "/en/dashboard/journal",
    );
  });

  it("preserves query + hash on safe paths", () => {
    expect(getSafeReturnPath("/lt/dashboard?tab=overview", "lt")).toBe(
      "/lt/dashboard?tab=overview",
    );
    expect(getSafeReturnPath("/lt/dashboard#section", "lt")).toBe(
      "/lt/dashboard#section",
    );
  });
});

describe("isSafeReturnPath", () => {
  it("agrees with getSafeReturnPath on the obvious cases", () => {
    expect(isSafeReturnPath("/lt/dashboard")).toBe(true);
    expect(isSafeReturnPath("/dashboard/profile")).toBe(true);
    expect(isSafeReturnPath("/lt/auth/login")).toBe(false);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
    expect(isSafeReturnPath("")).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
  });

  it("judges the PATH half only — a query never makes a path unsafe", () => {
    expect(isSafeReturnPath("/lt/dashboard?result=experiences")).toBe(true);
    expect(isSafeReturnPath("/lt/auth/login?next=/lt/dashboard")).toBe(false);
  });
});

// ── W7 slice 3 — deep-link query preservation ──────────────────────────────

describe("W7 slice 3 — the workspace query survives an auth redirect", () => {
  it("keeps the ?result= deep link and its depth", () => {
    expect(
      getSafeReturnPath("/en/dashboard?result=experiences", "en"),
    ).toBe("/en/dashboard?result=experiences");
    expect(
      getSafeReturnPath(
        "/en/dashboard?result=experiences&interaction=booking%3A00000000-0000-4000-8000-000000000000",
        "en",
      ),
    ).toBe(
      "/en/dashboard?result=experiences&interaction=booking%3A00000000-0000-4000-8000-000000000000",
    );
  });

  it("keeps the market result's geo/project depth", () => {
    expect(
      getSafeReturnPath(
        "/lt/dashboard?result=market&geo=NL%3Acity%3ARotterdam",
        "lt",
      ),
    ).toBe("/lt/dashboard?result=market&geo=NL%3Acity%3ARotterdam");
  });

  it("keeps ordinary route filters (planning, journal, documents)", () => {
    expect(getSafeReturnPath("/lt/dashboard/planning?view=week", "lt")).toBe(
      "/lt/dashboard/planning?view=week",
    );
    expect(getSafeReturnPath("/lt/dashboard/journal?editing=abc", "lt")).toBe(
      "/lt/dashboard/journal?editing=abc",
    );
  });

  it("keeps the query when it also has to add the locale prefix", () => {
    expect(getSafeReturnPath("/dashboard?result=player-card", "lt")).toBe(
      "/lt/dashboard?result=player-card",
    );
  });

  it("keeps a fragment for the client-side consumers", () => {
    expect(
      getSafeReturnPath("/lt/dashboard/profile#setup-journey", "lt"),
    ).toBe("/lt/dashboard/profile#setup-journey");
    expect(
      getSafeReturnPath("/dashboard/profile?result=x#setup-journey", "lt"),
    ).toBe("/lt/dashboard/profile?result=x#setup-journey");
  });

  it("drops credential-shaped params instead of carrying them into logs", () => {
    for (const key of [
      "code",
      "token",
      "token_hash",
      "access_token",
      "refresh_token",
      "password",
      "secret",
      "api_key",
      "signature",
      "state",
      "trace",
      "error",
    ]) {
      const out = getSafeReturnPath(`/lt/dashboard?${key}=SENSITIVE`, "lt");
      expect(out).toBe("/lt/dashboard");
      expect(out).not.toContain("SENSITIVE");
    }
  });

  it("drops a credential param but keeps the legitimate ones beside it", () => {
    expect(
      getSafeReturnPath("/lt/dashboard?result=market&code=abc&view=week", "lt"),
    ).toBe("/lt/dashboard?result=market&view=week");
  });

  it("drops a NESTED next so redirects cannot be chained", () => {
    expect(
      getSafeReturnPath(
        "/lt/dashboard?next=%2F%2Fevil.example&result=market",
        "lt",
      ),
    ).toBe("/lt/dashboard?result=market");
  });

  it("caps the number of params", () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}=${i}`).join("&");
    const out = getSafeReturnPath(`/lt/dashboard?${many}`, "lt");
    expect([...new URLSearchParams(out.split("?")[1]).keys()]).toHaveLength(12);
  });

  it("falls back when the whole value is absurdly long", () => {
    expect(getSafeReturnPath(`/lt/dashboard?a=${"x".repeat(2000)}`, "lt")).toBe(
      "/lt/dashboard",
    );
  });
});

describe("W7 slice 3 — a query can never create an open redirect", () => {
  it("still blocks every path-level escape, query or no query", () => {
    for (const evil of [
      "//evil.example/x?result=market",
      "https://evil.example/x?result=market",
      "http://evil.example?result=market",
      "javascript:alert(1)?result=market",
      "/lt/auth/login?result=market",
      "dashboard?result=market",
    ]) {
      expect(getSafeReturnPath(evil, "lt")).toBe("/lt/dashboard");
    }
  });

  it("blocks the backslash bypass (browsers normalise \\ to /)", () => {
    // `/\evil.example` normalises to `//evil.example` in Chrome/Safari.
    expect(getSafeReturnPath("/\\evil.example", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/\\/evil.example", "lt")).toBe("/lt/dashboard");
    expect(isSafeReturnPath("/\\evil.example")).toBe(false);
  });

  it("blocks percent-encoded separators", () => {
    expect(getSafeReturnPath("/%2F%2Fevil.example", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/%5Cevil.example", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/lt%2Fauth%2Flogin", "lt")).toBe("/lt/dashboard");
  });

  it("blocks whitespace and control characters (header/log injection)", () => {
    expect(getSafeReturnPath("/lt/dash board", "lt")).toBe("/lt/dashboard");
    expect(getSafeReturnPath("/lt/dashboard\nLocation: //evil", "lt")).toBe(
      "/lt/dashboard",
    );
    expect(getSafeReturnPath("/lt/dashboard\u0000", "lt")).toBe("/lt/dashboard");
  });

  it("does not treat a query value as part of the path", () => {
    // The `//evil` lives in a VALUE, so it can never affect the origin.
    expect(getSafeReturnPath("/lt/dashboard?u=//evil.example", "lt")).toBe(
      "/lt/dashboard?u=%2F%2Fevil.example",
    );
  });
});

describe("buildReturnValue (what the middleware attaches)", () => {
  it("joins pathname and query", () => {
    expect(buildReturnValue("/en/dashboard", "?result=experiences")).toBe(
      "/en/dashboard?result=experiences",
    );
    expect(buildReturnValue("/en/dashboard", "result=experiences")).toBe(
      "/en/dashboard?result=experiences",
    );
  });

  it("returns the bare path when there is no query", () => {
    expect(buildReturnValue("/en/dashboard", "")).toBe("/en/dashboard");
  });

  it("strips credential-shaped params before they reach the login URL", () => {
    expect(buildReturnValue("/en/dashboard", "?code=abc&result=market")).toBe(
      "/en/dashboard?result=market",
    );
  });

  it("returns null for a path the sanitiser would reject anyway", () => {
    expect(buildReturnValue("/en/auth/login", "?x=1")).toBeNull();
    expect(buildReturnValue("//evil.example", "")).toBeNull();
  });

  it("round-trips through getSafeReturnPath unchanged", () => {
    const built = buildReturnValue(
      "/en/dashboard",
      "?result=experiences&interaction=booking%3A1",
    );
    expect(built).not.toBeNull();
    expect(getSafeReturnPath(built, "en")).toBe(built);
  });
});
