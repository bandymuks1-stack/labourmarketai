/**
 * RECOGNITION OF DEMONSTRATED CAPABILITY — the object model behind SKL-9
 * (J-WORKER-EVIDENCE step 7, J-INSTITUTION-OUTCOME step 6). ARCH-2.
 *
 * THE WRONG ANSWER THIS EXISTS TO END. Today "five years of real work" reads,
 * on every requirement surface, as "certificate missing". That is not a
 * missing feature; it is the wrong answer, because the requirement ledger
 * collapses five things the constitution keeps apart (SEP-6):
 *
 *   DEMONSTRATED CAPABILITY  ≠  FORMAL QUALIFICATION  ≠  RECOGNISED
 *   EQUIVALENCE  ≠  VALID CREDENTIAL  ≠  MISSING REQUIREMENT
 *
 * This module names the five, says which evidence can move a person between
 * them, and says WHO may say so. It is PURE — no IO, no clock (the caller
 * passes `today`) — and it writes nothing: the recognition RECORD is a
 * separate, owner-gated relation (`competency_recognitions_v1`, prepared and
 * unapplied). Everything here can be exercised today against the evidence
 * that already exists, and nothing here can produce a recognition without
 * an assessor.
 *
 * ── THE AUTHORITY RULE, IN ONE PLACE ───────────────────────────────────────
 *
 * A recognition is an ACT BY AN INDEPENDENT ASSESSOR. Concretely:
 *
 *   · the assessing organization must hold an assessor-capable role — today
 *     `training_provider` (the education role; §6 "training_provider IS the
 *     education role"), tomorrow possibly a sector or public authority role
 *     the owner adds — and the acting person must MANAGE that organization;
 *   · it may NOT be the subject (nobody recognises themselves);
 *   · it may NOT be a beneficiary: any organization that currently ENGAGES
 *     the subject as a worker (employment, agency, booking) has an interest
 *     in the answer and is excluded, however many roles it holds. An
 *     institution that also employs the person is, for that person, an
 *     employer.
 *
 * ESCO is the SEMANTIC layer only — it says what a skill is called in 26
 * languages, never whether someone has it, and it is not a scoring input
 * here. Nothing in this file ranks or scores (doctrine §7).
 */

/** The five states of SEP-6, as a closed set. Order is NOT rank. */
export const RECOGNITION_STANDINGS = [
  "missing_requirement",
  "demonstrated_capability",
  "formal_qualification",
  "recognised_equivalence",
  "valid_credential",
] as const;
export type RecognitionStanding = (typeof RECOGNITION_STANDINGS)[number];

/** What a formal requirement can be about. */
export type RequirementTarget =
  | { readonly kind: "document_type"; readonly slug: string }
  | { readonly kind: "skill"; readonly slug: string }
  | { readonly kind: "profession"; readonly slug: string; readonly country: string | null };

/** Evidence the person already holds, as the ledger already reads it. */
export interface DemonstrationEvidence {
  /** Confirmed journal entries carrying the required skill (SKL-3 tiers). */
  readonly confirmedEntries: number;
  /** Entries that are only self-reported. Counted, never promoted. */
  readonly selfReportedEntries: number;
  /** Approximate hours across confirmed entries, when recorded; null = unknown. */
  readonly confirmedHours: number | null;
}

/** A credential the person holds, as the documents domain already reads it. */
export interface HeldCredential {
  readonly documentTypeSlug: string;
  readonly validUntil: string | null;
}

/** A recognition record, as the gated relation would return it. */
export interface RecognitionRecord {
  readonly id: string;
  readonly decision: "recognised" | "not_recognised" | "revoked";
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly assessorOrganizationId: string;
}

export const ASSESSOR_ROLES = ["training_provider"] as const;

export interface AssessorCheck {
  readonly assessorOrganizationId: string;
  readonly assessorRoles: readonly string[];
  readonly actorManagesAssessor: boolean;
  readonly actorProfileId: string;
  readonly subjectProfileId: string;
  /** Organizations that currently engage the subject as a worker. */
  readonly subjectEngagedByOrganizationIds: readonly string[];
}

export type AssessorRefusal =
  | "not_an_assessor_role"
  | "actor_does_not_manage_assessor"
  | "self_recognition"
  | "beneficiary_organization";

