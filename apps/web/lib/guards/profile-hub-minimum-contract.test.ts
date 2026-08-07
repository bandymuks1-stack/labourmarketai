import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Profile hub ↔ minimum Player Card contract consolidation (launch audit §7.3,
 * PR #540).
 *
 * The hub's identity-essential presence (CV/about + skills pillars) is sourced
 * from the ONE `buildPlayerCardMinimum().missing` list, not a parallel ad-hoc
 * computation — so the hub and the player card never disagree on "what's
 * missing". No new checklist surface, no percentage/score. Pure UI/logic reuse.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("the hub references the minimum contract's missing list", () => {
  const hub = read("components/app/profile-hub-overview.tsx");

  it("imports + builds the minimum card from the source prop", () => {
    expect(hub).toMatch(/from "@\/lib\/identity\/player-card-minimum"/);
    expect(hub).toMatch(/buildPlayerCardMinimum\(cardSource\)/);
  });

  it("derives the CV(about) + skills pillar presence from card.missing", () => {
    expect(hub).toMatch(/!card\.missing\.includes\("about"\)/);
    expect(hub).toMatch(/!card\.missing\.includes\("skills"\)/);
  });

  it("exposes the missing essentials honestly (no percentage/score)", () => {
    expect(hub).toMatch(/data-card-missing=/);
    const codeOnly = hub
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(codeOnly).not.toMatch(/percent|100%|completion\s*score|\bscore\b/i);
  });

  it("still falls back to the raw booleans when no source is provided", () => {
    // backward-compatible: cardSource is optional, no regression for callers.
    // Whitespace-tolerant — prettier may wrap either ternary across lines.
    expect(hub).toMatch(
      /card\s*\?\s*!card\.missing\.includes\("about"\)\s*:\s*cvProvided/,
    );
    expect(hub).toMatch(
      /card\s*\?\s*!card\.missing\.includes\("skills"\)\s*:\s*selfDeclaredCount > 0/,
    );
  });
});

describe("the profile page feeds the contract source from already-fetched data", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("passes cardSource built from real profile fields (no new reads)", () => {
    expect(page).toMatch(/cardSource=\{\{/);
    expect(page).toMatch(/fullName: profile\?\.full_name/);
    expect(page).toMatch(/about: savedProfileText/);
    expect(page).toMatch(/skillsDeclared: savedSkillClaims\.length \+ savedSkills\.length/);
  });
});
