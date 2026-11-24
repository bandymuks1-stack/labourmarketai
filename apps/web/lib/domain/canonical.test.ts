/**
 * Pure tests for the canonical domain policy module.
 *
 * Policy (2026-07-19, single-domain): apex labourmarket.ai is the
 * ONLY product origin; www.labourmarket.ai and app.labourmarket.ai
 * are permanent (308) redirect aliases. This SUPERSEDES the
 * 2026-06-15 split marketing/app policy and the 2026-05-28 "apex
 * redirects to app" policy.
 */
import { describe, expect, it } from "vitest";

import {
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  MARKETING_HOST,
  MARKETING_ORIGIN,
  WWW_HOST,
  LEGACY_APP_HOST,
  LEGACY_REDIRECT_HOSTS,
  VERCEL_PRODUCTION_ALIAS,
  buildCanonicalUrl,
  isCanonicalHost,
  isLegacyRedirectHost,
} from "./canonical";

describe("canonical domain policy — constants", () => {
  it("has labourmarket.ai (apex) as the one canonical product host", () => {
    expect(CANONICAL_HOST).toBe("labourmarket.ai");
    expect(CANONICAL_ORIGIN).toBe("https://labourmarket.ai");
  });

  it("SEO back-compat aliases equal the canonical host/origin", () => {
    expect(MARKETING_HOST).toBe(CANONICAL_HOST);
    expect(MARKETING_ORIGIN).toBe(CANONICAL_ORIGIN);
  });

  it("www and the legacy app host are both redirect aliases", () => {
    expect(WWW_HOST).toBe("www.labourmarket.ai");
    expect(LEGACY_APP_HOST).toBe("app.labourmarket.ai");
    expect(LEGACY_REDIRECT_HOSTS).toContain(WWW_HOST);
    expect(LEGACY_REDIRECT_HOSTS).toContain(LEGACY_APP_HOST);
  });

  it("the apex is never listed as a redirect host (no loop)", () => {
    expect(LEGACY_REDIRECT_HOSTS).not.toContain(CANONICAL_HOST);
  });

  it("the Vercel managed alias is known and never redirected", () => {
    expect(VERCEL_PRODUCTION_ALIAS).toBe("labourmarket-ai.vercel.app");
    expect(LEGACY_REDIRECT_HOSTS).not.toContain(VERCEL_PRODUCTION_ALIAS);
  });
});

describe("canonical domain policy — isLegacyRedirectHost", () => {
  it("matches www + legacy app host only", () => {
    expect(isLegacyRedirectHost("www.labourmarket.ai")).toBe(true);
    expect(isLegacyRedirectHost("app.labourmarket.ai")).toBe(true);
    expect(isLegacyRedirectHost("labourmarket.ai")).toBe(false);
    expect(isLegacyRedirectHost("labourmarket-ai.vercel.app")).toBe(false);
    expect(isLegacyRedirectHost("feat-something.vercel.app")).toBe(false);
  });

  it("is case-insensitive and strips ports", () => {
    expect(isLegacyRedirectHost("WWW.LABOURMARKET.AI")).toBe(true);
    expect(isLegacyRedirectHost("APP.LABOURMARKET.AI:443")).toBe(true);
    expect(isLegacyRedirectHost("www.labourmarket.ai:8080")).toBe(true);
  });

  it("is false for null / undefined / empty", () => {
    expect(isLegacyRedirectHost(null)).toBe(false);
    expect(isLegacyRedirectHost(undefined)).toBe(false);
    expect(isLegacyRedirectHost("")).toBe(false);
  });
});

describe("canonical domain policy — isCanonicalHost", () => {
  it("is true only for the apex", () => {
    expect(isCanonicalHost("labourmarket.ai")).toBe(true);
    expect(isCanonicalHost("LABOURMARKET.AI:443")).toBe(true);
    expect(isCanonicalHost("www.labourmarket.ai")).toBe(false);
    expect(isCanonicalHost("app.labourmarket.ai")).toBe(false);
    expect(isCanonicalHost("labourmarket-ai.vercel.app")).toBe(false);
    expect(isCanonicalHost(null)).toBe(false);
  });
});

describe("canonical domain policy — buildCanonicalUrl", () => {
  it("returns a full URL on the canonical origin", () => {
    expect(buildCanonicalUrl("/lt/for-workers")).toBe(
      "https://labourmarket.ai/lt/for-workers",
    );
  });

  it("preserves search params + inserts leading slash", () => {
    expect(buildCanonicalUrl("lt", "?ref=x")).toBe(
      "https://labourmarket.ai/lt?ref=x",
    );
  });
});

// Anti-regression lock for the 2026-07-19 owner decision: one domain.
// If someone reintroduces an app-host product origin (a second origin
// constant used for serving, an auth-CTA host-upgrade helper),
// lib/guards/single-domain-origin.test.ts fails; if someone flips the
// canonical constants themselves, THIS fails.
describe("anti-regression — single-domain policy", () => {
  it("the canonical origin is the apex, not a subdomain", () => {
    expect(CANONICAL_ORIGIN).toBe("https://labourmarket.ai");
    expect(CANONICAL_ORIGIN).not.toContain("app.");
    expect(CANONICAL_ORIGIN).not.toContain("www.");
  });

  it("the legacy app host stays classified as redirect-only", () => {
    expect(isLegacyRedirectHost(LEGACY_APP_HOST)).toBe(true);
  });
});
