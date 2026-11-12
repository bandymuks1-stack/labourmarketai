import { describe, expect, it } from "vitest";

import { peopleOutsideTeams } from "@/lib/company/people-outside-teams";

const ana = { profileId: "pa", name: "Ana" };
const ben = { profileId: "pb", name: "Ben" };
const cy = { profileId: "pc", name: "Cy" };

describe("people outside every team", () => {
  it("a person addable to a team and a member of none is outside", () => {
    expect(peopleOutsideTeams([{ members: [{ profileId: "pa" }], addable: [ben] }])).toEqual([ben]);
  });

  it("a member of ANOTHER team is not outside, although the first team could add them", () => {
    const out = peopleOutsideTeams([
      { members: [{ profileId: "pa" }], addable: [ben, cy] },
      { members: [{ profileId: "pb" }], addable: [ana, cy] },
    ]);
    expect(out).toEqual([cy]);
  });

  it("lists a person once, by name", () => {
    const out = peopleOutsideTeams([
      { members: [], addable: [cy, ben] },
      { members: [], addable: [ben, cy] },
    ]);
    expect(out).toEqual([ben, cy]);
  });

  it("an unreadable list is UNKNOWN, never 'nobody is outside'", () => {
    expect(peopleOutsideTeams([{ members: [], addable: [ben] }, { members: [], addable: null }])).toBeNull();
  });

  it("no teams: nobody can be said to be outside a team", () => {
    expect(peopleOutsideTeams([])).toEqual([]);
  });
});
