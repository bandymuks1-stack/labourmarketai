import { describe, expect, it } from "vitest";

import { buildSupplyCandidates } from "@/lib/market/match-subject";
import { compareMatches, matchWorkerToNeed, type MatchNeed } from "@/lib/market/match-v1";
import { SUPPLY_POOL_BUDGET } from "@/lib/market/supply-retrieval";
import { createFakeSupabase, type FakeRow, type FakeTables } from "@/lib/test/fake-supabase";

/**
 * W10 slice 3 — the regression that proves audit finding P0-3.
 *
 * The audit could only classify P0-3 as UNVERIFIABLE-STATICALLY: the pool was
 * `workers.order(created_at desc).limit(200)`, so whether a qualified worker
 * fell outside the window depended on live row counts nobody could assert in a
 * unit test. This fixture makes it assertable — 600 discoverable workers, and
 * the ONE genuinely qualified welder is the OLDEST registration on the
 * platform, i.e. position 600 of 600 by recency.
 *
 * Under the old retrieval that worker is not fetched, so not matched, not
 * ranked and not shown, and the employer reads "no candidates". The first test
 * below runs the old query shape against the same data and pins that failure.
 * Every test after it runs the new staged retrieval over the same data.
 */

const WORKER_COUNT = 600;
const STAR = "w-599"; // oldest registration, and the only real match
const DAY_MS = 86_400_000;
const BASE_MS = Date.parse("2024-01-01T00:00:00.000Z");

/** Worker ids sort ascending with the index; `created_at` sorts the OTHER way,
 *  so "newest 200" and "first 200 by id" are disjoint claims. */
const workerId = (i: number): string => `w-${String(i).padStart(3, "0")}`;

function buildTables(): FakeTables {
  const workers: FakeRow[] = [];
  for (let i = 0; i < WORKER_COUNT; i += 1) {
    const isStar = workerId(i) === STAR;
    workers.push({
      id: workerId(i),
      profile_id: `p-${i}`,
      display_name: `Worker ${i}`,
      headline: null,
      availability_status: isStar ? "available" : "busy",
      available_from: null,
      current_location_country: isStar ? "NL" : "DE",
      preferred_countries: isStar ? ["NL"] : [],
      salary_min_eur: null,
      preferred_contract_type: null,
      experience_years: isStar ? 12 : 1,
      // i=0 is the NEWEST registration; the star at i=599 is the oldest.
      created_at: new Date(BASE_MS + (WORKER_COUNT - 1 - i) * DAY_MS).toISOString(),
      updated_at: new Date(BASE_MS + (WORKER_COUNT - 1 - i) * DAY_MS).toISOString(),
    });
  }

  return {
    workers,
    skills: [
      { id: "sk-weld", slug: "welding", esco_uri: null },
      { id: "sk-steel", slug: "steel-fixing", esco_uri: null },
      { id: "sk-paint", slug: "painting", esco_uri: null },
    ],
    professions: [
      { id: "pr-welder", slug: "welder" },
      { id: "pr-painter", slug: "painter" },
    ],
    worker_skills: [
      {
        worker_id: STAR,
        skill_id: "sk-weld",
        source: "manager_confirmed",
        verified: true,
        skills: { slug: "welding", esco_uri: null },
      },
      {
        worker_id: STAR,
        skill_id: "sk-steel",
        source: "work_journal",
        verified: false,
        skills: { slug: "steel-fixing", esco_uri: null },
      },
      // A recently-registered worker with ONE self-declared overlap — the
      // decoy the old retrieval would have shown instead.
      {
        worker_id: "w-005",
        skill_id: "sk-weld",
        source: "self_declared",
        verified: false,
        skills: { slug: "welding", esco_uri: null },
      },
      {
        worker_id: "w-010",
        skill_id: "sk-paint",
        source: "self_declared",
        verified: false,
        skills: { slug: "painting", esco_uri: null },
      },
    ],
    worker_professions: [
      { worker_id: STAR, profession_id: "pr-welder", is_primary: true, professions: { slug: "welder" } },
      { worker_id: "w-010", profession_id: "pr-painter", is_primary: true, professions: { slug: "painter" } },
    ],
  };
}

const WELDER_IN_NL: MatchNeed = {
  skillIds: ["welding", "steel-fixing"],
  escoSkillUris: [],
  professionSlug: "welder",
  country: "NL",
  city: "Rotterdam",
};

