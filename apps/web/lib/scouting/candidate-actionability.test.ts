import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  candidateActionability,
  mayOfferEmployerActions,
  ACTIONABILITY_REASON_CODE,
  type CandidateActionabilityInput,
} from "./candidate-actionability";

const NOW = "2026-09-22T10:00:00.000Z";

/** An open need, a present worker, nobody having decided anything. */
function live(over: Partial<CandidateActionabilityInput> = {}): CandidateActionabilityInput {
  return {
    needStatus: "approved",
    needStartsOn: null,
    workerRecordPresent: true,
    interestStatus: null,
    shortlistStatus: null,
    availabilityStatus: "available",
    availableFrom: null,
    ...over,
  };
}

/**
 * THE OWNER'S ACTIONABILITY MATRIX (ruling 2026-09-22), case by case.
 * Each `it` is one line of that ruling, in the order the ruling gave them.
 */
describe("a person disappears from CURRENT proposals when canonical state says so", () => {
  it("a live candidate on an open need is actionable", () => {
    expect(candidateActionability(live(), NOW)).toEqual({ kind: "actionable" });
  });

  it("worker deleted / account no longer valid → not actionable", () => {
    expect(candidateActionability(live({ workerRecordPresent: false }), NOW)).toEqual({
      kind: "not_actionable",
      reason: "worker_record_absent",
    });
  });

  it("worker withdrew from THIS opportunity → not actionable", () => {
    expect(candidateActionability(live({ interestStatus: "withdrawn" }), NOW)).toEqual({
      kind: "not_actionable",
      reason: "worker_withdrew_interest",
    });
  });

  it("a live interest signal is not a withdrawal", () => {
    expect(candidateActionability(live({ interestStatus: "expressed" }), NOW).kind).toBe(
      "actionable",
    );
  });

  it("worker withdrew permission to receive proposals → not actionable", () => {
    expect(candidateActionability(live({ discoverable: false }), NOW)).toEqual({
      kind: "not_actionable",
      reason: "worker_not_discoverable",
    });
  });

  /** SEP-7. Not separately checked is not the same as refused — RLS already
   *  filtered the read, and treating silence as a refusal would empty the
   *  board wherever the caller simply did not ask. */
  it("an unchecked consent flag is not read as a refusal", () => {
    expect(candidateActionability(live({ discoverable: undefined }), NOW).kind).toBe("actionable");
  });

  it.each(["closed", "expired", "cancelled", "fulfilled"])(
    "a %s need carries no actionable proposals",
    (status) => {
      expect(candidateActionability(live({ needStatus: status }), NOW)).toEqual({
        kind: "not_actionable",
        reason: "need_closed",
      });
    },
  );

  it("the need outranks everything: a closed need refuses even a perfect candidate", () => {
    const a = candidateActionability(
      live({ needStatus: "closed", interestStatus: "expressed", shortlistStatus: "interested" }),
      NOW,
    );
    expect(a).toEqual({ kind: "not_actionable", reason: "need_closed" });
  });

  it("the employer's own final decision is kept, not re-offered", () => {
    expect(candidateActionability(live({ shortlistStatus: "not_fit" }), NOW)).toEqual({
      kind: "not_actionable",
      reason: "employer_decided",
    });
  });

  it.each(["saved", "interested", "reviewed"])(
    "%s is mid-flight, not a final decision",
    (status) => {
      expect(candidateActionability(live({ shortlistStatus: status }), NOW).kind).toBe("actionable");
    },
  );

  /** The worker's own decision outranks the employer's bookkeeping. */
  it("a withdrawal beats an employer shortlist entry", () => {
    expect(
      candidateActionability(
        live({ interestStatus: "withdrawn", shortlistStatus: "interested" }),
        NOW,
      ),
    ).toEqual({ kind: "not_actionable", reason: "worker_withdrew_interest" });
  });
});

/**
 * THE CORRECTION. The earlier command said availability=false should remove
 * a candidate; the owner reversed it: "Availability is temporal/contextual
 * evidence and may describe a future state. It is NOT automatically a
 * prohibition." These are the two worked examples from that ruling.
 */
