import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveWorkHistory,
  historyKindOf,
  PRACTICE_RELATIONSHIPS,
  PROFESSIONAL_HISTORY_RELATIONSHIPS,
  SELF_DECLARED_RELATIONSHIPS,
  WORKER_RELATIONSHIPS,
  type WorkHistorySourceRow,
} from "@/lib/player-card/work-history-model";
import { cvSectionVisibility } from "@/lib/cv-export/cv-sections";

/**
 * A STUDENT'S PLACEMENT IS EXPERIENCE (education pilot P0).
 *
 * Before this slice, `student` and `volunteer` engagements were filtered out
 * of the CV, the profile card and the work-log context picker, and the only
 * self-service write path refused to record them at all. A student who had
 * really worked was therefore indistinguishable from a person who never had.
 *
 * These tests pin the two halves of the fix that must never drift apart:
 * placements are VISIBLE, and placements are never LABELLED AS EMPLOYMENT.
 */

const APP = join(process.cwd());
const read = (p: string) => readFileSync(join(APP, p), "utf-8");

const row = (o: Partial<WorkHistorySourceRow> = {}): WorkHistorySourceRow => ({
  id: "e1",
  title: "UAB Statyba — praktika",
  relationship_slug: "student",
  started_at: "2026-02-01",
  ended_at: "2026-05-31",
  status: "ended",
  country_code: "LT",
  organizations: null,
  ...o,
});

describe("placements are part of professional history", () => {
  it("student and volunteer are in the list every history surface reads", () => {
    for (const slug of ["student", "volunteer"]) {
      expect(PROFESSIONAL_HISTORY_RELATIONSHIPS).toContain(slug);
    }
  });

  it("manager stays out — an admin relationship is not the person's own work", () => {
    expect(PROFESSIONAL_HISTORY_RELATIONSHIPS).not.toContain("manager");
  });

  it("the person can self-declare a placement, but never self-declare ownership", () => {
    expect(SELF_DECLARED_RELATIONSHIPS).toContain("student");
    expect(SELF_DECLARED_RELATIONSHIPS).toContain("volunteer");
    expect(SELF_DECLARED_RELATIONSHIPS).not.toContain("owner");
  });
});

describe("a placement is never presented as employment", () => {
  it("classifies each relationship by what it actually was", () => {
    expect(historyKindOf("student")).toBe("practice");
    expect(historyKindOf("volunteer")).toBe("practice");
    for (const slug of WORKER_RELATIONSHIPS) {
      expect(historyKindOf(slug)).toBe("employment");
    }
  });

  it("carries the kind on every derived entry", () => {
    const [practice] = deriveWorkHistory([row()]);
    expect(practice.kind).toBe("practice");
    const [job] = deriveWorkHistory([row({ relationship_slug: "employee" })]);
    expect(job.kind).toBe("employment");
  });

  it("PRACTICE_RELATIONSHIPS and WORKER_RELATIONSHIPS never overlap", () => {
    const employment = new Set<string>(WORKER_RELATIONSHIPS);
    for (const slug of PRACTICE_RELATIONSHIPS) {
      expect(employment.has(slug)).toBe(false);
    }
  });
});

describe("the CV prints the two under separate headings", () => {
  const base = {
    professionalSummary: null,
    workHistoryCount: 0,
    practiceHistoryCount: 0,
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

  it("a student with ONLY a placement still gets a section", () => {
    const v = cvSectionVisibility({ ...base, practiceHistoryCount: 1 });
    expect(v.practiceHistory).toBe(true);
    // …and no empty "Work history" header above it.
    expect(v.workHistory).toBe(false);
  });

  it("no placements → no placement section (honest empty)", () => {
    expect(cvSectionVisibility(base).practiceHistory).toBe(false);
  });

  it("the CV page splits on `kind`, not on a hardcoded slug list", () => {
    const page = read("app/[locale]/cv/page.tsx");
    expect(page).toContain('e.kind === "employment"');
    expect(page).toContain('e.kind === "practice"');
    expect(page).toContain("cv-practice-history");
  });
});

describe("the relationship list is declared once", () => {
  it("no surface re-declares its own copy of the work-relationship list", () => {
    // This file used to keep a private duplicate, which is exactly how the
    // CV, the profile card and the work-log picker drifted apart before.
    const worklog = read("lib/conversation/worklog-engagements.ts");
    expect(worklog).toContain("PROFESSIONAL_HISTORY_RELATIONSHIPS");
    expect(worklog).not.toMatch(/const\s+WORKER_RELATIONSHIPS\s*=/);
  });

  it("the CV and the profile card read the same list", () => {
    for (const p of ["lib/cv-export/verified-cv.ts", "lib/player-card/work-history.ts"]) {
      expect(read(p)).toContain("PROFESSIONAL_HISTORY_RELATIONSHIPS");
    }
  });
});

describe("the write path stops hardcoding employment", () => {
  const actions = read("lib/profile/cv-section-import-actions.ts");

  it("no longer pins every self-declared row to `employee`", () => {
    expect(actions).not.toContain('p_relationship_slug: "employee"');
    expect(actions).toContain("p_relationship_slug: relationship");
  });

  it("validates the relationship against the same closed set as the RPC", () => {
    expect(actions).toContain("SELF_DECLARED_RELATIONSHIPS");
  });

  it("the TS allowlist matches the widened RPC allowlist exactly", () => {
    const sql = readFileSync(
      join(
        APP,
        "..",
        "..",
        "supabase",
        "migrations",
        "20260826182421_practice_work_history_v1.sql",
      ),
      "utf-8",
    );
    // The closed set inside the function body, not the prose above it.
    const guard = sql.slice(sql.indexOf("if p_relationship_slug is null"));
    for (const slug of SELF_DECLARED_RELATIONSHIPS) {
      expect(guard).toContain(`'${slug}'`);
    }
    expect(guard).not.toContain("'manager'");
    expect(guard).not.toContain("'owner'");
  });
});
