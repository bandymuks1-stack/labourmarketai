import { describe, expect, it } from "vitest";

import { deriveGrowthReading } from "./growth-reading";
import {
  deriveWorkIntelligence,
  type WorkIntelligence,
  type WorkIntelligenceEntry,
} from "./work-intelligence";

/**
 * THE GROWTH READING (issue #1689, owner line 8) — behaviour over the REAL
 * `deriveWorkIntelligence`: a tiler's own rows, and what the reading says
 * and refuses to say about them. Fact block and reading block are asserted
 * apart; nothing here is a score.
 */

const TODAY = "2026-09-11";

type Row = { metric_slug: string; value_text: string | null; value_numeric: number | null; unit_slug: string | null };
const hours = (h: number): Row => ({ metric_slug: "quantity", value_text: null, value_numeric: h, unit_slug: "hours" });
const workDate = (iso: string): Row => ({ metric_slug: "work_date", value_text: iso, value_numeric: null, unit_slug: null });

function entry(
  id: string,
  day: string,
  h: number,
  linked: string[],
  reviewResult: WorkIntelligenceEntry["reviewResult"] = "submitted",
): WorkIntelligenceEntry {
  return {
    entryId: id,
    createdAt: `${day}T09:00:00.000Z`,
    metrics: [workDate(day), hours(h)].map((m) => ({ ...m, created_at: `${day}T09:00:00.000Z` })),
    engagementContextId: null,
    reviewResult,
    linkedSkillIds: linked,
  };
}

const SKILLS = [
  { skillId: "s-tile", slug: "tiling", verified: true, source: null },
  { skillId: "s-screed", slug: "floor-screeding", verified: false, source: null },
  { skillId: "s-floor", slug: "flooring", verified: false, source: null },
  { skillId: "s-wp", slug: "waterproofing", verified: false, source: null },
  // declared, backed by no entry — must be LEFT OUT and COUNTED as such
  { skillId: "s-carp", slug: "carpentry", verified: false, source: null },
];

const ENTRIES = [
  // tiling, confirmed by a manager, yesterday
  entry("e-tile", "2026-09-10", 6, ["s-tile"], "approved"),
  // screeding, own record, three days ago
  entry("e-screed", "2026-09-08", 4, ["s-screed"]),
  // a day shared by flooring AND tiling — involvement for both
  entry("e-shared", "2026-09-05", 3, ["s-floor", "s-tile"]),
  // waterproofing, own record, four months ago
  entry("e-wp", "2026-05-01", 5, ["s-wp"]),
];

function model(entries = ENTRIES, skills = SKILLS): WorkIntelligence {
  return deriveWorkIntelligence({ todayIso: TODAY, focus: "all", skills, entries });
}

describe("the FACT block is the person's own rows, nothing more", () => {
  const g = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler" });

  it("is a reading, said to be one", () => {
    expect(g.kind).toBe("derived");
  });

  it("lists exactly the skills the entries back, with the model's own figures, in the model's order", () => {
    expect(g.basis.skills.map((s) => s.slug)).toEqual(["tiling", "waterproofing", "floor-screeding", "flooring"]);
    const tiling = g.basis.skills[0]!;
    expect(tiling).toMatchObject({ attributedHours: 6, confirmedHours: 6, sharedHours: 3, entries: 2, lastWorkedDay: "2026-09-10" });
    const flooring = g.basis.skills[3]!;
    // involvement is carried per skill — never summed into anything (F8)
    expect(flooring).toMatchObject({ attributedHours: 0, sharedHours: 3, entries: 1 });
  });

  it("counts the declared-only skills it left out, and the recorded hours it stands on", () => {
    expect(g.basis.declaredOnly).toBe(1); // carpentry
    expect(g.basis.recordedHours).toBe(18);
    expect(g.basis.entries).toBe(4);
  });

  it("emits no score, rating, rank or tier field anywhere in the reading", () => {
    const names = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v)) {
          names.add(k.toLowerCase());
          walk(val);
        }
      }
    };
    walk(g);
    for (const n of names) expect(n, n).not.toMatch(/score|rating|rank|tier|level|ovr/);
  });
});

