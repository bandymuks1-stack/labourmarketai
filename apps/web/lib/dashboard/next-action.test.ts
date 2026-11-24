import { describe, expect, it } from "vitest";
import { deriveProfileNextAction } from "./next-action";

// Moved from lib/profile/profile-next-action.test.ts when the helper was
// folded into the canonical next-action module (canonical-user-journey v1).
describe("deriveProfileNextAction (deterministic one next action)", () => {
  it("no CV → complete profile", () => {
    expect(
      deriveProfileNextAction({
        cvProvided: false,
        selfDeclaredCount: 3,
        hasWorker: true,
        unsupportedSkillCount: 3,
      }),
    ).toEqual({ labelKey: "primaryAction", href: "#profile-edit" });
  });

  it("no skills → complete profile", () => {
    expect(
      deriveProfileNextAction({
        cvProvided: true,
        selfDeclaredCount: 0,
        hasWorker: true,
        unsupportedSkillCount: 0,
      }),
    ).toEqual({ labelKey: "primaryAction", href: "#profile-edit" });
  });

  it("worker with declared but unsupported skills → add work-journal evidence", () => {
    expect(
      deriveProfileNextAction({
        cvProvided: true,
        selfDeclaredCount: 4,
        hasWorker: true,
        unsupportedSkillCount: 2,
      }),
    ).toEqual({ labelKey: "primaryActionJournal", href: "/dashboard/journal" });
  });

  it("non-worker is never sent to the journal (no engagement)", () => {
    expect(
      deriveProfileNextAction({
        cvProvided: true,
        selfDeclaredCount: 4,
        hasWorker: false,
        unsupportedSkillCount: 4,
      }),
    ).toEqual({ labelKey: "primaryAction", href: "#profile-edit" });
  });

  it("all skills supported → keep refining the profile", () => {
    expect(
      deriveProfileNextAction({
        cvProvided: true,
        selfDeclaredCount: 4,
        hasWorker: true,
        unsupportedSkillCount: 0,
      }),
    ).toEqual({ labelKey: "primaryAction", href: "#profile-edit" });
  });

  it("is deterministic — same signals, same action", () => {
    const sig = {
      cvProvided: true,
      selfDeclaredCount: 1,
      hasWorker: true,
      unsupportedSkillCount: 1,
    };
    expect(deriveProfileNextAction(sig)).toEqual(deriveProfileNextAction(sig));
  });
});
