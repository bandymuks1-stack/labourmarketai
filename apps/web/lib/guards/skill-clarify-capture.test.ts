import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Skill clarify-capture honesty guard (slice skill-clarify-capture-v1).
 * Owner-scoped candidate clarifications; self-declared / needs-clarification
 * (never verified); additive migration with no drop.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const repo = join(root, "..", "..");
const mig = readFileSync(
  join(repo, "supabase", "migrations", "20260609160000_skill_candidate_clarifications.sql"),
  "utf8",
);
const code = mig.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const section = read("components/app/skill-clarify-section.tsx");
const profilePage = read("app/[locale]/dashboard/profile/page.tsx");
const action = read("lib/skills/candidate-clarifications-actions.ts");

describe("migration is additive + owner-scoped (no drop, no loosening)", () => {
  it("creates the table; no drop table/column/function, no delete/truncate", () => {
    expect(code).toMatch(/create table if not exists public\.skill_candidate_clarifications/i);
    expect(code).not.toMatch(/drop\s+(table|column|function)/i);
    expect(code).not.toMatch(/delete\s+from/i);
    expect(code).not.toMatch(/truncate/i);
  });
  it("RLS is owner-scoped (profile_id = auth.uid()), never using(true)/to anon", () => {
    expect(code).toMatch(/enable row level security/i);
    expect(code).toMatch(/profile_id = auth\.uid\(\)/);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(code).not.toMatch(/\bto\s+anon\b/i);
  });
  it("grants only to authenticated; documents a reversible rollback", () => {
    expect(code).toMatch(/grant select, insert, update, delete\s+on public\.skill_candidate_clarifications to authenticated/i);
    expect(mig).toMatch(/ROLLBACK \(reversible\)/);
  });
});

describe("the write is owner-scoped via RLS (no SECURITY DEFINER needed)", () => {
  it("the action upserts with profile_id = the user id", () => {
    expect(action).toMatch(/profile_id:\s*user\.id/);
    expect(action).toMatch(/skill_candidate_clarifications/);
    expect(action).not.toMatch(/rpc\(/);
  });
  it("blanks stay null (no fabrication)", () => {
    expect(action).toMatch(/v\.length > 0 \? v\.slice\(0, 500\) : null/);
  });
});

describe("UI frames candidates as self-declared, not verified; copy LT+EN", () => {
  it("the section shows a candidate badge + form, mounted on the canonical profile surface (no new route)", () => {
    expect(section).toMatch(/candidateBadge/);
    expect(section).toMatch(/<SkillClarifyForm\b/);
    expect(profilePage).toMatch(/<SkillClarifySection\b/);
    expect(profilePage).toMatch(/id="candidate-skills"/);
  });
  it("LT + EN say self-declared / not verified", () => {
    expect(lt.skillClarify.selfDeclaredNote).toMatch(/savideklaruot/i);
    expect(lt.skillClarify.selfDeclaredNote).toMatch(/nepatvirtint/i);
    expect(en.skillClarify.selfDeclaredNote).toMatch(/self-declared/i);
    expect(en.skillClarify.selfDeclaredNote).toMatch(/not verified/i);
  });
  it("the candidate badge never claims verified/AI", () => {
    const blob = lt.skillClarify.candidateBadge + en.skillClarify.candidateBadge;
    expect(blob).not.toMatch(/verified|patvirtint(a|as)\b|artificial intelligence/i);
  });
});
