/**
 * Pure tests for the canonical domain policy module.
 *
 * Policy (2026-06-15): apex labourmarket.ai = public marketing
 * canonical; www → apex; app.labourmarket.ai = app host. This
 * SUPERSEDES the 2026-05-28 "apex redirects to app" policy.
 */
import { describe, expect, it } from "vitest";

import {
  APP_HOST,
  APP_ORIGIN,
  MARKETING_HOST,
  MARKETING_ORIGIN,
  CANONICAL_ORIGIN,
  WWW_HOST,
  WWW_REDIRECT_HOSTS,
  VERCEL_PRODUCTION_ALIAS,
  buildAppUrl,
  buildCanonicalUrl,
  isAppHost,
  isMarketingHost,
  isProductionHost,
  isWwwRedirectHost,
} from "./canonical";

describe("canonical domain policy — constants", () => {
  it("has labourmarket.ai (apex) as the canonical public marketing host", () => {
    expect(MARKETING_HOST).toBe("labourmarket.ai");
    expect(MARKETING_ORIGIN).toBe("https://labourmarket.ai");
  });

  it("keeps app.labourmarket.ai as the app host", () => {
    expect(APP_HOST).toBe("app.labourmarket.ai");
    expect(APP_ORIGIN).toBe("https://app.labourmarket.ai");
  });

  it("CANONICAL_ORIGIN (back-compat) points at the public apex", () => {
    expect(CANONICAL_ORIGIN).toBe("https://labourmarket.ai");
  });

  it("treats www as the alias that must redirect to the apex", () => {
    expect(WWW_HOST).toBe("www.labourmarket.ai");
    expect(WWW_REDIRECT_HOSTS).toContain("www.labourmarket.ai");
  });

  it("never redirects the apex itself (it serves content)", () => {
    expect(WWW_REDIRECT_HOSTS).not.toContain("labourmarket.ai");
  });

  it("keeps the Vercel-managed alias as a non-public production host", () => {
    expect(VERCEL_PRODUCTION_ALIAS).toBe("labourmarket-ai.vercel.app");
    expect(WWW_REDIRECT_HOSTS).not.toContain(VERCEL_PRODUCTION_ALIAS);
  });
});

describe("canonical domain policy — isWwwRedirectHost", () => {
  it("returns true for the www subdomain", () => {
    expect(isWwwRedirectHost("www.labourmarket.ai")).toBe(true);
  });

  it("returns false for the apex (it must NOT redirect)", () => {
    expect(isWwwRedirectHost("labourmarket.ai")).toBe(false);
  });

  it("returns false for the app host", () => {
    expect(isWwwRedirectHost("app.labourmarket.ai")).toBe(false);
  });

  it("returns false for the Vercel-managed alias + previews", () => {
    expect(isWwwRedirectHost("labourmarket-ai.vercel.app")).toBe(false);
    expect(isWwwRedirectHost("feat-something.vercel.app")).toBe(false);
  });

  it("is case-insensitive + port-stripping", () => {
    expect(isWwwRedirectHost("WWW.LABOURMARKET.AI")).toBe(true);
    expect(isWwwRedirectHost("www.labourmarket.ai:8080")).toBe(true);
  });

  it("returns false on null/undefined/empty inputs", () => {
    expect(isWwwRedirectHost(null)).toBe(false);
    expect(isWwwRedirectHost(undefined)).toBe(false);
    expect(isWwwRedirectHost("")).toBe(false);
  });
});

describe("canonical domain policy — host predicates", () => {
  it("isMarketingHost is true only for the apex", () => {
    expect(isMarketingHost("labourmarket.ai")).toBe(true);
    expect(isMarketingHost("www.labourmarket.ai")).toBe(false);
    expect(isMarketingHost("app.labourmarket.ai")).toBe(false);
  });

  it("isAppHost is true only for the app subdomain", () => {
    expect(isAppHost("app.labourmarket.ai")).toBe(true);
    expect(isAppHost("labourmarket.ai")).toBe(false);
  });

  it("isProductionHost covers apex, app + Vercel alias", () => {
    expect(isProductionHost("labourmarket.ai")).toBe(true);
    expect(isProductionHost("app.labourmarket.ai")).toBe(true);
    expect(isProductionHost("labourmarket-ai.vercel.app")).toBe(true);
    expect(isProductionHost("preview-x.vercel.app")).toBe(false);
    expect(isProductionHost("example.com")).toBe(false);
  });
});

describe("canonical domain policy — URL builders", () => {
  it("buildCanonicalUrl returns a full URL on the apex public origin", () => {
    expect(buildCanonicalUrl("/lt/for-workers")).toBe(
      "https://labourmarket.ai/lt/for-workers",
    );
  });

  it("buildCanonicalUrl preserves search params + inserts leading slash", () => {
    expect(buildCanonicalUrl("lt", "?ref=x")).toBe(
      "https://labourmarket.ai/lt?ref=x",
    );
  });

  it("buildAppUrl returns a full URL on the app origin", () => {
    expect(buildAppUrl("/lt/dashboard")).toBe(
      "https://app.labourmarket.ai/lt/dashboard",
    );
  });
});

describe("canonical domain policy — anti-regression", () => {
  // Protects the owner's 2026-06-15 decision: the PUBLIC canonical is
  // the apex. If a future change ever flips the public canonical back
  // to the app subdomain, search engines stop seeing a clean
  // labourmarket.ai public surface — this test fails first.
  it("the public canonical is the apex, NOT the app subdomain", () => {
    expect(MARKETING_HOST).toBe("labourmarket.ai");
    expect(MARKETING_ORIGIN).not.toBe("https://app.labourmarket.ai");
    expect(CANONICAL_ORIGIN).not.toBe("https://app.labourmarket.ai");
  });

  it("the apex never appears in the www-redirect set", () => {
    expect(WWW_REDIRECT_HOSTS).not.toContain("labourmarket.ai");
    expect(isWwwRedirectHost("labourmarket.ai")).toBe(false);
  });
});
