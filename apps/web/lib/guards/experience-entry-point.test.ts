import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deriveReviewEligibility,
  isInteractionCompleted,
  ELIGIBLE_INTERACTION_KINDS,
  type InteractionFacts,
} from "@/lib/trust/experience-eligibility";
import {
  canonicalInteractionToken,
  parseInteractionToken,
  serializeInteractionToken,
} from "@/lib/trust/experience-interaction-token";

/**
 * W6 slice 3D — the experience ENTRY POINT.
 *
 * The domain has been code-complete since slice 3B while `ExperienceSubmitForm`
 * had no mount point at all. Closing that gap is where a trust domain is most
 * easily broken, because the shortest path to a working button is a generic
 * "leave a review" control that takes the subject from the client. These tests
 * pin the opposite: the interaction is a FACT the server reads, never an
 * argument the client supplies.
 *
 * The eligibility MATRIX is exercised against the pure contract (the same
 * predicate the server module and the SQL both use), and the wiring is pinned
 * on source — a source pin is weaker than a behavioural test, so it is used
 * only for the properties that are structural: what the client may send, which
 * module decides, and that no generic entry point exists.
 */

const APP = join(__dirname, "..", "..");
const ENTRY = readFileSync(join(APP, "lib", "trust", "experience-entry.ts"), "utf8");
const RESULT = readFileSync(
  join(APP, "components", "app", "workspace", "experiences-result.tsx"),
  "utf8",
);
const CHAT = readFileSync(
  join(APP, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);

const WORKER = "aaaaaaaa-0000-0000-0000-000000000001";
const OWNER = "aaaaaaaa-0000-0000-0000-000000000002";
const STRANGER = "aaaaaaaa-0000-0000-0000-0000000000ff";
const ORG = "bbbbbbbb-0000-0000-0000-000000000001";
const IID = "cccccccc-0000-0000-0000-000000000001";
const NOW = "2026-08-02T10:00:00.000Z";

const booking = (over: Partial<InteractionFacts> = {}): InteractionFacts => ({
  kind: "accepted_booking",
  interactionId: IID,
  partyA: OWNER,
  partyB: WORKER,
  status: "accepted",
  startDateIso: "2026-07-01",
  ...over,
});

const engagement = (over: Partial<InteractionFacts> = {}): InteractionFacts => ({
  kind: "completed_engagement",
  interactionId: IID,
  partyA: WORKER,
  partyB: ORG,
  status: "ended",
  endedAtIso: "2026-07-20T00:00:00.000Z",
  ...over,
});

const service = (over: Partial<InteractionFacts> = {}): InteractionFacts => ({
  kind: "concluded_service_request",
  interactionId: IID,
  partyA: OWNER,
  partyB: WORKER,
  status: "accepted",
  ...over,
});

const verdict = (
  interaction: InteractionFacts,
  author: string,
  subject: string,
  existing: Parameters<typeof deriveReviewEligibility>[0]["existingRecords"] = [],
) =>
  deriveReviewEligibility({
    authorProfileId: author,
    subjectProfileId: subject,
    interaction,
    existingRecords: existing,
    nowIso: NOW,
  });

describe("entry point — the CTA state matrix, per interaction kind", () => {
  it("an eligible accepted booking is offerable from BOTH sides", () => {
    expect(verdict(booking(), OWNER, WORKER).eligible).toBe(true);
    expect(verdict(booking(), WORKER, OWNER).eligible).toBe(true);
  });

  it("a booking before its start date is NOT offerable — the contract is not relaxed for the UI", () => {
    // The whole reason `not_yet` exists as a separate CTA state: the booking is
    // real and accepted, and there is still nothing to recount.
    const early = booking({ startDateIso: "2026-12-31" });
    expect(isInteractionCompleted(early, NOW)).toBe(false);
    const v = verdict(early, OWNER, WORKER);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toBe("interaction_not_completed");
  });

  it("a booking that is not accepted is NOT offerable", () => {
    const pending = booking({ status: "pending" });
    expect(isInteractionCompleted(pending, NOW)).toBe(false);
    expect(verdict(pending, OWNER, WORKER).eligible).toBe(false);
  });

  it("an ENDED engagement is offerable; an active one is not", () => {
    expect(verdict(engagement(), WORKER, ORG).eligible).toBe(true);
    const active = engagement({ status: "active", endedAtIso: null });
    expect(isInteractionCompleted(active, NOW)).toBe(false);
    const v = verdict(active, WORKER, ORG);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toBe("interaction_not_completed");
  });

  it("an accepted service request is offerable; any other status is not", () => {
    expect(verdict(service(), OWNER, WORKER).eligible).toBe(true);
    expect(verdict(service({ status: "pending" }), OWNER, WORKER).eligible).toBe(false);
    expect(verdict(service({ status: "declined" }), OWNER, WORKER).eligible).toBe(false);
  });

  it("someone who is not a party can never be offered the interaction", () => {
    for (const facts of [booking(), engagement(), service()]) {
      const v = verdict(facts, STRANGER, WORKER);
      expect(v.eligible, facts.kind).toBe(false);
      if (!v.eligible) expect(v.reason).toBe("not_a_party");
    }
  });

  it("a party cannot be offered an interaction whose OTHER side is a stranger", () => {
    // The forged-subject shape: a real interaction the caller IS part of, with
    // a subject who has nothing to do with it.
    const v = verdict(booking(), OWNER, STRANGER);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toBe("not_a_party");
  });

  it("self-review is impossible even on a real completed interaction", () => {
    const v = verdict(booking({ partyB: OWNER }), OWNER, OWNER);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toBe("self_review");
  });

  it("a second attempt for the same interaction is a duplicate, not a second vote", () => {
    const v = verdict(booking(), OWNER, WORKER, [
      {
        authorProfileId: OWNER,
        subjectProfileId: WORKER,
        interactionKind: "accepted_booking",
        interactionId: IID,
      },
    ]);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toBe("duplicate_for_interaction");
  });

  it("the OTHER party's record does not block this party's own", () => {
    // One record per (author, subject, interaction) — not one per interaction.
    const v = verdict(booking(), WORKER, OWNER, [
      {
        authorProfileId: OWNER,
        subjectProfileId: WORKER,
        interactionKind: "accepted_booking",
        interactionId: IID,
      },
    ]);
    expect(v.eligible).toBe(true);
  });

  it("no interaction kind outside the contract can ground anything", () => {
    const invented = booking({
      kind: "completed_project" as never,
    });
    const v = verdict(invented, OWNER, WORKER);
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toBe("unknown_interaction_kind");
  });
});

describe("entry point — the interaction token is a request, never a permission", () => {
  it("round-trips every contract kind", () => {
    for (const kind of ELIGIBLE_INTERACTION_KINDS) {
      const token = serializeInteractionToken(kind, IID);
      expect(parseInteractionToken(token)).toEqual({ kind, interactionId: IID });
    }
  });

  it("rejects an invented kind, a non-uuid, and every malformed shape", () => {
    for (const bad of [
      null,
      undefined,
      "",
      ":",
      "accepted_booking",
      `completed_project:${IID}`,
      "accepted_booking:not-a-uuid",
      `accepted_booking:${IID}extra`,
      `:${IID}`,
      `ACCEPTED_BOOKING:${IID}`,
      `accepted_booking:${IID}' or '1'='1`,
    ]) {
      expect(parseInteractionToken(bad as string | null), String(bad)).toBeNull();
    }
  });

  it("canonicalizes rather than passing a raw token through", () => {
    // What a loader is asked for is exactly what was validated.
    expect(canonicalInteractionToken(`accepted_booking:${IID}`)).toBe(
      `accepted_booking:${IID}`,
    );
    expect(canonicalInteractionToken("garbage")).toBeNull();
  });
});

describe("entry point — the SERVER decides, and it is the only thing that can", () => {
  it("the loader resolves the subject from the canonical row and never takes one", () => {
    // The client sends a kind and an id. If a subject could arrive as a
    // parameter, a forged pair would be expressible — this pins that it cannot.
    expect(ENTRY).toMatch(/export async function loadExperienceSubmitContext\(\s*kind: EligibleInteractionKind,\s*interactionId: string,\s*\)/);
    expect(ENTRY).not.toMatch(/subjectId:\s*string\s*[,)]/);
    // Resolution happens against rows read here.
    expect(ENTRY).toContain("booking_requests");
    expect(ENTRY).toContain("engagement_contexts");
    expect(ENTRY).toContain("service_offering_requests");
  });

  it("eligibility comes from the ONE pure contract, not a second local rule", () => {
    expect(ENTRY).toContain("deriveReviewEligibility");
    // No hand-rolled completion predicate that could drift from the SQL.
    expect(ENTRY).not.toMatch(/status\s*===\s*["']ended["']\s*\|\|/);
  });

  it("not-a-party and does-not-exist are the SAME answer (no existence oracle)", () => {
    expect(ENTRY).toMatch(/if \(!match\) return \{ state: "not_eligible", reason: "not_available" \}/);
  });

  it("fails closed: an absent domain is `unavailable`, never an empty invitation list", () => {
    expect(ENTRY).toMatch(/if \(own === "absent"\) return \{ state: "unavailable" \}/);
    expect(ENTRY).toContain("42883");
    expect(ENTRY).toContain("PGRST205");
  });
});

describe("entry point — no generic 'leave a review' control exists anywhere", () => {
  it("the submit form mounts ONLY inside the server-confirmed eligible branch", () => {
    // The form appears exactly once in the result, and the state that guards
    // it is the loader's `eligible`.
    const mounts = RESULT.match(/<ExperienceSubmitForm/g) ?? [];
    expect(mounts.length).toBe(1);
    expect(RESULT).toContain("loadExperienceSubmitContextAction");
    // Every non-eligible state returns BEFORE the form.
    const formAt = RESULT.indexOf("<ExperienceSubmitForm");
    for (const guard of [
      'ctx.state === "already_submitted"',
      'ctx.state === "not_eligible"',
      'ctx.state === "unavailable"',
      'ctx.state === "not_authenticated"',
    ]) {
      const at = RESULT.indexOf(guard);
      expect(at, guard).toBeGreaterThan(-1);
      expect(at, `${guard} must be checked before the form`).toBeLessThan(formAt);
    }
  });

  it("a duplicate renders the existing state — never a second form", () => {
    expect(RESULT).toContain("experience-submit-duplicate");
    const dup = RESULT.indexOf("experience-submit-duplicate");
    expect(dup).toBeLessThan(RESULT.indexOf("<ExperienceSubmitForm"));
  });

  it("the form is not mounted by any surface other than the result depth", () => {
    // The generic-button surfaces the owner directive names, checked as a set.
    const FORBIDDEN = [
      "app/[locale]/dashboard/profile/page.tsx",
      "app/[locale]/cv/page.tsx",
      "app/[locale]/dashboard/people/[workerId]/page.tsx",
      "app/[locale]/dashboard/opportunities/page.tsx",
    ];
    for (const rel of FORBIDDEN) {
      let src = "";
      try {
        src = readFileSync(join(APP, rel), "utf8");
      } catch {
        continue; // a surface that does not exist cannot host a button
      }
      expect(src, rel).not.toContain("ExperienceSubmitForm");
    }
  });

  it("the chat offers one chip PER INTERACTION, carrying its own token", () => {
    // `xp:<kind>:<uuid>` — there is no chip id that means "leave an experience"
    // in general, so no chip can open an unbound form.
    expect(CHAT).toMatch(/id: `xp:\$\{i\.kind\}:\$\{i\.interactionId\}`/);
    expect(CHAT).toContain("loadExperienceInvitationsAction");
    // The three honest no-chip states.
    expect(CHAT).toContain("experiencesAllSubmitted");
    expect(CHAT).toContain("experiencesNothingYet");
    expect(CHAT).toContain("experiencesUnavailable");
  });

  it("an unavailable read is never rendered as 'nothing to describe'", () => {
    const unavailableAt = CHAT.indexOf("labels.experiencesUnavailable");
    const nothingAt = CHAT.indexOf("labels.experiencesNothingYet");
    expect(unavailableAt).toBeGreaterThan(-1);
    expect(nothingAt).toBeGreaterThan(-1);
    expect(unavailableAt).not.toBe(nothingAt);
  });
});

describe("entry point — no rating mechanism leaked in with it", () => {
  /**
   * STRUCTURAL, NOT LEXICAL, and the first draft of this test got that wrong:
   * a word search for "rating" flagged the result's own honesty comment
   * ("never a rating"), i.e. the very line that enforces the doctrine. The
   * same trap is documented in `w6-experience-domain.spec.ts`. What must be
   * absent is a rating MECHANISM — a scored field, a star glyph, a numeric
   * verdict — not the word.
   */
  it("no star glyph and no scored/rating-named surface exists", () => {
    for (const [name, src] of [
      ["entry", ENTRY],
      ["result", RESULT],
    ] as const) {
      expect(src, `${name}: star glyph`).not.toMatch(/★|⭐|☆/);
      // No element identifies itself as a score/rating surface.
      const testIds = [...src.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
      expect(
        testIds.filter((id) => /score|rating|ovr|stars/i.test(id)),
        `${name}: scored surface`,
      ).toEqual([]);
      // The dormant legacy columns stay unread.
      expect(src, `${name}: dormant column`).not.toMatch(/trust_score|overall_score/);
    }
  });

  it("the submitted sentiment stays the binary the contract allows", () => {
    // A third option, or any numeric field, would be a scale — which averages.
    const FORM = readFileSync(
      join(APP, "components", "app", "experience-submit-form.tsx"),
      "utf8",
    );
    // The radio set is the literal contract pair, and nothing else renders a
    // sentiment value. Checked as VALUES, not words: the form's own comment
    // says "no neutral option", and a word search would flag that sentence —
    // the same lexical trap as the star check above.
    expect(FORM).toMatch(/\(\["positive", "negative"\] as const\)/);
    expect(FORM).not.toMatch(/type="number"|type="range"/);
    expect(FORM).not.toMatch(/value="neutral"|"neutral"\s*[,\]]/);
  });
});
