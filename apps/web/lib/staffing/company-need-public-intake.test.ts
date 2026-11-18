import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared store for every no-signup commercial form refuses spam BEFORE the
 * RPC, so a refused send writes no row (owner spam order 2026-11-09).
 * Synthetic data; Supabase and the request headers are mocked.
 */

const rpc = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "192.0.2.10" }) }));
vi.mock("@/lib/env", () => ({ requireSupabaseClientEnv: () => ({ url: "http://fixture.invalid", anonKey: "fixture" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));

import { __resetRateLimitsForTest } from "@/lib/security/rate-limit";
import { persistPublicCompanyNeed, type PublicIntakeInput } from "./company-need-public-intake";

const base: PublicIntakeInput = {
  locale: "en",
  companyName: "Synthetic Builders QA",
  contactEmail: "need-qa@example.test",
  country: "LT",
  sector: "tiler",
  headcount: 2,
  urgency: "flexible",
  accommodation: "not_provided",
  transportNeeded: false,
  engagementType: "employment",
  description: "Two tilers for a four-week site job in Vilnius.",
  sourcePath: "/en/company-need",
};

beforeEach(() => {
  __resetRateLimitsForTest();
  rpc.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("persistPublicCompanyNeed", () => {
  it("a real-looking need is stored", async () => {
    expect(await persistPublicCompanyNeed(base)).toEqual({ ok: true, advertising: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an advert", { description: "Free B2B data: 30 million companies, verified emails. https://seller.example.org" }],
    ["a pile of links", { description: "https://a.example.com https://b.example.com https://c.example.com" }],
    ["a URL as the name", { companyName: "https://seller.example.com" }],
  ])("%s is refused and nothing reaches the database", async (_n, change) => {
    expect(await persistPublicCompanyNeed({ ...base, ...change })).toEqual({ ok: false, code: "rejected" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the fourth send from one IP in the window is rate limited before the database", async () => {
    for (let i = 0; i < 3; i++) await persistPublicCompanyNeed({ ...base, contactEmail: `p${i}@example.test` });
    expect(await persistPublicCompanyNeed({ ...base, contactEmail: "p9@example.test" })).toEqual({ ok: false, code: "rate_limited" });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("the database's own ceiling (P0004) still maps to rate_limited", async () => {
    rpc.mockResolvedValue({ error: { code: "P0004" } });
    expect(await persistPublicCompanyNeed(base)).toEqual({ ok: false, code: "rate_limited" });
  });
});
