import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the candidate-suggestion tier is honest and DB-free
 * (journal-real-world-recognition-audit-p0, owner product direction).
 *
 *   - "Similar skills" candidate copy is neutral (no confirmed/verified/trust);
 *   - the composer wires the similar-skills framing + a manual fallback;
 *   - the human-in-the-loop LEARNING loop is documented only — no DB/learning
 *     code ships in this PR (the tier classifier touches no Supabase / IO).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CERT = /confirm|verif|patvirtin|tvirtin|approved|certified|trusted|proof|подтверж|верифиц/i;
const NEW_KEYS = ["similarSkillsTitle", "similarSkillsIntro", "addManuallyCta", "addManuallyHint"];

describe("candidate tier i18n is present + neutral in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: similar-skills + manual-fallback keys exist and avoid cert wording`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as Record<string, string>;
      for (const key of NEW_KEYS) {
        expect(j[key], `${loc}.${key} missing`).toBeTruthy();
        expect(CERT.test(j[key]), `${loc}.${key} "${j[key]}" must be neutral`).toBe(false);
      }
    });
  }
});

describe("composer wires the 3-level model", () => {
  const composer = read("components/app/journal-entry-composer.tsx");
  it("frames candidates as 'Similar skills' when nothing confident matched", () => {
    expect(composer).toMatch(/t\("similarSkillsTitle"\)/);
    expect(composer).toMatch(/t\("similarSkillsIntro"\)/);
  });
  it("keeps a manual fallback action and the empty-state note", () => {
    expect(composer).toMatch(/data-testid="skill-add-manually-link"/);
    expect(composer).toMatch(/t\("addManuallyCta"\)/);
    expect(composer).toMatch(/t\("skillNoMatch"\)/);
  });
  it("a chosen candidate stores only the canonical claim (no fake link as fact)", () => {
    expect(composer).toMatch(/addNewSkill\(row\.slug, row\.name\)/);
  });
});

describe("learning loop is documented only — no DB ships here", () => {
  const doc = read("../../docs/owner-input/journal-real-world-recognition-audit-p0.md");
  const tiers = read("lib/structuring/recognition-tiers.ts");
  it("the audit doc describes the human-in-the-loop learning model as RED", () => {
    expect(doc).toMatch(/Human-in-the-loop learning model/);
    expect(doc).toMatch(/RED \/ owner-gated/);
  });
  it("the tier classifier is pure: no Supabase / DB / network import", () => {
    expect(tiers).not.toMatch(/supabase|createClient|fetch\(|prisma|@\/lib\/db/i);
  });
});