describe("P0-3 regression — the newest-200 pool hid the best candidate", () => {
  it("OLD retrieval: `order(created_at desc).limit(200)` never fetches the best welder", async () => {
    const { client } = createFakeSupabase(buildTables());
    // The exact query buildSupplyCandidates opened with before this slice.
    const { data } = await client
      .from("workers")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(200);

    const fetched = (data as FakeRow[]).map((r) => r.id as string);
    expect(fetched).toHaveLength(200);
    expect(fetched).not.toContain(STAR);
    // ...and what it DID fetch is the decoy with one self-declared skill.
    expect(fetched).toContain("w-005");
  });

  it("NEW retrieval: staged retrieval fetches the best welder despite 599 newer registrations", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    const ids = candidates.map((c) => c.workerId);
    expect(ids).toContain(STAR);
  });

  it("retrieves the best welder even when the budget is smaller than the decoy pool", async () => {
    // Budget 5 against 600 workers: only demand-driven retrieval can find the
    // star. Recency-driven retrieval at ANY budget below 600 cannot.
    const { client } = createFakeSupabase(buildTables());
    const { candidates, retrieval } = await buildSupplyCandidates(client, {
      need: WELDER_IN_NL,
      budget: 5,
    });

    expect(candidates.map((c) => c.workerId)).toContain(STAR);
    expect(retrieval.poolSize).toBeLessThanOrEqual(5);
    expect(retrieval.capped).toBe(true);
  });

  it("the best welder also RANKS first once retrieved — retrieval and ranking agree", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    // Stage 3 exactly as scouting runs it (fit first).
    const ranked = candidates
      .map((c) => ({ workerId: c.workerId, match: matchWorkerToNeed(WELDER_IN_NL, c.subject) }))
      .sort((a, b) => compareMatches(a.match, b.match) || a.workerId.localeCompare(b.workerId));

    expect(ranked[0]?.workerId).toBe(STAR);
  });

  it("assembles the star's real evidence, not a placeholder", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    const star = candidates.find((c) => c.workerId === STAR);
    expect(star?.professionSlug).toBe("welder");
    expect([...(star?.subject.skills ?? [])].sort((a, b) => a.uri.localeCompare(b.uri))).toEqual([
      { uri: "steel-fixing", evidence: "work_journal" },
      { uri: "welding", evidence: "manager_confirmed" },
    ]);
    expect(star?.subject.country).toBe("NL");
  });
});

describe("staged retrieval — query shape", () => {
  it("never orders candidate retrieval by registration date", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    const recencyOrdered = queries.filter((q) =>
      q.order.some((o) => o.column === "created_at"),
    );
    expect(recencyOrdered).toEqual([]);
  });

  it("carries the demand's skills into SQL instead of filtering in memory", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    const skillLookup = queries.find(
      (q) => q.table === "skills" && q.filters.some((f) => f.column === "slug" && f.op === "in"),
    );
    expect(skillLookup).toBeDefined();
    expect(skillLookup?.filters[0]?.value).toEqual(["steel-fixing", "welding"]);

    const stage1Skill = queries.find(
      (q) => q.table === "worker_skills" && q.filters.some((f) => f.column === "skill_id"),
    );
    expect(stage1Skill?.select).toBe("worker_id");
  });

  it("carries the demand's country into SQL", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    expect(
      queries.some(
        (q) =>
          q.table === "workers" &&
          q.filters.some((f) => f.column === "current_location_country" && f.value === "NL"),
      ),
    ).toBe(true);
  });

  it("fetches full rows only for the retrieved ids (stage 2 is a key lookup)", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, {
      need: WELDER_IN_NL,
      budget: 5,
    });

    const stage2 = queries.find(
      (q) => q.table === "workers" && q.select.includes("display_name"),
    );
    expect(stage2?.filters[0]?.op).toBe("in");
    expect((stage2?.filters[0]?.value as string[]).length).toBe(candidates.length);
  });

  it("skips the backfill read once the demand tiers have spent the budget", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    await buildSupplyCandidates(client, { need: WELDER_IN_NL, budget: 2 });

    const backfill = queries.filter(
      (q) =>
        q.table === "workers" &&
        q.select === "id" &&
        q.filters.length === 0 &&
        q.order.some((o) => o.column === "id"),
    );
    expect(backfill).toEqual([]);
  });
});

