import { describe, expect, it } from "vitest";
import {
  matchWorkerToNeed,
  matchStrengthOrder,
  sourceToEvidence,
  type MatchNeed,
  type MatchSubject,
  type EvidenceTier,
} from "./match-v1";

describe("sourceToEvidence — maps worker_skills.source to the evidence tier", () => {
  it("maps the three real sources; unknown/missing → self_declared (never inflated)", () => {
    expect(sourceToEvidence("manager_confirmed")).toBe("manager_confirmed");
    expect(sourceToEvidence("work_journal")).toBe("work_journal");
    expect(sourceToEvidence("self_declared")).toBe("self_declared");
    expect(sourceToEvidence(null)).toBe("self_declared");
    expect(sourceToEvidence(undefined)).toBe("self_declared");
    expect(sourceToEvidence("anything_else")).toBe("self_declared");
  });
});

// Three ESCO skill URIs reused across cases.
const S1 = "http://data.europa.eu/esco/skill/aaaa";
const S2 = "http://data.europa.eu/esco/skill/bbbb";
const S3 = "http://data.europa.eu/esco/skill/cccc";

function subjectWith(
  uris: string[],
  evidence: EvidenceTier,
  extra: Partial<MatchSubject> = {},
): MatchSubject {
  return {
    skills: uris.map((uri) => ({ uri, evidence })),
    ...extra,
  };
}

const fullNeed: MatchNeed = {
  escoSkillUris: [S1, S2, S3],
  country: "LT",
  languages: ["lt"],
  payOfferedEurMax: 3000,
};

describe("matchWorkerToNeed — status classification", () => {
  it("strong: full coverage, all manager-confirmed, all compatibility met", () => {
    const subject = subjectWith([S1, S2, S3], "manager_confirmed", {
      country: "LT",
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2500,
    });
    const r = matchWorkerToNeed(fullNeed, subject);
    expect(r.status).toBe("strong");
    expect(r.skillFit?.pct).toBe(100);
    expect(r.evidence.matchedManagerConfirmed).toBe(3);
    expect(r.gaps).toEqual([]);
    // why-reasons present
    expect(r.reasons.some((x) => x.code === "skill_fit")).toBe(true);
    expect(r.reasons.some((x) => x.code === "country_match")).toBe(true);
    expect(r.reasons.some((x) => x.code === "language_match")).toBe(true);
    expect(r.reasons.some((x) => x.code === "pay_within_offer")).toBe(true);
  });

  it("weak: partial coverage, self-declared only", () => {
    const subject = subjectWith([S1], "self_declared", {
      country: "LT",
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2000,
    });
    const r = matchWorkerToNeed(fullNeed, subject);
    expect(r.status).toBe("weak");
    expect(r.skillFit?.matchedTotal).toBe(1);
    expect(r.gaps.some((g) => g.code === "skills_missing")).toBe(true);
  });

  it("insufficient_data: unstructured need (no ESCO skills) yields no %", () => {
    const r = matchWorkerToNeed(
      { escoSkillUris: [] },
      subjectWith([S1, S2], "manager_confirmed"),
    );
    expect(r.status).toBe("insufficient_data");
    expect(r.skillFit).toBeNull();
    expect(r.missingData).toContain("need_not_structured");
  });
});

describe("matchWorkerToNeed — evidence strength influences the result", () => {
  it("journal-supported skills outrank self-declared at equal coverage", () => {
    const base: Partial<MatchSubject> = {
      country: "LT",
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2000,
    };
    const journal = matchWorkerToNeed(
      fullNeed,
      subjectWith([S1, S2, S3], "work_journal", base),
    );
    const self = matchWorkerToNeed(
      fullNeed,
      subjectWith([S1, S2, S3], "self_declared", base),
    );
    // identical coverage (100%), but journal evidence ranks strictly higher
    expect(journal.skillFit?.pct).toBe(self.skillFit?.pct);
    expect(matchStrengthOrder(journal.status)).toBeGreaterThan(
      matchStrengthOrder(self.status),
    );
    expect(journal.evidence.matchedJournalSupported).toBe(3);
    expect(self.evidence.matchedSelfDeclared).toBe(3);
  });

  it("manager-confirmed outranks journal-supported at equal coverage", () => {
    const base: Partial<MatchSubject> = {
      country: "LT",
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2000,
    };
    const confirmed = matchWorkerToNeed(
      fullNeed,
      subjectWith([S1, S2, S3], "manager_confirmed", base),
    );
    const journal = matchWorkerToNeed(
      fullNeed,
      subjectWith([S1, S2, S3], "work_journal", base),
    );
    expect(matchStrengthOrder(confirmed.status)).toBeGreaterThanOrEqual(
      matchStrengthOrder(journal.status),
    );
    expect(confirmed.status).toBe("strong");
  });
});

