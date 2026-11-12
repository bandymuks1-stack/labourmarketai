import { describe, expect, it } from "vitest";

import { matchingAddable } from "@/components/app/team-brigades-panel";

const people = [
  { workerId: "1", name: "Ana Cook" },
  { workerId: "2", name: "Ben Nurse" },
  { workerId: "3", name: "ANATOL Dev" },
];

describe("team invite picker: name search", () => {
  it("no text keeps the whole list", () => {
    expect(matchingAddable(people, "", undefined)).toEqual(people);
    expect(matchingAddable(people, "   ", undefined)).toEqual(people);
    expect(matchingAddable(people, undefined, undefined)).toEqual(people);
  });
  it("matches part of a name in any letter case", () => {
    expect(matchingAddable(people, "ana", undefined).map((p) => p.workerId)).toEqual(["1", "3"]);
  });
  it("keeps the chosen person even when the text no longer matches them", () => {
    expect(matchingAddable(people, "ana", "2").map((p) => p.workerId)).toEqual(["1", "2", "3"]);
  });
  it("nobody matching is an empty list, not everyone", () => {
    expect(matchingAddable(people, "zzz", undefined)).toEqual([]);
  });
});
