import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ESTIMATE_VERSION } from "@/lib/estimate/estimate";
import { PAGE_SEO } from "@/lib/seo/metadata";
import { parseCompanyNeedPrefill } from "@/lib/staffing/company-need-prefill";

/**
 * European Work & Project Calculator v1 — integration + honesty guard.
 *
 * Locks the wave's core decisions:
 *  - ONE engine: the public calculator reuses lib/estimate (no lib/calculators
 *    duplicate engine, no local arithmetic fork);
 *  - the shared engine stays untouched (no VAT inside it; version still 1) —
 *    VAT is a public display layer only;
 *  - package rounding can never round down;
 *  - CSV export is formula-injection safe;
 *  - the public copy is cross-sector (no construction-first product frame in
 *    the title / h1 / SEO title);
 *  - every CTA on the page resolves to a real route;
 *  - calculator copy exists in all 5 active locales with identical structure;
 *  - the company-need prefill bridge stays bounded and validated.
 */

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(webRoot, rel));

const PAGE_REL = "app/[locale]/(marketing)/calculators/project-cost/page.tsx";
const component = read("components/app/project-cost-calculator.tsx");
const page = read(PAGE_REL);
const engine = read("lib/estimate/estimate.ts");
const packSrc = read("lib/estimate/packs/area-quantity-v1.ts");
const csvSrc = read("lib/estimate/calculator-csv-v1.ts");

describe("single engine — the calculator reuses lib/estimate", () => {
  it("no duplicate engine directory exists (lib/calculators is cancelled)", () => {
    expect(exists("lib/calculators")).toBe(false);
  });
  it("the public calculator imports the shared engine, not a fork", () => {
    expect(component).toMatch(
      /import\s*\{[^}]*computeEstimate[^}]*\}\s*from\s*"@\/lib\/estimate\/estimate"/,
    );
    // No local re-implementation of the engine's compute inside the UI tree.
    expect(component).not.toMatch(/function computeEstimate/);
    expect(page).not.toMatch(/function computeEstimate/);
  });
  it("the calculator reuses the shared summary view component", () => {
    expect(component).toMatch(/<EstimateSummaryView\b/);
    expect(component).toMatch(/estimate-summary-view/);
  });
});

