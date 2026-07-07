import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isConstructionWorkType,
  CONSTRUCTION_WORK_TYPE_SLUGS,
  WORK_CATEGORIES,
} from "@/lib/taxonomy/work-categories";

/**
 * CONSTRUCTION EMPLOYER PARTNER-ROUTE COPY v1 — GUARDS.
 *
 * On /company-need, a construction need's response shows an honest LT/PL
 * partner-company fallback route. This guard pins:
 *   - the sector detection is correct (construction slugs only);
 *   - the block renders only when the need is construction;
 *   - lt/en/ru copy exists and is honest (no guarantee / automatic-match /
 *     instant / demo / preview / coming-soon wording; mentions LT/PL +
 *     partner + a human-coordinated framing);
 *   - the existing received/prepared states + country dropdown are intact.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const catalog = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as { companyNeed: Record<string, string> };
const ACTIVE = ["lt", "en", "ru"] as const;

describe("construction sector detection is config-derived and correct", () => {
  it("recognises every construction work-type slug and nothing else", () => {
    const construction = WORK_CATEGORIES.find((c) => c.key === "construction")!;
    for (const t of construction.types) {
      expect(isConstructionWorkType(t.slug), t.slug).toBe(true);
    }
    // A sampling of non-construction slugs must be false.
    for (const slug of ["warehouse_worker", "cook", "care_assistant", "truck_driver_c", "other_general"]) {
      expect(isConstructionWorkType(slug), slug).toBe(false);
    }
    expect(isConstructionWorkType(undefined)).toBe(false);
    expect(isConstructionWorkType("")).toBe(false);
    expect(CONSTRUCTION_WORK_TYPE_SLUGS).toContain("welder");
  });
});

describe("the server action threads an isConstruction flag from the profession", () => {
  const action = read("lib/staffing/company-need-form-actions.ts");
  it("computes isConstruction from the submitted profession slug", () => {
    expect(action).toContain("isConstructionWorkType(raw.profession)");
    expect(action).toContain("isConstruction");
  });
});

describe("the partner-route block renders only for construction needs", () => {
  const form = read("components/app/company-need-form.tsx");
  it("is gated on state.isConstruction inside the result panel", () => {
    expect(form).toContain("company-need-partner-route");
    expect(form).toContain("state.isConstruction");
    expect(form).toContain("labels.partnerRouteTitle");
    expect(form).toContain("labels.partnerRouteBody");
  });
});

describe("partner-route copy is present and honest in lt/en/ru", () => {
  const BANNED = /guarantee|garantuo|гаранти|automatic match|automatinis atitikim|автоматическое совпаден|instant worker|\bdemo\b|\bpreview\b|coming soon|netrukus/i;

  it.each(ACTIVE)("%s has a non-empty title + body", (loc) => {
    const cn = catalog(loc).companyNeed;
    expect(typeof cn.partnerRouteTitle).toBe("string");
    expect(cn.partnerRouteTitle.length).toBeGreaterThan(5);
    expect(cn.partnerRouteBody.length).toBeGreaterThan(60);
  });

  it.each(ACTIVE)("%s body uses no forbidden guarantee/automatic/demo wording", (loc) => {
    const cn = catalog(loc).companyNeed;
    expect(cn.partnerRouteBody, `${loc} partnerRouteBody`).not.toMatch(BANNED);
    expect(cn.partnerRouteTitle, `${loc} partnerRouteTitle`).not.toMatch(BANNED);
  });

  it.each(ACTIVE)("%s body names the owner-approved LT + PL partner companies", (loc) => {
    const body = catalog(loc).companyNeed.partnerRouteBody;
    // The two owner-approved partners (approved 2026-07-07) — named verbatim.
    expect(body, `${loc} LT partner`).toMatch(/Nonstop Group/);
    expect(body, `${loc} PL partner`).toMatch(/Labour Market AI Sp\. z o\.o\./);
    // each carries its market marker
    expect(body, `${loc} LT marker`).toMatch(/\(LT\)/);
    expect(body, `${loc} PL marker`).toMatch(/\(PL\)/);
  });

  it.each(ACTIVE)("%s body keeps partner-company + human-coordinated + conditional framing", (loc) => {
    const body = catalog(loc).companyNeed.partnerRouteBody;
    expect(body, `${loc} partner`).toMatch(/partner|partneri|партн/i);
    // conditional ("if ... not yet") framing
    expect(body, `${loc} conditional`).toMatch(/if |jei |если/i);
    // human-coordinated (not automatic)
    expect(body, `${loc} human`).toMatch(/human|žmog|человек/i);
  });
});

describe("existing /company-need response states remain intact", () => {
  const form = read("components/app/company-need-form.tsx");
  it("keeps the received + prepared states and the country dropdown", () => {
    expect(form).toContain("company-need-received");
    expect(form).toContain("company-need-prepared");
    expect(form).toContain('<select name="country"');
  });
});
