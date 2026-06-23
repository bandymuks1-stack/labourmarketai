import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: Work Journal extraction is cross-sector (whole labour market), not
 * construction-only, and stays honest (system-detected data is never verified;
 * evidence source is work_journal). Static source + i18n assertions.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const engine = read("lib/structuring/universal-recognition.ts");
const review = read("lib/work-entry/entry-skill-review.ts");
const ui = read("components/app/work-entry-skill-review.tsx");
const sectors = read("lib/structuring/sectors.ts");

describe("recogniser is cross-sector, not construction-only", () => {
  it("declares the required non-construction domains", () => {
    for (const d of [
      "cooking", "gardening", "driving_logistics", "warehouse",
      "customer_service", "it", "language", "equipment", "care",
    ]) {
      expect(engine, `domain ${d}`).toMatch(new RegExp(`domain: "${d}"`));
    }
  });
  it("maps domains to whole-labour-market sectors (DOMAIN_SECTOR)", () => {
    expect(engine).toMatch(/export const DOMAIN_SECTOR/);
    for (const s of [
      "hospitality_food", "agriculture", "transport_logistics", "retail_sales",
      "care_health", "manufacturing", "education",
    ]) {
      expect(engine, `sector ${s}`).toMatch(new RegExp(s));
    }
  });
  it("has NO construction default / construction-only branch", () => {
    // No code path that early-returns or filters to construction only.
    expect(engine).not.toMatch(/construction-only/);
    expect(engine).not.toMatch(/DEFAULT_DOMAIN\s*=\s*"construction"/);
    expect(sectors).toMatch(/DEFAULT_SECTOR:\s*SectorKey\s*=\s*"other"/);
    expect(sectors).not.toMatch(/DEFAULT_SECTOR[^;]*"construction"/);
  });
});

describe("required distinctions are modelled", () => {
  it("separates existing vs new skills, activities, evidence source + verification", () => {
    expect(review).toMatch(/existingItems/);
    expect(review).toMatch(/newItems/);
    expect(review).toMatch(/PerformedActivity/);
    expect(review).toMatch(/evidenceSource/);
    expect(review).toMatch(/verificationState/);
  });
  it("evidence source is work_journal and verification stays unverified", () => {
    expect(review).toMatch(/verificationState:\s*"unverified"/);
    expect(engine).toMatch(/EVIDENCE_SOURCE\s*=\s*"work_journal"/);
  });
});

describe("honesty: system-detected data is never verified", () => {
  it("recognition suggestions are confirmed:false, never confirmed:true", () => {
    expect(engine).toMatch(/confirmed: false/);
    expect(engine).not.toMatch(/confirmed: true/);
  });
  it("the review UI carries an explicit not-verified note", () => {
    expect(ui).toMatch(/data-testid="work-entry-verification-note"/);
    expect(ui).toMatch(/verificationNote/);
  });
});

describe("UI separates the required buckets", () => {
  for (const id of [
    "work-entry-activities",
    "work-entry-existing",
    "work-entry-new",
    "work-entry-verification-note",
  ]) {
    it(`renders ${id}`, () => {
      expect(ui).toMatch(new RegExp(`data-testid="${id}"`));
    });
  }
});

describe("i18n parity for the new review copy (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: workEntryReview has the cross-sector keys + 14 domains`, () => {
      const w = JSON.parse(read(`messages/${loc}.json`)).workEntryReview;
      for (const k of ["existingTitle", "newTitle", "activitiesTitle", "evidenceLabel", "evidenceJournal", "verificationNote", "existingBadge"]) {
        expect(typeof w?.[k] === "string" && w[k].length > 0, `${loc} ${k}`).toBe(true);
      }
      expect(Object.keys(w.domain)).toHaveLength(14);
      for (const d of ["cooking", "gardening", "driving_logistics", "warehouse", "customer_service", "it", "language", "equipment", "care"]) {
        expect(typeof w.domain[d] === "string" && w.domain[d].length > 0, `${loc} domain.${d}`).toBe(true);
      }
    });
  }
});