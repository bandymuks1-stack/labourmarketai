import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FIRST_RUN_INTENTS,
  asksForCurrentEducation,
  companyPresetForIntents,
  identitiesForIntents,
  nextPathForIntents,
  parseFirstRunIntents,
  type FirstRunIntent,
} from "./first-run-intent";

describe("first-run intent router (pure)", () => {
  it("maps every intent onto exactly one of the two base identities", () => {
    for (const i of FIRST_RUN_INTENTS) {
      const ids = identitiesForIntents([i]);
      expect(ids).toHaveLength(1);
      expect(["worker", "company"]).toContain(ids[0]);
    }
    expect(identitiesForIntents(["work"])).toEqual(["worker"]);
    expect(identitiesForIntents(["student"])).toEqual(["worker"]);
    expect(identitiesForIntents(["hire"])).toEqual(["company"]);
    expect(identitiesForIntents(["agency"])).toEqual(["company"]);
    expect(identitiesForIntents(["education"])).toEqual(["company"]);
  });

  it("unions identities in canonical order and never invents a third one", () => {
    expect(identitiesForIntents(["education", "work"])).toEqual(["worker", "company"]);
    expect(identitiesForIntents(["hire", "agency", "education"])).toEqual(["company"]);
    expect(identitiesForIntents([])).toEqual([]);
  });

  it("parses the form field defensively: unknown dropped, duplicates collapsed, order canonical", () => {
    expect(parseFirstRunIntents("education, work,work, admin, student")).toEqual([
      "work",
      "student",
      "education",
    ]);
    expect(parseFirstRunIntents("")).toEqual([]);
    expect(parseFirstRunIntents(null)).toEqual([]);
  });

  it("no intent makes a profession a condition of entry (owner direction 2026-09-27)", () => {
    // The module used to export `professionRequiredForIntents`, which returned
    // true for the `work` intent and made onboarding refuse to continue
    // without a profession. Nothing may reintroduce a requirement: a person
    // between jobs, holding several trades, or holding one this registry does
    // not name, still gets through the door.
    // Comments stripped: the module's docblock deliberately RECORDS the
    // removed helper and why, and that history must not read as the thing
    // itself coming back.
    const code = readFileSync(join(__dirname, "first-run-intent.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/professionRequired/);
  });

  it("only the student intent adds a question of its own", () => {
    expect(asksForCurrentEducation(["student"])).toBe(true);
    expect(asksForCurrentEducation(["work"])).toBe(false);
    expect(asksForCurrentEducation(["hire"])).toBe(false);
  });

  it("an agency is a company TYPE and an institution is a company CAPABILITY — never root roles", () => {
    expect(companyPresetForIntents(["agency"])).toEqual({ companyType: "staffing_agency" });
    expect(companyPresetForIntents(["education"])).toEqual({ capability: "training_provider" });
    expect(companyPresetForIntents(["agency", "education"])).toEqual({
      companyType: "staffing_agency",
      capability: "training_provider",
    });
    expect(companyPresetForIntents(["hire"])).toEqual({});
    expect(companyPresetForIntents(["work"])).toBeNull();
    expect(companyPresetForIntents(["student"])).toBeNull();
  });

  it("never sends a fresh company identity to ?new=1 — onboarding already created its one shell row", () => {
    // Regression (production 2026-09-02): create mode after onboarding made
    // a SECOND company; two organisations + no pointer = "no company profile".
    for (const intents of [["hire"], ["agency"], ["education"], ["agency", "education"]] as const) {
      expect(nextPathForIntents([...intents])).not.toMatch(/new=1/);
    }
  });

  it("routes a company identity straight to the one canonical setup form with its presets", () => {
    expect(nextPathForIntents(["hire"])).toBe("/dashboard/start/company");
    expect(nextPathForIntents(["agency"])).toBe(
      "/dashboard/start/company?type=staffing_agency",
    );
    expect(nextPathForIntents(["education"])).toBe(
      "/dashboard/start/company?capability=training_provider",
    );
    expect(nextPathForIntents(["work"])).toBeNull();
    // A student's first screen is the Learning Compass, not the generic
    // worker setup card; a company intent alongside it still wins the setup
    // form (the company identity needs its organisation first).
    expect(nextPathForIntents(["student"])).toBe("/dashboard/profile#learning-compass");
    expect(nextPathForIntents(["student", "hire"])).toBe("/dashboard/start/company");
  });
});

/**
 * Owner correction 2026-09-26 — the first screen names CONTEXTS, not an
 * episode of looking for something. The six cards must keep every existing
 * continuation (identities, the study question,
 * the next screen) and the new "part of a company or team" card must stay a
 * PERSON: it never opens a company identity or the company setup form.
 */
describe("the six first-screen contexts keep onboarding's continuation", () => {
  const route = (intents: FirstRunIntent[]) => ({
    identities: identitiesForIntents(intents),
    study: asksForCurrentEducation(intents),
    next: nextPathForIntents(intents),
  });

  it("six cards, in the order the screen shows them", () => {
    expect(FIRST_RUN_INTENTS).toEqual(["work", "member", "hire", "agency", "student", "education"]);
  });

  it("A — only 'I work': the person, their own space", () => {
    expect(route(["work"])).toEqual({ identities: ["worker"], study: false, next: null });
  });

  it("B — 'I work' + 'part of a company or team': still one person, nothing created for the company", () => {
    expect(route(["work", "member"])).toEqual({ identities: ["worker"], study: false, next: null });
  });

  it("'part of a company or team' alone: a person, never the company setup", () => {
    expect(route(["member"])).toEqual({ identities: ["worker"], study: false, next: null });
    expect(companyPresetForIntents(["member"])).toBeNull();
  });

  it("C — 'I run a company or team': the one company setup form", () => {
    expect(route(["hire"])).toEqual({ identities: ["company"], study: false, next: "/dashboard/start/company" });
  });

  it("D — recruitment / workforce supply: a company of type staffing agency, never a root role", () => {
    expect(route(["agency"])).toEqual({
      identities: ["company"],
      study: false,
      next: "/dashboard/start/company?type=staffing_agency",
    });
  });

  it("E — learning / preparing for a profession: a person with a current study place", () => {
    expect(route(["student"])).toEqual({
      identities: ["worker"],
      study: true,
      next: "/dashboard/profile#learning-compass",
    });
  });

  it("F — an education provider: a company declaring the training capability", () => {
    expect(route(["education"])).toEqual({
      identities: ["company"],
      study: false,
      next: "/dashboard/start/company?capability=training_provider",
    });
  });

  it("G — several contexts at once: both identities, every question the parts need", () => {
    expect(route(["work", "member", "hire", "student"])).toEqual({
      identities: ["worker", "company"],
      study: true,
      next: "/dashboard/start/company",
    });
    expect(route(["member", "agency", "education"])).toEqual({
      identities: ["worker", "company"],
      study: false,
      next: "/dashboard/start/company?type=staffing_agency&capability=training_provider",
    });
    // The form field keeps the canonical order whatever order was clicked.
    expect(parseFirstRunIntents("education,member,work")).toEqual(["work", "member", "education"]);
  });
});

