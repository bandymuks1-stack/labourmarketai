import { describe, expect, it } from "vitest";

import { matchTeamToNeed } from "./match-team-v1";
import { MATCH_CALC_VERSION, type MatchNeed, type MatchSubject } from "./match-v1";
import { sanitizeStructuredDemandV2 } from "@/lib/demand/structured-demand-v2";

/**
 * Wagon 4 — team matching layer. Pins:
 *   1. composition: per-member results ARE canonical engine results;
 *   2. set-level coverage always carries its full basis (n of m skills,
 *      k of j eligible members) — no global team score exists;
 *   3. set blockers = hard criteria no member satisfies; they cap the team
 *      status at weak BEFORE ordering and force eligible=false (invariant);
 *   4. edge cases: empty team, unstructured need, all-ineligible members,
 *      partial coverage, mandatory-tier interaction (Wagon 4 #1);
 *   5. aggregated missing facts are deduped with affected-member counts;
 *   6. determinism.
 */

const v2 = (input: Record<string, unknown>) => {
  const parsed = sanitizeStructuredDemandV2(input);
  if (parsed === null) throw new Error("fixture v2 cluster did not validate");
  return parsed;
};

const need: MatchNeed = {
  skillIds: ["bricklaying", "concrete-works", "scaffolding"],
  needSource: "human_structured",
  structuredV2: v2({ target_supply: "team" }),
};

const member = (
  skills: string[],
  extra: Partial<MatchSubject> = {},
): MatchSubject => ({
  skills: skills.map((uri) => ({ uri, evidence: "work_journal" as const })),
  availabilityStatus: "available",
  ...extra,
});

describe("composition + coverage basis", () => {
  it("covers a need through complementary members, with the full basis", () => {
    const r = matchTeamToNeed(
      need,
      [member(["bricklaying", "concrete-works"]), member(["scaffolding"])],
      { memberRefs: ["w1", "w2"] },
    );
    expect(r.coverage).not.toBeNull();
    expect(r.coverage?.coveredCount).toBe(3);
    expect(r.coverage?.needTotal).toBe(3);
    expect(r.coverage?.entries).toEqual([
      { skillId: "bricklaying", eligibleMembers: 1, totalMembers: 1 },
      { skillId: "concrete-works", eligibleMembers: 1, totalMembers: 1 },
      { skillId: "scaffolding", eligibleMembers: 1, totalMembers: 1 },
    ]);
    expect(r.status).toBe("strong");
    expect(r.eligible).toBe(true);
    expect(r.memberCount).toBe(2);
    expect(r.eligibleMemberCount).toBe(2);
    // Per-member roles-covered breakdown, caller refs preserved.
    expect(r.members.map((m) => m.memberRef)).toEqual(["w1", "w2"]);
    expect(r.members[0].coveredSkillIds).toEqual(["bricklaying", "concrete-works"]);
    expect(r.members[1].coveredSkillIds).toEqual(["scaffolding"]);
    // Member results are the canonical engine's (same calc version).
    expect(r.members[0].result.calcVersion).toBe(MATCH_CALC_VERSION);
    expect(r.calcVersion).toBe(MATCH_CALC_VERSION);
  });

  it("partial coverage classifies by the covered share (2 of 3 → possible)", () => {
    const r = matchTeamToNeed(need, [member(["bricklaying", "concrete-works"])]);
    expect(r.coverage?.coveredCount).toBe(2);
    expect(r.status).toBe("possible"); // 2/3 ≈ 0.67
    expect(r.eligible).toBe(true);
  });

  it("zero overlap → weak, never insufficient_data (the need IS structured)", () => {
    const r = matchTeamToNeed(need, [member(["plumbing"])]);
    expect(r.coverage?.coveredCount).toBe(0);
    expect(r.status).toBe("weak");
  });
});

