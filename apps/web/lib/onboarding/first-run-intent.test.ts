import { describe, expect, it } from "vitest";

import {
  FIRST_RUN_INTENTS,
  asksForCurrentEducation,
  companyPresetForIntents,
  identitiesForIntents,
  nextPathForIntents,
  parseFirstRunIntents,
  professionRequiredForIntents,
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

  it("asks for a profession only when the person came to work; a student may skip it", () => {
    expect(professionRequiredForIntents(["work"])).toBe(true);
    expect(professionRequiredForIntents(["work", "student"])).toBe(true);
    expect(professionRequiredForIntents(["student"])).toBe(false);
    expect(professionRequiredForIntents(["hire"])).toBe(false);
    expect(asksForCurrentEducation(["student"])).toBe(true);
    expect(asksForCurrentEducation(["work"])).toBe(false);
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

  it("routes a company identity straight to the one canonical setup form with its presets", () => {
    expect(nextPathForIntents(["hire"])).toBe("/dashboard/start/company?new=1");
    expect(nextPathForIntents(["agency"])).toBe(
      "/dashboard/start/company?new=1&type=staffing_agency",
    );
    expect(nextPathForIntents(["education"])).toBe(
      "/dashboard/start/company?new=1&capability=training_provider",
    );
    expect(nextPathForIntents(["work"])).toBeNull();
    expect(nextPathForIntents(["student"])).toBeNull();
  });
});
