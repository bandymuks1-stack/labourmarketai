/**
 * THE evidence-state ladder for organization-supplied evidence.
 * (Owner P0 2026-09-07; ORGANIZATION-root correction and owner decision 3, the
 * same day.) Pure: no IO, no clock, no copy.
 *
 * ── THE AXIS THIS ADDS, AND THE ONE IT REFUSES TO TOUCH ────────────────────
 * Two canonical vocabularies already exist and neither is replaced:
 *
 *   `lib/evidence/evidence-tier.ts`      what a worker_skills ROW is worth
 *   `lib/journal/work-verification-state.ts`
 *                                        what happened to a WORK RECORD and
 *                                        who could verify it
 *
 * What neither expresses is the question organization-supplied evidence
 * raises: **who supplied this, in what capacity, and did anyone independent
 * stand behind it?** "Ramūnas says he did it", "his employer's 2023 timesheet
 * says he did it", and "the client confirmed it" are three different claims.
 * This module is that axis.
 *
 * ── THE LINE THAT MAY NEVER BE CROSSED (owner decision 3) ──────────────────
 *
 *     SELF_REPORTED / SELF_ATTESTED   ≠   INDEPENDENTLY_VERIFIED
 *
 * A person MAY report their own work. An authorized organization
 * representative MAY attest the organization's records — **including their own
 * work**, because a sole trader legitimately has nobody above them and blocking
 * them would erase real history. What the result must never do is acquire
 * independent-verification authority.
 *
 * So attestation and verification are two DIFFERENT events with two different
 * policies, and this derivation keeps the self-relationship visible forever:
 * an attestation whose actor is the subject derives `SELF_ATTESTED`, never
 * `ORGANIZATION_ATTESTED`, and `countsAsIndependentlyVerified` is false for it
 * by construction.
 *
 * ── FACT vs DERIVED ────────────────────────────────────────────────────────
 * A record's state is a FACT about provenance. Everything the importer
 * INFERRED lives in `derived` with its method and confidence and never becomes
 * a source fact. `factOrDerived()` is the one answer to "did the source
 * actually say this?".
 */

/** What the record's own row may carry — the REPORTED states. The DB CHECK on
 *  `organization_evidence_records.evidence_state` is exactly this list, so an
 *  import cannot write an attested state even by mistake. */
export const REPORTED_EVIDENCE_STATES = [
  /** The person themselves supplied it (an imported personal archive). */
  "SELF_REPORTED",
  /** The organization supplied it about someone who worked, studied or
   *  trained under it. */
  "ORGANIZATION_REPORTED",
  /** Migrated from an older system; the original supplier is not recorded. */
  "LEGACY_IMPORTED",
  /** Supplied, but the supplier's standing was not established. */
  "UNVERIFIED",
  /** Something about the row needs a human before it can be relied on. */
  "NEEDS_REVIEW",
] as const;

export type ReportedEvidenceState = (typeof REPORTED_EVIDENCE_STATES)[number];

/**
 * States reachable ONLY through an append-only `organization_evidence_events`
 * row. Note the deliberate pairing: every attested state has a self- variant,
 * because the actor being the subject is a permanent property of the evidence,
 * not an error to be suppressed.
 */
export const ATTESTED_EVIDENCE_STATES = [
  /** The organization stands behind it, and the attester is NOT the subject. */
  "ORGANIZATION_ATTESTED",
  /** The organization stands behind it and the attester IS the subject — a
   *  sole trader, or an owner attesting their own work. Legitimate, permanent,
   *  and never independent verification. */
  "SELF_ATTESTED",
  /** A client / end client stood behind it. */
  "CLIENT_ATTESTED",
  /** An education or training institution stood behind it. */
  "INSTITUTION_ATTESTED",
  /** A named assessor stood behind it. */
  "ASSESSOR_ATTESTED",
  /** A public body or sector body stood behind it. */
  "PUBLIC_BODY_ATTESTED",
  /** Any other party with standing. */
  "THIRD_PARTY_ATTESTED",
] as const;

