import { describe, expect, it } from "vitest";

import { needFromDemandRow } from "@/lib/opportunities/opportunity-need";
import { matchWorkerToNeed, type MatchSubject } from "@/lib/market/match-v1";

import { NEED_SKILLS_CONTRACT, needSkillsForPayload, readProjectedNeedSkills } from "./need-skills-payload";

// Owner decision 2026-10-29: a free-text need is judged by what it asks for,
// derived once at intake as catalogue slugs, never by its title alone.

const WET_ROOM = {
  title: "Wet-room finishing specialist",
  needSummary: "Tiling and waterproofing of bathrooms in Vilnius",
};

describe("needSkillsForPayload — the set stored at intake", () => {
  it("derives the required catalogue skills from the description, not only the title", () => {
    const stored = needSkillsForPayload(WET_ROOM);
    expect(stored).not.toBeNull();
    expect(stored!.slugs).toEqual(expect.arrayContaining(["tiling", "waterproofing"]));
    expect(stored!.source).toBe("recognized_from_text");
    expect(stored!.contract).toBe(NEED_SKILLS_CONTRACT);
    // Catalogue slugs only — no free text survives into the payload.
    expect(JSON.stringify(stored)).not.toMatch(/Vilnius|bathrooms|specialist/i);
  });

  it("stores nothing when nothing is derivable reliably (honest unassessed)", () => {
    expect(needSkillsForPayload({ title: "Zzqx", needSummary: "Qwvz plorb" })).toBeNull();
  });

  it("never stores a human-structured claim (that is the company's own act)", () => {
    const stored = needSkillsForPayload({
      ...WET_ROOM,
      payload: { structured_need: { skill_slugs: ["tiling"] } },
    });
    expect(stored).toBeNull();
  });
});

describe("readProjectedNeedSkills — the reader's two columns", () => {
  it("reads slugs + a known source", () => {
    expect(
      readProjectedNeedSkills({ need_skill_slugs: ["waterproofing", "tiling", "tiling"], need_skill_source: "recognized_from_text" }),
    ).toEqual({ slugs: ["tiling", "waterproofing"], source: "recognized_from_text" });
    expect(readProjectedNeedSkills({ need_skill_slugs: ["tiling"], need_skill_source: "human_structured" })?.source).toBe(
      "human_structured",
    );
  });

  it("degrades to 'no stored set' for an absent column, a null, an unknown source or non-slug text", () => {
    expect(readProjectedNeedSkills({})).toBeNull();
    expect(readProjectedNeedSkills({ need_skill_slugs: null, need_skill_source: null })).toBeNull();
    expect(readProjectedNeedSkills({ need_skill_slugs: ["tiling"], need_skill_source: "made_up" })).toBeNull();
    expect(readProjectedNeedSkills({ need_skill_slugs: ["Tile the BATHROOM please"], need_skill_source: "recognized_from_text" })).toBeNull();
  });
});

describe("needFromDemandRow — the worker board's need", () => {
  const titleOnlyRow = { id: "r1", role_text: WET_ROOM.title, country: "LT" };
  const widenedRow = {
    ...titleOnlyRow,
    need_skill_slugs: ["tiling", "waterproofing"],
    need_skill_source: "recognized_from_text",
  };

  it("an old row (no stored set) keeps the exact title-only reading", () => {
    const before = needFromDemandRow(titleOnlyRow);
    const withNulls = needFromDemandRow({ ...titleOnlyRow, need_skill_slugs: null, need_skill_source: null });
    expect(withNulls).toEqual(before);
  });

  it("a widened row matches on the need's own requirement set, labelled as a suggestion", () => {
    const { need, source } = needFromDemandRow(widenedRow);
    expect(need.skillIds).toEqual(["tiling", "waterproofing"]);
    expect(need.needSource).toBe("recognized_from_text");
    expect(source).toBe("recognized_from_text");
  });

  it("a worker whose stated profession differs but whose journal shows the work gets a real fit band", () => {
    const subject: MatchSubject = {
      professionSlug: "warehouse_worker",
      country: "LT",
      skills: [
        { uri: "tiling", evidence: "work_journal" },
        { uri: "waterproofing", evidence: "work_journal" },
      ],
    } as MatchSubject;
    const titleOnly = matchWorkerToNeed(needFromDemandRow(titleOnlyRow).need, subject);
    const widened = matchWorkerToNeed(needFromDemandRow(widenedRow).need, subject);
    expect(widened.skillFit?.matchedTotal).toBe(2);
    expect(widened.status).toBe("strong");
    // Probable, not confirmed: the derived set is flagged on the card.
    expect(widened.missingData).toContain("need_recognized_not_confirmed");
    expect(widened.evidence.matchedJournalSupported).toBe(2);
    expect(widened.evidence.matchedManagerConfirmed).toBe(0);
    // The defect this closes: the title alone could not be compared.
    expect(titleOnly.skillFit?.matchedTotal ?? 0).toBe(0);
  });
});
