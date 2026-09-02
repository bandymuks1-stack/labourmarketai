import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the LEARNER half of M10 (FINAL COMPLETION Train G2, 2026-09-02).
 *
 * The institution half shipped as `lib/conversation/education-home.ts`
 * (an organization holding `training_provider` and not `employer` gets
 * education-shaped starters). The person half was still missing: a learner
 * — a person with an ACTIVE `student` engagement, the relationship the
 * institution↔learner invitation writes as DATA — was greeted with plain
 * worker copy. Pins:
 *   1. the person brief reads the EXISTING engagement read (no new table,
 *      no new query shape) and keys on the `student` slug;
 *   2. it adds ONE line + ONE chip, the chip being the same journal starter
 *      (learning is logged like work — one evidence path, not a second one);
 *   3. the 1–3 cap stays enforced (the block is behind `lines.length <
 *      MAX_LINES` and goes through `addChip`);
 *   4. copy exists in the five routed locales; the line names the
 *      institution when known and never invents one.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("Guard: learner home identity (person brief)", () => {
  const brief = read("lib/conversation/opening-brief.ts");

  it("reads the existing engagement layer and keys on the student slug", () => {
    expect(brief).toMatch(/import \{ listMyEngagements \} from "@\/lib\/invitations\/network"/);
    expect(brief).toMatch(/relationshipSlug === "student"/);
    expect(brief).not.toMatch(/\.from\("engagement_contexts"\)/);
  });

  it("adds one line and the SAME journal starter chip, inside the cap", () => {
    const block = brief.slice(brief.indexOf("learner identity (M10"), brief.indexOf('loadProfileSummaryForChat("resume")'));
    expect(block).toMatch(/lines\.length < MAX_LINES/);
    expect(block).toMatch(/addChip\("logwork", t\("chipLogLearning"\)\)/);
    expect((block.match(/addChip\(/g) ?? []).length).toBe(1);
    expect((block.match(/lines\.push\(/g) ?? []).length).toBe(1);
  });

  it("names the institution when known, an honest unnamed line otherwise — never an invented name", () => {
    expect(brief).toMatch(/t\("briefLearner", \{ organization: learner\.organizationName \}\)/);
    expect(brief).toMatch(/t\("briefLearnerUnnamed"\)/);
  });

  it("copy exists in the five routed locales", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const cat = JSON.parse(read(`messages/${locale}.json`));
      for (const k of ["briefLearner", "briefLearnerUnnamed", "chipLogLearning"]) {
        expect(cat.conversation?.chat?.[k], `${locale} conversation.chat.${k}`).toBeTruthy();
      }
      expect(cat.conversation.chat.briefLearner).toContain("{organization}");
    }
  });
});
