import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — UX gaps 2026-11-18, E-2 / E-3 / A-1. The setup form was 2,233 px at
 * 375 with ~20 controls though only the name is required, and after Save the
 * result and its next door sat below two competing buttons. A first setup now
 * shows name, type and country and keeps the optional fields in one closed
 * group (still inside the form, so they still submit); editing keeps every
 * field open. After a save the result scrolls into view and the next door is
 * the one primary action.
 */
const WEB = join(__dirname, "..", "..");
const src = readFileSync(join(WEB, "components/app/company-setup-form.tsx"), "utf8");
const at = (needle: string) => {
  const i = src.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return i;
};

describe("company setup: what is needed first", () => {
  it("collapses the optional fields only on a first setup", () => {
    expect(src).toMatch(/const collapseOptional = existing === null \|\| firstSetup;/);
    expect(src).toMatch(/\{collapseOptional \? \(\s*<details[^>]*data-testid="company-setup-optional"/);
    expect(src).toMatch(/\) : \(\s*optionalFields\s*\)\}/);
    expect(src).toMatch(/<summary className="flex min-h-11[^"]*">\s*\{labels\.optionalDetails\}/);
  });

  it("the optional group holds registration, address, website, contacts and role; name, type and country stay outside", () => {
    const group = src.slice(at("const optionalFields = ("), at("  return (\n    <form"));
    for (const name of ["registration_code", "address", "website", "contact_email", "contact_phone", "requester_role"]) {
      expect(group, name).toContain(`name="${name}"`);
    }
    for (const name of ["legal_name", "company_type", "country"]) {
      expect(group, name).not.toContain(`name="${name}"`);
      expect(src.slice(at("  return (\n    <form")), name).toContain(`name="${name}"`);
    }
    // The group is rendered inside the <form>, so its fields are submitted.
    expect(at("{optionalFields}")).toBeGreaterThan(at("  return (\n    <form"));
    expect(at("{optionalFields}")).toBeLessThan(at("</form>"));
  });

  it("after a save the result scrolls into view", () => {
    expect(src).toMatch(/resultRef\.current\?\.scrollIntoView\(\{ behavior: reduce \? "auto" : "smooth", block: "start" \}\)/);
    expect(src).toMatch(/ref=\{resultRef\}\s*data-testid="company-setup-result"/);
    expect(src).toMatch(/prefers-reduced-motion: reduce/);
  });

  it("while the next door is shown, Save is secondary — one primary action", () => {
    expect(src).toMatch(/variant=\{state\?\.ok \? "secondary" : "primary"\}[\s\S]{0,80}data-testid="company-setup-save-draft"/);
    expect(src).toMatch(/\{state\?\.ok \? \(\s*<div[^>]*data-testid="company-setup-next"/);
  });
});

describe("company setup: the summary label in every catalog", () => {
  it("roleDashboards.company.setup.optionalDetails has real text in all 11 catalogs", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de", "pl", "sv", "da", "et", "lv", "no"]) {
      const d = JSON.parse(readFileSync(join(WEB, `messages/${loc}.json`), "utf8"));
      const v = d.roleDashboards.company.setup.optionalDetails as string;
      expect(typeof v, loc).toBe("string");
      expect(v.length, loc).toBeGreaterThan(5);
      expect(v, loc).not.toMatch(/\[EN\]/);
    }
  });
});