/** The one authority rule. Returns the first refusal, or null when allowed. */
export function assessorRefusal(c: AssessorCheck): AssessorRefusal | null {
  if (!c.assessorRoles.some((r) => (ASSESSOR_ROLES as readonly string[]).includes(r))) {
    return "not_an_assessor_role";
  }
  if (!c.actorManagesAssessor) return "actor_does_not_manage_assessor";
  if (c.actorProfileId === c.subjectProfileId) return "self_recognition";
  if (c.subjectEngagedByOrganizationIds.includes(c.assessorOrganizationId)) return "beneficiary_organization";
  return null;
}

/** Evidence enough for an assessor to LOOK at. Not a recognition. */
export const DEMONSTRATION_FLOOR_ENTRIES = 3;

export interface StandingInput {
  readonly target: RequirementTarget;
  readonly evidence: DemonstrationEvidence;
  readonly credentials: readonly HeldCredential[];
  readonly recognitions: readonly RecognitionRecord[];
  /** ISO day. */
  readonly today: string;
}

export interface StandingResult {
  readonly standing: RecognitionStanding;
  /** Why — every standing names its basis so a surface can say it. */
  readonly basis:
    | { readonly kind: "credential"; readonly documentTypeSlug: string; readonly validUntil: string | null }
    | { readonly kind: "recognition"; readonly recognitionId: string; readonly validUntil: string | null }
    | { readonly kind: "demonstration"; readonly confirmedEntries: number; readonly confirmedHours: number | null }
    | { readonly kind: "nothing" };
  /** True when evidence exists that an assessor COULD examine. Never a
   *  recognition; the sentence a surface may say is "could be assessed". */
  readonly assessable: boolean;
  /** A credential or recognition that HAS lapsed, kept so the surface can
   *  say "expired" rather than "never". */
  readonly lapsed: readonly { readonly kind: "credential" | "recognition"; readonly until: string }[];
}

function isCurrent(validUntil: string | null, today: string): boolean {
  return validUntil === null || validUntil >= today;
}

/**
 * The one derivation. Precedence is the constitution's, not a score:
 *
 *   valid credential  — the person HOLDS the formal document and it is current;
 *   recognised equivalence — an independent assessor recognised the evidence
 *                            and the recognition is current and not revoked;
 *   demonstrated capability — confirmed real work carries the required skill
 *                             (self-reported entries do not reach here: SKL-3);
 *   missing requirement — none of the above.
 *
 * `formal_qualification` is reserved for a qualification that is formal but
 * not the required credential (e.g. a diploma where a licence is required).
 * Nothing in the current data can assert it, so this function never returns
 * it — a state that cannot be evidenced is not emitted (SEP-7).
 */
export function deriveRecognitionStanding(input: StandingInput): StandingResult {
  const lapsed: { kind: "credential" | "recognition"; until: string }[] = [];

  if (input.target.kind === "document_type") {
    const held = input.credentials.filter((c) => c.documentTypeSlug === input.target.slug);
    const current = held.find((c) => isCurrent(c.validUntil, input.today));
    if (current) {
      return {
        standing: "valid_credential",
        basis: { kind: "credential", documentTypeSlug: current.documentTypeSlug, validUntil: current.validUntil },
        assessable: false,
        lapsed,
      };
    }
    for (const c of held) if (c.validUntil) lapsed.push({ kind: "credential", until: c.validUntil });
  }

  const recognised = input.recognitions.filter(
    (r) => r.decision === "recognised" && isCurrent(r.validUntil, input.today),
  );
  if (recognised.length > 0) {
    const r = recognised[0];
    return {
      standing: "recognised_equivalence",
      basis: { kind: "recognition", recognitionId: r.id, validUntil: r.validUntil },
      assessable: false,
      lapsed,
    };
  }
  for (const r of input.recognitions) {
    if (r.decision === "recognised" && r.validUntil && !isCurrent(r.validUntil, input.today)) {
      lapsed.push({ kind: "recognition", until: r.validUntil });
    }
  }

  const assessable = input.evidence.confirmedEntries >= DEMONSTRATION_FLOOR_ENTRIES;
  if (input.evidence.confirmedEntries > 0) {
    return {
      standing: "demonstrated_capability",
      basis: {
        kind: "demonstration",
        confirmedEntries: input.evidence.confirmedEntries,
        confirmedHours: input.evidence.confirmedHours,
      },
      assessable,
      lapsed,
    };
  }

  return { standing: "missing_requirement", basis: { kind: "nothing" }, assessable: false, lapsed };
}
