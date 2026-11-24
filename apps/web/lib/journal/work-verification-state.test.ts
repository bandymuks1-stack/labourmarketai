import { describe, expect, it } from "vitest";

import {
  WORK_VERIFICATION_STATES,
  deriveWorkVerificationState,
  isVerificationDeadEnd,
  resolveVerifierOptions,
  type VerifierContextFacts,
} from "@/lib/journal/work-verification-state";

/** The context the 15 orphaned production records actually sit in. */
const PERSONAL: VerifierContextFacts = {
  organizationId: null,
  journalReviewEnabled: false,
  relationshipSlug: "employee",
  status: "active",
};

/** An employer that can confirm work. */
const EMPLOYER_READY: VerifierContextFacts = {
  organizationId: "org-a",
  journalReviewEnabled: true,
  relationshipSlug: "employee",
  status: "active",
};

/** An employer that exists but has nobody set up to confirm. */
const EMPLOYER_NOT_SET_UP: VerifierContextFacts = {
  ...EMPLOYER_READY,
  journalReviewEnabled: false,
};

/** The person's own company. */
const OWN_COMPANY: VerifierContextFacts = {
  organizationId: "org-own",
  journalReviewEnabled: false,
  relationshipSlug: "owner",
  status: "active",
};

describe("the four situations a blank absence used to hide", () => {
  it("a verifier has it right now → verification_pending, nothing to do", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: EMPLOYER_READY,
    });
    expect(v.state).toBe("verification_pending");
    expect(v.verifier).toEqual({ kind: "organization", organizationId: "org-a" });
    expect(v.nextAction).toBe("await_verifier");
  });

  it("the employer is known but cannot confirm yet → verifier_available, with the action that unblocks it", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: EMPLOYER_NOT_SET_UP,
    });
    expect(v.state).toBe("verifier_available");
    expect(v.verifier).toEqual({ kind: "organization", organizationId: "org-a" });
    // Not "identify_verifier": we know exactly who. The gap is the switch.
    expect(v.nextAction).toBe("ask_employer_to_enable_confirmation");
  });

  it("personal history with no employer → self_reported, and that is NOT a failure", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: PERSONAL,
    });
    expect(v.state).toBe("self_reported");
    expect(v.verifier).toEqual({ kind: "none" });
    expect(v.nextAction).toBe("identify_verifier");
  });

  it("the person owns the company → not_applicable, and is never nagged", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: OWN_COMPANY,
    });
    expect(v.state).toBe("not_applicable");
    expect(v.verifier).toEqual({ kind: "self", organizationId: "org-own" });
    // Nobody stands above them: this is not a gap, so it asks for nothing.
    expect(v.nextAction).toBe("none");
  });

  it("the four are genuinely distinct — the defect was collapsing them into one", () => {
    const states = [EMPLOYER_READY, EMPLOYER_NOT_SET_UP, PERSONAL, OWN_COMPANY].map(
      (context) => deriveWorkVerificationState({ reviewResult: "submitted", context }).state,
    );
    expect(new Set(states).size).toBe(4);
  });
});

describe("a recorded decision is a fact and always wins", () => {
  it.each([
    ["approved", "verified", "none"],
    ["rejected", "disputed", "respond_to_decision"],
    ["changes_requested", "returned", "respond_to_decision"],
  ] as const)("%s → %s", (reviewResult, state, nextAction) => {
    const v = deriveWorkVerificationState({ reviewResult, context: EMPLOYER_READY });
    expect(v.state).toBe(state);
    expect(v.nextAction).toBe(nextAction);
  });

  it("a confirmation does not evaporate when the relationship later ends", () => {
    const ended: VerifierContextFacts = { ...EMPLOYER_READY, status: "ended" };
    const v = deriveWorkVerificationState({ reviewResult: "approved", context: ended });
    expect(v.state).toBe("verified");
  });
});

