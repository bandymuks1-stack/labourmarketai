import { describe, expect, it } from "vitest";
import {
  deriveProfileProcessBrain,
  type ProfileProcessSignals,
} from "./profile-process-brain";

const EMPTY_WORKER: ProfileProcessSignals = {
  hasCv: false,
  selfDeclaredSkillCount: 0,
  supportedSkillCount: 0,
  journalEntryCount: 0,
  hasWorker: true,
};

describe("deriveProfileProcessBrain", () => {
  it("is deterministic — same input yields deeply equal output", () => {
    expect(deriveProfileProcessBrain(EMPTY_WORKER)).toEqual(
      deriveProfileProcessBrain(EMPTY_WORKER),
    );
  });

  it("empty worker profile → all three signals missing + three suggestions", () => {
    const out = deriveProfileProcessBrain(EMPTY_WORKER);
    expect(out.knownSignals).toHaveLength(0);
    expect(out.missingSignals.map((m) => m.key).sort()).toEqual([
      "cv",
      "journal",
      "skills",
    ]);
    expect(out.suggestedNextActions.map((a) => a.id).sort()).toEqual([
      "add-cv",
      "add-journal",
      "add-skills",
    ]);
  });

  it("every suggestion carries a reason and an existing canonical href", () => {
    const out = deriveProfileProcessBrain(EMPTY_WORKER);
    for (const a of out.suggestedNextActions) {
      expect(a.reasonKey, `${a.id} missing reasonKey`).toMatch(/\.reason$/);
      expect(a.href === "#profile-edit" || a.href === "/dashboard/journal").toBe(true);
    }
  });

  it("a full profile → all signals known, no suggestions", () => {
    const out = deriveProfileProcessBrain({
      hasCv: true,
      selfDeclaredSkillCount: 4,
      supportedSkillCount: 2,
      journalEntryCount: 3,
      hasWorker: true,
    });
    expect(out.missingSignals).toHaveLength(0);
    expect(out.suggestedNextActions).toHaveLength(0);
    expect(out.knownSignals.map((k) => k.key).sort()).toEqual([
      "cv",
      "journal",
      "skills",
    ]);
    // Known counts are passed as params, never fabricated.
    const skills = out.knownSignals.find((k) => k.key === "skills");
    expect(skills?.params).toEqual({ n: 4 });
  });

  it("non-worker: no journal suggestion (journal not reachable), no evidence link", () => {
    const out = deriveProfileProcessBrain({
      hasCv: false,
      selfDeclaredSkillCount: 1,
      supportedSkillCount: 0,
      journalEntryCount: 0,
      hasWorker: false,
    });
    expect(out.suggestedNextActions.map((a) => a.id)).not.toContain("add-journal");
    expect(out.missingSignals.map((m) => m.key)).not.toContain("journal");
    expect(out.evidenceLinks).toHaveLength(0);
  });

  it("always carries the two safety disclaimers (suggests, never verifies)", () => {
    const out = deriveProfileProcessBrain(EMPTY_WORKER);
    expect(out.safetyDisclaimers).toEqual([
      "safety.notAutomaticVerification",
      "safety.suggestionOnly",
    ]);
  });

  it("returns i18n keys only — never localized strings or raw verdicts", () => {
    const out = deriveProfileProcessBrain(EMPTY_WORKER);
    const allKeys = [
      ...out.knownSignals.map((s) => s.labelKey),
      ...out.missingSignals.map((s) => s.labelKey),
      ...out.suggestedNextActions.flatMap((a) => [a.labelKey, a.reasonKey]),
      ...out.evidenceLinks.map((e) => e.labelKey),
      ...out.safetyDisclaimers,
    ];
    // Keys are dotted identifiers, not sentences (no spaces).
    for (const k of allKeys) expect(k).toMatch(/^[a-zA-Z]+(\.[a-zA-Z]+)+$/);
  });
});
