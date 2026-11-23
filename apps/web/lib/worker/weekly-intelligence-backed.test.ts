import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvSkillTier } from "@/lib/cv-export/skill-tiers";
import { withStandingConfirmation } from "@/lib/evidence/skill-confirmation-standing";
import { isSkillSupportedByWork } from "@/lib/profile/skill-evidence";

/**
 * G-8 (duplication): a skill's "backed" state on the opportunities page and in
 * the weekly digest was re-derived inline (link OR verified OR
 * source === manager_confirmed) instead of read from THE canonical CV tier.
 * The two disagreed on a real row: `source = work_journal` without a link
 * printed as "evidence" on the Living CV but as not backed here. After the
 * fix, every surface answers from `cvSkillTier`.
 */

type Row = {
  id: string;
  skill_id: string;
  verified: boolean;
  source: string | null;
  skills: { slug: string };
};

const state: { rows: Row[]; linked: string[]; captured: ReadonlySet<string> | null | undefined } = {
  rows: [],
  linked: [],
  captured: undefined,
};

function builder() {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lt", "is", "in", "order", "limit"]) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(ok, err);
  return b;
}

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: () => builder() })) }));
vi.mock("@/lib/data/worker-core", () => ({
  getWorkerCoreRow: vi.fn(async () => ({ id: "w1", profile_id: "p1" })),
  getWorkerSkillRows: vi.fn(async () => state.rows),
}));
vi.mock("@/lib/journal/entry-skill-link-read", () => ({
  readWorkerEntrySkillLinks: vi.fn(async () => ({
    ok: true,
    rows: state.linked.map((skill_id) => ({ journal_entry_id: "e1", skill_id })),
    provenanceByEntry: new Map(),
    truncated: false,
  })),
}));
vi.mock("@/lib/opportunities/recommendations", () => ({
  getWorkerJobRecommendations: vi.fn(async () => ({ kind: "none" })),
}));
vi.mock("@/lib/worker/weekly-intelligence-model", async (orig) => {
  const real = await orig<typeof import("@/lib/worker/weekly-intelligence-model")>();
  return {
    ...real,
    deriveWeeklyPersonalIntelligence: (
      ...args: Parameters<typeof real.deriveWeeklyPersonalIntelligence>
    ) => {
      state.captured = args[2];
      return real.deriveWeeklyPersonalIntelligence(...args);
    },
  };
});

import { getWeeklyPersonalIntelligence } from "@/lib/worker/weekly-intelligence";

const SOURCES = [null, "self_declared", "work_journal", "manager_confirmed"] as const;

function matrix(): { rows: Row[]; linked: string[] } {
  const rows: Row[] = [];
  const linked: string[] = [];
  let i = 0;
  for (const verified of [false, true]) {
    for (const source of SOURCES) {
      for (const link of [false, true]) {
        const id = `s${i++}`;
        rows.push({ id, skill_id: id, verified, source, skills: { slug: `slug-${id}` } });
        if (link) linked.push(id);
      }
    }
  }
  return { rows, linked };
}

async function backedSlugs(): Promise<ReadonlySet<string>> {
  const res = await getWeeklyPersonalIntelligence();
  if (res.kind !== "ready") throw new Error("expected ready");
  if (!state.captured) throw new Error("expected a backed-slug set");
  return state.captured;
}

beforeEach(() => {
  state.rows = [];
  state.linked = [];
  state.captured = undefined;
});

describe("weekly intelligence — backed skills come from the canonical tier (G-8)", () => {
  it("agrees with cvSkillTier on every verified × source × link combination", async () => {
    const m = matrix();
    state.rows = m.rows;
    state.linked = m.linked;
    const expected = new Set(
      m.rows
        .filter(
          (r) =>
            cvSkillTier({
              slug: r.skills.slug,
              verified: r.verified,
              source: r.source,
              journalSupported: m.linked.includes(r.skill_id),
            }) !== "declared",
        )
        .map((r) => r.skills.slug),
    );
    expect([...(await backedSlugs())].sort()).toEqual([...expected].sort());
  });

  it("a confirmation whose work was withdrawn does not read as backed", async () => {
    // As getWorkerSkillRows hands it over: the stored flag is judged against
    // the standing read, which no longer holds this skill.
    const [row] = withStandingConfirmation(
      [
        {
          id: "x",
          skill_id: "x",
          verified: true,
          verified_by: "manager",
          source: "manager_confirmed",
          skills: { slug: "tiling" },
        },
      ],
      { ids: new Set<string>(), subjectProfileId: "p1" },
    );
    state.rows = [row as unknown as Row];
    expect((await backedSlugs()).has("tiling")).toBe(false);
    // …and the profile's evidence count says the same.
    expect(isSkillSupportedByWork(row)).toBe(false);
  });

  it("declared stays declared; journal support stays support (decision 0023)", async () => {
    state.rows = [
      { id: "a", skill_id: "a", verified: false, source: "self_declared", skills: { slug: "own-claim" } },
      { id: "b", skill_id: "b", verified: false, source: "self_declared", skills: { slug: "linked" } },
    ];
    state.linked = ["b"];
    const backed = await backedSlugs();
    expect(backed.has("own-claim")).toBe(false);
    expect(backed.has("linked")).toBe(true);
  });
});

describe("profile skill evidence — same canonical tier (G-8)", () => {
  it("isSkillSupportedByWork agrees with cvSkillTier on every combination", () => {
    for (const verified of [false, true, undefined]) {
      for (const source of SOURCES) {
        for (const journalSupported of [false, true, undefined]) {
          expect(isSkillSupportedByWork({ verified, source, journalSupported })).toBe(
            cvSkillTier({ slug: "", verified, source, journalSupported }) !== "declared",
          );
        }
      }
    }
  });
});
