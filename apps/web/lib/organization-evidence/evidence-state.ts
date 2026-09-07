/**
 * THE evidence-state ladder for company-supplied historical work (owner P0,
 * 2026-09-07). Pure: no IO, no clock, no copy.
 *
 * ── WHY A SECOND VOCABULARY IS NOT A SECOND TRUTH ──────────────────────────
 * Two canonical vocabularies already exist and neither is replaced here:
 *
 *   `lib/evidence/evidence-tier.ts`   what a worker_skills ROW is worth
 *   `lib/journal/work-verification-state.ts`
 *                                     what happened to a WORK RECORD and who
 *                                     could verify it
 *
 * `work-verification-state.ts` was written (2026-09-06) with this import in
 * mind and says so in its own header: *"Tomorrow's imports enter through these
 * same states… An imported record with a resolvable employer is
 * `verifier_available`; one without is `self_reported`. Neither is ever
 * `verified`."* That still holds and this module does not contradict it.
 *
 * What that vocabulary cannot express is the question a company import raises
 * and a self-logged journal entry never does: **who supplied this, and in what
 * capacity?** "Ramūnas says he did it" and "the company's 2023 timesheet says
 * he did it" are both unverified, and they are not the same claim. This module
 * is that axis — the SUPPLIER/ATTESTATION axis — and it is deliberately
 * incapable of expressing verification:
 *
 *   there is no VERIFIED value in this type, at all.
 *
 * Independent verification stays exactly where it has always been: a real
 * `journal_entry_confirmations` row, derived by `deriveReviewResult`. No
 * import, no attestation and no inference in this file can reach it.
 *
 * ── FACT vs DERIVED ────────────────────────────────────────────────────────
 * A record's evidence state is a FACT about its provenance. Everything the
 * importer INFERRED (which object a line refers to, which person a nickname
 * is) lives in `derived` with its method and confidence and never becomes a
 * source fact. `factOrDerived()` below is the one place that answers "did the
 * source actually say this?" for a rendered field.
 */

/** What the record's own row can carry — the REPORTED states. The DB CHECK on
 *  `work_history_records.evidence_state` is exactly this list, so an import
 *  cannot write an attested state even by mistake. */
export const REPORTED_EVIDENCE_STATES = [
  /** The person themselves supplied it (an imported personal archive). */
  "SELF_REPORTED",
  /** The organization supplied it about someone who worked for it. */
  "COMPANY_REPORTED",
  /** Migrated from an older system; the original supplier is not recorded. */
  "LEGACY_IMPORTED",
  /** Supplied, but the supplier's standing was not established. */
  "UNVERIFIED",
  /** Something about the row needs a human before it can be relied on. */
  "NEEDS_REVIEW",
] as const;

export type ReportedEvidenceState = (typeof REPORTED_EVIDENCE_STATES)[number];

/** The attested states — reachable ONLY through an append-only
 *  `work_history_record_events` row whose actor is NOT the subject. */
export const ATTESTED_EVIDENCE_STATES = [
  "COMPANY_ATTESTED",
  "CLIENT_ATTESTED",
  "THIRD_PARTY_ATTESTED",
] as const;

export type AttestedEvidenceState = (typeof ATTESTED_EVIDENCE_STATES)[number];

