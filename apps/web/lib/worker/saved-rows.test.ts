import { describe, expect, it } from "vitest";

import { mergeSavedRows, pruneSavedRows, type LocalRows } from "./saved-rows";
import { findSameAchievement, type WorkerAchievementEntry } from "./worker-achievements-model";
import { findSameEducation, type WorkerEducationEntry } from "./worker-education-model";

type Row = { id: string; name: string };
const none: LocalRows<Row> = { saved: [], removed: [] };
const a: Row = { id: "a", name: "A" };
const b: Row = { id: "b", name: "B" };

describe("mergeSavedRows", () => {
  it("with nothing local the server's list stands, in its order", () => {
    expect(mergeSavedRows([a, b], none)).toEqual([a, b]);
  });

  it("a confirmed new row shows at once, first", () => {
    expect(mergeSavedRows([a], { saved: [b], removed: [] })).toEqual([b, a]);
  });

  it("an edit shows in its own place, not as a second row", () => {
    const edited = { id: "a", name: "A2" };
    expect(mergeSavedRows([a, b], { saved: [edited], removed: [] })).toEqual([edited, b]);
  });

  it("a removed row is gone, also one saved a moment ago", () => {
    expect(mergeSavedRows([a, b], { saved: [], removed: ["a"] })).toEqual([b]);
    expect(mergeSavedRows([a], { saved: [b], removed: ["b"] })).toEqual([a]);
  });
});

describe("pruneSavedRows", () => {
  it("the server caught up with a new row: the local copy is dropped", () => {
    expect(pruneSavedRows([a, b], { saved: [b], removed: [] })).toEqual(none);
  });

  it("the server still shows the old text of an edit: the edit stays", () => {
    const edited = { id: "a", name: "A2" };
    expect(pruneSavedRows([a], { saved: [edited], removed: [] }).saved).toEqual([edited]);
  });

  it("a later change made elsewhere is not hidden once the edit was seen", () => {
    const edited = { id: "a", name: "A2" };
    const seen = pruneSavedRows([edited], { saved: [edited], removed: [] });
    expect(mergeSavedRows([{ id: "a", name: "A3" }], seen)).toEqual([{ id: "a", name: "A3" }]);
  });

  it("the server dropped a removed row: nothing is left to hide", () => {
    expect(pruneSavedRows([b], { saved: [], removed: ["a"] })).toEqual(none);
    expect(pruneSavedRows([a], { saved: [], removed: ["a"] }).removed).toEqual(["a"]);
  });

  it("no change keeps the same object, so no state update follows", () => {
    const local: LocalRows<Row> = { saved: [b], removed: [] };
    expect(pruneSavedRows([a], local)).toBe(local);
  });
});

describe("a second save of the same statement is not a second row", () => {
  const school: WorkerEducationEntry = {
    id: "e1",
    institutionName: "Vilniaus kolegija",
    programOrField: "Statyba",
    educationTypeSlug: "college",
    startYear: 2014,
    endYear: 2017,
    isCurrent: false,
    note: null,
  };
  const input = {
    institutionName: "Vilniaus kolegija",
    programOrField: "Statyba",
    educationTypeSlug: "college" as const,
    startYear: 2014,
    endYear: 2017,
    isCurrent: false,
    note: null,
  };

  it("education: same words in any case find the row", () => {
    expect(findSameEducation([school], { ...input, institutionName: "VILNIAUS KOLEGIJA" })).toBe(school);
  });

  it("education: another programme or period is another statement", () => {
    expect(findSameEducation([school], { ...input, programOrField: "Apskaita" })).toBeNull();
    expect(findSameEducation([school], { ...input, endYear: 2018 })).toBeNull();
    expect(findSameEducation([], input)).toBeNull();
  });

  const award: WorkerAchievementEntry = {
    id: "a1",
    title: "Saugos kursai",
    description: null,
    achievedAt: "2022-05-01",
    achievementTypeSlug: "achievement",
    confirmedByManager: false,
  };
  const awardInput = {
    title: "saugos kursai",
    description: null,
    achievedAt: "2022-05-01",
    achievementTypeSlug: "achievement" as const,
  };

  it("achievement: same words and date find the row", () => {
    expect(findSameAchievement([award], awardInput)).toBe(award);
  });

  it("achievement: another date is another statement", () => {
    expect(findSameAchievement([award], { ...awardInput, achievedAt: "2023-05-01" })).toBeNull();
  });
});
