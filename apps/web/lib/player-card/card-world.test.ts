import { describe, expect, it } from "vitest";
import { buildCardWorld, type CardWorldInput } from "./card-world";

const base: CardWorldInput = {
  person: {
    name: "Rasa J.",
    initials: "RJ",
    avatarUrl: null,
    professions: ["Virėja"],
    confirmedEdge: false,
    currentWork: [],
    currentWorkLabel: "Dirba dabar",
    facts: [],
    provenance: { label: "Kilmė", text: "Nurodė pati" },
  },
  modeLabels: { work: "Darbas", skills: "Gebėjimai", evidence: "Įrašai", history: "Istorija", next: "Toliau" },
  currentWork: [],
  skillBars: [],
  skillNames: [],
  skillEntryLabels: [],
  noEvidence: "Dar be įrašų",
  tierLabels: { verified: "Patvirtinta", journal: "Žurnale", declared: "Nurodyta" },
  months: [],
  monthLabels: [],
  lanes: [],
  laneDetails: [],
  currentLabel: "Vyksta dabar",
  directions: [],
  words: { sceneLabel: "scene", empty: "empty", emptyNext: "emptyNext", allDetails: "all" },
};

describe("the person's world is the card's own rows, placed in space", () => {
  it("an empty person has five empty satellites — nothing padded", () => {
    const w = buildCardWorld(base);
    expect(w.satellites.map((s) => s.key)).toEqual(["next", "history", "skills", "work", "evidence"]);
    expect(w.satellites.every((s) => s.count === 0 && s.weight === 0)).toBe(true);
    expect([w.skills, w.history, w.next, w.work, w.evidence.sources, w.evidence.months].every((a) => a.length === 0)).toBe(true);
  });

  it("each skill keeps its evidence tier, and each source lists exactly its skills", () => {
    const w = buildCardWorld({
      ...base,
      skillBars: [
        { slug: "cooking", entries: 9, tier: "verified" },
        { slug: "dishwashing", entries: 4, tier: "journal" },
        { slug: "cleaning-services", entries: 0, tier: "declared" },
      ],
      skillNames: ["Maisto gaminimas", "Indų plovimas", "Patalpų valymas"],
      skillEntryLabels: ["9 įrašai", "4 įrašai", "0 įrašų"],
    });
    expect(w.skills.map((s) => [s.label, s.tone, s.detail])).toEqual([
      ["Maisto gaminimas", "confirmed", "9 įrašai"],
      ["Indų plovimas", "recorded", "4 įrašai"],
      ["Patalpų valymas", "declared", "Dar be įrašų"],
    ]);
    expect(w.evidence.sources.map((s) => [s.key, s.skillIds])).toEqual([
      ["confirmed", ["skill:cooking"]],
      ["journal", ["skill:dishwashing"]],
      ["declared", ["skill:cleaning-services"]],
    ]);
    // weight is size only, and a declared skill never outweighs a recorded one
    expect(w.skills[2].weight).toBeLessThan(w.skills[1].weight);
  });

  it("history runs oldest → newest and says 'now' once", () => {
    const w = buildCardWorld({
      ...base,
      lanes: [
        { id: "b", label: "Restoranas", startFraction: 0.6, endFraction: 1, current: true },
        { id: "a", label: "Statybos UAB", startFraction: 0, endFraction: 0.5, current: false },
      ],
      laneDetails: ["2025-03 — dabar", "2021-01 — 2024-06"],
    });
    expect(w.history.map((h) => h.label)).toEqual(["Statybos UAB", "Restoranas"]);
    expect(w.history[1].detail).toBe("2025-03 — dabar");
    expect(w.history[1].tone).toBe("current");
  });

  it("the environment follows the catalogue profession, neutral otherwise", () => {
    expect(buildCardWorld({ ...base, professionSlug: "cook" }).environment).toBe("kitchen");
    expect(buildCardWorld({ ...base, professionSlug: "welder" }).environment).toBe("workshop");
    expect(buildCardWorld({ ...base, professionSlug: null }).environment).toBe("neutral");
    expect(buildCardWorld({ ...base, professionSlug: "astronaut" }).environment).toBe("neutral");
  });

  it("the model is plain data — it can cross into a client component", () => {
    const w = buildCardWorld({ ...base, currentWork: ["Restoranas", "Restoranas", " "] });
    expect(w.work.map((n) => n.label)).toEqual(["Restoranas"]);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});
