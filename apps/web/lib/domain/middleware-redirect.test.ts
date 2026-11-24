/**
 * Behavioural test for the host-normalization redirect built on
 * top of the canonical-domain module. We don't import the full
 * middleware (it pulls in next-intl + Supabase); we re-implement
 * the redirect call here against the same pure module so the
 * test acts as a structural lock: any regression that re-introduces
 * the app host as a served product origin, or drops a legacy-alias
 * redirect, fails here.
 *
 * Policy (2026-07-19, single-domain): the apex labourmarket.ai is
 * the ONLY product origin; www + app are 308 redirect aliases.
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

describe("middleware host-normalization contract (single domain)", () => {
  it("www.labourmarket.ai redirects to the apex labourmarket.ai", () => {
    const r = computeRedirectTarget("www.labourmarket.ai", "/lt/for-workers", "");
    expect(r?.origin).toBe("https://labourmarket.ai");
    expect(r?.pathname).toBe("/lt/for-workers");
  });

  it("app.labourmarket.ai redirects to the apex labourmarket.ai", () => {
    const r = computeRedirectTarget("app.labourmarket.ai", "/lt/dashboard", "?x=1");
    expect(r?.toString()).toBe("https://labourmarket.ai/lt/dashboard?x=1");
  });

  it("preserves the query string verbatim (incl. next + invitation tokens)", () => {
    const r = computeRedirectTarget(
      "app.labourmarket.ai",
      "/lt/auth/login",
      "?next=%2Flt%2Fdashboard&invite=tok_abc123",
    );
    expect(r?.toString()).toBe(
      "https://labourmarket.ai/lt/auth/login?next=%2Flt%2Fdashboard&invite=tok_abc123",
    );
  });

  it("case + port variants of legacy hosts still redirect", () => {
    expect(
      computeRedirectTarget("APP.LABOURMARKET.AI:443", "/en/business/acme", "")?.host,
    ).toBe("labourmarket.ai");
    expect(
      computeRedirectTarget("WWW.LABOURMARKET.AI", "/lt", "")?.host,
    ).toBe("labourmarket.ai");
  });

  it("does NOT redirect the apex itself — it serves everything", () => {
    expect(computeRedirectTarget("labourmarket.ai", "/lt", "")).toBeUndefined();
    expect(
      computeRedirectTarget("labourmarket.ai", "/lt/dashboard", ""),
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

  // Anti-loop: a legacy-host redirect must always target the apex, and the
  // apex itself is never a legacy host — so a redirect chain terminates in
  // exactly one hop.
  it("anti-loop: redirect target host is never itself a legacy redirect host", () => {
    for (const host of ["www.labourmarket.ai", "app.labourmarket.ai"]) {
      const r = computeRedirectTarget(host, "/lt/anything", "?q=1");
      expect(r).toBeDefined();
      expect(isLegacyRedirectHost(r!.host)).toBe(false);
    }
  });

  // Anti-regression: protects the owner's 2026-07-19 single-domain decision.
  // If a future change makes the apex redirect anywhere, or lets the app
  // host serve content again, this fails first.
  it("anti-regression: apex must NOT redirect (it is the only product origin)", () => {
    expect(computeRedirectTarget("labourmarket.ai", "/anything", "?q=1")).toBeUndefined();
  });

  it("anti-regression: both legacy aliases must redirect to the apex", () => {
    for (const host of ["www.labourmarket.ai", "app.labourmarket.ai"]) {
      const r = computeRedirectTarget(host, "/anything", "");
      expect(r).toBeDefined();
      expect(r?.host).toBe("labourmarket.ai");
    }
  });
});
