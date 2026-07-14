import { describe, expect, it } from "vitest";

import {
  classifyEducationError,
  EDUCATION_TYPE_SLUGS,
  parseEducationTypeSlug,
  parseEducationYear,
  validateEducationInput,
} from "./worker-education-model";
import {
  ACHIEVEMENT_TYPE_SLUGS,
  classifyAchievementsError,
  validateAchievementInput,
} from "./worker-achievements-model";

/**
 * Education + achievements pure models (Full CV System v1) — pins the closed
 * slug sets (mirror of DRAFT migration 20260714160000 seeds), the validation
 * honesty rules, and needs-migration error classification.
 */

describe("worker-education-model", () => {
  it("mirrors the migration seed slugs exactly", () => {
    expect([...EDUCATION_TYPE_SLUGS]).toEqual([
      "primary",
      "secondary",
      "vocational",
      "college",
      "university_bachelor",
      "university_master",
      "doctorate",
      "course_certificate",
      "other",
    ]);
  });

  it("rejects unknown slugs to null — never coerces", () => {
    expect(parseEducationTypeSlug("vocational")).toBe("vocational");
    expect(parseEducationTypeSlug("hogwarts")).toBeNull();
    expect(parseEducationTypeSlug("")).toBeNull();
  });

  it("bounds years to 1900..2100", () => {
    expect(parseEducationYear("2015")).toBe(2015);
    expect(parseEducationYear("1899")).toBeNull();
    expect(parseEducationYear("2101")).toBeNull();
    expect(parseEducationYear("abc")).toBeNull();
    expect(parseEducationYear("")).toBeNull();
  });

  it("validates a full input and rejects dishonest combinations", () => {
    const ok = validateEducationInput({
      institutionName: "  VGTU ",
      programOrField: "Statybos inžinerija",
      educationTypeSlug: "university_bachelor",
      startYear: "2014",
      endYear: "2018",
      isCurrent: false,
      note: null,
    });
    expect(ok).not.toBeNull();
    expect(ok!.institutionName).toBe("VGTU");

    // end before start
    expect(
      validateEducationInput({
        institutionName: "VGTU",
        educationTypeSlug: "college",
        startYear: "2018",
        endYear: "2014",
      }),
    ).toBeNull();
    // "current" AND an end year — contradictory (mirrors the table CHECK)
    expect(
      validateEducationInput({
        institutionName: "VGTU",
        educationTypeSlug: "college",
        endYear: "2020",
        isCurrent: true,
      }),
    ).toBeNull();
    // a stated-but-unparseable year is rejected, never silently dropped
    expect(
      validateEducationInput({
        institutionName: "VGTU",
        educationTypeSlug: "college",
        startYear: "20xx",
      }),
    ).toBeNull();
    // too-short institution
    expect(
      validateEducationInput({ institutionName: "V", educationTypeSlug: "college" }),
    ).toBeNull();
  });

  it("classifies not-applied codes as needs_migration", () => {
    for (const code of ["42P01", "42703", "PGRST205", "42883", "PGRST202"]) {
      expect(classifyEducationError(code)).toBe("needs_migration");
    }
    expect(classifyEducationError("42501")).toBe("unauthenticated");
    expect(classifyEducationError("XX000")).toBe("error");
  });
});

describe("worker-achievements-model", () => {
  it("mirrors the migration seed slugs exactly (incl. declared_certificate)", () => {
    expect([...ACHIEVEMENT_TYPE_SLUGS]).toEqual([
      "achievement",
      "award",
      "course_completion",
      "declared_certificate",
      "other",
    ]);
  });

  it("validates inputs and never carries a confirmation field", () => {
    const ok = validateAchievementInput({
      title: "Aukštalipio pažymėjimas",
      achievedAt: "2020-01-01",
      achievementTypeSlug: "declared_certificate",
    });
    expect(ok).not.toBeNull();
    // The input shape has NO confirmed_by_manager key — the app cannot even
    // express a self-confirmation (grant-level exclusion is the DB backstop).
    expect(Object.keys(ok!)).toEqual([
      "title",
      "description",
      "achievedAt",
      "achievementTypeSlug",
    ]);

    expect(
      validateAchievementInput({ title: "x", achievementTypeSlug: "award" }),
    ).toBeNull(); // too short
    expect(
      validateAchievementInput({ title: "Valid title", achievedAt: "2020/01/01" }),
    ).toBeNull(); // bad date shape
    expect(
      validateAchievementInput({ title: "Valid title", achievementTypeSlug: "nope" }),
    ).toBeNull(); // unknown slug
  });

  it("classifies not-applied codes as needs_migration", () => {
    expect(classifyAchievementsError("42P01")).toBe("needs_migration");
    expect(classifyAchievementsError("42501")).toBe("unauthenticated");
    expect(classifyAchievementsError(undefined)).toBe("error");
  });
});