describe("nothing is ever marked verified without a real confirmation", () => {
  /**
   * The single most important guarantee in this module (doctrine §7). If any
   * context could produce `verified`, an import could manufacture a verified
   * work history — which is exactly the fabrication the platform forbids.
   */
  it("no context, with no decision, can produce verified", () => {
    const everyContext: (VerifierContextFacts | null)[] = [
      null,
      PERSONAL,
      EMPLOYER_READY,
      EMPLOYER_NOT_SET_UP,
      OWN_COMPANY,
      { ...EMPLOYER_READY, status: "ended" },
      { ...OWN_COMPANY, journalReviewEnabled: true },
    ];
    for (const context of everyContext) {
      for (const reviewResult of ["submitted", null] as const) {
        expect(
          deriveWorkVerificationState({ reviewResult, context }).state,
          `context ${JSON.stringify(context)} / result ${reviewResult}`,
        ).not.toBe("verified");
      }
    }
  });

  it("importedRecordCannotBeVerified — an import carries facts, never a verdict", () => {
    // An imported timesheet resolving to a real employer is the BEST case an
    // import can reach, and it is still only `verifier_available`.
    const imported = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: EMPLOYER_NOT_SET_UP,
    });
    expect(imported.state).toBe("verifier_available");
    expect(imported.state).not.toBe("verified");

    // An import with no resolvable employer stays the person's own claim —
    // preserved, not discarded.
    const orphanImport = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: PERSONAL,
    });
    expect(orphanImport.state).toBe("self_reported");
  });
});

describe("unknown is not the same as unconfirmed (§54)", () => {
  it("unreadable evidence is flagged, never rendered as 'nobody confirmed it'", () => {
    const v = deriveWorkVerificationState({ reviewResult: null, context: EMPLOYER_READY });
    expect(v.evidenceUnavailable).toBe(true);
  });

  it("a real 'no decision yet' is not flagged as unknown", () => {
    const v = deriveWorkVerificationState({ reviewResult: "submitted", context: EMPLOYER_READY });
    expect(v.evidenceUnavailable).toBe(false);
  });
});

describe("a verifier is never invented", () => {
  it("an unresolvable context returns none, not a plausible organization", () => {
    expect(
      deriveWorkVerificationState({ reviewResult: "submitted", context: null }).verifier,
    ).toEqual({ kind: "none" });
    expect(resolveVerifierOptions([])).toEqual({ kind: "none" });
    expect(resolveVerifierOptions([PERSONAL])).toEqual({ kind: "none" });
  });

  it("no state name hedges — there is no 'probably' or 'maybe' state", () => {
    for (const s of WORK_VERIFICATION_STATES) {
      expect(s).not.toMatch(/probabl|maybe|likely|assumed|guess/i);
    }
  });
});

describe("\"Kam pateikti atliktą darbą?\" — the owner's rule, literally", () => {
  it("exactly one valid verifier → show that verifier", () => {
    expect(resolveVerifierOptions([PERSONAL, EMPLOYER_READY])).toEqual({
      kind: "organization",
      organizationId: "org-a",
    });
  });

  it("several valid verifiers → present the choices, preselect nothing", () => {
    const r = resolveVerifierOptions([
      EMPLOYER_READY,
      { ...EMPLOYER_NOT_SET_UP, organizationId: "org-b" },
    ]);
    expect(r.kind).toBe("choice");
    expect(r.kind === "choice" && [...r.organizationIds].sort()).toEqual(["org-a", "org-b"]);
  });

  it("two contexts at the SAME organization are one verifier, not a false choice", () => {
    const r = resolveVerifierOptions([
      EMPLOYER_READY,
      { ...EMPLOYER_NOT_SET_UP, relationshipSlug: "contractor" },
    ]);
    expect(r).toEqual({ kind: "organization", organizationId: "org-a" });
  });

  it("no verifier resolvable → none, and the work stays self-reported evidence", () => {
    expect(resolveVerifierOptions([PERSONAL])).toEqual({ kind: "none" });
    const v = deriveWorkVerificationState({ reviewResult: "submitted", context: PERSONAL });
    expect(v.state).toBe("self_reported");
    expect(isVerificationDeadEnd(v)).toBe(true);
  });

  it("your own company cannot verify you", () => {
    expect(resolveVerifierOptions([OWN_COMPANY])).toEqual({
      kind: "self",
      organizationId: "org-own",
    });
  });

  it("an ended relationship is not offered as a verifier", () => {
    expect(
      resolveVerifierOptions([{ ...EMPLOYER_READY, status: "ended" }]),
    ).toEqual({ kind: "none" });
  });
});

