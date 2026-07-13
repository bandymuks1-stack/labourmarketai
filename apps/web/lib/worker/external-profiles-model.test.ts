import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXTERNAL_PROFILE_VISIBILITY,
  EXTERNAL_PROFILE_PLATFORMS,
  classifyExternalProfilesError,
  maskedUrlHost,
  parseExternalProfilePlatform,
  parseExternalProfileVisibility,
  validateExternalProfileUrl,
} from "./external-profiles-model";

describe("external profile URL validation (https-only)", () => {
  it("accepts a normal https profile URL", () => {
    const r = validateExternalProfileUrl("https://github.com/someone");
    expect(r).toEqual({ ok: true, url: "https://github.com/someone" });
  });

  it("trims surrounding whitespace", () => {
    const r = validateExternalProfileUrl("  https://example.com/me  ");
    expect(r).toEqual({ ok: true, url: "https://example.com/me" });
  });

  it("rejects empty input", () => {
    expect(validateExternalProfileUrl("")).toEqual({ ok: false, reason: "empty" });
    expect(validateExternalProfileUrl(null)).toEqual({ ok: false, reason: "empty" });
    expect(validateExternalProfileUrl(undefined)).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects http:// and every non-https scheme", () => {
    expect(validateExternalProfileUrl("http://example.com/me")).toEqual({
      ok: false,
      reason: "not-https",
    });
    expect(validateExternalProfileUrl("ftp://example.com/me")).toEqual({
      ok: false,
      reason: "not-https",
    });
    expect(validateExternalProfileUrl("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "not-https",
    });
  });

  it("rejects URLs above the 500-char DB bound", () => {
    const long = `https://example.com/${"a".repeat(500)}`;
    expect(validateExternalProfileUrl(long)).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("rejects malformed / hostless / credentialed URLs", () => {
    expect(validateExternalProfileUrl("https://")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(validateExternalProfileUrl("https://nohostdot")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(
      validateExternalProfileUrl("https://user:pass@example.com/profile"),
    ).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("masked URL host (list view privacy)", () => {
  it("returns the hostname only", () => {
    expect(maskedUrlHost("https://github.com/very-personal-slug")).toBe(
      "github.com",
    );
  });

  it("degrades to a dash for unparseable values", () => {
    expect(maskedUrlHost("not a url")).toBe("—");
  });
});

describe("closed vocabularies", () => {
  it("default visibility is private (consent-first)", () => {
    expect(DEFAULT_EXTERNAL_PROFILE_VISIBILITY).toBe("private");
  });

  it("platform parse accepts only the closed set", () => {
    for (const p of EXTERNAL_PROFILE_PLATFORMS) {
      expect(parseExternalProfilePlatform(p)).toBe(p);
    }
    expect(parseExternalProfilePlatform("facebook")).toBeNull();
    expect(parseExternalProfilePlatform("")).toBeNull();
    expect(parseExternalProfilePlatform(null)).toBeNull();
  });

  it("visibility parse accepts only private|employers", () => {
    expect(parseExternalProfileVisibility("private")).toBe("private");
    expect(parseExternalProfileVisibility("employers")).toBe("employers");
    expect(parseExternalProfileVisibility("public")).toBeNull();
  });
});

describe("error classification", () => {
  it("maps missing table/RPC codes to needs_migration", () => {
    for (const code of ["42P01", "PGRST205", "42883", "PGRST202"]) {
      expect(classifyExternalProfilesError(code)).toBe("needs_migration");
    }
  });

  it("maps the RPC closed-set rejection to invalid", () => {
    expect(classifyExternalProfilesError("22023")).toBe("invalid");
  });

  it("everything unknown is a plain error", () => {
    expect(classifyExternalProfilesError("XX000")).toBe("error");
    expect(classifyExternalProfilesError(undefined)).toBe("error");
  });
});