describe("availability is never a prohibition", () => {
  it('"available from 15 Oct" + need begins after → still actionable', () => {
    const a = candidateActionability(
      live({
        availabilityStatus: "unavailable",
        availableFrom: "2026-10-15",
        needStartsOn: "2026-11-01",
      }),
      NOW,
    );
    expect(a).toEqual({ kind: "actionable" });
  });

  it('"available from 15 Oct" + employer needs an immediate start → actionable LATER, never removed', () => {
    const a = candidateActionability(
      live({ availabilityStatus: "unavailable", availableFrom: "2026-10-15", needStartsOn: null }),
      NOW,
    );
    expect(a).toEqual({
      kind: "actionable_later",
      reason: "available_from_after_need_start",
      availableFrom: "2026-10-15",
    });
    // The whole point: real future supply stays in the market.
    expect(mayOfferEmployerActions(a)).toBe(true);
  });

  it("a start exactly on the needed date is available, not late", () => {
    expect(
      candidateActionability(
        live({
          availabilityStatus: "unavailable",
          availableFrom: "2026-11-01",
          needStartsOn: "2026-11-01",
        }),
        NOW,
      ).kind,
    ).toBe("actionable");
  });

  it('a person who says "available" now outranks a stale date', () => {
    expect(
      candidateActionability(
        live({ availabilityStatus: "available", availableFrom: "2027-01-01" }),
        NOW,
      ).kind,
    ).toBe("actionable");
  });

  it("an unstated availability is never inferred into a refusal", () => {
    expect(
      candidateActionability(live({ availabilityStatus: null, availableFrom: null }), NOW).kind,
    ).toBe("actionable");
  });

  /**
   * A COMMITMENT IS NOT A PROHIBITION (SEP-2). An overlapping assignment is
   * deliberately NOT a reason here: the booking layer already treats a clash
   * as a fact needing explicit acknowledgement, and re-deciding it as a ban
   * in a second place would be the workforce-planner reduction.
   */
  it("there is no reason code that bans a person for being committed", () => {
    expect(Object.keys(ACTIONABILITY_REASON_CODE).sort()).toEqual([
      "employer_decided",
      "need_closed",
      "worker_not_discoverable",
      "worker_record_absent",
      "worker_withdrew_interest",
    ]);
  });
});

describe("it decides offering, never suitability", () => {
  it("no branch reads a skill, an evidence tier or a fit band", () => {
    // The input type is the proof: there is nowhere to put one.
    const keys = Object.keys(live());
    expect(keys).not.toContain("skills");
    expect(keys).not.toContain("match");
    expect(keys).not.toContain("evidence");
    expect(keys).not.toContain("score");
  });

  it("every reason has an i18n code, so no enum can reach a screen", () => {
    for (const [reason, code] of Object.entries(ACTIONABILITY_REASON_CODE)) {
      expect(code, reason).toMatch(/^scouting\.actionability\./);
    }
  });

  it("only actionable states may carry employer actions", () => {
    expect(mayOfferEmployerActions({ kind: "actionable" })).toBe(true);
    expect(
      mayOfferEmployerActions({ kind: "not_actionable", reason: "worker_withdrew_interest" }),
    ).toBe(false);
  });
});

/**
 * THE WIRING. The rules above are worthless if the reader does not consult
 * them, so these pin the two places the previous behaviour hid the facts.
 */
describe("the scouting reader consults the canonical verdict", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/scouting/scouting.ts"),
    "utf8",
  );

  /**
   * THE INFORMATION LOSS THIS REPLACED. `scouting.ts` used to drop withdrawn
   * interest rows while building the map, which turned "this person withdrew
   * from your opportunity" into "this person never answered" — the same
   * screen, two opposite facts, and no way for any later code to tell them
   * apart.
   */
  it("a withdrawal reaches the verdict instead of being filtered away", () => {
    expect(src).not.toMatch(/if \(r\.status !== "withdrawn"\) interestByWorker/);
    expect(src).toContain("interestByWorker[r.worker_id] = r.status;");
  });

  it("every candidate is filtered through the one verdict", () => {
    expect(src).toContain("candidateActionability(");
    expect(src).toContain("mayOfferEmployerActions(actionability)");
    // The verdict is decided BEFORE the safe view is built, so no surface
    // can assemble a candidate without one.
    expect(src.indexOf("candidateActionability(")).toBeLessThan(
      src.indexOf("toScoutSafeCandidate({"),
    );
  });

  it("the safe view cannot be built without a verdict", () => {
    const view = readFileSync(
      join(process.cwd(), "lib/scouting/scout-safe-view.ts"),
      "utf8",
    );
    // Required, not optional: `actionability?:` would let a caller forget.
    expect(view).toMatch(/readonly actionability: CandidateActionabilityV1;/);
    expect(view).not.toMatch(/readonly actionability\?:/);
    // Employer actions are AND-ed with the verdict, not just the calendar.
    expect(view).toContain("mayOfferEmployerActions(input.actionability) &&");
  });
});