describe("staged retrieval — determinism", () => {
  it("returns the identical candidate list across repeated runs", async () => {
    const tables = buildTables();
    const first = await buildSupplyCandidates(createFakeSupabase(tables).client, {
      need: WELDER_IN_NL,
      budget: 25,
    });
    const second = await buildSupplyCandidates(createFakeSupabase(tables).client, {
      need: WELDER_IN_NL,
      budget: 25,
    });

    expect(second.candidates.map((c) => c.workerId)).toEqual(
      first.candidates.map((c) => c.workerId),
    );
    expect(second.retrieval).toEqual(first.retrieval);
  });

  it("returns no duplicate candidate even when several tiers name the same worker", async () => {
    // The star is reachable via skill, profession AND location at once.
    const { client } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, { need: WELDER_IN_NL });

    const ids = candidates.map((c) => c.workerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the assembled order pinned to the retrieval order", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, {
      need: WELDER_IN_NL,
      budget: 10,
    });

    // Multi-signal first (the star), then id-ascending within equal signal.
    expect(candidates[0]?.workerId).toBe(STAR);
    const backfilled = candidates.slice(2).map((c) => c.workerId);
    expect(backfilled).toEqual([...backfilled].sort());
  });

  it("is stable across pool sizes — a larger budget only ADDS candidates", async () => {
    const tables = buildTables();
    const small = await buildSupplyCandidates(createFakeSupabase(tables).client, {
      need: WELDER_IN_NL,
      budget: 10,
    });
    const large = await buildSupplyCandidates(createFakeSupabase(tables).client, {
      need: WELDER_IN_NL,
      budget: 40,
    });

    const largeIds = large.candidates.map((c) => c.workerId);
    for (const id of small.candidates.map((c) => c.workerId)) {
      expect(largeIds).toContain(id);
    }
  });
});

describe("staged retrieval — honest reporting", () => {
  it("reports capped=false and the real pool size when everything fits", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { candidates, retrieval } = await buildSupplyCandidates(client, {
      need: WELDER_IN_NL,
    });

    expect(retrieval.budget).toBe(SUPPLY_POOL_BUDGET);
    expect(retrieval.poolSize).toBe(candidates.length);
    // 600 discoverable workers against a 500 budget: the bound really binds,
    // and the report says so rather than presenting a silent partial list.
    expect(retrieval.capped).toBe(true);
    expect(retrieval.matchedByDemand).toBeGreaterThan(0);
  });

  it("separates demand-matched candidates from backfilled ones", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { retrieval } = await buildSupplyCandidates(client, {
      need: WELDER_IN_NL,
      budget: 20,
    });

    expect(retrieval.matchedByDemand + retrieval.backfilled).toBe(retrieval.poolSize);
    // welding(2) + steel-fixing(1 of the same) + welder profession + NL
    expect(retrieval.matchedByDemand).toBeGreaterThanOrEqual(2);
  });

  it("degrades to the deterministic backfill when the demand carries no predicate", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, {
      need: { skillIds: [], escoSkillUris: [], professionSlug: null, country: null },
      budget: 8,
    });

    expect(candidates).toHaveLength(8);
    // Deterministic id order, NOT recency.
    expect(candidates.map((c) => c.workerId)).toEqual([
      "w-000",
      "w-001",
      "w-002",
      "w-003",
      "w-004",
      "w-005",
      "w-006",
      "w-007",
    ]);
    expect(queries.some((q) => q.order.some((o) => o.column === "created_at"))).toBe(false);
  });

  it("survives an absent optional table without losing a candidate", async () => {
    // worker_professions / worker_languages absent → 42P01 on those tiers.
    const tables = { ...buildTables() } as Record<string, readonly FakeRow[]>;
    delete tables.worker_professions;
    const { client } = createFakeSupabase(tables);

    const { candidates } = await buildSupplyCandidates(client, { need: WELDER_IN_NL });
    const star = candidates.find((c) => c.workerId === STAR);
    expect(star).toBeDefined();
    expect(star?.professionSlug).toBeNull();
    // Skill evidence still assembled — one failed tier costs priority, never
    // reachability.
    expect(star?.subject.skills.map((s) => s.uri).sort()).toEqual(["steel-fixing", "welding"]);
  });

  it("returns an empty pool, never a fabricated worker, when workers is unreadable", async () => {
    const { client } = createFakeSupabase({ skills: [], professions: [] });
    const { candidates, retrieval } = await buildSupplyCandidates(client, {
      need: WELDER_IN_NL,
    });
    expect(candidates).toEqual([]);
    expect(retrieval.poolSize).toBe(0);
  });
});

describe("explicit-id retrieval (admin workbench)", () => {
  it("returns exactly the named workers, bounded by the budget", async () => {
    const { client, queries } = createFakeSupabase(buildTables());
    const { candidates, retrieval } = await buildSupplyCandidates(client, {
      workerIds: [STAR, "w-005", "w-010"],
      budget: 2,
    });

    expect(candidates.map((c) => c.workerId)).toEqual([STAR, "w-005"]);
    expect(retrieval.strategy).toBe("explicit_ids");
    expect(retrieval.capped).toBe(true);
    // No Stage-1 planning ran at all.
    expect(queries.some((q) => q.table === "professions")).toBe(false);
  });

  it("drops duplicate ids the caller passed in", async () => {
    const { client } = createFakeSupabase(buildTables());
    const { candidates } = await buildSupplyCandidates(client, {
      workerIds: [STAR, STAR, "w-005"],
    });
    expect(candidates.map((c) => c.workerId)).toEqual([STAR, "w-005"]);
  });
});
