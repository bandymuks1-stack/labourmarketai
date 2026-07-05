import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PUBLIC MARKET ENTRY / SALES FUNNEL — LAUNCH GUARDS (PR13).
 *
 * The public surface must route into REAL product flows and describe only
 * what is actually live. Specifically:
 *  - every marketing CTA target route exists (no dead public links);
 *  - CTAs that route to /auth/signup never call themselves a "waitlist"
 *    (the worker loop and the company demand loop are live);
 *  - no unverifiable numeric market-size claims (country/language counts);
 *  - the work-abroad journey describes the live interest loop, not a
 *    booking system that does not exist;
 *  - inert plan-boundary labels read as statements, not dead buttons.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const LOCALES = ["en", "lt", "ru", "da", "de", "et", "lv", "nl", "no", "pl", "sv"];

type Json = Record<string, unknown>;
const catalog = (loc: string): Json =>
  JSON.parse(read(`messages/${loc}.json`)) as Json;

const get = (obj: unknown, path: (string | number)[]): unknown => {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
};

describe("no dead public links — every marketing CTA target route exists", () => {
  // The routes the public funnel depends on. Deleting/renaming any of these
  // without updating the marketing surface would create a dead public CTA.
  const ROUTES = [
    "app/[locale]/auth/signup",
    "app/[locale]/auth/login",
    "app/[locale]/(marketing)/company-need",
    "app/[locale]/(marketing)/worker-intake",
    "app/[locale]/(marketing)/for-companies",
    "app/[locale]/(marketing)/for-workers",
    "app/[locale]/(marketing)/for-agencies",
    "app/[locale]/(marketing)/pricing",
    "app/[locale]/(marketing)/labour-market",
    "app/[locale]/(marketing)/skills",
    "app/[locale]/(marketing)/work-abroad",
  ];
  it("all funnel target routes have a page", () => {
    for (const r of ROUTES) {
      expect(
        existsSync(join(APP_ROOT, r, "page.tsx")),
        `missing route for public CTA target: ${r}`,
      ).toBe(true);
    }
  });

  it("landing hero routes to the two real entries (worker signup + company need)", () => {
    const page = read("app/[locale]/(marketing)/page.tsx");
    expect(page).toContain('href="/auth/signup"');
    expect(page).toContain('href="/company-need"');
  });

  it("work-abroad profile CTA goes to public signup, not an auth-walled bounce", () => {
    const page = read("app/[locale]/(marketing)/work-abroad/page.tsx");
    expect(page).not.toContain('href="/onboarding"');
    expect(page).toContain('href="/auth/signup"');
  });
});

describe("signup CTAs never call themselves a waitlist (the loop is live)", () => {
  // These i18n keys label CTAs whose ctaKind is "signup" (PageHero /
  // CtaBand route them to /auth/signup). Calling a live signup a
  // "waitlist" is a false funnel in both directions.
  const SIGNUP_CTA_KEYS: (string | number)[][] = [
    ["pages", "workers", "cta"],
    ["pages", "companies", "cta"],
    ["pages", "agencies", "cta"],
    ["workers", "cta", "subcopy"],
    ["workers", "cta", "button"],
    ["companies", "cta", "subcopy"],
    ["companies", "cta", "button"],
    ["agencies", "cta", "subcopy"],
    ["agencies", "cta", "button"],
  ];
  // EN (also inside "[EN] " copies), LT, RU waitlist vocabulary.
  const WAITLIST = /waitlist|laukian\w*|laukiam\w*|список ожидания|лист ожидания/i;

  it("no waitlist wording on signup-routed CTA keys in any locale", () => {
    const hits: string[] = [];
    for (const loc of LOCALES) {
      const c = catalog(loc);
      for (const path of SIGNUP_CTA_KEYS) {
        const v = get(c, path);
        if (typeof v === "string" && WAITLIST.test(v)) {
          hits.push(`${loc}:${path.join(".")} = "${v}"`);
        }
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("the real waitlist (pricing) still posts to /api/waitlist", () => {
    // Pricing IS a genuine waitlist (persists a lead) — that one may keep
    // the word; this pins that the modal still hits the real endpoint.
    const modal = read("components/marketing/waitlist-modal.tsx");
    expect(modal).toContain("/api/waitlist");
  });
});

describe("no unverifiable market-size claims in public copy", () => {
  const COUNT_CLAIM =
    /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(countries|languages)\b|\bdevyni\w*\s+šal\w*|\bдевят\w*\s+стран\w*/i;

  it("pages.* role copy makes no numeric country/language count claims", () => {
    const hits: string[] = [];
    for (const loc of LOCALES) {
      const pages = get(catalog(loc), ["pages"]);
      const walk = (o: unknown, p: string) => {
        if (typeof o === "string") {
          if (COUNT_CLAIM.test(o)) hits.push(`${loc}:pages${p} = "${o}"`);
        } else if (Array.isArray(o)) {
          o.forEach((v, i) => walk(v, `${p}[${i}]`));
        } else if (o && typeof o === "object") {
          for (const [k, v] of Object.entries(o)) walk(v, `${p}.${k}`);
        }
      };
      walk(pages, "");
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("work-abroad journey describes the live interest loop", () => {
  it("EN steps promise no booking system (interest + honest status instead)", () => {
    const wa = get(catalog("en"), ["workAbroad"]);
    const all = JSON.stringify(wa);
    expect(all).not.toMatch(/\bbook(ing|ed)\b/i);
    // The live loop vocabulary must be present: express interest + status.
    expect(all).toMatch(/express interest/i);
    expect(all).toMatch(/reviewed or contacted/i);
  });
});

describe("plan boundary carries no dead pseudo-buttons", () => {
  it("the component renders no interactive elements for plan CTAs", () => {
    const src = read("components/marketing/pre-payment-plan-boundary.tsx");
    expect(src).not.toMatch(/<Link\b/);
    expect(src).not.toMatch(/<Button\b/);
    expect(src).not.toMatch(/<a\b/);
  });

  it("inert plan labels are statements, not imperative dead CTAs", () => {
    for (const loc of ["en", "lt", "ru"]) {
      const cta = get(catalog(loc), ["planBoundary", "cta"]) as Record<
        string,
        string
      >;
      expect(cta.request_pilot_access).not.toMatch(
        /^(request|prašyti|запросить)/i,
      );
      expect(cta.contact).not.toMatch(/^(contact|susisiek|свяжитесь)/i);
    }
  });
});
