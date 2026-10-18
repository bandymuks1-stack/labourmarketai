import { describe, expect, it } from "vitest";
import {
  compareMatches,
  matchWorkerToNeed,
  type MatchNeed,
  type MatchSubject,
} from "@/lib/market/match-v1";
import {
  REPEATED_CONFIRMED_MIN_DAYS,
  REPEATED_CONFIRMED_MIN_ENTRIES,
  deriveConfirmedWorkTier,
  deriveSkillEvidenceDetail,
} from "@/lib/evidence/evidence-tier";

const S1 = "tiling";
const S2 = "painting";
const need: MatchNeed = { escoSkillUris: [S1, S2], country: "LT" };

function subject(skills: MatchSubject["skills"], extra: Partial<MatchSubject> = {}): MatchSubject {
  return { skills, country: "LT", availabilityStatus: "available", ...extra };
}

describe("confirmed WORK is derived, never a score", () => {
  it("none / confirmed_work / repeated_confirmed with explicit thresholds", () => {
    expect(deriveConfirmedWorkTier(undefined)).toBe("none");
    expect(deriveConfirmedWorkTier({ confirmedWorkEntries: 0, confirmedDays: 0 })).toBe("none");
    expect(deriveConfirmedWorkTier({ confirmedWorkEntries: 1, confirmedDays: 1 })).toBe("confirmed_work");
    // many entries on ONE day are not repeated evidence across days
    expect(deriveConfirmedWorkTier({ confirmedWorkEntries: REPEATED_CONFIRMED_MIN_ENTRIES, confirmedDays: 1 })).toBe("confirmed_work");
    expect(
      deriveConfirmedWorkTier({
        confirmedWorkEntries: REPEATED_CONFIRMED_MIN_ENTRIES,
        confirmedDays: REPEATED_CONFIRMED_MIN_DAYS,
      }),
    ).toBe("repeated_confirmed");
  });

  it("the stored tier stays the per-skill truth: confirmed WORK never promotes to manager_confirmed", () => {
    const d = deriveSkillEvidenceDetail(
      { verified: false, source: "work_journal" },
      { confirmedWorkEntries: 5, confirmedDays: 4 },
    );
    expect(d.tier).toBe("work_journal");
    expect(d.confirmedWork).toBe("repeated_confirmed");
  });
});

describe("the same candidate, before and after confirmed work", () => {
  const before = matchWorkerToNeed(need, subject([
    { uri: S1, evidence: "work_journal" },
    { uri: S2, evidence: "self_declared" },
  ]));
  const afterOnce = matchWorkerToNeed(need, subject([
    { uri: S1, evidence: "work_journal", confirmedWorkEntries: 1, confirmedDays: 1 },
    { uri: S2, evidence: "self_declared" },
  ]));
  const afterRepeated = matchWorkerToNeed(need, subject([
    { uri: S1, evidence: "work_journal", confirmedWorkEntries: 3, confirmedDays: 2 },
    { uri: S2, evidence: "self_declared" },
  ]));

  it("status, coverage and eligibility do not move; only the evidence counts do", () => {
    for (const r of [afterOnce, afterRepeated]) {
      expect(r.status).toBe(before.status);
      expect(r.skillFit?.pct).toBe(before.skillFit?.pct);
      expect(r.eligible).toBe(before.eligible);
      expect(r.evidenceConfidence).toBe(before.evidenceConfidence);
    }
    expect(before.evidence.matchedConfirmedWork).toBe(0);
    expect(afterOnce.evidence.matchedConfirmedWork).toBe(1);
    expect(afterOnce.evidence.matchedRepeatedConfirmed).toBe(0);
    expect(afterRepeated.evidence.matchedRepeatedConfirmed).toBe(1);
  });

  it("ranks ahead of an otherwise identical candidate, and only as a tiebreak", () => {
    const sorted = [before, afterOnce, afterRepeated].sort(compareMatches);
    expect(sorted[0]).toBe(afterRepeated);
    expect(sorted[1]).toBe(afterOnce);
    expect(sorted[2]).toBe(before);
  });

  it("never outranks coverage: more coverage with no evidence still wins", () => {
    const fullCoverageNoEvidence = matchWorkerToNeed(need, subject([
      { uri: S1, evidence: "self_declared" },
      { uri: S2, evidence: "self_declared" },
    ]));
    const halfCoverageRepeated = matchWorkerToNeed(need, subject([
      { uri: S1, evidence: "work_journal", confirmedWorkEntries: 9, confirmedDays: 5 },
    ]));
    expect([halfCoverageRepeated, fullCoverageNoEvidence].sort(compareMatches)[0]).toBe(fullCoverageNoEvidence);
  });
});

describe("missing evidence is 'not stated', never a reason to not match", () => {
  it("no counts at all → same eligibility/status/coverage as with counts", () => {
    const without = matchWorkerToNeed(need, subject([{ uri: S1, evidence: "self_declared" }, { uri: S2, evidence: "self_declared" }]));
    const withCounts = matchWorkerToNeed(need, subject([
      { uri: S1, evidence: "self_declared", confirmedWorkEntries: 2, confirmedDays: 2 },
      { uri: S2, evidence: "self_declared" },
    ]));
    expect(without.eligible).toBe(withCounts.eligible);
    expect(without.status).toBe(withCounts.status);
    expect(without.evidence.matchedConfirmedWork).toBe(0);
  });

  it("fit-not-rating: the evidence block carries integer counts only", () => {
    const r = matchWorkerToNeed(need, subject([{ uri: S1, evidence: "work_journal", confirmedWorkEntries: 4, confirmedDays: 3 }]));
    for (const v of Object.values(r.evidence)) expect(Number.isInteger(v)).toBe(true);
  });
});
