import { describe, expect, it } from "vitest";

import {
  compareMatches,
  matchWorkerToNeed,
  type MatchNeed,
  type MatchSubject,
} from "./match-v1";
import { PRACTICE_RELATIONSHIPS } from "@/lib/player-card/work-history-model";

/**
 * PRACTICE AS A LABELLED MATCHING SIGNAL.
 *
 * The education chain is live in production: a training_provider invites a
 * learner, the learner records practice / volunteer work, and
 * `engagement_contexts` carries the placement. Every history surface already
 * renders it — under its own heading, never as a job. The MATCH RESULT could
 * not see it at all, so the one fact the education pilot exists to establish
 * ("this person did real work, as a placement") reached the deciding human as
 * silence.
 *
 * This file pins the three properties that make the fix safe:
 *   (a) LABELLED     — its own reason code, never conflated with employment;
 *   (b) ADDITIVE ONLY — a subject's practice count can only APPEND a reason.
 *       Status, eligibility, skill fit, criterion tiers and the ranking
 *       comparator are byte-identical with and without it, so no candidate's
 *       fit falls and no employment-backed candidate is reordered downward;
 *   (c) HONEST       — absence is "not stated", never "has none".
 */

const NEED: MatchNeed = {
  skillIds: ["presenting", "teamwork"],
  country: "LT",
  needSource: "human_structured",
};

/** An employment-backed candidate: confirmed skills, no placement anywhere. */
const EMPLOYMENT_ONLY: MatchSubject = {
  skills: [
    { uri: "presenting", evidence: "manager_confirmed" },
    { uri: "teamwork", evidence: "manager_confirmed" },
  ],
  country: "LT",
  availabilityStatus: "available",
};

/** The same person, plus two completed placements. */
const WITH_PRACTICE: MatchSubject = { ...EMPLOYMENT_ONLY, practiceEngagements: 2 };

const codes = (s: MatchSubject): string[] =>
  matchWorkerToNeed(NEED, s).reasons.map((r) => r.code);

describe("(a) the signal is present, and it is labelled as practice", () => {
  it("a subject with placements gets its own reason code, carrying the real count", () => {
    const result = matchWorkerToNeed(NEED, WITH_PRACTICE);
    const reason = result.reasons.find((r) => r.code === "practice_experience");
    expect(reason).toBeTruthy();
    expect(reason).toEqual({ code: "practice_experience", count: 2 });
  });

  it("the practice code is distinct from every employment/evidence code", () => {
    const got = codes(WITH_PRACTICE);
    expect(got).toContain("practice_experience");
    // It is NOT reported through the skill-evidence codes, which describe the
    // worker's SKILLS, nor through any employment-shaped reason.
    expect(got).toContain("skills_manager_confirmed");
    expect(got.filter((c) => c === "practice_experience")).toHaveLength(1);
  });

  it("the relationship set it counts is the canonical practice list, not employment", () => {
    // Guards the meaning at the source: if `student`/`volunteer` ever migrated
    // into WORKER_RELATIONSHIPS, this signal would silently become employment.
    expect([...PRACTICE_RELATIONSHIPS]).toEqual(["student", "volunteer"]);
  });
});

describe("(b) absence changes nothing — the employment-only candidate is untouched", () => {
  it("no placements ⇒ no practice reason", () => {
    expect(codes(EMPLOYMENT_ONLY)).not.toContain("practice_experience");
  });

  it("an explicit zero is the same as an unread field (both say nothing)", () => {
    const zero = matchWorkerToNeed(NEED, { ...EMPLOYMENT_ONLY, practiceEngagements: 0 });
    const unread = matchWorkerToNeed(NEED, { ...EMPLOYMENT_ONLY, practiceEngagements: null });
    expect(zero).toEqual(matchWorkerToNeed(NEED, EMPLOYMENT_ONLY));
    expect(unread).toEqual(matchWorkerToNeed(NEED, EMPLOYMENT_ONLY));
  });

  it("NO-REGRESSION: an employment-only candidate's whole result is unchanged", () => {
    // The literal pre-change expectation, spelled out rather than compared to
    // itself: a fully covered, confirmed, available, in-country candidate.
    const r = matchWorkerToNeed(NEED, EMPLOYMENT_ONLY);
    expect(r.status).toBe("strong");
    expect(r.eligible).toBe(true);
    expect(r.evidenceConfidence).toBe("confirmed");
    expect(r.skillFit?.pct).toBe(100);
    expect(r.reasons.map((x) => x.code)).toEqual([
      "skill_fit",
      "skills_manager_confirmed",
      "country_match",
      "available_now",
    ]);
  });
});

