import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Local interactive UX review 2026-10-24 — items 1.4, 3.6, 3.26, 4.16, 4.28.
 * Each block pins the root-cause fix so the defect cannot quietly return.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const catalog = (l: string) =>
  JSON.parse(read(`messages/${l}.json`)) as Record<string, Record<string, unknown>>;
const ACTIVE = ["lt", "en", "ru", "nl", "de", "pl"] as const;

describe("1.4 onboarding: the missing-field error sits AT the field; no e-mail handle as a name", () => {
  const wizard = read("components/app/onboarding-wizard.tsx");
  const page = read("app/[locale]/onboarding/page.tsx");
  it("the name input carries aria-invalid + aria-describedby to its own message", () => {
    expect(wizard).toMatch(/aria-invalid=\{fieldError === "name"/);
    expect(wizard).toMatch(/aria-describedby=\{fieldError === "name" \? nameErrorId/);
    expect(wizard).toMatch(/id=\{nameErrorId\}/);
  });
  it("the country listbox is marked and points at the message right under it", () => {
    expect(wizard).toMatch(/invalid=\{fieldError === "country"\}/);
    expect(wizard).toMatch(/describedBy=\{fieldError === "country" \? countryErrorId/);
    expect(wizard).toMatch(/data-testid="onboarding-country-error"/);
  });
  it("the required-field errors are no longer only the far-away form-level line", () => {
    expect(wizard).not.toMatch(/setError\(t\("error_country_required"\)\)/);
    expect(wizard).not.toMatch(/setError\(t\("error_name_required"\)\)/);
  });
  it("the display name is never prefilled from the e-mail local part", () => {
    expect(page).not.toMatch(/email\s*\?\s*user\.email\.split\("@"\)/);
    expect(page).not.toMatch(/emailLocal/);
  });
});

describe("3.6 assignment: no pre-save advisory beside a finished assignment", () => {
  const src = read("components/app/project-assignment-manager.tsx");
  it("the pre-check verdict is dropped once THIS project + person is assigned", () => {
    expect(src).toMatch(/const justAssigned =/);
    expect(src).toMatch(/!justAssigned && pre && pre\.key === precheckKey/);
  });
});

describe("3.26 instructions: the worker sees who sent it", () => {
  it("an RLS-hidden author name falls back to the permission-gated counterpart reader", () => {
    const src = read("lib/instructions/instructions.ts");
    expect(src).toMatch(/readCounterpartIdentities\(unnamed\)/);
  });
});

describe("4.16 scouting: a raised hand is a working contact door, said so", () => {
  const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
  it("both candidate lists suppress 'shortlist first' when the interest card can open the thread", () => {
    expect(page.match(/inConversation \|\| interestDoor \? null/g)?.length).toBe(2);
    expect(page.match(/t\("comms\.interestDoor"\)/g)?.length).toBe(2);
  });
  it.each(ACTIVE)("%s: no 'messaging comes later' copy; the interest-door line exists", (l) => {
    const s = catalog(l).scouting as { comms: Record<string, string> };
    expect(s.comms.interestDoor).toBeTruthy();
    expect(s.comms.eligible).not.toMatch(/vėliau|later|позже|later stap|späteren|kolejnym/i);
  });
  it("the counterpart reader translates the RPC's English pseudonym", () => {
    const src = read("lib/communication/contact-permission.ts");
    expect(src).toMatch(/localizePseudonymousName\(stored, candidateName\)/);
    expect(src).toMatch(/t\("anonymousName", \{ token \}\)/);
  });
});

describe("4.28 supply declaration: a saved intent reads in words, never as its code", () => {
  it("the saved answers and the form share one label mapping", () => {
    const src = read("components/app/partner-supply-representation.tsx");
    expect(src).toMatch(/intentLabelFor\(declaration\?\.intentState, labels\)/);
    expect(src).not.toMatch(/\{declaration\?\.intentState \?\? labels\.unknown\}/);
  });
});
