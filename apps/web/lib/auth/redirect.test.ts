import { describe, expect, it } from "vitest";
import { getSafeReturnPath, isSafeReturnPath } from "./redirect";

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
});
