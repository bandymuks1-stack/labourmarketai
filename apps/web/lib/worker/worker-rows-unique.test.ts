import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The profile's own add forms against the unique index: two saves at once are one row
 * and both show it. An edit into another row's words does not say saved.
 */
const eduRow = {
  id: "e1",
  institution_name: "Vilniaus kolegija",
  program_or_field: null,
  education_type_slug: "college",
  start_year: null,
  end_year: null,
  is_current: false,
  note: null,
};
const achRow = {
  id: "a1",
  title: "Saugos kursai",
  description: null,
  achieved_at: null,
  achievement_type_slug: "achievement",
  confirmed_by_manager: false,
};

let reads: Record<string, unknown>[][] = [];

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: async () => ({ data: reads.shift() ?? [], error: null }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "unique" } }) }) }),
      update: () => ({
        eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "23505", message: "unique" } }) }) }) }),
      }),
    }),
  }),
}));

import { saveWorkerAchievementAction } from "./worker-achievements-actions";
import { saveWorkerEducationAction } from "./worker-education-actions";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const school = { institution_name: "Vilniaus kolegija", education_type_slug: "college" };
const award = { title: "Saugos kursai" };

beforeEach(() => {
  reads = [];
});

describe("the second of two saves at once", () => {
  it("answers with the education row the first one stored", async () => {
    reads = [[], [eduRow]];
    const res = await saveWorkerEducationAction(null, form(school));
    expect(res).toMatchObject({ ok: true, id: "e1" });
  });

  it("answers with the achievement the first one stored", async () => {
    reads = [[], [achRow]];
    const res = await saveWorkerAchievementAction(null, form(award));
    expect(res).toMatchObject({ ok: true, id: "a1" });
  });
});

describe("an edit into another row's words", () => {
  it("education: not saved", async () => {
    expect(await saveWorkerEducationAction(null, form({ ...school, id: "e2" }))).toEqual({ ok: false, code: "invalid" });
  });

  it("achievement: not saved", async () => {
    expect(await saveWorkerAchievementAction(null, form({ ...award, id: "a2" }))).toEqual({ ok: false, code: "invalid" });
  });
});
