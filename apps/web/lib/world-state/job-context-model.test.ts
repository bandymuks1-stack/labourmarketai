import { describe, expect, it } from "vitest";

import type { MatchResultV1 } from "@/lib/market/match-v1";
import type { OpportunityCard } from "@/lib/opportunities/load-worker-opportunities";
import type { WorkerNextAction } from "@/lib/opportunities/opportunity-fit";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import { CONTEXT_RECOMMENDATION_LIMIT } from "./entity-context";
import {
  MAX_NAMED_MISSING_SKILLS,
  VERIFIED_ROUTE_STATUS,
  deriveJobContextModel,
} from "./job-context-model";

/**
 * The `job` entity's panel model (W3).
 *
 * What matters here is that the panel can only ever say things the engine
 * already decided, and that its "next steps" stay honest: named gaps, no
 * invented advice, and never advice to do what the person is already doing.
 */

function match(over: Partial<MatchResultV1> = {}): MatchResultV1 {
  return {
    status: "possible",
    skillFit: null,
    evidence: {
      matchedManagerConfirmed: 0,
      matchedJournalSupported: 0,
      matchedSelfDeclared: 0,
    },
    reasons: [],
    gaps: [],
    missingData: [],
    availability: "unknown",
    nextAction: "review",
    calcVersion: "2",
    eligible: true,
    matchedHard: [],
    blocking: [],
    strengths: [],
    negotiables: [],
    missingFacts: [],
    ...over,
  } as MatchResultV1;
}

function card(over: {
  matched?: string[];
  missing?: string[];
  interestStatus?: InterestStatus | null;
  nextAction?: WorkerNextAction;
  saved?: boolean;
  routeStatus?: string | null;
} = {}): OpportunityCard {
  const matched = over.matched ?? ["bricklaying"];
  const missing = over.missing ?? [];
  return {
    need: {
      id: "req-1",
      roleText: "bricklayer",
      country: "NL",
      teamSize: 4,
      startPeriod: "2026-09",
      accommodation: "provided",
      companyName: "Bouw BV",
      locationLabel: "Amsterdam",
      transport: "provided",
      requiredTools: ["hand-tools"],
      routeStatus: over.routeStatus === undefined ? VERIFIED_ROUTE_STATUS : over.routeStatus,
    },
    fit: { status: "possible_match", gaps: [] },
    match: match({
      skillFit: {
        pct: 50,
        needTotal: matched.length + missing.length,
        matchedTotal: matched.length,
        matchedConfirmed: 1,
        matchedUris: matched,
        matchedConfirmedUris: matched.slice(0, 1),
        missingUris: missing,
      },
    }),
    nextAction: over.nextAction ?? "review_match",
    interestStatus: over.interestStatus ?? null,
    saved: over.saved ?? false,
    structured: null,
  } as OpportunityCard;
}

describe("job context model — facts come from the engine, never from here", () => {
  it("carries the engine's basis, skills and status unchanged", () => {
    const m = deriveJobContextModel(card({ matched: ["a", "b"], missing: ["c"] }));
    expect(m.requestId).toBe("req-1");
    expect(m.matchedSkillSlugs).toEqual(["a", "b"]);
    expect(m.missingSkillSlugs).toEqual(["c"]);
    expect(m.basis).toEqual({ matched: 2, total: 3, confirmed: 1 });
    expect(m.matchStatus).toBe("possible");
  });

  it("has no basis at all when the need was unstructured", () => {
    const c = { ...card(), match: match({ skillFit: null }) } as OpportunityCard;
    const m = deriveJobContextModel(c);
    // No structure means no numbers — never a zero presented as a measurement.
    expect(m.basis).toBeNull();
    expect(m.matchedSkillSlugs).toEqual([]);
    expect(m.missingSkillSlugs).toEqual([]);
  });

  it("keys the verified badge on the real route status only", () => {
    expect(deriveJobContextModel(card()).verifiedRoute).toBe(true);
    expect(deriveJobContextModel(card({ routeStatus: "open_market" })).verifiedRoute).toBe(false);
    expect(deriveJobContextModel(card({ routeStatus: null })).verifiedRoute).toBe(false);
  });
});

describe("job context model — recommendations are honest and capped", () => {
  it("names the missing skills, bounded", () => {
    const missing = ["m1", "m2", "m3", "m4", "m5"];
    const m = deriveJobContextModel(card({ missing }));
    const rec = m.recommendations[0];
    expect(rec.code).toBe("close_missing_skills");
    if (rec.code === "close_missing_skills") {
      expect(rec.slugs).toEqual(missing.slice(0, MAX_NAMED_MISSING_SKILLS));
    }
    // The full count is still available for the copy — the list is trimmed,
    // the fact is not.
    expect(m.missingSkillSlugs).toHaveLength(5);
  });

  it("says nothing when there is nothing to say", () => {
    const m = deriveJobContextModel(card({ missing: [], nextAction: "review_match" }));
    expect(m.recommendations).toEqual([]);
  });

  it("reports an unanswered interest signal", () => {
    for (const status of ["interested", "reviewed"] as const) {
      const m = deriveJobContextModel(card({ interestStatus: status }));
      expect(m.recommendations.map((r) => r.code)).toContain("interest_pending");
    }
  });

  it("does NOT tell someone to keep waiting once the loop closed", () => {
    for (const status of ["contacted", "withdrawn"] as const) {
      const m = deriveJobContextModel(card({ interestStatus: status }));
      expect(m.recommendations.map((r) => r.code)).not.toContain("interest_pending");
    }
  });

  it("never advises 'review the match' — that is what the open panel is", () => {
    const m = deriveJobContextModel(card({ missing: [], nextAction: "review_match" }));
    expect(m.recommendations.map((r) => r.code)).not.toContain("next_action");
  });

  it("passes through a real next action when there is room for it", () => {
    const m = deriveJobContextModel(card({ missing: [], nextAction: "add_work_evidence" }));
    expect(m.recommendations).toEqual([{ code: "next_action", action: "add_work_evidence" }]);
  });

  it("never exceeds the cap", () => {
    const m = deriveJobContextModel(
      card({ missing: ["a", "b"], interestStatus: "interested", nextAction: "complete_profile" }),
    );
    expect(m.recommendations.length).toBeLessThanOrEqual(CONTEXT_RECOMMENDATION_LIMIT);
  });
});
