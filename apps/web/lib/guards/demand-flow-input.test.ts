/**
 * Demand-flow input + clarity guard (P0 activity/workspace flow fix).
 *
 * The dashboard "create a work need" screen must be a REAL, understandable
 * flow: a real input the user fills, empty creation blocked, the numbered steps
 * a real wizard (not fake-clickable cards), an intent-matching CTA, no animated
 * sweep over the form, and fully localized copy (lt/en/ru).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

const form = read("components/app/demand-request-button.tsx");
const page = read("app/[locale]/dashboard/page.tsx");
const helper = read("lib/demand/demand-request.ts");
const readback = read("components/app/demand-requests-readback.tsx");
const requestsLib = read("lib/buyer/customer-requests.ts");

describe("demand flow has a real input", () => {
  it("renders a real description textarea + a role input", () => {
    expect(form).toMatch(/<textarea/);
    expect(form).toContain('data-testid="demand-description"');
    expect(form).toContain('data-testid="demand-role"');
  });
  it("collects criteria fields (location / skills / urgency / notes)", () => {
    for (const id of ["demand-location", "demand-skills", "demand-notes"]) {
      expect(form).toContain(`data-testid="${id}"`);
    }
    expect(form).toMatch(/urgencyOptions/);
  });
});

describe("empty creation is blocked", () => {
  it("create is disabled without a description (client)", () => {
    expect(form).toMatch(/descOk\s*=\s*description\.trim\(\)\.length\s*>\s*0/);
    expect(form).toMatch(/disabled=\{state === "sending" \|\| !descOk\}/);
  });
  it("the server blocks an empty need (no placeholder request)", () => {
    expect(helper).toMatch(/empty_description/);
    expect(helper).toMatch(/description\.length === 0/);
    expect(helper).toMatch(/p_need_summary:\s*description/);
  });
});

describe("the 1/2/3 steps are a real wizard, not fake-clickable cards", () => {
  it("has real Back/Next controls driving step state", () => {
    expect(form).toMatch(/setStep/);
    expect(form).toContain('data-testid="demand-next"');
    expect(form).toContain('data-testid="demand-back"');
  });
  it("the progress dots carry no button/link/onClick (progress-only)", () => {
    // Isolate the progress <ol> and assert it has no interactive semantics.
    const start = form.indexOf('aria-label={t("form.progressLabel")}');
    const segment = form.slice(start, start + 900);
    expect(segment).not.toMatch(/onClick|role="button"|<button|<Link\b|href=/);
  });
});

describe("CTA matches the object being created (intent-specific)", () => {
  it("the create button uses the intent-specific cta key", () => {
    expect(form).toMatch(/\{state === "sending" \? t\("sending"\) : t\(`\$\{key\}\.cta`\)\}/);
  });
  it("submits via the canonical action", () => {
    expect(form).toMatch(/submitDemandRequestAction\(intent, \{/);
  });
});

describe("no animated sweep / purple band over the form", () => {
  it("the demand-intake section does not use the wow-card sweep", () => {
    const start = page.indexOf('data-testid="demand-intake-section"');
    expect(start).toBeGreaterThan(-1);
    const sectionTagStart = page.lastIndexOf("<section", start);
    const sectionOpen = page.slice(sectionTagStart, start + 40);
    expect(sectionOpen).not.toMatch(/wow-card/);
  });
  it("the old fake-clickable lanes grid is gone", () => {
    expect(page).not.toMatch(/lanes\.map/);
  });
});

describe("submitted values are read back to the owner", () => {
  it("the form shows a post-submit confirmation panel echoing the input", () => {
    expect(form).toContain('data-testid="demand-submitted-summary"');
    expect(form).toContain("submittedHeading");
    // The same summary list is shown on review AND after submit (one source).
    expect(form).toContain("summaryList");
    expect(form).toContain('data-testid="demand-summary-description"');
  });
  it("the persistent read-back surfaces the submitted payload fields", () => {
    expect(readback).toContain('data-testid="demand-readback-details"');
    for (const f of ["description", "role", "location", "skills", "urgency", "notes"]) {
      expect(readback).toContain(`labels.fields.${f}`);
    }
    // It reads role/location/skills/urgency/notes from the request payload.
    expect(readback).toMatch(/r\.payload/);
  });
  it("listOwnCustomerRequests selects the payload jsonb", () => {
    expect(requestsLib).toMatch(/notes, payload, status/);
    expect(requestsLib).toMatch(/payload:\s*\n?\s*r\.payload/);
  });
});

describe("no fake AI / matching / verification language in the demand surface", () => {
  for (const [name, src] of [
    ["form", form],
    ["read-back", readback],
  ] as const) {
    it(`${name} makes no matched/verified/AI claim`, () => {
      expect(src).not.toMatch(/\bmatched\b|\bverified\b|\bAI\b|\bautomatically matched\b/i);
    });
  }
});

describe("copy is localized for active locales (lt/en/ru)", () => {
  for (const locale of ["lt", "en", "ru"] as const) {
    it(`${locale}: demand.form + intent role/description + read-back keys exist`, () => {
      const j = JSON.parse(read(`messages/${locale}.json`));
      const d = j.auth.dashboard.wow.demand;
      for (const k of [
        "back",
        "next",
        "descRequired",
        "locationLabel",
        "skillsLabel",
        "urgencyLabel",
        "notesLabel",
        "reviewIntro",
        "submittedHeading",
      ]) {
        expect(typeof d.form[k], `${locale} demand.form.${k}`).toBe("string");
      }
      for (const intent of ["hire", "partner"] as const) {
        for (const k of ["roleLabel", "rolePlaceholder", "descLabel", "descPlaceholder"]) {
          expect(typeof d[intent][k], `${locale} demand.${intent}.${k}`).toBe("string");
        }
      }
      // Read-back field labels (detailsLabel + per-field) must exist.
      const rb = j.demandReadback;
      expect(typeof rb.detailsLabel, `${locale} demandReadback.detailsLabel`).toBe("string");
      for (const f of ["description", "role", "location", "skills", "urgency", "notes"]) {
        expect(typeof rb.fields[f], `${locale} demandReadback.fields.${f}`).toBe("string");
      }
    });
  }
});