describe("the READING block — deepen: a closed set of facts about each evidenced skill", () => {
  const g = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler" });
  const reasons = (slug: string) => g.deepen.find((d) => d.slug === slug)?.reasons ?? null;

  it("a confirmed skill used more in the last 30 days is only 'rising' — never 'unconfirmed'", () => {
    expect(reasons("tiling")).toEqual(["rising"]);
  });

  it("an own record with no confirmation, used lately, is 'unconfirmed' and 'rising'", () => {
    expect(reasons("floor-screeding")).toEqual(["unconfirmed", "rising"]);
  });

  it("a skill only ever shared with others is 'involvement_only' — no invented attributable hours", () => {
    expect(reasons("flooring")).toEqual(["involvement_only", "rising"]);
  });

  it("a skill with no entry for 90 days is 'dormant' (and still 'unconfirmed')", () => {
    expect(reasons("waterproofing")).toEqual(["unconfirmed", "dormant"]);
  });

  it("keeps the model's hours order — the number of reasons never re-ranks a person", () => {
    expect(g.deepen.map((d) => d.slug)).toEqual(["tiling", "waterproofing", "floor-screeding", "flooring"]);
  });
});

describe("a skill backed only by UNTIMED entries — counted, never timed (SEP-7; production walk 2026-09-12)", () => {
  // the pallets entry of the production walk: linked skills, no duration —
  // the fact line read "dalyvauta 0 val." (a zero figure for NOT_MEASURED)
  const untimed: WorkIntelligenceEntry = {
    entryId: "e-pallets",
    createdAt: "2026-09-11T09:00:00.000Z",
    metrics: [{ ...workDate("2026-09-11"), created_at: "2026-09-11T09:00:00.000Z" }],
    engagementContextId: null,
    reviewResult: "submitted",
    linkedSkillIds: ["s-pallet"],
  };
  const skills = [...SKILLS, { skillId: "s-pallet", slug: "pallet-loading", verified: false, source: null }];
  const g = deriveGrowthReading(model([...ENTRIES, untimed], skills), { primaryProfessionSlug: "tiler" });
  const pallet = g.basis.skills.find((s) => s.slug === "pallet-loading");

  it("is in the FACT block with its entry, and with NO hour of any kind — not a 0 h involvement", () => {
    expect(pallet).toMatchObject({ entries: 1, attributedHours: 0, sharedHours: 0, confirmedHours: 0 });
  });

  it("reads 'untimed' — and not 'involvement_only' (nothing was shared) nor 'unconfirmed' (no hour to confirm)", () => {
    expect(g.deepen.find((d) => d.slug === "pallet-loading")?.reasons).toEqual(["untimed"]);
  });

  it("changes nothing for the timed skills", () => {
    expect(g.deepen.find((d) => d.slug === "tiling")?.reasons).toEqual(["rising"]);
    expect(g.basis.recordedHours).toBe(18);
    expect(g.basis.entries).toBe(5);
  });
});

describe("the READING block — expand: the existing adjacency over EVIDENCED skills only", () => {
  it("a direction is backed by evidenced skills; the declared-only skill contributes nothing; the primary profession is excluded", () => {
    const g = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler" });
    expect(g.limitation).toBe("ok");
    const ids = g.expand.map((d) => d.professionId);
    expect(ids).toContain("concrete_worker"); // floor-screeding + waterproofing
    expect(ids).not.toContain("tiler");
    // carpenter shares only `flooring` (+ carpentry, which no entry backs) → below the floor
    expect(ids).not.toContain("carpenter");
    const cw = g.expand.find((d) => d.professionId === "concrete_worker")!;
    expect([...cw.sharedSkills].sort()).toEqual(["floor-screeding", "waterproofing"]);
    expect(cw.sharedSkills).not.toContain("carpentry");
  });

  it("a declared skill alone can never open a direction (the CV-builder collapse)", () => {
    // only carpentry + one evidenced skill: one evidenced → insufficient
    const g = deriveGrowthReading(model([ENTRIES[0]!]), { primaryProfessionSlug: null });
    expect(g.limitation).toBe("insufficient_skills");
    expect(g.expand).toEqual([]);
    expect(g.deepen).toEqual([]);
    // the FACT block is still stated
    expect(g.basis.skills.map((s) => s.slug)).toEqual(["tiling"]);
    expect(g.basis.declaredOnly).toBe(4);
  });
});

