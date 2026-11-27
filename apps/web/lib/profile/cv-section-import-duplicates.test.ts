import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A CV imported twice is not two educations (found 2026-11-04, P-9). The action's read
 * stops a repeat. Two at once both read nothing, so the unique index stops the second
 * row, and that answer has to read as saved (run 42098444964: 201 twice in every round).
 */
const inserted: { table: string; row: Record<string, unknown> }[] = [];
let stored: Record<string, Record<string, unknown>[]> = {};
let readError: { code: string } | null = null;
// Stands in for the unique index: what the database says to the second of two inserts.
let uniqueIndex = false;
const revalidated: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void revalidated.push(path) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: async () => (readError ? { data: null, error: readError } : { data: stored[table] ?? [], error: null }),
      }),
      insert: (row: Record<string, unknown>) => {
        const duplicate = uniqueIndex && inserted.some((i) => i.table === table);
        if (!duplicate) inserted.push({ table, row });
        const result = duplicate
          ? { data: null, error: { code: "23505", message: "unique" } }
          : { data: { id: "new-row", ...row }, error: null };
        return Object.assign(Promise.resolve(result), {
          select: () => ({ single: async () => result }),
        });
      },
    }),
  }),
}));

import {
  confirmCvAchievementAction,
  confirmCvCertificateAction,
  confirmCvEducationAction,
} from "./cv-section-import-actions";

import { saveWorkerEducationAction } from "@/lib/worker/worker-education-actions";
import { EDUCATION_MAX_ROWS } from "@/lib/worker/worker-education-model";

const school = { institution: "Vilniaus kolegija", program: "Statyba", educationTypeSlug: "college", startYear: 2014, endYear: 2017 };
const schoolRow = {
  id: "e1",
  institution_name: "Vilniaus kolegija",
  program_or_field: "Statyba",
  education_type_slug: "college",
  start_year: 2014,
  end_year: 2017,
  is_current: false,
  note: null,
};

beforeEach(() => {
  inserted.length = 0;
  stored = {};
  readError = null;
  uniqueIndex = false;
  revalidated.length = 0;
});

describe("a repeat CV import stores nothing new", () => {
  it("the first import of an education row stores it", async () => {
    expect(await confirmCvEducationAction(school)).toEqual({ ok: true });
    expect(inserted).toHaveLength(1);
  });

  it("the same education again stores nothing, in any case, and still answers ok", async () => {
    stored.worker_education = [schoolRow];
    expect(await confirmCvEducationAction({ ...school, institution: "VILNIAUS KOLEGIJA" })).toEqual({ ok: true });
    expect(inserted).toHaveLength(0);
  });

  it("another period at the same school is another row", async () => {
    stored.worker_education = [schoolRow];
    await confirmCvEducationAction({ ...school, endYear: 2018 });
    expect(inserted).toHaveLength(1);
  });

  it("the same certificate and year again stores nothing", async () => {
    stored.worker_achievements = [
      { id: "a1", title: "Saugos kursai", description: null, achieved_at: "2022-01-01", achievement_type_slug: "declared_certificate", confirmed_by_manager: false },
    ];
    expect(await confirmCvCertificateAction({ title: "saugos kursai", year: 2022 })).toEqual({ ok: true });
    expect(inserted).toHaveLength(0);
  });

  it("the same words as a certificate and as an achievement are two statements", async () => {
    stored.worker_achievements = [
      { id: "a1", title: "Saugos kursai", description: null, achieved_at: null, achievement_type_slug: "declared_certificate", confirmed_by_manager: false },
    ];
    await confirmCvAchievementAction({ title: "Saugos kursai" });
    expect(inserted).toHaveLength(1);
  });

  it("when the check cannot read, nothing is stored and it does not say saved", async () => {
    readError = { code: "XX000" };
    const res = await confirmCvEducationAction(school);
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe("two confirms at once", () => {
  it("both read nothing, the index keeps one education row, and both answer saved", async () => {
    uniqueIndex = true;
    const answers = await Promise.all([confirmCvEducationAction(school), confirmCvEducationAction(school)]);
    expect(answers).toEqual([{ ok: true }, { ok: true }]);
    expect(inserted).toHaveLength(1);
  });

  it("the same for a certificate", async () => {
    uniqueIndex = true;
    const answers = await Promise.all([
      confirmCvCertificateAction({ title: "Saugos kursai", year: 2022 }),
      confirmCvCertificateAction({ title: "Saugos kursai", year: 2022 }),
    ]);
    expect(answers).toEqual([{ ok: true }, { ok: true }]);
    expect(inserted).toHaveLength(1);
  });
});

describe("what a confirm re-renders", () => {
  it("the review's confirm answers without the page tree", async () => {
    await confirmCvEducationAction({ ...school, refreshLater: true });
    await confirmCvCertificateAction({ title: "Saugos kursai", year: 2022, refreshLater: true });
    await confirmCvAchievementAction({ title: "Kita", refreshLater: true });
    expect(inserted).toHaveLength(3);
    expect(revalidated).toEqual([]);
  });

  it("any other caller still gets the page it relies on", async () => {
    await confirmCvAchievementAction({ title: "Kita" });
    expect(revalidated).toEqual(["/"]);
  });
});

describe("education import and manual save share the existing row limit", () => {
  function fillEducation(count: number) {
    stored.worker_education = Array.from({ length: count }, (_, i) => ({
      ...schoolRow, id: `e${i}`, institution_name: `School ${i}`,
    }));
  }

  it("both refuse a new row at the limit without writing or refreshing", async () => {
    fillEducation(EDUCATION_MAX_ROWS);
    const form = new FormData();
    form.set("institution_name", school.institution);
    form.set("education_type_slug", school.educationTypeSlug);
    expect(await saveWorkerEducationAction(null, form)).toEqual({ ok: false, code: "limit" });
    expect(await confirmCvEducationAction(school)).toEqual({ ok: false, code: "limit" });
    expect(inserted).toHaveLength(0);
    expect(revalidated).toEqual([]);
  });

  it("a repeated statement at the limit is still accepted without adding a row", async () => {
    fillEducation(EDUCATION_MAX_ROWS - 1);
    stored.worker_education.push(schoolRow);
    expect(await confirmCvEducationAction(school)).toEqual({ ok: true });
    expect(inserted).toHaveLength(0);
  });

  it("the final allowed row is saved with its stated fields, unverified", async () => {
    fillEducation(EDUCATION_MAX_ROWS - 1);
    expect(await confirmCvEducationAction(school)).toEqual({ ok: true });
    expect(inserted).toEqual([{ table: "worker_education", row: {
      profile_id: "u1", institution_name: school.institution, program_or_field: school.program,
      education_type_slug: school.educationTypeSlug, start_year: 2014, end_year: 2017,
      is_current: false, note: null,
    } }]);
    expect(revalidated).toEqual(["/"]);
  });

  it("invalid education still does not write", async () => {
    expect(await confirmCvEducationAction({ ...school, institution: "" })).toEqual({ ok: false, code: "invalid" });
    expect(inserted).toHaveLength(0);
  });
});
