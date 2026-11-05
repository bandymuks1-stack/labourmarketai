import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A CV imported twice is not two educations (found 2026-11-04, P-9). The tables have
 * no unique key, so these actions are what stops a second row.
 */
const inserted: { table: string; row: Record<string, unknown> }[] = [];
let stored: Record<string, Record<string, unknown>[]> = {};
let readError: { code: string } | null = null;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: async () => (readError ? { data: null, error: readError } : { data: stored[table] ?? [], error: null }),
      }),
      insert: async (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));

import {
  confirmCvAchievementAction,
  confirmCvCertificateAction,
  confirmCvEducationAction,
} from "./cv-section-import-actions";

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
