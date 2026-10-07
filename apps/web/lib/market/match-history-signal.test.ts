import { describe, expect, it } from "vitest";

import { matchWorkerToNeed, type MatchNeed, type MatchSubject } from "./match-v1";

/**
 * ORGANIZATION-PROVIDED HISTORY in matching: a labelled signal, never a
 * score input. These tests pin the three rules the signal lives under:
 *  - SEP-3: it is not verification - the evidence tiers and confidence do not
 *    move;
 *  - SEP-7: a worker with no history (unknown) is scored exactly as before;
 *  - it never makes a skill the person did not declare count as matched.
 */

const need: MatchNeed = { skillIds: ["tiling", "screed", "waterproofing"] };

const declared = (slugs: string[]): MatchSubject["skills"] =>
  slugs.map((uri) => ({ uri, evidence: "self_declared" as const }));

describe("matchWorkerToNeed - organization-provided history signal", () => {
  it("counts matched skills the history names, beside the ladder", () => {
    const r = matchWorkerToNeed(need, {
      skills: declared(["tiling", "screed"]),
      historySignals: [
        { uri: "tiling", records: 12 },
        { uri: "waterproofing", records: 3 },
      ],
    });
    // waterproofing is NOT declared: it is not a matched skill and is not
    // counted. tiling is matched and named by the history.
    expect(r.evidence.matchedHistorySignal).toBe(1);
  });

  it("is never verification: tiers, confidence, status and fit are unchanged", () => {
    const without = matchWorkerToNeed(need, { skills: declared(["tiling", "screed"]) });
    const withSignal = matchWorkerToNeed(need, {
      skills: declared(["tiling", "screed"]),
      historySignals: [
        { uri: "tiling", records: 40 },
        { uri: "screed", records: 40 },
      ],
    });
    expect(withSignal.status).toBe(without.status);
    expect(withSignal.skillFit).toEqual(without.skillFit);
    expect(withSignal.evidenceConfidence).toBe(without.evidenceConfidence);
    expect(withSignal.evidence.matchedSelfDeclared).toBe(without.evidence.matchedSelfDeclared);
    expect(withSignal.evidence.matchedManagerConfirmed).toBe(0);
    expect(withSignal.evidence.matchedJournalSupported).toBe(0);
    expect(withSignal.evidenceConfidence).toBe("unverified");
  });

  it("a worker with no history is unknown, not zero: same result, field omitted", () => {
    const base = matchWorkerToNeed(need, { skills: declared(["tiling"]) });
    const unknown = matchWorkerToNeed(need, { skills: declared(["tiling"]), historySignals: undefined });
    const explicitNull = matchWorkerToNeed(need, { skills: declared(["tiling"]), historySignals: null });
    expect(unknown).toEqual(base);
    expect(explicitNull).toEqual(base);
    expect("matchedHistorySignal" in unknown.evidence).toBe(false);
  });

  it("a worker WITH history never ranks below the same worker without it", () => {
    const a = matchWorkerToNeed(need, { skills: declared(["tiling"]) });
    const b = matchWorkerToNeed(need, {
      skills: declared(["tiling"]),
      historySignals: [{ uri: "tiling", records: 1 }],
    });
    expect(b.skillFit?.pct).toBe(a.skillFit?.pct);
    expect(b.status).toBe(a.status);
  });
});
