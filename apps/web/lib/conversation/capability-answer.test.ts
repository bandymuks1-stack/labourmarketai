import { describe, expect, it } from "vitest";

import {
  CAPABILITY_ANSWER_UNREADABLE,
  OUTCOME_CAP,
  capabilityContextOf,
  introMessageKey,
  outcomeMessageKey,
  resolveCapabilityAnswer,
  type CapabilityOutcomeKey,
} from "@/lib/conversation/capability-answer";
import {
  UNKNOWN_FACTS,
  UNKNOWN_PERSON_FACTS,
  type CompanyStarterFacts,
  type PersonStarterFacts,
  type StarterSignals,
} from "@/lib/conversation/starters";

const ZERO_FACTS: CompanyStarterFacts = {
  openDemands: 0,
  projects: 0,
  roster: 0,
  clientConnectionsActive: 0,
  clientConnectionsPending: 0,
  sharedRequests: 0,
  proposals: 0,
  learnersActive: 0,
  programmes: 0,
};

function person(personFacts: PersonStarterFacts = UNKNOWN_PERSON_FACTS, learnerLinked = false): StarterSignals {
  return {
    identity: "person",
    capabilities: [],
    staffingAgency: false,
    educationFirst: false,
    facts: UNKNOWN_FACTS,
    learnerLinked,
    personFacts,
  };
}

function company(over: Partial<StarterSignals> = {}): StarterSignals {
  return {
    identity: "company",
    capabilities: [],
    staffingAgency: false,
    educationFirst: false,
    facts: ZERO_FACTS,
    learnerLinked: false,
    ...over,
  };
}

const keysOf = (s: StarterSignals): CapabilityOutcomeKey[] => {
  const a = resolveCapabilityAnswer(s);
  if (a.kind !== "outcomes") throw new Error("expected outcomes");
  return a.outcomes.map((o) => o.key);
};

describe("every actor gets a real answer", () => {
  it("A PERSON IS ANSWERED — the defect that produced only \"Įmonės erdvė\"", () => {
    // `capabilityPhraseKeys` (the old composed fallback) returns [] for a
    // person. This is the whole point of the slice.
    const keys = keysOf(person());
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain("personCv");
    expect(capabilityContextOf(person())).toBe("person");
  });

  it("an employer hears employer and operations outcomes", () => {
    const keys = keysOf(company());
    expect(capabilityContextOf(company())).toBe("employer");
    expect(keys).toContain("employerNeed");
    expect(keys.some((k) => k === "opsProjects" || k === "opsTeam")).toBe(true);
  });

  it("an AGENCY does not collapse into a generic company answer", () => {
    const agency = company({ staffingAgency: true });
    expect(capabilityContextOf(agency)).toBe("agency");
    expect(introMessageKey("agency")).toBe("capIntroAgency");
    expect(introMessageKey("agency")).not.toBe(introMessageKey("employer"));
    const keys = keysOf(agency);
    expect(keys.some((k) => k.startsWith("agency"))).toBe(true);
  });

  it("an institution hears education outcomes only when it actually holds them", () => {
    const holds = company({ capabilities: ["training_provider"], educationFirst: true });
    expect(capabilityContextOf(holds)).toBe("education");
    expect(keysOf(holds).some((k) => k.startsWith("edu"))).toBe(true);
    // …and a company WITHOUT the capability is never told it has learners.
    expect(keysOf(company()).some((k) => k.startsWith("edu"))).toBe(false);
  });
});

