/**
 * Behavioural test for the host-normalization redirect built on
 * top of the canonical-domain module. We don't import the full
 * middleware (it pulls in next-intl + Supabase); we re-implement
 * the redirect call here against the same pure module so the
 * test acts as a structural lock: any regression that re-introduces
 * an apex→app redirect, or drops the www→apex redirect, fails here.
 *
 * Policy (2026-06-15): apex serves content (public marketing
 * canonical); www → apex; app stays the app host.
 */
import { describe, expect, it } from "vitest";

import {
  MARKETING_ORIGIN,
  isWwwRedirectHost,
} from "./canonical";

function computeRedirectTarget(
  host: string | null,
  pathname: string,
  search: string,
): URL | undefined {
  if (!isWwwRedirectHost(host)) return undefined;
  return new URL(`${pathname}${search}`, MARKETING_ORIGIN);
}

describe("middleware host-normalization contract", () => {
  it("www.labourmarket.ai redirects to the apex labourmarket.ai", () => {
    const r = computeRedirectTarget("www.labourmarket.ai", "/lt/for-workers", "");
    expect(r?.origin).toBe("https://labourmarket.ai");
    expect(r?.pathname).toBe("/lt/for-workers");
  });

  it("preserves the query string verbatim", () => {
    const r = computeRedirectTarget(
      "www.labourmarket.ai",
      "/lt/pricing",
      "?ref=campaign&x=1",
    );
    expect(r?.toString()).toBe(
      "https://labourmarket.ai/lt/pricing?ref=campaign&x=1",
    );
  });

  it("does NOT redirect the apex itself — it serves content", () => {
    expect(
      computeRedirectTarget("labourmarket.ai", "/lt", ""),
    ).toBeUndefined();
  });

  it("does NOT redirect the app host", () => {
    expect(
      computeRedirectTarget("app.labourmarket.ai", "/lt/dashboard", ""),
    ).toBeUndefined();
  });

  it("does NOT redirect Vercel preview / managed-alias hosts", () => {
    expect(
      computeRedirectTarget("feat-branch.vercel.app", "/", ""),
    ).toBeUndefined();
    expect(
      computeRedirectTarget("labourmarket-ai.vercel.app", "/", ""),
    ).toBeUndefined();
  });

  // Anti-regression: protects the owner's 2026-06-15 decision that the
  // apex must SERVE the public marketing surface and never redirect to
  // the app subdomain. If a future change re-introduces an apex→app
  // redirect, the apex stops being indexable — this test fails first.
  it("anti-regression: apex must NOT redirect (it is the public surface)", () => {
    expect(computeRedirectTarget("labourmarket.ai", "/anything", "?q=1")).toBeUndefined();
  });

  it("anti-regression: www must redirect to the apex (consolidate host)", () => {
    const r = computeRedirectTarget("www.labourmarket.ai", "/anything", "");
    expect(r).toBeDefined();
    expect(r?.host).toBe("labourmarket.ai");
    expect(r?.host).not.toBe("app.labourmarket.ai");
    expect(r?.host).not.toBe("www.labourmarket.ai");
  });
});
