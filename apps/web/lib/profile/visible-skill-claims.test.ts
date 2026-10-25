import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { visibleSkillClaims } from "./visible-skill-claims";

const row = (id: string) => ({ id, label: `claim ${id}` });

describe("visibleSkillClaims", () => {
  it("shows a claim that arrives in a later server read (the add-then-refresh case)", () => {
    const removed = new Set<string>();
    const before = visibleSkillClaims([row("a")], removed);
    const afterRefresh = visibleSkillClaims([row("b"), row("a")], removed);
    expect(before.map((c) => c.id)).toEqual(["a"]);
    expect(afterRefresh.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("hides a claim removed in this session until the refresh drops it", () => {
    const removed = new Set(["a"]);
    expect(visibleSkillClaims([row("b"), row("a")], removed).map((c) => c.id)).toEqual(["b"]);
    expect(visibleSkillClaims([row("b")], removed).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("capability profile section reads claims from the prop, not from seeded state", () => {
  const src = readFileSync(join(process.cwd(), "components", "app", "capability-profile-section.tsx"), "utf8");

  it("no useState seeded with the claims prop (it would freeze the first list)", () => {
    expect(src).not.toMatch(/useState<ProfileSkillClaimRow\[\]>\(\s*claims\s*\)/);
    expect(src).not.toMatch(/setSavedClaims\b/);
  });

  it("derives the shown claims from the prop on every render", () => {
    expect(src).toMatch(/visibleSkillClaims\(\s*claims\s*,/);
  });
});