describe("matchWorkerToNeed — compatibility gaps surface as reasons", () => {
  it("missing required language is a gap and caps the status", () => {
    const subject = subjectWith([S1, S2, S3], "manager_confirmed", {
      country: "LT",
      languages: ["en"], // need requires 'lt'
      availabilityStatus: "available",
      salaryMinEur: 2000,
    });
    const r = matchWorkerToNeed(fullNeed, subject);
    const gap = r.gaps.find((g) => g.code === "language_missing");
    expect(gap).toBeTruthy();
    if (gap && gap.code === "language_missing") expect(gap.required).toContain("lt");
    // hard language block caps an otherwise-strong match down to weak
    expect(r.status).toBe("weak");
  });

  it("pay expectation above the offer surfaces a pay_above_offer gap", () => {
    const subject = subjectWith([S1, S2, S3], "manager_confirmed", {
      country: "LT",
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 4000, // need offers max 3000
    });
    const r = matchWorkerToNeed(fullNeed, subject);
    const gap = r.gaps.find((g) => g.code === "pay_above_offer");
    expect(gap).toBeTruthy();
    if (gap && gap.code === "pay_above_offer") {
      expect(gap.expected).toBe(4000);
      expect(gap.offered).toBe(3000);
    }
    // soft cap: still skilled, but pay mismatch holds it at 'possible'
    expect(r.status).toBe("possible");
  });

  it("country mismatch without mobility caps to possible", () => {
    const subject = subjectWith([S1, S2, S3], "manager_confirmed", {
      country: "PL",
      preferredCountries: ["PL", "DE"], // not LT
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2000,
    });
    const r = matchWorkerToNeed(fullNeed, subject);
    expect(r.gaps.some((g) => g.code === "country_mismatch")).toBe(true);
    expect(r.status).toBe("possible");
  });

  it("mobility (preferred country) counts as a positive reason", () => {
    const subject = subjectWith([S1, S2, S3], "manager_confirmed", {
      country: "PL",
      preferredCountries: ["LT"],
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2000,
    });
    const r = matchWorkerToNeed(fullNeed, subject);
    expect(r.reasons.some((x) => x.code === "mobility_match")).toBe(true);
    expect(r.status).toBe("strong");
  });
});

describe("matchWorkerToNeed — honest missing-data signals", () => {
  it("flags unknown availability / pay / language without assuming", () => {
    const r = matchWorkerToNeed(fullNeed, {
      skills: [S1, S2, S3].map((uri) => ({ uri, evidence: "manager_confirmed" as const })),
      country: "LT",
      // no availability, no salary, no languages
    });
    expect(r.missingData).toContain("availability_unknown");
    expect(r.missingData).toContain("pay_unknown");
    expect(r.missingData).toContain("language_unknown");
    // missing data never fabricates a gap or inflates status
    expect(r.gaps.some((g) => g.code === "language_missing")).toBe(false);
  });

  it("no subject skills at all → weak, flagged, never invented", () => {
    const r = matchWorkerToNeed(fullNeed, { skills: [] });
    expect(r.status).toBe("weak");
    expect(r.missingData).toContain("no_subject_skills");
    expect(r.skillFit?.matchedTotal).toBe(0);
  });
});

describe("matchWorkerToNeed — determinism", () => {
  it("same inputs produce identical output", () => {
    const subject = subjectWith([S1, S2], "work_journal", {
      country: "LT",
      languages: ["lt"],
      availabilityStatus: "available",
      salaryMinEur: 2000,
    });
    const a = matchWorkerToNeed(fullNeed, subject);
    const b = matchWorkerToNeed(fullNeed, subject);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
