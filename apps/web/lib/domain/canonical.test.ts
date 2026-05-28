/**
 * Pure tests for the canonical domain policy module.
 */
import { describe, expect, it } from "vitest";

import {
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  LEGACY_REDIRECT_HOSTS,
  VERCEL_PRODUCTION_ALIAS,
  buildCanonicalUrl,
  isLegacyRedirectHost,
  isProductionHost,
} from "./canonical";

describe("canonical domain policy — constants", () => {
  it("has app.labourmarket.ai as the canonical host", () => {
    expect(CANONICAL_HOST).toBe("app.labourmarket.ai");
    expect(CANONICAL_ORIGIN).toBe("https://app.labourmarket.ai");
  });

  it("treats apex + www as legacy hosts that must redirect", () => {
    expect(LEGACY_REDIRECT_HOSTS).toContain("labourmarket.ai");
    expect(LEGACY_REDIRECT_HOSTS).toContain("www.labourmarket.ai");
  });

  it("keeps the Vercel-managed alias as a non-public production host", () => {
    expect(VERCEL_PRODUCTION_ALIAS).toBe("labourmarket-ai.vercel.app");
    expect(LEGACY_REDIRECT_HOSTS).not.toContain(VERCEL_PRODUCTION_ALIAS);
  });
});

describe("canonical domain policy — isLegacyRedirectHost", () => {
  it("returns true for the apex domain", () => {
    expect(isLegacyRedirectHost("labourmarket.ai")).toBe(true);
  });

  it("returns true for the www subdomain", () => {
    expect(isLegacyRedirectHost("www.labourmarket.ai")).toBe(true);
  });

  it("returns false for the canonical host", () => {
    expect(isLegacyRedirectHost("app.labourmarket.ai")).toBe(false);
  });

  it("returns false for the Vercel-managed alias", () => {
    expect(isLegacyRedirectHost("labourmarket-ai.vercel.app")).toBe(false);
  });

  it("returns false for any Vercel preview host", () => {
    expect(isLegacyRedirectHost("feat-something.vercel.app")).toBe(false);
  });

  it("returns false for an unrelated host", () => {
    expect(isLegacyRedirectHost("example.com")).toBe(false);
  });

  it("is case-insensitive + port-stripping", () => {
    expect(isLegacyRedirectHost("LABOURMARKET.AI")).toBe(true);
    expect(isLegacyRedirectHost("WWW.labourmarket.ai")).toBe(true);
    expect(isLegacyRedirectHost("labourmarket.ai:443")).toBe(true);
    expect(isLegacyRedirectHost("www.labourmarket.ai:8080")).toBe(true);
  });

  it("returns false on null/undefined/empty inputs", () => {
    expect(isLegacyRedirectHost(null)).toBe(false);
    expect(isLegacyRedirectHost(undefined)).toBe(false);
    expect(isLegacyRedirectHost("")).toBe(false);
  });
});

describe("canonical domain policy — isProductionHost", () => {
  it("returns true for the canonical host", () => {
    expect(isProductionHost("app.labourmarket.ai")).toBe(true);
  });

  it("returns true for the Vercel-managed alias", () => {
    expect(isProductionHost("labourmarket-ai.vercel.app")).toBe(true);
  });

  it("returns false for apex / www (those redirect, they don't serve)", () => {
    expect(isProductionHost("labourmarket.ai")).toBe(false);
    expect(isProductionHost("www.labourmarket.ai")).toBe(false);
  });

  it("returns false for previews + unrelated hosts", () => {
    expect(isProductionHost("preview-x.vercel.app")).toBe(false);
    expect(isProductionHost("example.com")).toBe(false);
  });
});

describe("canonical domain policy — buildCanonicalUrl", () => {
  it("returns a full URL on the canonical origin", () => {
    expect(buildCanonicalUrl("/lt/dashboard")).toBe(
      "https://app.labourmarket.ai/lt/dashboard",
    );
  });

  it("preserves search params", () => {
    expect(buildCanonicalUrl("/lt/dashboard", "?next=%2Flt")).toBe(
      "https://app.labourmarket.ai/lt/dashboard?next=%2Flt",
    );
  });

  it("inserts a leading slash when missing", () => {
    expect(buildCanonicalUrl("lt/dashboard")).toBe(
      "https://app.labourmarket.ai/lt/dashboard",
    );
  });

  it("handles the bare root", () => {
    expect(buildCanonicalUrl("/", "")).toBe("https://app.labourmarket.ai/");
  });
});

describe("canonical domain policy — anti-regression", () => {
  // If a future change ever silently flips the canonical host to
  // `labourmarket.ai` apex, the snapshot below catches it. The
  // owner's 2026-05-28 decision is `app.labourmarket.ai`.
  it("apex is NEVER the canonical host (would re-introduce LABMA-domain drift)", () => {
    expect(CANONICAL_HOST).not.toBe("labourmarket.ai");
    expect(CANONICAL_HOST).not.toBe("www.labourmarket.ai");
    expect(CANONICAL_ORIGIN).not.toBe("https://labourmarket.ai");
    expect(CANONICAL_ORIGIN).not.toBe("https://www.labourmarket.ai");
  });

  it("the canonical host must be a subdomain of labourmarket.ai", () => {
    expect(CANONICAL_HOST.endsWith(".labourmarket.ai")).toBe(true);
  });
});