describe("(b) presence adds a reason and NOTHING else", () => {
  const without = matchWorkerToNeed(NEED, EMPLOYMENT_ONLY);
  const with_ = matchWorkerToNeed(NEED, WITH_PRACTICE);

  it("status, eligibility and skill fit are identical", () => {
    expect(with_.status).toBe(without.status);
    expect(with_.eligible).toBe(without.eligible);
    expect(with_.skillFit).toEqual(without.skillFit);
    expect(with_.evidence).toEqual(without.evidence);
    expect(with_.evidenceConfidence).toBe(without.evidenceConfidence);
    expect(with_.nextAction).toBe(without.nextAction);
    expect(with_.availability).toBe(without.availability);
  });

  it("every criterion tier is identical — practice is not a weighted input", () => {
    expect(with_.strengths).toEqual(without.strengths);
    expect(with_.matchedHard).toEqual(without.matchedHard);
    expect(with_.blocking).toEqual(without.blocking);
    expect(with_.negotiables).toEqual(without.negotiables);
    expect(with_.missingFacts).toEqual(without.missingFacts);
    expect(with_.gaps).toEqual(without.gaps);
    expect(with_.missingData).toEqual(without.missingData);
  });

  it("the reason list only GREW — every previous reason survives, in order", () => {
    const before = without.reasons.map((r) => r.code);
    const after = with_.reasons.map((r) => r.code);
    expect(after.filter((c) => c !== "practice_experience")).toEqual(before);
    expect(after.length).toBe(before.length + 1);
  });
});

describe("(b) ranking is untouched — no employment-backed candidate moves down", () => {
  it("a practice-backed candidate never outranks an equal employment-backed one", () => {
    const employment = matchWorkerToNeed(NEED, EMPLOYMENT_ONLY);
    const practice = matchWorkerToNeed(NEED, WITH_PRACTICE);
    // Ties stay ties: the comparator sees no practice input at all.
    expect(compareMatches(employment, practice)).toBe(0);
    expect(compareMatches(practice, employment)).toBe(0);
  });

  it("a weaker practice-backed candidate still ranks below a stronger employment one", () => {
    const weakWithPractice = matchWorkerToNeed(NEED, {
      skills: [{ uri: "teamwork", evidence: "self_declared" }],
      country: "LT",
      availabilityStatus: "available",
      practiceEngagements: 5,
    });
    const strongEmployment = matchWorkerToNeed(NEED, EMPLOYMENT_ONLY);
    expect(weakWithPractice.status).toBe("possible");
    expect(compareMatches(strongEmployment, weakWithPractice)).toBeLessThan(0);
  });
});

describe("(c) practice never rescues an unmatchable profile", () => {
  it("placements alone do not create a fit — an unstructured need still cannot match", () => {
    const r = matchWorkerToNeed(
      { needSource: null },
      { skills: [], practiceEngagements: 3 },
    );
    expect(r.status).toBe("insufficient_data");
    expect(r.reasons).toHaveLength(0);
    expect(r.missingData).toContain("need_not_structured");
  });

  it("a worker with placements but no skills is still insufficient_data, not strong", () => {
    const r = matchWorkerToNeed(NEED, { skills: [], practiceEngagements: 4 });
    expect(r.status).toBe("insufficient_data");
    expect(r.reasons.map((x) => x.code)).toContain("practice_experience");
    expect(r.missingData).toContain("no_subject_skills");
  });
});