describe("multiple simultaneous relationships", () => {
  it("an agency that is ALSO an employer and runs projects hears a MIX", () => {
    // The named production drift: "Labour market ai Sp. z o.o" — a staffing
    // agency that also holds demands, a roster and projects — was offered
    // three agency chips, as if being an agency erased everything else.
    const both = company({
      staffingAgency: true,
      capabilities: ["training_provider"],
      facts: { ...ZERO_FACTS, openDemands: 8, projects: 3, roster: 12, clientConnectionsActive: 2 },
    });
    const keys = keysOf(both);
    const families = new Set(
      keys.map((k) => (k.startsWith("agency") ? "agency" : k.startsWith("edu") ? "edu" : k.startsWith("ops") ? "ops" : "employer")),
    );
    expect(families.size, `one family only: ${keys.join(", ")}`).toBeGreaterThan(1);
    // The agency frame is still primary — context is not lost by mixing.
    expect(capabilityContextOf(both)).toBe("agency");
  });

  it("never more than the cap, and never a duplicate", () => {
    const busy = company({
      staffingAgency: true,
      capabilities: ["training_provider"],
      facts: { ...ZERO_FACTS, openDemands: 5, projects: 5, roster: 5, clientConnectionsActive: 5, sharedRequests: 5, learnersActive: 5, programmes: 5 },
    });
    const keys = keysOf(busy);
    expect(keys.length).toBeLessThanOrEqual(OUTCOME_CAP);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("current state decides what is most useful", () => {
  it("no open need → describe one; needs exist → see who answered", () => {
    expect(keysOf(company())[0]).toBe("employerNeed");
    const withNeeds = company({ facts: { ...ZERO_FACTS, openDemands: 4 } });
    expect(keysOf(withNeeds)[0]).toBe("employerCandidates");
  });

  it("an agency with no client is told to connect one first", () => {
    const fresh = company({ staffingAgency: true });
    expect(keysOf(fresh)[0]).toBe("agencyClients");
  });

  it("a client shared a need and nobody was proposed → that is the first outcome", () => {
    const unfinished = company({
      staffingAgency: true,
      facts: { ...ZERO_FACTS, clientConnectionsActive: 1, sharedRequests: 3, proposals: 0 },
    });
    expect(keysOf(unfinished)[0]).toBe("agencyProposals");
  });

  it("a person with nothing yet is asked to build; a person with history is shown it", () => {
    const empty = person({ skills: 0, workHistory: 0, journalEntries: 0 });
    expect(keysOf(empty)[0]).toBe("personProfile");
    const real = person({ skills: 7, workHistory: 2, journalEntries: 11 });
    expect(keysOf(real)[0]).toBe("personCv");
  });

  it("a linked learner keeps everything else — learning is added, not substituted", () => {
    const learner = person({ skills: 3, workHistory: 1, journalEntries: 0 }, true);
    const keys = keysOf(learner);
    expect(keys[0]).toBe("personLearning");
    expect(keys).toContain("personCv");
    expect(keys.length).toBeGreaterThan(1);
  });
});

describe("UNKNOWN != EMPTY != FAILED (SEP-7)", () => {
  it("a whole-context read failure is unreadable, never an empty list", () => {
    expect(CAPABILITY_ANSWER_UNREADABLE.kind).toBe("unreadable");
  });

  it("an ALL-UNKNOWN workspace still gets real outcomes — never 'nothing available'", () => {
    // Every count degraded. That is a statement about US, and it may not
    // become a statement about the person's account.
    const blind = company({ facts: UNKNOWN_FACTS });
    const keys = keysOf(blind);
    expect(keys.length).toBeGreaterThan(0);
    const answer = resolveCapabilityAnswer(blind);
    if (answer.kind !== "outcomes") throw new Error("expected outcomes");
    expect(answer.degraded, "an all-unknown read must be reported as partial").toBe(true);
  });

  it("an all-unknown PERSON is degraded and still answered", () => {
    const answer = resolveCapabilityAnswer(person(UNKNOWN_PERSON_FACTS));
    if (answer.kind !== "outcomes") throw new Error("expected outcomes");
    expect(answer.degraded).toBe(true);
    expect(answer.outcomes.length).toBeGreaterThan(0);
  });

  it("a fully-read workspace is NOT reported as partial", () => {
    const answer = resolveCapabilityAnswer(company());
    if (answer.kind !== "outcomes") throw new Error("expected outcomes");
    expect(answer.degraded).toBe(false);
  });

  it("an employer is not 'partial' because an agency read it never needed is null", () => {
    // Relevance is per HELD track — otherwise every plain employer would
    // permanently apologise for missing agency numbers it has no use for.
    const employer = company({
      facts: { ...ZERO_FACTS, clientConnectionsActive: null, sharedRequests: null, proposals: null, learnersActive: null, programmes: null },
    });
    const answer = resolveCapabilityAnswer(employer);
    if (answer.kind !== "outcomes") throw new Error("expected outcomes");
    expect(answer.degraded).toBe(false);
  });

  it("an UNKNOWN count never becomes a number in the sentence", () => {
    expect(outcomeMessageKey({ key: "employerCandidates", count: null })).toBe(
      "capOutEmployerCandidates",
    );
    expect(outcomeMessageKey({ key: "opsProjects", count: null })).toBe("capOutOpsProjects");
  });

  it("a KNOWN zero never becomes a number in the sentence either", () => {
    // "your 0 open needs" is not language.
    expect(outcomeMessageKey({ key: "employerCandidates", count: 0 })).toBe(
      "capOutEmployerCandidates",
    );
  });

  it("a real count IS spoken", () => {
    expect(outcomeMessageKey({ key: "employerCandidates", count: 4 })).toBe(
      "capOutEmployerCandidatesN",
    );
    expect(outcomeMessageKey({ key: "eduLearners", count: 60 })).toBe("capOutEduLearnersN");
  });
});

describe("nothing internal reaches the person", () => {
  it("no outcome key is ever used as copy — every one maps to a message key", () => {
    const every: CapabilityOutcomeKey[] = [
      "personCv", "personFindWork", "personLogWork", "personProfile", "personLearning",
      "employerNeed", "employerCandidates",
      "agencyClients", "agencyProposals", "agencyRoster",
      "eduLearners", "eduProgrammes",
      "opsProjects", "opsTeam",
    ];
    for (const key of every) {
      const messageKey = outcomeMessageKey({ key, count: null });
      expect(messageKey, `${key} has no phrase`).toMatch(/^capOut/);
      expect(messageKey).not.toBe(key);
    }
  });

  it("the organization name is carried only for an organization workspace", () => {
    const asPerson = resolveCapabilityAnswer(person(), "Some Company Ltd");
    if (asPerson.kind !== "outcomes") throw new Error("expected outcomes");
    expect(asPerson.organizationName).toBeNull();
    const asCompany = resolveCapabilityAnswer(company(), "Some Company Ltd");
    if (asCompany.kind !== "outcomes") throw new Error("expected outcomes");
    expect(asCompany.organizationName).toBe("Some Company Ltd");
  });
});
