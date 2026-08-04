import { describe, it, expect } from "vitest";
import {
  OUTREACH_MAX_INITIAL_CONTACTS,
  OUTREACH_MIN_AGE_DAYS,
  evaluateEmployerOutreach,
  evaluateEmployerOutreachByCompany,
  type EmployerOutreachInputV1,
} from "./employer-outreach-policy";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/** A publication date exactly `days` full days before NOW. */
const publishedDaysAgo = (days: number) =>
  new Date(NOW - days * DAY).toISOString();

function input(over: Partial<EmployerOutreachInputV1> = {}): EmployerOutreachInputV1 {
  return {
    companyKey: "se-5566778899",
    publishedAt: publishedDaysAgo(45),
    nowMs: NOW,
    alreadyContacted: false,
    optedOut: false,
    companyClaimed: false,
    ...over,
  };
}

describe("the 30-day floor", () => {
  it("day 0 is denied", () => {
    const d = evaluateEmployerOutreach(input({ publishedAt: publishedDaysAgo(0) }));
    expect(d.state).toBe("ineligible_too_new");
    expect(d.mayContact).toBe(false);
    expect(d.mayRequestHumanReview).toBe(false);
    expect(d.denyReasons).toContain("too_new");
    expect(d.daysUntilEligible).toBe(30);
  });

  it("every day from 0 to 29 is denied", () => {
    for (let day = 0; day < OUTREACH_MIN_AGE_DAYS; day += 1) {
      const d = evaluateEmployerOutreach(
        input({ publishedAt: publishedDaysAgo(day) }),
      );
      expect(d.mayContact, `day ${day} mayContact`).toBe(false);
      expect(d.mayRequestHumanReview, `day ${day} review`).toBe(false);
      expect(d.state, `day ${day} state`).toBe("ineligible_too_new");
    }
  });

  it("day 29 is still too new — the boundary is not off by one", () => {
    const d = evaluateEmployerOutreach(input({ publishedAt: publishedDaysAgo(29) }));
    expect(d.state).toBe("ineligible_too_new");
    expect(d.ageDays).toBe(29);
    expect(d.daysUntilEligible).toBe(1);
  });

  it("day 30 becomes eligible for HUMAN REVIEW only — never contactable", () => {
    const d = evaluateEmployerOutreach(input({ publishedAt: publishedDaysAgo(30) }));
    expect(d.state).toBe("eligible_for_human_review");
    expect(d.mayRequestHumanReview).toBe(true);
    expect(d.mayContact).toBe(false);
    expect(d.denyReasons).toContain("not_yet_human_approved");
    expect(d.ageDays).toBe(30);
  });

  it("day 31 and beyond behave the same as day 30 — review, not send", () => {
    for (const day of [31, 60, 400]) {
      const d = evaluateEmployerOutreach(
        input({ publishedAt: publishedDaysAgo(day) }),
      );
      expect(d.state, `day ${day}`).toBe("eligible_for_human_review");
      expect(d.mayContact, `day ${day}`).toBe(false);
    }
  });
});

describe("fail-closed on anything unprovable", () => {
  it("a missing publication date denies", () => {
    const d = evaluateEmployerOutreach(input({ publishedAt: null }));
    expect(d.mayContact).toBe(false);
    expect(d.mayRequestHumanReview).toBe(false);
    expect(d.denyReasons).toContain("publication_date_missing");
  });

  it("an unparseable publication date denies", () => {
    const d = evaluateEmployerOutreach(input({ publishedAt: "last spring" }));
    expect(d.denyReasons).toContain("publication_date_invalid");
    expect(d.mayRequestHumanReview).toBe(false);
  });

  it("a FUTURE publication date denies — it cannot prove 30 days passed", () => {
    const d = evaluateEmployerOutreach(
      input({ publishedAt: new Date(NOW + 5 * DAY).toISOString() }),
    );
    expect(d.denyReasons).toContain("publication_date_in_future");
    expect(d.mayContact).toBe(false);
  });

  it("a missing company key denies — one-per-company cannot be guaranteed", () => {
    for (const key of [null, "", "   "]) {
      const d = evaluateEmployerOutreach(input({ companyKey: key }));
      expect(d.denyReasons).toContain("company_key_missing");
      expect(d.mayRequestHumanReview).toBe(false);
    }
  });

  it("even a human approval cannot rescue an unprovable date", () => {
    const d = evaluateEmployerOutreach(
      input({ publishedAt: null, humanApproved: true }),
    );
    expect(d.mayContact).toBe(false);
  });
});

describe("automatic outreach is structurally impossible", () => {
  it("an old, unclaimed, un-opted-out company is STILL not contactable by default", () => {
    const d = evaluateEmployerOutreach(input({ publishedAt: publishedDaysAgo(365) }));
    expect(d.mayContact).toBe(false);
    expect(d.state).toBe("eligible_for_human_review");
  });

  it("only an explicit human approval produces mayContact", () => {
    const d = evaluateEmployerOutreach(input({ humanApproved: true }));
    expect(d.state).toBe("approved_for_single_contact");
    expect(d.mayContact).toBe(true);
  });

  it("humanApproved must be exactly true — no truthy coercion opens the gate", () => {
    for (const value of [undefined, false, null, 0, 1, "yes", {}] as unknown[]) {
      const d = evaluateEmployerOutreach({
        ...input(),
        humanApproved: value as boolean | undefined,
      });
      if (value === true) continue;
      expect(d.mayContact, `humanApproved=${String(value)}`).toBe(false);
    }
  });
});

