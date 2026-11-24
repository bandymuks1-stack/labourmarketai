import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSupplyCandidates } from "@/lib/market/match-subject";
import type { MatchNeed } from "@/lib/market/match-v1";
import { createFakeSupabase, type FakeRow, type FakeTables } from "@/lib/test/fake-supabase";

/**
 * THE PERSON SEARCHING IS NEVER THEIR OWN CANDIDATE (employer-flow audit 2026-11-15).
 *
 * Every profile has its own worker row, and the `workers` table returns that
 * row to its owner. The pool's reads run as the person searching, so a new
 * employer's pool was themselves: listed and counted ("compared with 1") as a
 * candidate for their own need, with the controls to shortlist and book.
 *
 * The rule sits next to the fixture rule, where `poolSize` is counted, so the
 * count and the list stay the same statement.
 */

const VIEWER = "p-employer";

function worker(id: string, profileId: string, displayName: string): FakeRow {
  return {
    id,
    profile_id: profileId,
    display_name: displayName,
    headline: null,
    availability_status: null,
    available_from: null,
    current_location_country: "LT",
    preferred_countries: [],
    salary_min_eur: null,
    preferred_contract_type: null,
    experience_years: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function tables(workers: readonly FakeRow[]): FakeTables {
  return { workers, skills: [], professions: [], worker_skills: [], worker_professions: [] };
}

const NEED_IN_LT: MatchNeed = { skillIds: [], escoSkillUris: [], country: "LT" };

describe("the person searching is never their own candidate", () => {
  it("a new employer whose own row is all the table returns reads an empty pool, not themselves", async () => {
    const { client } = createFakeSupabase(tables([worker("w-self", VIEWER, "The employer")]));
    const pool = await buildSupplyCandidates(client, { need: NEED_IN_LT, viewerProfileId: VIEWER });
    expect(pool.candidates).toEqual([]);
    expect(pool.retrieval.poolSize).toBe(0);
  });

  it("the others stay, and the count is the list", async () => {
    const { client } = createFakeSupabase(
      tables([worker("w-other", "p-other", "A worker"), worker("w-self", VIEWER, "The employer")]),
    );
    const pool = await buildSupplyCandidates(client, { need: NEED_IN_LT, viewerProfileId: VIEWER });
    expect(pool.candidates.map((c) => c.workerId)).toEqual(["w-other"]);
    expect(pool.retrieval.poolSize).toBe(1);
  });

  it("a hand raised on their own need does not make them a candidate either", async () => {
    const { client } = createFakeSupabase(
      tables([worker("w-other", "p-other", "A worker"), worker("w-self", VIEWER, "The employer")]),
    );
    const planned = await buildSupplyCandidates(client, {
      need: NEED_IN_LT,
      viewerProfileId: VIEWER,
      alwaysInclude: ["w-self"],
    });
    expect(planned.candidates.map((c) => c.workerId)).toEqual(["w-other"]);
    const named = await buildSupplyCandidates(client, {
      workerIds: ["w-self", "w-other"],
      viewerProfileId: VIEWER,
    });
    expect(named.candidates.map((c) => c.workerId)).toEqual(["w-other"]);
    expect(named.retrieval.poolSize).toBe(1);
  });

  it("both rules hold together: no fixture and not the person searching", async () => {
    const { client } = createFakeSupabase(
      tables([
        worker("w-fixture", "p-fixture", "QA-SYNTHETIC worker"),
        worker("w-other", "p-other", "A worker"),
        worker("w-self", VIEWER, "The employer"),
      ]),
    );
    const pool = await buildSupplyCandidates(client, {
      need: NEED_IN_LT,
      excludeFixtures: true,
      viewerProfileId: VIEWER,
    });
    expect(pool.candidates.map((c) => c.workerId)).toEqual(["w-other"]);
    expect(pool.retrieval.poolSize).toBe(1);
  });

  it("a caller that names no viewer (the admin workbench names its workers) is unchanged", async () => {
    const { client } = createFakeSupabase(
      tables([worker("w-other", "p-other", "A worker"), worker("w-self", VIEWER, "The employer")]),
    );
    const pool = await buildSupplyCandidates(client, { workerIds: ["w-self", "w-other"] });
    expect(pool.candidates.map((c) => c.workerId).sort()).toEqual(["w-other", "w-self"]);
  });

  it("the scouting core (web page, assistant, auto-match) names the person searching on every pool", () => {
    const core = readFileSync(resolve(__dirname, "..", "scouting", "scouting.ts"), "utf8");
    const calls = core.match(/buildSupplyCandidates\(supabase, \{[\s\S]*?\}\)/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/viewerProfileId: user\.id,/);
    expect(calls[1]).toMatch(/viewerProfileId: input\.userId,/);
  });
});