describe("shared engine untouched — VAT is a display layer only", () => {
  it("the engine has no VAT concept and its version is still 1", () => {
    expect(engine.toLowerCase()).not.toContain("vat");
    expect(ESTIMATE_VERSION).toBe(1);
  });
  it("VAT lines come from the vat-display module, only when entered", () => {
    expect(component).toMatch(/computeVatDisplay/);
    expect(component).toMatch(/parseVatPercentInput/);
    // The VAT block renders behind the null-check (never invented).
    expect(component).toMatch(/\{vat && \(/);
  });
});

describe("quantity pack — rounding can never go down", () => {
  it("package count uses Math.ceil and never floor/round", () => {
    expect(packSrc).toMatch(/Math\.ceil\(/);
    expect(packSrc).not.toMatch(/packageCount\s*=[\s\S]{0,80}Math\.(floor|round)\(/);
  });
  it("the pack feeds engine fields instead of computing prices itself", () => {
    expect(packSrc).toMatch(/applyAreaQuantityToEstimate/);
    // The pack must not import or reimplement the estimate total.
    expect(packSrc).not.toMatch(/estimatedTotal|computeEstimate/);
  });
  it("the pack declares itself a quantity estimate, not structural design", () => {
    expect(packSrc).toMatch(/not structural design/i);
    // No structural-engineering advice concepts anywhere in the pack/UI copy.
    for (const src of [packSrc, component, page]) {
      expect(src).not.toMatch(/reinforc|foundation advice|load-?bearing/i);
    }
  });
});

describe("CSV export — formula-injection safe", () => {
  it("every cell goes through csvSafeCell on top of the shared csvCell", () => {
    expect(csvSrc).toMatch(
      /import\s*\{\s*csvCell\s*\}\s*from\s*"@\/lib\/projects\/operations-report"/,
    );
    expect(csvSrc).toMatch(/\^\[=\+\\-@\\t\\r\]/); // the guard regex
    expect(csvSrc).toMatch(/cells\.map\(csvSafeCell\)/);
  });
});

describe("cross-sector positioning — no construction-first product frame", () => {
  const CONSTRUCTION_FIRST = /statyb|construction|бетон|строит|\bbau(?![a-z])|bouw(?!en)/i;
  it("page h1/title copy is not construction-framed in any active locale", () => {
    for (const locale of ["en", "lt", "ru", "nl", "de"] as const) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const pc = messages.calculators?.projectCost;
      expect(pc, `${locale}: calculators.projectCost missing`).toBeTruthy();
      expect(String(pc.title), `${locale} title`).not.toMatch(CONSTRUCTION_FIRST);
    }
  });
  it("SEO titles stay cross-sector too", () => {
    for (const [locale, copy] of Object.entries(PAGE_SEO.projectCostCalculator)) {
      expect(copy.title, `${locale} SEO title`).not.toMatch(CONSTRUCTION_FIRST);
    }
  });
  it("all 9 sector templates are offered via the existing labels", () => {
    expect(page).toMatch(/ESTIMATE_TEMPLATES/);
    expect(component).toMatch(/ESTIMATE_TEMPLATES\.map/);
  });
});

describe("honest incompleteness — never a fake zero total", () => {
  it("the result step distinguishes empty / incomplete from complete", () => {
    expect(component).toMatch(/hasMeaningfulEstimate/);
    expect(component).toMatch(/estimateMissingInfoKeys/);
    expect(component).toContain('data-testid="pcc-empty"');
    expect(component).toContain('data-testid="pcc-incomplete"');
    expect(component).toMatch(/missing\.includes\("rate"\) \|\| missing\.includes\("hours"\)/);
  });
});

describe("every CTA resolves to a real route", () => {
  it("the dashboard bridge targets the existing anchored demand intake", () => {
    expect(component).toContain("/dashboard#demand-intake");
    const dashboard = read("app/[locale]/dashboard/page.tsx");
    expect(dashboard).toContain('id="demand-intake"');
  });
  it("the anonymous bridge targets the existing public company-need page", () => {
    expect(component).toContain('pathname: "/company-need"');
    expect(exists("app/[locale]/(marketing)/company-need/page.tsx")).toBe(true);
  });
  it("the calculator page itself is routed and in the sitemap", () => {
    expect(exists(PAGE_REL)).toBe(true);
    expect(read("app/sitemap.ts")).toContain("/calculators/project-cost");
  });
});

describe("calculator copy exists in all 5 active locales, same structure", () => {
  const keyPaths = (obj: Record<string, unknown>, prefix = ""): string[] =>
    Object.keys(obj)
      .sort()
      .flatMap((k) => {
        const p = prefix ? `${prefix}.${k}` : k;
        const v = obj[k];
        return v && typeof v === "object"
          ? [p, ...keyPaths(v as Record<string, unknown>, p)]
          : [p];
      });
  const en = JSON.parse(read("messages/en.json")).calculators.projectCost;
  const enKeys = keyPaths(en);
  for (const locale of ["lt", "ru", "nl", "de"] as const) {
    it(`${locale}: same key structure as EN, no empty / [EN] values`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`)).calculators?.projectCost;
      expect(m, `${locale} namespace`).toBeTruthy();
      expect(keyPaths(m)).toEqual(enKeys);
      const flat = JSON.stringify(m);
      expect(flat).not.toContain("[EN]");
      expect(flat).not.toContain('""');
    });
  }
});

describe("company-need prefill bridge — bounded and validated", () => {
  const parse = (qs: string) => parseCompanyNeedPrefill(new URLSearchParams(qs));
  it("accepts only in-range worker counts", () => {
    expect(parse("number_of_workers=5").numberOfWorkers).toBe(5);
    expect(parse("number_of_workers=0").numberOfWorkers).toBeUndefined();
    expect(parse("number_of_workers=10001").numberOfWorkers).toBeUndefined();
    expect(parse("number_of_workers=abc").numberOfWorkers).toBeUndefined();
    expect(parse("number_of_workers=2.5").numberOfWorkers).toBeUndefined();
  });
  it("accepts only known market countries", () => {
    expect(parse("country=lt").country).toBe("LT");
    expect(parse("country=XX").country).toBeUndefined();
  });
  it("accepts only known profession slugs and bounds free text", () => {
    expect(parse("profession=totally-made-up-slug").profession).toBeUndefined();
    const long = "x".repeat(5000);
    expect(parse(`description=${long}`).description?.length).toBe(1000);
    expect(parse(`expected_duration=${long}`).expectedDuration?.length).toBe(120);
  });
  it("the calculator sends only worker count + country (no prices, no PII)", () => {
    const query = component.slice(
      component.indexOf("query: {"),
      component.indexOf("}}", component.indexOf("query: {")),
    );
    expect(query).toContain("number_of_workers");
    expect(query).toContain("country");
    for (const banned of ["rate", "materials", "estimatedTotal", "workType", "description"]) {
      expect(query, `query must not carry ${banned}`).not.toContain(banned);
    }
  });
});