describe("one message, then never again", () => {
  it("the cap is one and is not configurable upward in code", () => {
    expect(OUTREACH_MAX_INITIAL_CONTACTS).toBe(1);
  });

  it("an already-contacted company is denied even with human approval", () => {
    const d = evaluateEmployerOutreach(
      input({ alreadyContacted: true, humanApproved: true }),
    );
    expect(d.state).toBe("contacted");
    expect(d.mayContact).toBe(false);
    expect(d.denyReasons).toContain("already_contacted");
  });

  it("there is NO state that permits a follow-up — contacted is terminal", () => {
    // Every combination of the remaining inputs, once contacted, denies.
    for (const humanApproved of [true, false]) {
      for (const days of [30, 120, 999]) {
        const d = evaluateEmployerOutreach(
          input({
            alreadyContacted: true,
            humanApproved,
            publishedAt: publishedDaysAgo(days),
          }),
        );
        expect(d.mayContact).toBe(false);
        expect(d.mayRequestHumanReview).toBe(false);
      }
    }
  });
});

describe("permanent opt-out and company claim outrank everything", () => {
  it("opt-out denies regardless of age or approval", () => {
    const d = evaluateEmployerOutreach(
      input({ optedOut: true, humanApproved: true, publishedAt: publishedDaysAgo(900) }),
    );
    expect(d.state).toBe("opted_out");
    expect(d.mayContact).toBe(false);
    expect(d.mayRequestHumanReview).toBe(false);
  });

  it("ageing never reverses an opt-out", () => {
    for (const days of [30, 365, 3650]) {
      const d = evaluateEmployerOutreach(
        input({ optedOut: true, publishedAt: publishedDaysAgo(days) }),
      );
      expect(d.state, `day ${days}`).toBe("opted_out");
    }
  });

  it("a claimed company ends external outreach eligibility", () => {
    const d = evaluateEmployerOutreach(
      input({ companyClaimed: true, humanApproved: true }),
    );
    expect(d.state).toBe("company_claimed");
    expect(d.mayContact).toBe(false);
  });

  it("opt-out outranks claim in the reported state", () => {
    const d = evaluateEmployerOutreach(
      input({ optedOut: true, companyClaimed: true }),
    );
    expect(d.state).toBe("opted_out");
  });
});

describe("company-level deduplication — never one message per vacancy", () => {
  const context = {
    nowMs: NOW,
    alreadyContacted: false,
    optedOut: false,
    companyClaimed: false,
    humanApproved: false,
  };

  it("eleven vacancies from one company collapse to ONE decision", () => {
    const vacancies = Array.from({ length: 11 }, (_, i) => ({
      companyKey: "se-5566778899",
      publishedAt: publishedDaysAgo(40 + i),
    }));
    const decisions = evaluateEmployerOutreachByCompany(vacancies, context);
    expect(decisions.size).toBe(1);
  });

  it("the OLDEST vacancy sets the age, so reposting cannot reset the clock", () => {
    const decisions = evaluateEmployerOutreachByCompany(
      [
        { companyKey: "acme", publishedAt: publishedDaysAgo(0) },
        { companyKey: "acme", publishedAt: publishedDaysAgo(90) },
      ],
      context,
    );
    expect(decisions.get("acme")!.ageDays).toBe(90);
    expect(decisions.get("acme")!.state).toBe("eligible_for_human_review");
  });

  it("a fresh repost alone does not make an otherwise-new company eligible", () => {
    const decisions = evaluateEmployerOutreachByCompany(
      [
        { companyKey: "newco", publishedAt: publishedDaysAgo(2) },
        { companyKey: "newco", publishedAt: publishedDaysAgo(5) },
      ],
      context,
    );
    expect(decisions.get("newco")!.state).toBe("ineligible_too_new");
  });

  it("distinct companies get distinct decisions", () => {
    const decisions = evaluateEmployerOutreachByCompany(
      [
        { companyKey: "old", publishedAt: publishedDaysAgo(90) },
        { companyKey: "new", publishedAt: publishedDaysAgo(1) },
      ],
      context,
    );
    expect(decisions.get("old")!.state).toBe("eligible_for_human_review");
    expect(decisions.get("new")!.state).toBe("ineligible_too_new");
  });

  it("per-company facts override the shared context", () => {
    const decisions = evaluateEmployerOutreachByCompany(
      [
        { companyKey: "a", publishedAt: publishedDaysAgo(90) },
        { companyKey: "b", publishedAt: publishedDaysAgo(90) },
      ],
      {
        ...context,
        companyFacts: new Map([["a", { optedOut: true }]]),
      },
    );
    expect(decisions.get("a")!.state).toBe("opted_out");
    expect(decisions.get("b")!.state).toBe("eligible_for_human_review");
  });

  it("a vacancy with no company key is dropped, never given a decision", () => {
    const decisions = evaluateEmployerOutreachByCompany(
      [
        { companyKey: null, publishedAt: publishedDaysAgo(90) },
        { companyKey: "  ", publishedAt: publishedDaysAgo(90) },
      ],
      context,
    );
    expect(decisions.size).toBe(0);
  });
});

describe("the module sends nothing", () => {
  it("exports only pure decision helpers — no transport of any kind", async () => {
    const mod = await import("./employer-outreach-policy");
    const exported = Object.keys(mod).sort();
    expect(exported).toEqual([
      "OUTREACH_MAX_INITIAL_CONTACTS",
      "OUTREACH_MIN_AGE_DAYS",
      "evaluateEmployerOutreach",
      "evaluateEmployerOutreachByCompany",
    ]);
  });
});
