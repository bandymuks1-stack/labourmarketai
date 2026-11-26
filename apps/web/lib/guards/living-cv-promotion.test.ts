import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — canonical-journey P2 (living CV): the claim → catalogue promotion
 * stays a recording of the user's OWN confirmation, never an authority.
 *
 * Pins:
 *   1. promotion runs ONLY on labels the user confirmed (called strictly
 *      after saveProfileSkillClaimsAction in the flow's apply handler);
 *   2. the action never touches the `verified` flag — verification stays
 *      the manager-confirmation chain's job (confirm_entry_and_verify_skills);
 *   3. the scope guard (worker's own directions) is applied — outside-
 *      direction skills are skipped, not silently stored;
 *   4. the mapping is the shared deterministic lexicon (extract-profile-
 *      suggestions) — no AI call, no network in the pure module;
 *   5. the visible delta line renders only from the REAL promotion result.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const pure = read("lib/profile/claim-catalog-promotion.ts");
const action = read("lib/profile/claim-catalog-promotion-actions.ts");
const flow = read("components/app/profile-text-first-flow.tsx");

describe("living-CV promotion — honesty contract", () => {
  it("pure module uses the shared lexicon and nothing else", () => {
    expect(pure).toMatch(/extractProfileSuggestions/);
    expect(pure).not.toMatch(/fetch\(|createClient|runAiAgent/);
  });

  it("action never writes the verified flag", () => {
    expect(action).not.toMatch(/verified:\s*true/);
    expect(action).not.toMatch(/\.update\(/);
    // Insert carries ONLY worker_id + skill_id (column defaults do the rest).
    expect(action).toMatch(
      /insert\(toInsert\.map\(\(skill_id\) => \(\{ worker_id: workerId, skill_id \}\)\)\)/,
    );
  });

  it("action clamps to the worker's own directions", () => {
    expect(action).toMatch(/workerProfessionSkillIds\(supabase, workerId\)/);
    expect(action).toMatch(/skippedOutsideDirections/);
  });

  it("flow promotes only after the confirmed claims were saved", () => {
    // CV-18 / G-10: the save and the promotion run through the shared
    // CV-import proposal state; each is exactly the named server action.
    const hook = read("components/app/use-cv-import-proposals.ts");
    expect(hook).toMatch(/const saveConfirmed = [\s\S]{0,300}await saveProfileSkillClaimsAction\(/);
    expect(hook).toMatch(/const promote = [\s\S]{0,200}promoteConfirmedClaimsAction\(/);
    const saveIdx = flow.indexOf("await cvProposals.saveConfirmed(confirmedClaims)");
    const promoIdx = flow.indexOf("cvProposals.promote(saved)");
    expect(saveIdx).toBeGreaterThan(-1);
    expect(promoIdx).toBeGreaterThan(saveIdx);
  });

  it("delta line renders only from the real promotion result", () => {
    expect(flow).toMatch(/promotion && promotion\.applicable/);
    expect(flow).toMatch(/promotion\.promoted > 0/);
  });
});
