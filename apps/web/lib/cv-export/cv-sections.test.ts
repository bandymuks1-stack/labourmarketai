import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  certificateDocsForCv,
  cvSectionVisibility,
  orderSkillsForNeed,
  projectsFromProof,
  splitAchievementsForCv,
  type CvSectionData,
} from "./cv-sections";
import { computeContextFit } from "@/lib/market/fit";

/**
 * Verified CV section honesty (Full CV System v1) — fixture-driven guards.
 * Pins: honest-empty (no data → no section on the export), expired/unready
 * certificates never print as held, projects derive ONLY from confirmed
 * proof, and tailored mode is a pure reorder with a mandatory §19 basis.
 */

const EMPTY: CvSectionData = {
  professionalSummary: null,
  workHistoryCount: 0,
  languagesCount: 0,
  certificateDocsCount: 0,
  drivingLicenceCategoriesCount: 0,
  declaredCertificatesCount: 0,
  educationCount: 0,
  achievementsCount: 0,
  projectsCount: 0,
  hasSalary: false,
  hasAvailability: false,
  includePrivateDetails: false,
};

describe("cvSectionVisibility — honest empty contract", () => {
  it("renders NO section when its data is empty", () => {
    const v = cvSectionVisibility(EMPTY);
    expect(Object.values(v).every((x) => x === false)).toBe(true);
  });

  it("each section appears ONLY with its own real data", () => {
    expect(cvSectionVisibility({ ...EMPTY, languagesCount: 1 }).languages).toBe(true);
    expect(cvSectionVisibility({ ...EMPTY, educationCount: 2 }).education).toBe(true);
    expect(cvSectionVisibility({ ...EMPTY, achievementsCount: 1 }).achievements).toBe(true);
    expect(cvSectionVisibility({ ...EMPTY, projectsCount: 1 }).projects).toBe(true);
    expect(
      cvSectionVisibility({ ...EMPTY, drivingLicenceCategoriesCount: 1 }).certificates,
    ).toBe(true);
    expect(
      cvSectionVisibility({ ...EMPTY, declaredCertificatesCount: 1 }).certificates,
    ).toBe(true);
    // Cross-contamination check: one section's data never lights another.
    const onlyLang = cvSectionVisibility({ ...EMPTY, languagesCount: 3 });
    expect(onlyLang.education).toBe(false);
    expect(onlyLang.certificates).toBe(false);
    expect(onlyLang.projects).toBe(false);
  });

  it("salary/availability require the explicit per-export opt-in", () => {
    expect(
      cvSectionVisibility({ ...EMPTY, hasSalary: true }).privateDetails,
    ).toBe(false);
    expect(
      cvSectionVisibility({ ...EMPTY, hasSalary: true, includePrivateDetails: true })
        .privateDetails,
    ).toBe(true);
    // Opt-in without any fact still renders nothing (no empty section).
    expect(
      cvSectionVisibility({ ...EMPTY, includePrivateDetails: true }).privateDetails,
    ).toBe(false);
  });

  it("the /cv page uses this single guard for every new section", () => {
    const src = readFileSync(
      path.join(__dirname, "../../app/[locale]/cv/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/cvSectionVisibility\(/);
    // (summary keeps the older guard-pinned `cv.professionalSummary ?`
    // conditional — same honest-empty behaviour, pinned elsewhere.)
    for (const key of [
      "visibility.workHistory",
      "visibility.education",
      "visibility.languages",
      "visibility.certificates",
      "visibility.projects",
      "visibility.achievements",
    ]) {
      expect(src).toContain(key);
    }
  });
});

describe("certificateDocsForCv", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  it("keeps only READY, unexpired certificate/licence types", () => {
    const rows = certificateDocsForCv(
      [
        { documentTypeSlug: "professional_certificate", country: "LT", storedStatus: "ready", validUntil: "2027-01-01" },
        { documentTypeSlug: "a1_certificate", country: "NL", storedStatus: "ready", validUntil: null },
        // expired — must NOT print as held
        { documentTypeSlug: "professional_certificate", country: "DE", storedStatus: "ready", validUntil: "2026-01-01" },
        // not ready — worker's own checklist state says it is missing
        { documentTypeSlug: "professional_certificate", country: null, storedStatus: "missing", validUntil: null },
        // not certificate material
        { documentTypeSlug: "cv", country: null, storedStatus: "ready", validUntil: null },
        { documentTypeSlug: "id_document", country: null, storedStatus: "ready", validUntil: null },
      ],
      now,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.typeSlug).sort()).toEqual([
      "a1_certificate",
      "professional_certificate",
    ]);
  });
});

describe("projectsFromProof", () => {
  it("derives distinct titled projects from confirmed proof only", () => {
    const projects = projectsFromProof([
      { projectTitle: "Halė A", confirmedAt: "2026-01-01T00:00:00Z" },
      { projectTitle: "Halė A", confirmedAt: "2026-03-01T00:00:00Z" },
      { projectTitle: null, confirmedAt: "2026-04-01T00:00:00Z" },
      { projectTitle: "  ", confirmedAt: "2026-04-01T00:00:00Z" },
      { projectTitle: "Sandėlis B", confirmedAt: "2026-02-01T00:00:00Z" },
    ]);
    expect(projects).toEqual([
      { title: "Halė A", lastConfirmedAt: "2026-03-01T00:00:00Z" },
      { title: "Sandėlis B", lastConfirmedAt: "2026-02-01T00:00:00Z" },
    ]);
    expect(projectsFromProof([])).toEqual([]);
  });
});

describe("splitAchievementsForCv", () => {
  it("splits declared certificates from real achievements", () => {
    const { declaredCertificates, achievements } = splitAchievementsForCv([
      { title: "Aukštalipio pažymėjimas", description: null, achievedAt: null, achievementTypeSlug: "declared_certificate", confirmedByManager: false },
      { title: "Metų meistras", description: null, achievedAt: null, achievementTypeSlug: "award", confirmedByManager: false },
    ]);
    expect(declaredCertificates).toHaveLength(1);
    expect(achievements).toHaveLength(1);
    expect(achievements[0].achievementTypeSlug).toBe("award");
  });
});

describe("tailored ordering (§19)", () => {
  it("reorders matched-first WITHOUT adding or dropping skills", () => {
    const slugs = ["a", "b", "c", "d"];
    const { ordered, matchedCount } = orderSkillsForNeed(
      slugs,
      (s) => s,
      new Set(["c", "a"]),
    );
    expect(ordered).toEqual(["a", "c", "b", "d"]); // stable within groups
    expect(matchedCount).toBe(2);
    expect([...ordered].sort()).toEqual([...slugs].sort()); // pure reorder
  });

  it("no matches → original order, zero highlight basis", () => {
    const { ordered, matchedCount } = orderSkillsForNeed(
      ["x", "y"],
      (s) => s,
      new Set(),
    );
    expect(ordered).toEqual(["x", "y"]);
    expect(matchedCount).toBe(0);
  });

  it("the fit basis comes from the SAME §19 engine the board uses", () => {
    const fit = computeContextFit(
      ["masonry", "tiling", "welding"],
      [
        { uri: "masonry", verified: true },
        { uri: "tiling", verified: false },
      ],
    );
    expect(fit).not.toBeNull();
    expect(fit!.matchedTotal).toBe(2);
    expect(fit!.needTotal).toBe(3);
    expect(fit!.matchedConfirmed).toBe(1);
    // unstructured need → NO percentage, ever
    expect(computeContextFit([], [{ uri: "masonry", verified: true }])).toBeNull();
  });
});
