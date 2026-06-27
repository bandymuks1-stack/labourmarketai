import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CV import path visibility from the profile (launch audit §7.4, PR #541).
 *
 * The CV import path (paste OR file → /api/cv/extract → deterministic skill
 * parser, no storage) already exists. This slice only makes it DISCOVERABLE from
 * the profile lead card via an honest, count-gated bridge link — it rebuilds no
 * upload / parser / storage. Pure UI/copy + guard.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("the hub surfaces the existing CV import as an honest bridge", () => {
  const hub = read("components/app/profile-hub-overview.tsx");

  it("renders a CV-import link gated on a missing CV (actionable, not noise)", () => {
    expect(hub).toMatch(/!aboutOk &&/);
    expect(hub).toMatch(/data-testid="profile-hub-cv-import-link"/);
    expect(hub).toMatch(/t\("cvImportLink"\)/);
  });

  it("points at the in-page editor where the import panel already lives", () => {
    expect(hub).toMatch(/href="#profile-edit"[\s\S]*?profile-hub-cv-import-link/);
  });
});

describe("the existing CV import path is reused, not rebuilt", () => {
  it("the panel still feeds the extract route via the existing upload component", () => {
    const panel = read("components/app/cv-input-panel.tsx");
    expect(panel).toMatch(/CvImportUpload/);
    expect(panel).toMatch(/onExtracted=\{onPasteSubmit\}/);
    // server-side extraction endpoint still present (not re-implemented here)
    expect(existsSync(join(REPO, "apps/web/app/api/cv/extract/route.ts"))).toBe(true);
  });
});

describe("CV-import link copy exists across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: profileHub.cvImportLink present + non-empty`, () => {
      const h = (JSON.parse(read(`messages/${loc}.json`)) as { profileHub?: Record<string, unknown> }).profileHub ?? {};
      expect(typeof h.cvImportLink, `${loc}.cvImportLink`).toBe("string");
      expect(String(h.cvImportLink).trim().length).toBeGreaterThan(0);
    });
  }
});
