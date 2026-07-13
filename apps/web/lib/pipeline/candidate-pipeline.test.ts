import { describe, expect, it } from "vitest";

import {
  CANDIDATE_PIPELINE_STAGES,
  deriveCandidatePipelineStage,
  nextActionForStage,
  type CandidatePipelineFacts,
  type CandidatePipelineStage,
} from "@/lib/pipeline/candidate-pipeline";

const NONE: CandidatePipelineFacts = {
  shortlistStatus: null,
  interestStatus: null,
  bookingStatus: null,
  conversationExists: false,
};

function facts(over: Partial<CandidatePipelineFacts>): CandidatePipelineFacts {
  return { ...NONE, ...over };
}

describe("candidate pipeline — the 7 canonical stages", () => {
  it("pins the ordered 7-stage set", () => {
    expect(CANDIDATE_PIPELINE_STAGES).toEqual([
      "new",
      "reviewing",
      "contacted",
      "interview",
      "offer",
      "accepted",
      "rejected",
    ]);
  });

  it("every stage is reachable from real existing facts", () => {
    const reachable: Record<CandidatePipelineStage, CandidatePipelineFacts> = {
      new: NONE,
      reviewing: facts({ shortlistStatus: "saved" }),
      contacted: facts({ interestStatus: "contacted" }),
      interview: facts({ conversationExists: true }),
      offer: facts({ bookingStatus: "proposed" }),
      accepted: facts({ bookingStatus: "accepted" }),
      rejected: facts({ shortlistStatus: "not_fit" }),
    };
    for (const stage of CANDIDATE_PIPELINE_STAGES) {
      expect(deriveCandidatePipelineStage(reachable[stage])).toBe(stage);
    }
  });
});

describe("candidate pipeline — precedence ladder (pinned)", () => {
  it("1. accepted booking beats every other fact (even not_fit)", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({
          bookingStatus: "accepted",
          shortlistStatus: "not_fit",
          interestStatus: "contacted",
          conversationExists: true,
        }),
      ),
    ).toBe("accepted");
  });

  it("2. open proposal beats rejection facts and conversation", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({
          bookingStatus: "proposed",
          shortlistStatus: "not_fit",
          conversationExists: true,
        }),
      ),
    ).toBe("offer");
  });

  it("3a. shortlist not_fit → rejected, even with an open conversation", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({ shortlistStatus: "not_fit", conversationExists: true }),
      ),
    ).toBe("rejected");
  });

  it("3b. declined booking → rejected, even with an open conversation", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({
          bookingStatus: "declined",
          shortlistStatus: "saved",
          conversationExists: true,
        }),
      ),
    ).toBe("rejected");
  });

  it("4. conversation beats contacted/reviewing facts", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({
          conversationExists: true,
          interestStatus: "contacted",
          shortlistStatus: "reviewed",
        }),
      ),
    ).toBe("interview");
  });

  it("5. interest 'contacted' ack beats shortlist reviewing statuses", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({ interestStatus: "contacted", shortlistStatus: "saved" }),
      ),
    ).toBe("contacted");
  });

  it("6. every positive shortlist status → reviewing", () => {
    for (const s of ["saved", "interested", "reviewed"] as const) {
      expect(deriveCandidatePipelineStage(facts({ shortlistStatus: s }))).toBe(
        "reviewing",
      );
    }
  });

  it("6b. interest 'reviewed' ack alone → reviewing (company acted)", () => {
    expect(
      deriveCandidatePipelineStage(facts({ interestStatus: "reviewed" })),
    ).toBe("reviewing");
  });
});

describe("candidate pipeline — non-active facts fall through honestly", () => {
  it("withdrawn booking is not an offer nor a rejection", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({ bookingStatus: "withdrawn", shortlistStatus: "saved" }),
      ),
    ).toBe("reviewing");
    expect(deriveCandidatePipelineStage(facts({ bookingStatus: "withdrawn" }))).toBe(
      "new",
    );
  });

  it("expired booking falls through to the lower rungs", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({ bookingStatus: "expired", interestStatus: "contacted" }),
      ),
    ).toBe("contacted");
  });

  it("worker-initiated interest alone stays new (no company action yet)", () => {
    expect(
      deriveCandidatePipelineStage(facts({ interestStatus: "interested" })),
    ).toBe("new");
  });

  it("withdrawn interest is no signal", () => {
    expect(
      deriveCandidatePipelineStage(facts({ interestStatus: "withdrawn" })),
    ).toBe("new");
  });
});

describe("candidate pipeline — default-closed", () => {
  it("no facts → new", () => {
    expect(deriveCandidatePipelineStage(NONE)).toBe("new");
  });

  it("unknown status strings never mint a stage", () => {
    expect(
      deriveCandidatePipelineStage(
        facts({
          shortlistStatus: "hired",
          interestStatus: "super_interested",
          bookingStatus: "confirmed",
        }),
      ),
    ).toBe("new");
  });

  it("an unknown booking status cannot fake an offer or acceptance", () => {
    expect(
      deriveCandidatePipelineStage(facts({ bookingStatus: "ACCEPTED" })),
    ).toBe("new");
  });
});

describe("candidate pipeline — one next action per stage", () => {
  const ctx = { locale: "lt", requestId: "req-1" };

  it("returns exactly one action with a real locale-prefixed href per stage", () => {
    for (const stage of CANDIDATE_PIPELINE_STAGES) {
      const action = nextActionForStage(stage, ctx);
      expect(Object.keys(action).sort()).toEqual(["href", "key"]);
      expect(action.key).toMatch(/^candidatePipeline\.action\.[a-zA-Z]+$/);
      expect(action.href.startsWith("/lt/dashboard/")).toBe(true);
    }
  });

  it("stage-scoped routing: pipeline stages point at their real surfaces", () => {
    expect(nextActionForStage("new", ctx).href).toContain(
      "/dashboard/company/scouting?request=req-1",
    );
    expect(nextActionForStage("reviewing", ctx).href).toContain(
      "/dashboard/company/scouting?request=req-1",
    );
    expect(nextActionForStage("contacted", ctx).href).toBe(
      "/lt/dashboard/communication",
    );
    expect(nextActionForStage("interview", ctx).href).toBe(
      "/lt/dashboard/communication",
    );
    expect(nextActionForStage("offer", ctx).href).toBe("/lt/dashboard/bookings");
    expect(nextActionForStage("accepted", ctx).href).toBe("/lt/dashboard/bookings");
    expect(nextActionForStage("rejected", ctx).href).toContain(
      "/dashboard/company/scouting?request=req-1",
    );
  });
});