describe("the dead end the owner called P0 is detectable, so it can be surfaced", () => {
  it("flags exactly the orphaned population and nothing else", () => {
    const orphan = deriveWorkVerificationState({ reviewResult: "submitted", context: PERSONAL });
    expect(isVerificationDeadEnd(orphan)).toBe(true);

    for (const context of [EMPLOYER_READY, EMPLOYER_NOT_SET_UP, OWN_COMPANY]) {
      expect(
        isVerificationDeadEnd(
          deriveWorkVerificationState({ reviewResult: "submitted", context }),
        ),
      ).toBe(false);
    }
  });

  it("a dead end is never also 'verified' — the work is preserved, not promoted", () => {
    const orphan = deriveWorkVerificationState({ reviewResult: "submitted", context: PERSONAL });
    expect(orphan.state).not.toBe("verified");
    expect(orphan.nextAction).toBe("identify_verifier");
  });
});

describe("the real production shape, pinned as a fixture", () => {
  /**
   * These are the ACTUAL active engagement contexts of the person who owns the
   * largest share of the 15 orphaned records, read off production 2026-09-06
   * under their own RLS. Organization ids are real; nothing is invented.
   *
   * The point of pinning them: this person looked, to the product, like someone
   * with no way to get work confirmed. They are not. They hold an employment
   * relationship at an organization with confirmation already enabled — the
   * work was simply being written into their personal context instead.
   */
  const REAL_CONTEXTS: VerifierContextFacts[] = [
    // personal, org-less — where the orphaned entries actually landed
    { organizationId: null, journalReviewEnabled: false, relationshipSlug: "employee", status: "active" },
    // their own companies — cannot verify them
    { organizationId: "19f47e78-7bd1-4120-9937-603dba769f8a", journalReviewEnabled: false, relationshipSlug: "owner", status: "active" },
    { organizationId: "2e3a4744-3eb1-482c-bbae-1bf0646d1802", journalReviewEnabled: false, relationshipSlug: "owner", status: "active" },
    // the employer that CAN confirm work
    { organizationId: "a3d59458-373e-4939-8897-9f22ae2d35cb", journalReviewEnabled: true, relationshipSlug: "employee", status: "active" },
  ];

  it("resolves to the ONE employer that can actually confirm — not to their own companies", () => {
    expect(resolveVerifierOptions(REAL_CONTEXTS)).toEqual({
      kind: "organization",
      organizationId: "a3d59458-373e-4939-8897-9f22ae2d35cb",
    });
  });

  it("the orphaned entry is a dead end, while the same person HAS a reachable verifier", () => {
    // What the product shows today for those entries…
    const orphan = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: REAL_CONTEXTS[0],
    });
    expect(isVerificationDeadEnd(orphan)).toBe(true);

    // …while a verifier for this very person exists. That gap between the two
    // is the whole defect, and it is now expressible instead of invisible.
    expect(resolveVerifierOptions(REAL_CONTEXTS).kind).toBe("organization");
  });

  it("owning three organizations does not make any of them a verifier of your own work", () => {
    const ownOnly = REAL_CONTEXTS.filter((c) => c.relationshipSlug === "owner");
    expect(resolveVerifierOptions(ownOnly).kind).toBe("self");
  });
});