export type AttestedEvidenceState = (typeof ATTESTED_EVIDENCE_STATES)[number];

/** The ONE state that means somebody independent checked it. Reachable only
 *  through an `independently_verified` event, whose policy requires a recorded
 *  party organization that is neither the supplier nor the subject. */
export const INDEPENDENTLY_VERIFIED = "INDEPENDENTLY_VERIFIED" as const;

export const LIFECYCLE_EVIDENCE_STATES = [
  /** Withdrawn by the supplying organization — the rollback path. The record
   *  and the reason both stay readable; nothing is deleted. */
  "WITHDRAWN",
  /** Someone with standing disputes it. Never silently dropped. */
  "DISPUTED",
  /** Superseded by a correcting record, which points back at this one. */
  "CORRECTED",
] as const;

export type LifecycleEvidenceState = (typeof LIFECYCLE_EVIDENCE_STATES)[number];

export type EvidenceState =
  | ReportedEvidenceState
  | AttestedEvidenceState
  | typeof INDEPENDENTLY_VERIFIED
  | LifecycleEvidenceState;

export const EVIDENCE_STATES: readonly EvidenceState[] = [
  ...REPORTED_EVIDENCE_STATES,
  ...ATTESTED_EVIDENCE_STATES,
  INDEPENDENTLY_VERIFIED,
  ...LIFECYCLE_EVIDENCE_STATES,
];

export function isReportedEvidenceState(
  v: unknown,
): v is ReportedEvidenceState {
  return (
    typeof v === "string" &&
    (REPORTED_EVIDENCE_STATES as readonly string[]).includes(v)
  );
}

export function isEvidenceState(v: unknown): v is EvidenceState {
  return (
    typeof v === "string" && (EVIDENCE_STATES as readonly string[]).includes(v)
  );
}

/**
 * THE ONE PREDICATE every count, ranking and trust signal must use.
 *
 * Owner decision 3: self-confirmations and self-attestations are EXCLUDED from
 * independently-verified counts, ranking and trust signals. Making that a
 * function rather than a convention is what stops the next surface from
 * re-deriving it and getting it wrong — which is exactly how
 * `review_journal_entry` came to treat a self-confirmation as a confirmation.
 */
export function countsAsIndependentlyVerified(state: EvidenceState): boolean {
  return state === INDEPENDENTLY_VERIFIED;
}

/** True when the state records the subject vouching for themselves. Real
 *  evidence, permanently marked as self-referential. */
export function isSelfVouched(state: EvidenceState): boolean {
  return state === "SELF_ATTESTED" || state === "SELF_REPORTED";
}

/** The roles an attestation or verification event may carry. Mirrors the DB
 *  CHECK on `organization_evidence_events.actor_role`. */
export const ATTESTATION_ACTOR_ROLES = [
  "employer",
  "agency",
  "client",
  "end_client",
  "project_owner",
  "subcontractor",
  "education_provider",
  "training_provider",
  "assessor",
  "verifier",
  "placement_provider",
  "public_body",
  "sector_body",
  "other",
] as const;

export type AttestationActorRole = (typeof ATTESTATION_ACTOR_ROLES)[number];

/** Which attested state a role produces when the actor is NOT the subject. */
const ROLE_STATE: Record<AttestationActorRole, AttestedEvidenceState> = {
  employer: "ORGANIZATION_ATTESTED",
  agency: "ORGANIZATION_ATTESTED",
  subcontractor: "ORGANIZATION_ATTESTED",
  project_owner: "ORGANIZATION_ATTESTED",
  client: "CLIENT_ATTESTED",
  end_client: "CLIENT_ATTESTED",
  education_provider: "INSTITUTION_ATTESTED",
  training_provider: "INSTITUTION_ATTESTED",
  placement_provider: "INSTITUTION_ATTESTED",
  assessor: "ASSESSOR_ATTESTED",
  verifier: "ASSESSOR_ATTESTED",
  public_body: "PUBLIC_BODY_ATTESTED",
  sector_body: "PUBLIC_BODY_ATTESTED",
  other: "THIRD_PARTY_ATTESTED",
};

