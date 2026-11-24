import { describe, expect, it } from "vitest";
import {
  groupLinkedSkillIdsByEntry,
  countEntriesBySkill,
  supportedSkillIds,
  type EntrySkillLinkRow,
} from "./journal-entry-skills";

const ROWS: EntrySkillLinkRow[] = [
  { journal_entry_id: "e1", skill_id: "s1" },
  { journal_entry_id: "e1", skill_id: "s2" },
  { journal_entry_id: "e2", skill_id: "s1" },
  { journal_entry_id: "e3", skill_id: "s3" },
];

describe("groupLinkedSkillIdsByEntry", () => {
  it("maps each entry to its supported skill ids", () => {
    const m = groupLinkedSkillIdsByEntry(ROWS);
    expect(m.get("e1")?.sort()).toEqual(["s1", "s2"]);
    expect(m.get("e2")).toEqual(["s1"]);
    expect(m.get("e3")).toEqual(["s3"]);
  });
  it("empty input → empty map", () => {
    expect(groupLinkedSkillIdsByEntry([]).size).toBe(0);
  });
});

describe("countEntriesBySkill", () => {
  it("counts DISTINCT supporting entries per skill", () => {
    const c = countEntriesBySkill(ROWS);
    expect(c.get("s1")).toBe(2); // e1 + e2
    expect(c.get("s2")).toBe(1);
    expect(c.get("s3")).toBe(1);
  });
  it("does not double-count a duplicate (entry,skill) pair", () => {
    const c = countEntriesBySkill([
      { journal_entry_id: "e1", skill_id: "s1" },
      { journal_entry_id: "e1", skill_id: "s1" },
    ]);
    expect(c.get("s1")).toBe(1);
  });
});

describe("supportedSkillIds", () => {
  it("returns the distinct set of durably-supported skills", () => {
    expect([...supportedSkillIds(ROWS)].sort()).toEqual(["s1", "s2", "s3"]);
  });
  it("empty input → empty set (no fake support)", () => {
    expect(supportedSkillIds([]).size).toBe(0);
  });
});