/** Lifecycle outcomes that are neither a report nor an attestation. */
export const LIFECYCLE_EVIDENCE_STATES = [
  /** Withdrawn by the importing organization — the rollback path. The record
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
  | LifecycleEvidenceState;

export const EVIDENCE_STATES: readonly EvidenceState[] = [
  ...REPORTED_EVIDENCE_STATES,
  ...ATTESTED_EVIDENCE_STATES,
  ...LIFECYCLE_EVIDENCE_STATES,
];

export function isReportedEvidenceState(v: unknown): v is ReportedEvidenceState {
  return typeof v === "string" && (REPORTED_EVIDENCE_STATES as readonly string[]).includes(v);
}

export function isEvidenceState(v: unknown): v is EvidenceState {
  return typeof v === "string" && (EVIDENCE_STATES as readonly string[]).includes(v);
}

/** The attestation kinds a record event may carry, and the state each yields. */
export const ATTESTATION_KINDS = ["company", "client", "third_party"] as const;
export type AttestationKind = (typeof ATTESTATION_KINDS)[number];

const ATTESTATION_STATE: Record<AttestationKind, AttestedEvidenceState> = {
  company: "COMPANY_ATTESTED",
  client: "CLIENT_ATTESTED",
  third_party: "THIRD_PARTY_ATTESTED",
};

/** One append-only lifecycle row, as read. */
export interface RecordLifecycleEvent {
  readonly eventType:
    | "attested"
    | "attestation_withdrawn"
    | "withdrawn"
    | "reinstated"
    | "disputed"
    | "corrected";
  readonly attestationKind?: AttestationKind | null;
  /** ISO timestamp; used for latest-wins ordering. */
  readonly createdAt?: string | null;
  /** Who acted. Carried so a reader can see WHO attested, never to decide
   *  authority — the database already refused a self-attestation. */
  readonly actorProfileId?: string | null;
}

export interface EvidenceStanding {
  /** The state to show. */
  readonly state: EvidenceState;
  /** True while the record is withdrawn — the honest rollback outcome. It is
   *  NOT deletion and the record stays readable with its reason. */
  readonly withdrawn: boolean;
  /** The attestation currently standing, if any. */
  readonly attestation: {
    readonly kind: AttestationKind;
    readonly at: string | null;
    readonly byProfileId: string | null;
  } | null;
  /**
   * ALWAYS false. Present so no caller has to remember why the field is
   * missing: a company import can never be independent verification, and a
   * reader that wants the real thing must consult
   * `journal_entry_confirmations` through `deriveReviewResult`.
   */
  readonly independentlyVerified: false;
}

function ts(v: string | null | undefined): number {
  return v ? Date.parse(v) || 0 : 0;
}

/**
 * THE derivation: a record's base (reported) state plus its append-only
 * lifecycle rows → the state a surface may show.
 *
 * Precedence, strongest signal first:
 *   1. WITHDRAWN — a withdrawal that has not been reinstated hides the
 *      record's standing entirely (but never the record);
 *   2. DISPUTED — someone with standing contests it;
 *   3. CORRECTED — a correcting record superseded it;
 *   4. the standing attestation, if one was made and not withdrawn;
 *   5. otherwise the reported state, unchanged.
 *
 * Latest-wins WITHIN each event family, exactly as `deriveReviewResult` does
 * for journal confirmations — so a withdraw → reinstate → withdraw sequence
 * reads as withdrawn, and attest → withdraw-attestation reads as merely
 * reported again.
 */
export function deriveEvidenceStanding(
  base: ReportedEvidenceState,
  events: readonly RecordLifecycleEvent[] = [],
): EvidenceStanding {
  let withdrawnAt = 0;
  let reinstatedAt = 0;
  let disputedAt = 0;
  let correctedAt = 0;
  let attested: RecordLifecycleEvent | null = null;
  let attestationWithdrawnAt = 0;

  for (const e of events) {
    const at = ts(e.createdAt);
    switch (e.eventType) {
      case "withdrawn":
        withdrawnAt = Math.max(withdrawnAt, at);
        break;
      case "reinstated":
        reinstatedAt = Math.max(reinstatedAt, at);
        break;
      case "disputed":
        disputedAt = Math.max(disputedAt, at);
        break;
      case "corrected":
        correctedAt = Math.max(correctedAt, at);
        break;
      case "attested":
        if (attested === null || at >= ts(attested.createdAt)) attested = e;
        break;
      case "attestation_withdrawn":
        attestationWithdrawnAt = Math.max(attestationWithdrawnAt, at);
        break;
    }
  }

  const isWithdrawn = withdrawnAt > 0 && withdrawnAt > reinstatedAt;
  const attestationStands =
    attested !== null &&
    attested.attestationKind != null &&
    ts(attested.createdAt) >= attestationWithdrawnAt &&
    !(attestationWithdrawnAt > 0 && ts(attested.createdAt) === 0);

  const attestation =
    attestationStands && attested?.attestationKind
      ? {
          kind: attested.attestationKind,
          at: attested.createdAt ?? null,
          byProfileId: attested.actorProfileId ?? null,
        }
      : null;

  let state: EvidenceState;
  if (isWithdrawn) state = "WITHDRAWN";
  else if (disputedAt > 0) state = "DISPUTED";
  else if (correctedAt > 0) state = "CORRECTED";
  else if (attestation) state = ATTESTATION_STATE[attestation.kind];
  else state = base;

  return { state, withdrawn: isWithdrawn, attestation, independentlyVerified: false };
}

/**
 * THE self-confirmation rule, stated once, for every surface that needs it.
 *
 * A person may submit, log or import their own work — that is legitimate, and
 * blocking it would erase real history. What they may never do is turn their
 * own action into independent confirmation of themselves. The database refuses
 * the write (the `work_history_record_events` insert policy); this is the same
 * rule as a pure predicate, so a UI can grey the button out and a capability
 * can refuse before it even tries.
 */
export function canAttest(opts: {
  /** Who is about to attest. */
  readonly actorProfileId: string | null;
  /** The profile the record's subject is linked to, or null when unclaimed. */
  readonly subjectProfileId: string | null;
}): { readonly ok: true } | { readonly ok: false; readonly reason: "self_attestation" | "no_actor" } {
  if (!opts.actorProfileId) return { ok: false, reason: "no_actor" };
  if (opts.subjectProfileId && opts.subjectProfileId === opts.actorProfileId) {
    return { ok: false, reason: "self_attestation" };
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
