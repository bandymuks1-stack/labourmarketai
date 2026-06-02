import { describe, expect, it } from "vitest";
import {
  deriveSkillEvidence,
  isSkillSupportedByWork,
} from "./skill-evidence";

describe("isSkillSupportedByWork", () => {
  it("counts work_journal and manager_confirmed / verified as supported", () => {
    expect(isSkillSupportedByWork({ source: "work_journal" })).toBe(true);
    expect(isSkillSupportedByWork({ source: "manager_confirmed" })).toBe(true);
    expect(isSkillSupportedByWork({ verified: true })).toBe(true);
    expect(isSkillSupportedByWork({ source: "self_declared", verified: true })).toBe(true);
  });

  it("does NOT count plain self-declared (no journal backing) as supported", () => {
    expect(isSkillSupportedByWork({ source: "self_declared" })).toBe(false);
    expect(isSkillSupportedByWork({ source: "self_declared", verified: false })).toBe(false);
    expect(isSkillSupportedByWork({})).toBe(false); // defaults to self_declared
    expect(isSkillSupportedByWork({ source: null })).toBe(false);
  });

  it("counts a DURABLE journal→skill link as supported (v1)", () => {
    // A self-declared skill with at least one journal entry linked to it is now
    // supported — independent of the loose source value.
    expect(
      isSkillSupportedByWork({ source: "self_declared", journalSupported: true }),
    ).toBe(true);
    expect(
      isSkillSupportedByWork({ source: "self_declared", journalSupported: false }),
    ).toBe(false);
  });
});

describe("deriveSkillEvidence with durable journal links", () => {
  it("a self-declared skill backed by a journal link counts as supported", () => {
    const s = deriveSkillEvidence(
      [
        { source: "self_declared", journalSupported: true },
        { source: "self_declared", journalSupported: false },
      ],
      0,
    );
    expect(s).toEqual({ declared: 2, supported: 1, unsupported: 1 });
  });
});

describe("deriveSkillEvidence", () => {
  it("declared = worker skills + free-label claims; claims are never supported", () => {
    const s = deriveSkillEvidence(
      [{ source: "self_declared" }, { source: "work_journal" }],
      3, // free-label claims, always unsupported
    );
    expect(s.declared).toBe(5);
    expect(s.supported).toBe(1);
    expect(s.unsupported).toBe(4);
  });

  it("all self-declared, no journal backing → supported 0", () => {
    const s = deriveSkillEvidence(
      [{ source: "self_declared" }, { source: "self_declared" }],
      0,
    );
    expect(s).toEqual({ declared: 2, supported: 0, unsupported: 2 });
  });

  it("manager-confirmed skills are supported", () => {
    const s = deriveSkillEvidence(
      [
        { source: "manager_confirmed", verified: true },
        { source: "self_declared" },
      ],
      0,
    );
    expect(s).toEqual({ declared: 2, supported: 1, unsupported: 1 });
  });

  it("empty profile → all zeros, no negative counts", () => {
    expect(deriveSkillEvidence([], 0)).toEqual({
      declared: 0,
      supported: 0,
      unsupported: 0,
    });
  });

  it("unsupported never goes negative", () => {
    const s = deriveSkillEvidence([{ source: "work_journal" }], 0);
    expect(s.unsupported).toBeGreaterThanOrEqual(0);
  });
});