describe("the READING block — demand: the board's own count, or UNKNOWN", () => {
  it("null when the board was not read — never an empty list that reads as 'nothing asks'", () => {
    const g = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler" });
    expect(g.demand).toBeNull();
    const g2 = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler", demandBySkill: null });
    expect(g2.demand).toBeNull();
  });

  it("keeps only skills the person's evidence does NOT cover, by the board's count then slug", () => {
    const g = deriveGrowthReading(model(), {
      primaryProfessionSlug: "tiler",
      demandBySkill: new Map([
        ["tiling", 5], // evidenced → not a gap
        ["formwork", 3],
        ["concrete-pouring", 1],
        ["carpentry", 2], // declared only, no entry backs it → still a gap in evidence
        ["nothing", 0],
      ]),
    });
    expect(g.demand).toEqual([
      { slug: "formwork", demands: 3 },
      { slug: "carpentry", demands: 2 },
      { slug: "concrete-pouring", demands: 1 },
    ]);
  });

  it("a read board with nothing missing is an empty list (ZERO), apart from null (UNKNOWN)", () => {
    const g = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler", demandBySkill: new Map() });
    expect(g.demand).toEqual([]);
  });
});

describe("the KINDS (owner requirement 5, #1689) — each direction names its kind and the facts it stands on", () => {
  /* NEGATIVE CONTROL for the whole block: a kind is decided by a plain rule
     over the person's own rows; nothing here is a trait, a grade or a career
     fact the entries do not contain. The base fixture's largest share
     (tiling, 2 entries in ONE context) is deliberately NOT a core strength —
     one day's work is not a strength, however large its share. */
  const g = deriveGrowthReading(model(), { primaryProfessionSlug: "tiler" });
  const byKind = (kind: string) => g.directions.filter((d) => d.kind === kind);

  it("emits no invented kind: the base fixture has no core strength (largest share, but 2 entries in 1 context)", () => {
    expect(byKind("core_strength")).toEqual([]);
    const tiling = g.basis.skills[0]!;
    expect(tiling.slug).toBe("tiling");
    expect(tiling.entries).toBe(2);
  });

  it("growing — trend up / new, with the hours, share, entries, contexts, last day and trend as the why", () => {
    const growing = byKind("growing");
    expect(growing.map((d) => (d as { slug: string }).slug)).toEqual(["tiling", "floor-screeding", "flooring"]);
    const tiling = growing[0]!;
    if (tiling.kind !== "growing") throw new Error("kind");
    expect(tiling.why).toEqual({
      attributedHours: 6,
      sharedHours: 3,
      confirmedHours: 6,
      share: 0.4,
      entries: 2,
      contexts: 1,
      lastWorkedDay: "2026-09-10",
      trend: "new",
    });
  });

  it("underused — no linked entry for 90 days, with the dormant days counted from the focus window's end", () => {
    const under = byKind("underused");
    expect(under).toHaveLength(1);
    const wp = under[0]!;
    if (wp.kind !== "underused") throw new Error("kind");
    expect(wp.slug).toBe("waterproofing");
    expect(wp.why).toMatchObject({ attributedHours: 5, entries: 1, lastWorkedDay: "2026-05-01" });
    // 2026-05-01 → 2026-09-11 (focus "all" ends today)
    expect(wp.why.dormantDays).toBe(133);
  });

  it("self_stated — the declared-only skill, with its zeros stated, never a trait", () => {
    expect(byKind("self_stated")).toEqual([{ kind: "self_stated", slug: "carpentry", why: { entries: 0, hours: 0 } }]);
  });

  it("adjacent_opportunity — the EXISTING adjacency reading, restated with its shared and missing skills", () => {
    const adj = byKind("adjacent_opportunity");
    expect(adj.map((d) => (d as { professionId: string }).professionId)).toEqual(g.expand.map((d) => d.professionId));
    const cw = adj.find((d) => (d as { professionId: string }).professionId === "concrete_worker")!;
    if (cw.kind !== "adjacent_opportunity") throw new Error("kind");
    expect([...cw.why.sharedSkills].sort()).toEqual(["floor-screeding", "waterproofing"]);
    expect(cw.why.sharedCount).toBe(2);
    expect(cw.why.missingSkills.length).toBeGreaterThan(0);
  });

  it("core_strength — the largest attributed share once its entries are spread over ≥ 2 contexts or ≥ 3 entries; one kind per skill", () => {
    // a third tiling entry, in another context: still the largest share,
    // now spread → core strength; it stops being listed as `growing` even
    // though its trend is still up (one kind per skill; the trend is in why)
    const third = { ...entry("e-tile-3", "2026-09-09", 2, ["s-tile"]), engagementContextId: "ctx-b" };
    const g2 = deriveGrowthReading(model([...ENTRIES, third]), { primaryProfessionSlug: "tiler" });
    const core = g2.directions.filter((d) => d.kind === "core_strength");
    expect(core).toHaveLength(1);
    const tiling = core[0]!;
    if (tiling.kind !== "core_strength") throw new Error("kind");
    expect(tiling.slug).toBe("tiling");
    expect(tiling.why).toMatchObject({ attributedHours: 8, entries: 3, contexts: 2, trend: "new" });
    // the model's own (rounded) share figure — 8 of 17 attributed hours
    expect(tiling.why.share).toBe(0.47);
    expect(g2.directions.filter((d) => d.kind === "growing").map((d) => (d as { slug: string }).slug)).not.toContain("tiling");
  });

  it("no qualification_gap is ever emitted — the model receives no requirement ledger, so none is invented", () => {
    const kinds = new Set(g.directions.map((d) => d.kind));
    expect(kinds.has("qualification_gap" as never)).toBe(false);
    expect([...kinds].every((k) => ["core_strength", "growing", "underused", "self_stated", "adjacent_opportunity"].includes(k))).toBe(true);
  });

  it("is listed by kind, then in the model's own hours order — never re-ranked by anything", () => {
    const order = ["core_strength", "growing", "underused", "self_stated", "adjacent_opportunity"];
    const seen = g.directions.map((d) => order.indexOf(d.kind));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("no field of any direction is a score, rating, rank, tier, level or grade", () => {
    const names = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { names.add(k.toLowerCase()); walk(val); }
    };
    walk(g.directions);
    for (const n of names) expect(n, n).not.toMatch(/score|rating|rank|tier|level|ovr|grade/);
  });

  it("under the insufficient-skills limitation the kinds are empty too — the fact block still stands", () => {
    const g1 = deriveGrowthReading(model([ENTRIES[0]!]), { primaryProfessionSlug: null });
    expect(g1.limitation).toBe("insufficient_skills");
    expect(g1.directions).toEqual([]);
  });
});

describe("determinism", () => {
  it("the same rows in any order give the same reading", () => {
    const a = deriveGrowthReading(model(ENTRIES, SKILLS), { primaryProfessionSlug: "tiler" });
    const b = deriveGrowthReading(model([...ENTRIES].reverse(), [...SKILLS].reverse()), { primaryProfessionSlug: "tiler" });
    expect(b).toEqual(a);
  });
});
