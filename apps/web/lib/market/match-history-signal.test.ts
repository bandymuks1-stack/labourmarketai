import { describe, expect, it } from "vitest";

import { compareMatches, matchWorkerToNeed, type MatchNeed, type MatchSubject } from "./match-v1";
import { matchRosterPersonToNeed } from "./roster-person-match";

/**
 * ORGANIZATION-PROVIDED HISTORY in matching (owner decision 2026-10-07, B:
 * supported historical skill signals contribute to matching, evidence class
 * explicit). The rules the signal lives under:
 *  - SEP-3: it is not verification - for skills the person declared, tiers and
 *    confidence do not move;
 *  - SEP-7: a person with no history (unknown) is scored exactly as before;
 *  - a required skill the person did NOT declare but the organization's
 *    history names DOES count toward fit - as its OWN class
 *    (ORGANIZATION_REPORTED), never as self-declared / journal-supported /
 *    manager-confirmed, and never lifting evidenceConfidence above
 *    "unverified".
 */

const need: MatchNeed = { skillIds: ["tiling", "screed", "waterproofing"] };

const declared = (slugs: string[]): MatchSubject["skills"] =>
  slugs.map((uri) => ({ uri, evidence: "self_declared" as const }));

describe("matchWorkerToNeed - organization-provided history signal", () => {
  it("counts matched skills the history names, beside the ladder", () => {
    const r = matchWorkerToNeed(need, {
      skills: declared(["tiling", "screed"]),
      historySignals: [{ uri: "tiling", records: 12 }],
    });
    expect(r.evidence.matchedHistorySignal).toBe(1);
    expect(r.evidence.matchedOrganizationReported).toBe(0);
  });

  it("for skills the person declared it is never verification: tiers, confidence, status and fit are unchanged", () => {
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

  it("a person with no history is unknown, not zero: same result, field omitted", () => {
    const base = matchWorkerToNeed(need, { skills: declared(["tiling"]) });
    const unknown = matchWorkerToNeed(need, { skills: declared(["tiling"]), historySignals: undefined });
    const explicitNull = matchWorkerToNeed(need, { skills: declared(["tiling"]), historySignals: null });
    expect(unknown).toEqual(base);
    expect(explicitNull).toEqual(base);
    expect("matchedHistorySignal" in unknown.evidence).toBe(false);
    expect("matchedOrganizationReported" in unknown.evidence).toBe(false);
  });

  it("history can only help: the same person with history never ranks below the same person without it", () => {
    const a = matchWorkerToNeed(need, { skills: declared(["tiling"]) });
    const b = matchWorkerToNeed(need, {
      skills: declared(["tiling"]),
      historySignals: [{ uri: "screed", records: 1 }],
    });
    expect((b.skillFit?.pct ?? 0) >= (a.skillFit?.pct ?? 0)).toBe(true);
    expect(compareMatches(b, a)).toBeLessThanOrEqual(0);
  });
});

describe("history-only skills - controlled cases, with vs without supported history", () => {
  const history = [
    { uri: "tiling", records: 14 },
    { uri: "screed", records: 6 },
  ];

  it("a declared-skill-less person with supported history matches; the comparable one without does not", () => {
    const withHistory = matchWorkerToNeed(need, { skills: [], historySignals: history });
    const without = matchWorkerToNeed(need, { skills: [] });

    // BEFORE (no history): nothing to evaluate.
    expect(without.status).toBe("insufficient_data");
    expect(without.skillFit?.matchedTotal).toBe(0);
    expect(without.missingData).toContain("no_subject_skills");

    // AFTER (supported history): 2 of 3 required skills are held through it.
    expect(withHistory.skillFit?.matchedTotal).toBe(2);
    expect(withHistory.skillFit?.pct).toBe(67);
    expect(withHistory.status).toBe("possible");
    expect(withHistory.missingData).not.toContain("no_subject_skills");
    expect(compareMatches(withHistory, without)).toBeLessThan(0);
  });

  it("evidence class stays explicit: ORGANIZATION_REPORTED, never a declared, journal or confirmed tier", () => {
    const r = matchWorkerToNeed(need, { skills: [], historySignals: history });
    expect(r.evidence.matchedOrganizationReported).toBe(2);
    expect(r.evidence.matchedSelfDeclared).toBe(0);
    expect(r.evidence.matchedJournalSupported).toBe(0);
    expect(r.evidence.matchedManagerConfirmed).toBe(0);
    expect(r.skillFit?.matchedConfirmed).toBe(0);
    expect(r.evidenceConfidence).toBe("unverified");
    expect(r.reasons).toContainEqual({ code: "skills_history_reported", count: 2 });
    // and the verified-only reasons stay absent
    const codes = r.reasons.map((x) => x.code);
    expect(codes).not.toContain("skills_manager_confirmed");
    expect(codes).not.toContain("skills_journal_supported");
  });

  it("a declared skill beside history-only skills: mixed classes, declared one not double counted", () => {
    const r = matchWorkerToNeed(need, {
      skills: declared(["tiling"]),
      historySignals: [
        { uri: "tiling", records: 3 },
        { uri: "screed", records: 6 },
      ],
    });
    expect(r.skillFit?.matchedTotal).toBe(2);
    expect(r.evidence.matchedSelfDeclared).toBe(1);
    expect(r.evidence.matchedOrganizationReported).toBe(1);
    expect(r.evidence.matchedHistorySignal).toBe(2);
    expect(r.evidenceConfidence).toBe("unverified");
  });

  it("history never raises confirmation: a manager-confirmed skill plus history-only skills is 'mixed', not 'confirmed'", () => {
    const r = matchWorkerToNeed(need, {
      skills: [{ uri: "tiling", evidence: "manager_confirmed" as const }],
      historySignals: [{ uri: "screed", records: 6 }],
    });
    expect(r.evidenceConfidence).toBe("mixed");
    expect(r.skillFit?.matchedConfirmed).toBe(1);
  });

  it("a signal for a skill the need does not require changes nothing", () => {
    const a = matchWorkerToNeed(need, { skills: declared(["tiling"]) });
    const b = matchWorkerToNeed(need, {
      skills: declared(["tiling"]),
      historySignals: [{ uri: "welding", records: 50 }],
    });
    expect(b.skillFit).toEqual(a.skillFit);
    expect(b.status).toBe(a.status);
    expect(b.evidence.matchedOrganizationReported).toBe(0);
  });

  it("zero-record signals are not signals", () => {
    const r = matchWorkerToNeed(need, { skills: [], historySignals: [{ uri: "tiling", records: 0 }] });
    expect(r.skillFit?.matchedTotal).toBe(0);
    expect(r.status).toBe("insufficient_data");
  });

  it("ranking: among comparable people, the one with supported history outranks the one without", () => {
    const people = [
      { id: "plain", result: matchWorkerToNeed(need, { skills: declared(["tiling"]) }) },
      {
        id: "supported",
        result: matchWorkerToNeed(need, {
          skills: declared(["tiling"]),
          historySignals: [{ uri: "screed", records: 9 }, { uri: "waterproofing", records: 2 }],
        }),
      },
    ].sort((a, b) => compareMatches(a.result, b.result));
    expect(people.map((p) => p.id)).toEqual(["supported", "plain"]);
    expect(people[0]!.result.status).toBe("strong");
    expect(people[1]!.result.status).toBe("weak");
  });
});

describe("matchRosterPersonToNeed - the organization's own historical person (no account)", () => {
  it("no signals: insufficient data (unknown), never a weak fit", () => {
    expect(matchRosterPersonToNeed(need, undefined).status).toBe("insufficient_data");
    expect(matchRosterPersonToNeed(need, []).status).toBe("insufficient_data");
  });

  it("supported signals: fits the organization's own need, class ORGANIZATION_REPORTED", () => {
    const r = matchRosterPersonToNeed(need, [
      { slug: "tiling", records: 14 },
      { slug: "screed", records: 6 },
      { slug: "waterproofing", records: 1 },
    ]);
    expect(r.status).toBe("strong");
    expect(r.evidence.matchedOrganizationReported).toBe(3);
    expect(r.evidenceConfidence).toBe("unverified");
    expect(r.eligible).toBe(true);
  });

  it("the result carries no record, name or excerpt - only counts and codes", () => {
    const r = matchRosterPersonToNeed(need, [{ slug: "tiling", records: 14 }]);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/Site A|context_label|organization_person_id|display_name/);
  });
});
