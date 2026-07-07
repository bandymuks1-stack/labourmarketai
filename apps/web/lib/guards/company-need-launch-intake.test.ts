import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * COMPANY-NEED PAID-LAUNCH INTAKE GUARDS.
 *
 * The public /company-need form is the canonical company-demand PREPARATION
 * step (no anonymous persistence by design — the real structured submission
 * runs through the authenticated customer_requests intake after signup). This
 * guard pins the launch-intake improvements so they cannot silently regress:
 *   - the structured fields a real employer needs are present + wired;
 *   - every successful parse leads with the operational "prepared → next step"
 *     confirmation (no "AI not enabled / data not saved" dead-end);
 *   - no weak "preview"-style launch wording in the company-need copy;
 *   - the country control stays the constrained PR #675 dropdown;
 *   - lt/en/ru parity for the new keys.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const catalog = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as {
    companyNeed: Record<string, unknown>;
  };
const ACTIVE = ["lt", "en", "ru"] as const;

const NEW_FIELD_KEYS = [
  "contactPerson",
  "contactPersonHelp",
  "cityRegion",
  "cityRegionHelp",
  "expectedDuration",
  "expectedDurationHelp",
  "urgency",
  "urgencyAsap",
  "urgencyWeeks",
  "urgencyFlexible",
  "preparedTitle",
  "preparedBody",
] as const;

describe("the form exposes the structured intake fields a real employer needs", () => {
  const form = read("components/app/company-need-form.tsx");

  it.each([
    ["contact_person", "text"],
    ["city_region", "text"],
    ["expected_duration", "text"],
  ])("renders the %s input", (name) => {
    expect(form).toContain(`name="${name}"`);
  });

  it("renders the urgency select with the three canonical levels", () => {
    expect(form).toContain('name="urgency"');
    for (const v of ["asap", "weeks", "flexible"]) {
      expect(form).toContain(`value="${v}"`);
    }
  });

  it("keeps the country control a constrained dropdown (PR #675), not free text", () => {
    expect(form).toContain('<select name="country"');
    expect(form).not.toMatch(/<input[^>]*name="country"/);
  });
});

describe("the server action reads and forwards the new fields", () => {
  const action = read("lib/staffing/company-need-form-actions.ts");
  it.each([
    ["contact_person", "contactPerson"],
    ["city_region", "cityRegion"],
    ["expected_duration", "expectedDuration"],
    ["urgency", "urgency"],
  ])("maps form field %s into need.%s", (formField, needKey) => {
    expect(action).toContain(`formData.get("${formField}")`);
    // colon form (`contactPerson: ...`) or shorthand (`urgency,`)
    expect(action).toMatch(new RegExp(`${needKey}[,:]`));
  });
});

describe("the post-submit state is an operational confirmation, not a dead-end", () => {
  const form = read("components/app/company-need-form.tsx");

  it("leads every ok result with the prepared-confirmation block", () => {
    expect(form).toContain("company-need-prepared");
    expect(form).toContain("labels.preparedTitle");
    expect(form).toContain("labels.preparedBody");
  });

  it("no longer renders the bare 'AI disabled / none' dead-end as the result headline", () => {
    // The AI suggestion is now enrichment gated behind draftStatus === "suggestion";
    // the disabled/needs_review branches that only printed aiDisabled/aiNone are gone.
    expect(form).not.toMatch(/draftStatus === "disabled" \? \(\s*<p[^>]*>\{labels\.aiDisabled\}/);
    expect(form).toContain('state.draftStatus === "suggestion"');
  });
});

describe("company-need copy is operational, not weak 'preview' framing", () => {
  const WEAK = /\bpreview\b|peržiūra|предпросмотр/i;
  it("bridgeNote carries no preview-style wording in any active locale", () => {
    for (const loc of ACTIVE) {
      const note = String(catalog(loc).companyNeed.bridgeNote ?? "");
      expect(note, `${loc} bridgeNote weak wording`).not.toMatch(WEAK);
      expect(note.length).toBeGreaterThan(20);
    }
  });
});

describe("lt/en/ru parity for the new intake keys", () => {
  it("all new keys exist and are non-empty in every active locale", () => {
    for (const loc of ACTIVE) {
      const cn = catalog(loc).companyNeed;
      for (const k of NEW_FIELD_KEYS) {
        expect(typeof cn[k], `${loc} companyNeed.${k}`).toBe("string");
        expect(String(cn[k]).trim().length, `${loc} companyNeed.${k} empty`).toBeGreaterThan(0);
      }
    }
  });
});