/** One append-only lifecycle row, as read. */
export interface RecordLifecycleEvent {
  readonly eventType:
    | "attested"
    | "attestation_withdrawn"
    | "independently_verified"
    | "verification_withdrawn"
    | "withdrawn"
    | "reinstated"
    | "disputed"
    | "corrected";
  readonly actorRole?: AttestationActorRole | string | null;
  /** ISO timestamp; used for latest-wins ordering. */
  readonly createdAt?: string | null;
  /** Who acted. Carried so the derivation can tell a self-attestation from an
   *  independent one — never to decide authority, which the DB already did. */
  readonly actorProfileId?: string | null;
}

export interface EvidenceStanding {
  readonly state: EvidenceState;
  /** True while withdrawn — the honest rollback outcome. NOT deletion. */
  readonly withdrawn: boolean;
  readonly attestation: {
    readonly role: string | null;
    readonly at: string | null;
    readonly byProfileId: string | null;
    /** The attester IS the subject. Permanent, visible, and never a defect. */
    readonly self: boolean;
  } | null;
  readonly verification: {
    readonly at: string | null;
    readonly byProfileId: string | null;
  } | null;
  /** The ONE flag counts, ranking and trust signals may read. */
  readonly independentlyVerified: boolean;
}

function ts(v: string | null | undefined): number {
  return v ? Date.parse(v) || 0 : 0;
}

function newestOf(
  events: readonly RecordLifecycleEvent[],
  type: RecordLifecycleEvent["eventType"],
): RecordLifecycleEvent | null {
  let best: RecordLifecycleEvent | null = null;
  for (const e of events) {
    if (e.eventType !== type) continue;
    if (best === null || ts(e.createdAt) >= ts(best.createdAt)) best = e;
  }
  return best;
}

function latestAt(
  events: readonly RecordLifecycleEvent[],
  type: RecordLifecycleEvent["eventType"],
): number {
  return events.reduce(
    (acc, e) => (e.eventType === type ? Math.max(acc, ts(e.createdAt)) : acc),
    0,
  );
}

/**
 * THE derivation: a record's base (reported) state, its append-only lifecycle
 * rows, and who the record is ABOUT → the state a surface may show.
 *
 * Precedence, strongest signal first:
 *   1. WITHDRAWN — a withdrawal not since reinstated hides the standing (never
 *      the record);
 *   2. DISPUTED — someone with standing contests it;
 *   3. CORRECTED — a correcting record superseded it;
 *   4. INDEPENDENTLY_VERIFIED — a standing verification event;
 *   5. the standing attestation, self- or not;
 *   6. otherwise the reported state, unchanged.
 *
 * Latest-wins WITHIN each event family, exactly as `deriveReviewResult` does
 * for journal confirmations.
 */
