/**
 * Guard — experience-record eligibility contract (marketplace precision
 * PR 6, canonical contract §5). Pins:
 *  - review eligibility exists ONLY for completed real interactions;
 *  - self-review and non-party review are impossible;
 *  - duplicates per (author, subject, interaction) are blocked;
 *  - the moderation machine has NO submitted→published shortcut and the
 *    author can never move a record;
 *  - no numeric person score exists in the contract vocabulary (§19
 *    fit-not-rating reconciliation);
 *  - the lib stays a CONTRACT: no UI or storage imports it yet
 *    (OWNER_DECISION_GATED — MP-6).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  canTransitionModeration,
  deriveReviewEligibility,
  DIMENSION_OUTCOMES,
  EXPERIENCE_DIMENSIONS,
  isInteractionCompleted,
  LEGAL_REVIEW_DIMENSIONS,
  MODERATION_STATES,
  visibleRecordCount,
  type InteractionFacts,
} from "@/lib/trust/experience-eligibility";

const NOW = "2026-07-11T12:00:00.000Z";

const booking = (over: Partial<InteractionFacts> = {}): InteractionFacts => ({
  kind: "accepted_booking",
  interactionId: "b-1",
  partyA: "company-1",
  partyB: "worker-1",
  status: "accepted",
  startDateIso: "2026-07-01",
  ...over,
});

describe("interaction completion", () => {
  it("accepted booking counts only from its start date", () => {
    expect(isInteractionCompleted(booking(), NOW)).toBe(true);
    expect(isInteractionCompleted(booking({ startDateIso: "2026-08-01" }), NOW)).toBe(false);
    expect(isInteractionCompleted(booking({ startDateIso: null }), NOW)).toBe(false);
    expect(isInteractionCompleted(booking({ status: "proposed" }), NOW)).toBe(false);
    expect(isInteractionCompleted(booking({ status: "declined" }), NOW)).toBe(false);
  });

  it("engagement counts only when ended; service request only when accepted", () => {
    expect(
      isInteractionCompleted(
        booking({ kind: "completed_engagement", endedAtIso: "2026-06-01T00:00:00Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isInteractionCompleted(booking({ kind: "completed_engagement", endedAtIso: null }), NOW),
    ).toBe(false);
    expect(
      isInteractionCompleted(
        booking({ kind: "concluded_service_request", status: "accepted" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isInteractionCompleted(
        booking({ kind: "concluded_service_request", status: "sent" }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("eligibility rules", () => {
  const base = {
    authorProfileId: "worker-1",
    subjectProfileId: "company-1",
    interaction: booking(),
    existingRecords: [],
    nowIso: NOW,
  };

  it("both real parties of a completed interaction are eligible, either direction", () => {
    expect(deriveReviewEligibility(base)).toEqual({
      eligible: true,
      kind: "accepted_booking",
      interactionId: "b-1",
    });
    expect(
      deriveReviewEligibility({
        ...base,
        authorProfileId: "company-1",
        subjectProfileId: "worker-1",
      }).eligible,
    ).toBe(true);
  });

  it("self-review is impossible", () => {
    expect(
      deriveReviewEligibility({ ...base, subjectProfileId: "worker-1" }),
    ).toEqual({ eligible: false, reason: "self_review" });
  });

  it("a non-party can neither write nor be written about", () => {
    expect(
      deriveReviewEligibility({ ...base, authorProfileId: "stranger" }),
    ).toEqual({ eligible: false, reason: "not_a_party" });
    expect(
      deriveReviewEligibility({ ...base, subjectProfileId: "stranger" }),
    ).toEqual({ eligible: false, reason: "not_a_party" });
  });

  it("incomplete interactions ground nothing", () => {
    expect(
      deriveReviewEligibility({
        ...base,
        interaction: booking({ startDateIso: "2027-01-01" }),
      }),
    ).toEqual({ eligible: false, reason: "interaction_not_completed" });
  });

  it("one record per (author, subject, interaction) — duplicates blocked", () => {
    const existing = [
      {
        authorProfileId: "worker-1",
        subjectProfileId: "company-1",
        interactionKind: "accepted_booking" as const,
        interactionId: "b-1",
      },
    ];
    expect(
      deriveReviewEligibility({ ...base, existingRecords: existing }),
    ).toEqual({ eligible: false, reason: "duplicate_for_interaction" });
    // The counterpart's own record about the other side stays possible.
    expect(
      deriveReviewEligibility({
        ...base,
        authorProfileId: "company-1",
        subjectProfileId: "worker-1",
        existingRecords: existing,
      }).eligible,
    ).toBe(true);
  });
});

describe("moderation machine", () => {
  it("has no submitted→published shortcut and authors never move records", () => {
    expect(canTransitionModeration("submitted", "published", "moderator")).toBe(false);
    expect(canTransitionModeration("submitted", "in_moderation", "moderator")).toBe(true);
    expect(canTransitionModeration("in_moderation", "published", "moderator")).toBe(true);
    expect(canTransitionModeration("in_moderation", "rejected", "moderator")).toBe(true);
    expect(canTransitionModeration("published", "rejected", "moderator")).toBe(false);
    for (const from of MODERATION_STATES) {
      for (const to of MODERATION_STATES) {
        expect(canTransitionModeration(from, to, "author")).toBe(false);
      }
    }
  });

  it("compensation accuracy always carries legal review", () => {
    expect(LEGAL_REVIEW_DIMENSIONS).toContain("compensation_accuracy");
  });
});

describe("§19 reconciliation — no numeric person score", () => {
  it("the contract vocabulary contains no score/rating/star language", () => {
    const vocab = JSON.stringify([EXPERIENCE_DIMENSIONS, DIMENSION_OUTCOMES]);
    expect(vocab).not.toMatch(/score|rating|star|percent/i);
  });

  it("the only aggregate is a transparent count; below minimum = absence", () => {
    expect(visibleRecordCount(0)).toBeNull();
    expect(visibleRecordCount(-1)).toBeNull();
    expect(visibleRecordCount(3)).toBe(3);
  });
});

describe("OWNER_DECISION_GATED — contract only, no consumers", () => {
  it("no app/ or components/ file imports the eligibility lib yet", () => {
    const roots = [
      join(__dirname, "..", "..", "app"),
      join(__dirname, "..", "..", "components"),
    ];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        if (statSync(abs).isDirectory()) {
          if (entry === "node_modules" || entry.startsWith(".")) continue;
          walk(abs);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          const src = readFileSync(abs, "utf8");
          if (src.includes("trust/experience-eligibility")) offenders.push(abs);
        }
      }
    };
    for (const root of roots) if (existsSync(root)) walk(root);
    expect(offenders).toEqual([]);
  });
});
