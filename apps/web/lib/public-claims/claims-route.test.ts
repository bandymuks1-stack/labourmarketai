import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/public/claims/v1/route";
import { activeLocales } from "@/lib/i18n/config";
import enMessages from "@/messages/en.json";
import {
  PUBLIC_CLAIMS,
  buildPublicClaimsPayload,
  renderFragment,
  type ClaimSpec,
  type MessageTree,
  type PublicClaimsPayload,
} from "./registry";

/**
 * The `lm-public-claims/v1` contract as Agentai OS consumes it. Field names
 * are FIXED — another system parses them — so this test pins the exact key
 * set of every level, not just the presence of some keys.
 */

async function served(): Promise<{ res: Response; body: PublicClaimsPayload }> {
  const res = await GET();
  return { res, body: (await res.json()) as PublicClaimsPayload };
}

describe("GET /api/public/claims/v1", () => {
  it("answers 200 JSON, publicly cacheable for 300 s", async () => {
    const { res } = await served();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300");
  });

  it("serves exactly the contract's fields at every level", async () => {
    const { body } = await served();
    expect(Object.keys(body).sort()).toEqual(["builtAtIso", "claims", "schema"]);
    expect(body.schema).toBe("lm-public-claims/v1");
    expect(new Date(body.builtAtIso).toISOString()).toBe(body.builtAtIso);
    expect(body.claims.length).toBe(PUBLIC_CLAIMS.length);
    for (const c of body.claims) {
      expect(Object.keys(c).sort()).toEqual(
        ["audience", "capabilityId", "claimId", "pages", "status", "structural"],
      );
      expect(["WORKER", "EMPLOYER", "PARTNER", "PLATFORM"]).toContain(c.audience);
      expect(["LIVE", "RETIRED"]).toContain(c.status);
      expect(c.capabilityId === null || typeof c.capabilityId === "string").toBe(true);
      for (const p of c.pages) {
        expect(Object.keys(p).sort()).toEqual(["fragments", "locale", "path"]);
        expect(activeLocales as readonly string[]).toContain(p.locale);
        expect(p.path === `/${p.locale}` || p.path.startsWith(`/${p.locale}/`)).toBe(true);
        expect(p.fragments.length).toBeGreaterThan(0);
        for (const f of p.fragments) {
          expect(typeof f).toBe("string");
          expect(f).toBe(f.replace(/\s+/g, " ").trim());
          expect(f.length).toBeGreaterThan(0);
        }
      }
      if (c.structural !== null) {
        expect(Object.keys(c.structural).sort()).toEqual(["kind", "locales"]);
      }
    }
  });

  it("RETIRED claims stay listed, with no pages and no structural check", async () => {
    const { body } = await served();
    const retired = body.claims.filter((c) => c.status === "RETIRED");
    expect(retired.map((c) => c.claimId).sort()).toEqual([
      "employer.organization-plan-price",
      "employer.vat-via-stripe-tax",
      "platform.four-entry-paths",
    ]);
    for (const c of retired) {
      expect(c.pages).toEqual([]);
      expect(c.structural).toBeNull();
    }
  });

  it("fragments are the CURRENT text of the keys the page renders, never a stored sentence", async () => {
    const { body } = await served();
    const fit = body.claims.find((c) => c.claimId === "employer.fit-per-need")!;
    const en = fit.pages.find((p) => p.locale === "en")!;
    expect(en.path).toBe("/en/for-companies");
    expect(en.fragments).toEqual([enMessages.pages.companies.subcopy.replace(/\s+/g, " ").trim()]);
    // every active locale that renders the page is cited
    expect(fit.pages.map((p) => p.locale).sort()).toEqual([...activeLocales].sort());
  });

  it("separate elements stay separate fragments (never concatenated)", async () => {
    const { body } = await served();
    const plan = body.claims.find((c) => c.claimId === "employer.organization-plan-99-per-month")!;
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].path).toBe("/en/pricing");
    expect(plan.pages[0].fragments).toEqual([
      enMessages.pricing.plans.business.name,
      enMessages.pricing.plans.business.tagline,
      "€99/month",
      enMessages.pricing.plans.business.features[0],
    ]);
  });

  it("the per-locale headline claims cite only their own locale root", async () => {
    const { body } = await served();
    for (const l of ["en", "de", "lt", "ru"]) {
      const c = body.claims.find((x) => x.claimId === `platform.headline.${l}`)!;
      expect(c.capabilityId).toBeNull();
      expect(c.pages.map((p) => p.path)).toEqual([`/${l}`]);
    }
  });

  it("platform.locales-live is a structural locale-roots claim over the active locales", async () => {
    const { body } = await served();
    const c = body.claims.find((x) => x.claimId === "platform.locales-live")!;
    expect(c.pages).toEqual([]);
    expect(c.structural).toEqual({ kind: "locale-roots", locales: [...activeLocales] });
  });
});

describe("registry resolution", () => {
  it("a reworded key changes the served fragment with no registry edit", async () => {
    const spec: ClaimSpec = {
      claimId: "employer.example",
      audience: "EMPLOYER",
      capabilityId: "DEM-1",
      status: "LIVE",
      structural: null,
      pages: [{ path: "/for-companies", locales: ["en"], fragments: [{ key: "a.b[1].c" }] }],
    };
    const tree = (text: string): MessageTree => ({ a: { b: [{ c: "x" }, { c: text }] } });
    const one = await buildPublicClaimsPayload(async () => tree("First   wording."), new Date(0), [spec]);
    const two = await buildPublicClaimsPayload(async () => tree("Second wording."), new Date(0), [spec]);
    expect(one.claims[0].pages[0].fragments).toEqual(["First wording."]);
    expect(two.claims[0].pages[0].fragments).toEqual(["Second wording."]);
  });

  it("refuses ICU it cannot render instead of serving a wrong fragment", () => {
    const m: MessageTree = {
      plural: "{n, plural, one {# day} other {# days}}",
      tag: "Read <b>this</b>",
      arg: "€{price}/month",
      quote: "workers'' records",
    };
    expect(() => renderFragment(m, { key: "plural" })).toThrow();
    expect(() => renderFragment(m, { key: "tag" })).toThrow();
    expect(() => renderFragment(m, { key: "arg" })).toThrow();
    expect(renderFragment(m, { key: "arg", values: { price: 99 } })).toBe("€99/month");
    expect(renderFragment(m, { key: "quote" })).toBe("workers' records");
    expect(() => renderFragment(m, { key: "missing" })).toThrow();
  });
});
