/**
 * Behavioural test for the host-normalization redirect built on
 * top of the canonical-domain module. We don't import the full
 * middleware (it pulls in next-intl + Supabase); we re-implement
 * the redirect call here against the same pure module so the
 * test acts as a structural lock: any regression that loosens
 * the canonical host or removes the redirect contract fails.
 */
import { describe, expect, it } from "vitest";

import {
  CANONICAL_ORIGIN,
  isLegacyRedirectHost,
} from "./canonical";

function computeRedirectTarget(
  host: string | null,
  pathname: string,
  search: string,
): URL | undefined {
  if (!isLegacyRedirectHost(host)) return undefined;
  return new URL(`${pathname}${search}`, CANONICAL_ORIGIN);
}

describe("middleware host-normalization contract", () => {
  it("apex labourmarket.ai redirects to app.labourmarket.ai", () => {
    const r = computeRedirectTarget("labourmarket.ai", "/lt/dashboard", "");
    expect(r?.origin).toBe("https://app.labourmarket.ai");
    expect(r?.pathname).toBe("/lt/dashboard");
  });

  it("www.labourmarket.ai redirects to app.labourmarket.ai", () => {
    const r = computeRedirectTarget("www.labourmarket.ai", "/", "");
    expect(r?.origin).toBe("https://app.labourmarket.ai");
    expect(r?.pathname).toBe("/");
  });

  it("preserves the query string verbatim", () => {
    const r = computeRedirectTarget(
      "labourmarket.ai",
      "/lt/auth/login",
      "?next=%2Flt%2Fdashboard&trace=abc123",
    );
    expect(r?.toString()).toBe(
      "https://app.labourmarket.ai/lt/auth/login?next=%2Flt%2Fdashboard&trace=abc123",
    );
  });

  it("does NOT redirect requests already on app.labourmarket.ai", () => {
    expect(
      computeRedirectTarget("app.labourmarket.ai", "/lt/dashboard", ""),
    ).toBeUndefined();
  });

  it("does NOT redirect Vercel preview hosts", () => {
    expect(
      computeRedirectTarget("feat-branch.vercel.app", "/", ""),
    ).toBeUndefined();
  });

  it("does NOT redirect the Vercel production alias", () => {
    expect(
      computeRedirectTarget("labourmarket-ai.vercel.app", "/", ""),
    ).toBeUndefined();
  });

  // Anti-regression: protects the owner's 2026-05-28 decision that
  // the apex labourmarket.ai must stop serving old LABMA content.
  // If a future change ever drops the apex from the redirect set
  // OR flips the canonical to the apex, the old-LABMA-on-apex
  // problem returns. This test fails first.
  it("anti-regression: apex must redirect (cannot serve content)", () => {
    const r = computeRedirectTarget("labourmarket.ai", "/anything", "?q=1");
    expect(r).toBeDefined();
    expect(r?.host).toBe("app.labourmarket.ai");
    expect(r?.host).not.toBe("labourmarket.ai");
  });

  it("anti-regression: www must redirect (cannot serve content)", () => {
    const r = computeRedirectTarget("www.labourmarket.ai", "/anything", "");
    expect(r).toBeDefined();
    expect(r?.host).toBe("app.labourmarket.ai");
    expect(r?.host).not.toBe("www.labourmarket.ai");
  });
});
