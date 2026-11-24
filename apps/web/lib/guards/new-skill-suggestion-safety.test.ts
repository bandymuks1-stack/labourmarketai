/**
 * Evidence-safety guard for Recognition v1.1 "possible new skill" suggestions.
 *
 * Adding an undeclared skill must create ONLY a self-declared profile claim —
 * never verified, never manager-confirmed, never work-journal evidence. These
 * are static source assertions so a future refactor can't quietly wire the
 * add-path into a stronger evidence tier.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

describe("new-skill suggestion — evidence safety", () => {
  it("the cross-sector recogniser is pure (no IO, no verification)", () => {
    const src = read("lib/structuring/new-skill-suggestions.ts");
    for (const banned of [
      "createClient",
      "supabase",
      "fetch(",
      '"verified"',
      "manager_confirmed",
      "journal_entry_skills",
    ]) {
      expect(src.includes(banned), `must not reference ${banned}`).toBe(false);
    }
  });

  it("the add-to-profile path goes through self-declared claims only", () => {
    const src = read("components/app/journal-entry-composer.tsx");
    // The add handler uses the profile-skill-claims action…
    expect(src).toContain("saveProfileSkillClaimsAction");
    // …and the add path never sets verification / manager confirmation.
    const addFn = src.slice(
      src.indexOf("async function addNewSkill"),
      src.indexOf("async function addNewSkill") + 700,
    );
    expect(addFn).toContain("saveProfileSkillClaimsAction");
    expect(addFn).not.toContain("verified");
    expect(addFn).not.toContain("manager_confirmed");
    expect(addFn).not.toContain("createJournalEntry");
    expect(addFn).not.toContain("journal_entry_skills");
  });

  it("profile_skill_claims rows are self_declared + closed by type", () => {
    const src = read("lib/profile/profile-skill-claims.ts");
    expect(src).toContain('status: "self_declared"');
    expect(src).toContain('visibility: "closed"');
    // No verified/manager status is representable on a claim row.
    expect(src).not.toContain('status: "verified"');
    expect(src).not.toContain("manager_confirmed");
  });
});