export function deriveEvidenceStanding(
  base: ReportedEvidenceState,
  events: readonly RecordLifecycleEvent[] = [],
  subjectProfileId?: string | null,
): EvidenceStanding {
  const withdrawnAt = latestAt(events, "withdrawn");
  const reinstatedAt = latestAt(events, "reinstated");
  const disputedAt = latestAt(events, "disputed");
  const correctedAt = latestAt(events, "corrected");
  const attestationWithdrawnAt = latestAt(events, "attestation_withdrawn");
  const verificationWithdrawnAt = latestAt(events, "verification_withdrawn");

  const attested = newestOf(events, "attested");
  const verified = newestOf(events, "independently_verified");

  const isWithdrawn = withdrawnAt > 0 && withdrawnAt > reinstatedAt;
  const attestationStands =
    attested !== null && ts(attested.createdAt) >= attestationWithdrawnAt;
  const verificationStands =
    verified !== null && ts(verified.createdAt) >= verificationWithdrawnAt;

  const attesterIsSubject =
    attestationStands &&
    Boolean(subjectProfileId) &&
    attested?.actorProfileId === subjectProfileId;

  const attestation = attestationStands
    ? {
        role: (attested?.actorRole as string | null) ?? null,
        at: attested?.createdAt ?? null,
        byProfileId: attested?.actorProfileId ?? null,
        self: attesterIsSubject,
      }
    : null;

  const verification = verificationStands
    ? {
        at: verified?.createdAt ?? null,
        byProfileId: verified?.actorProfileId ?? null,
      }
    : null;

  let state: EvidenceState;
  if (isWithdrawn) state = "WITHDRAWN";
  else if (disputedAt > 0) state = "DISPUTED";
  else if (correctedAt > 0) state = "CORRECTED";
  else if (verificationStands) state = INDEPENDENTLY_VERIFIED;
  else if (attestation) {
    state = attestation.self
      ? "SELF_ATTESTED"
      : (ROLE_STATE[attestation.role as AttestationActorRole] ??
        "THIRD_PARTY_ATTESTED");
  } else state = base;

  return {
    state,
    withdrawn: isWithdrawn,
    attestation,
    verification,
    independentlyVerified: countsAsIndependentlyVerified(state),
  };
}

/**
 * THE self-verification rule, stated once, for every surface that needs it.
 *
 * Owner decision 3, precisely: a person may report AND attest their own work;
 * what they may never do is independently verify it. So this predicate governs
 * VERIFICATION only — `canAttest` deliberately does not exist, because
 * attestation by the subject is legitimate and is recorded as SELF_ATTESTED.
 */
export function canIndependentlyVerify(opts: {
  /** Who is about to verify. */
  readonly actorProfileId: string | null;
  /** The profile the record's subject is linked to, or null when unclaimed. */
  readonly subjectProfileId: string | null;
  /** Does the actor manage the organization that SUPPLIED the evidence? */
  readonly actorManagesSupplier: boolean;
  /** Is the actor's organization a recorded party in a verifying role? */
  readonly actorIsRecordedVerifyingParty: boolean;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "no_actor"
        | "actor_is_subject"
        | "actor_is_supplier"
        | "not_a_recorded_party";
    } {
  if (!opts.actorProfileId) return { ok: false, reason: "no_actor" };
  if (opts.subjectProfileId && opts.subjectProfileId === opts.actorProfileId) {
    return { ok: false, reason: "actor_is_subject" };
  }
  if (opts.actorManagesSupplier)
    return { ok: false, reason: "actor_is_supplier" };
  if (!opts.actorIsRecordedVerifyingParty) {
    return { ok: false, reason: "not_a_recorded_party" };
  }
  return { ok: true };
}

/** The i18n key (namespace `workHistory.evidenceState`) for a state. One key
 *  per state; surfaces never spell the word themselves. */
export function evidenceStateMessageKey(state: EvidenceState): string {
  return state;
}

// ── FACT vs DERIVED ─────────────────────────────────────────────────────────

/** One inferred field, with why it was inferred and how sure we are. */
export interface DerivedField {
  readonly value: string | number | null;
  /** A stable slug the UI localises, e.g. "object_from_text". */
  readonly method: string;
  readonly confidence: number;
  readonly note?: string | null;
}

export type DerivedMap = Readonly<Record<string, DerivedField>>;

export type FieldOrigin =
  | { readonly kind: "fact" }
  | { readonly kind: "derived"; readonly derived: DerivedField }
  | { readonly kind: "absent" };

/**
 * Did the SOURCE state this field, or did we work it out? The one answer, so
 * no surface has to guess and no inference can be rendered as a source fact.
 */
export function factOrDerived(
  field: string,
  factFields: readonly string[],
  derived: DerivedMap,
): FieldOrigin {
  if (factFields.includes(field)) return { kind: "fact" };
  const d = derived[field];
  if (d) return { kind: "derived", derived: d };
  return { kind: "absent" };
}