describe("edge cases", () => {
  it("empty team → insufficient_data, no coverage, honest code", () => {
    const r = matchTeamToNeed(need, []);
    expect(r.status).toBe("insufficient_data");
    expect(r.coverage).toBeNull();
    expect(r.eligible).toBe(false);
    expect(r.missingData).toContain("no_team_members");
  });

  it("unstructured need → insufficient_data (no % without a basis)", () => {
    const r = matchTeamToNeed({ skillIds: [] }, [member(["bricklaying"])]);
    expect(r.status).toBe("insufficient_data");
    expect(r.coverage).toBeNull();
    expect(r.missingData).toContain("need_not_structured");
    // The member breakdown still exists (each an honest engine result).
    expect(r.members[0].result.status).toBe("insufficient_data");
  });

  it("all-ineligible members: coverage counts them separately and status caps weak", () => {
    // Both members fully cover the skills but fail a hard language check.
    const needLang: MatchNeed = { ...need, languages: ["de"] };
    const blocked = member(["bricklaying", "concrete-works", "scaffolding"], {
      languages: ["lt"],
    });
    const r = matchTeamToNeed(needLang, [blocked, blocked]);
    expect(r.eligibleMemberCount).toBe(0);
    // Skills are held only by INELIGIBLE members — visible, not hidden…
    expect(r.coverage?.entries.every((e) => e.totalMembers === 2)).toBe(true);
    // …but eligible coverage is 0 and the status stays weak.
    expect(r.coverage?.coveredCount).toBe(0);
    expect(r.status).toBe("weak");
    expect(r.eligible).toBe(false);
    // The language block is a SET blocker: no member satisfies it.
    expect(r.setBlockers.some((b) => b.criterion === "language")).toBe(true);
  });
});

describe("set blockers — the hard-cap invariant at team level", () => {
  it("a requirement one member satisfies is NOT a set blocker", () => {
    const needLang: MatchNeed = { ...need, languages: ["de"] };
    const speaks = member(["bricklaying", "concrete-works", "scaffolding"], {
      languages: ["de"],
    });
    const silent = member(["bricklaying"], { languages: ["lt"] });
    const r = matchTeamToNeed(needLang, [speaks, silent]);
    expect(r.setBlockers).toEqual([]);
    expect(r.eligible).toBe(true);
    // Full eligible coverage through the speaking member → strong.
    expect(r.status).toBe("strong");
  });

  it("mandatory-tier interaction: an author-marked mandatory no member meets blocks the whole team", () => {
    const tieredNeed: MatchNeed = {
      ...need,
      structuredV2: v2({
        target_supply: "team",
        requirements: { own_tools: true },
        requirement_priorities: { own_tools: "mandatory" },
      }),
    };
    const full = member(["bricklaying", "concrete-works", "scaffolding"], {
      ownTools: false,
    });
    const r = matchTeamToNeed(tieredNeed, [full, { ...full }]);
    const blocker = r.setBlockers.find((b) => b.criterion === "own_tools");
    expect(blocker).toBeTruthy();
    // Tier provenance survives to the set level.
    expect(blocker?.authorMarked).toBe(true);
    expect(r.eligible).toBe(false);
    // The skills are held — but only by now-ineligible members, so eligible
    // coverage honestly reads 0 while the holds stay visible via totalMembers.
    expect(r.coverage?.coveredCount).toBe(0);
    expect(r.coverage?.entries.every((e) => e.totalMembers === 2)).toBe(true);
    // Invariant: the set-level hard blocker caps the status at weak.
    expect(r.status).toBe("weak");
  });

  it("author-preferred tier never produces a set blocker", () => {
    const tieredNeed: MatchNeed = {
      ...need,
      structuredV2: v2({
        target_supply: "team",
        requirements: { own_tools: true },
        requirement_priorities: { own_tools: "preferred" },
      }),
    };
    const full = member(["bricklaying", "concrete-works", "scaffolding"], {
      ownTools: false,
    });
    const r = matchTeamToNeed(tieredNeed, [full]);
    expect(r.setBlockers).toEqual([]);
    expect(r.eligible).toBe(true);
    expect(r.status).toBe("strong");
  });
});

describe("aggregated missing facts", () => {
  it("dedupes by criterion+side+source with affected-member counts", () => {
    const needLang: MatchNeed = { ...need, languages: ["de"] };
    const unstated = member(["bricklaying"]); // no languages stated
    const stated = member(["scaffolding"], { languages: ["de"] });
    const r = matchTeamToNeed(needLang, [unstated, { ...unstated }, stated]);
    const langFact = r.missingFacts.find(
      (f) => f.criterion === "language" && f.side === "worker",
    );
    expect(langFact).toBeTruthy();
    expect(langFact?.memberCount).toBe(2);
  });
});

describe("determinism", () => {
  it("same inputs produce identical output", () => {
    const members = [member(["bricklaying"]), member(["scaffolding", "plumbing"])];
    const a = matchTeamToNeed(need, members, { memberRefs: ["a", "b"] });
    const b = matchTeamToNeed(need, members, { memberRefs: ["a", "b"] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
