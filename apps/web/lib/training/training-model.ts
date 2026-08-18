/**
 * Pure Training & Certification model (v1) — shared by the server read
 * service, the server actions, the guard test and the UI section. No
 * server-only imports, no IO.
 *
 * Codes against the contract the SEPARATE, human-gated migration
 * 20260817230000_training_certification_v1 proposes. Until the lead applies
 * it the read/action layers degrade honestly (the established tasks/finance
 * pattern) — nothing here fakes a programme, an assignment or a certificate.
 *
 * DOCTRINE, pinned by lib/guards/training-certification.test.ts:
 *   * a certificate is EVIDENCE THAT A COURSE WAS COMPLETED — never a claim
 *     of demonstrated competence;
 *   * the material acknowledgement is the DOCUMENT ENGINE's
 *     (document_acknowledgements) — this module never mirrors it;
 *   * a training skill link is this module's OWN honest row: no level, no
 *     score, no verified flag, and no write to worker_skills.
 * No AI anywhere.
 */

export const TRAINING_ASSIGNMENT_STATUSES = [
  "assigned",
  "completed",
  "expired",
] as const;
export type TrainingAssignmentStatus =
  (typeof TRAINING_ASSIGNMENT_STATUSES)[number];

export const TRAINING_EVENT_TYPES = [
  "assigned",
  "completed",
  "certificate_attached",
  "marked_expired",
  "reopened",
  "skill_linked",
] as const;
export type TrainingEventType = (typeof TRAINING_EVENT_TYPES)[number];

/** The one provenance a training_skill_links row can carry. */
export const TRAINING_SKILL_PROVENANCE = "training_completion" as const;

/** Bounded lengths — mirrored by the gated RPC validation (one contract). */
export const TRAINING_TITLE_MIN = 3;
export const TRAINING_TITLE_MAX = 160;
export const TRAINING_DESCRIPTION_MAX = 2000;
export const TRAINING_COMPLETION_NOTE_MAX = 1000;

/** Bounded reads everywhere — the training surfaces never stream unbounded rows. */
export const TRAINING_READ_LIMIT = 200;

/** The same 30-day window the worker-document readiness layer already uses.
 *  Expiry is a RENDER-TIME derivation, never a stored state and never a job. */
export const TRAINING_EXPIRING_SOON_DAYS = 30;

export const TRAINING_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isTrainingMigrationMissingCode(code: string | undefined): boolean {
  return (TRAINING_MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export function isValidTrainingAssignmentStatus(
  v: string,
): v is TrainingAssignmentStatus {
  return (TRAINING_ASSIGNMENT_STATUSES as readonly string[]).includes(v);
}

export type TrainingProgramRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly description: string | null;
  readonly materialDocumentId: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
};

export type TrainingAssignmentRow = {
  readonly id: string;
  readonly programId: string;
  readonly programTitle: string;
  readonly organizationId: string;
  readonly assigneeProfileId: string;
  readonly requiredBy: string | null;
  readonly status: TrainingAssignmentStatus;
  readonly completedAt: string | null;
  readonly completionNote: string | null;
  readonly certificateDocumentFileId: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly createdAt: string;
};

/** A row of the certification register: a training assignment that actually
 *  carries certificate evidence. Nothing is inferred — a row without a
 *  certificate file is simply not a certification. */
export type CertificationRow = {
  readonly source: "training" | "worker_document";
  readonly id: string;
  readonly label: string;
  readonly holderProfileId: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
};

/**
 * Render-time expiry derivation, reusing the existing 30-day window.
 * Returns "none" when there is no expiry date at all — an undated record is
 * never described as valid or as expiring.
 */
export function deriveExpiryState(
  expiresOn: string | null,
  today: Date,
): "none" | "valid" | "expiring" | "lapsed" {
  if (!expiresOn) return "none";
  const end = Date.parse(`${expiresOn}T00:00:00Z`);
  if (Number.isNaN(end)) return "none";
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Math.floor((end - start) / 86_400_000);
  if (days < 0) return "lapsed";
  if (days <= TRAINING_EXPIRING_SOON_DAYS) return "expiring";
  return "valid";
}

/** The honest `?trn=` outcomes the actions can navigate back with. */
export const TRAINING_NOTICES = [
  "created",
  "updated",
  "assigned",
  "already_assigned",
  "completed",
  "already_completed",
  "attached",
  "expired",
  "already_expired",
  "linked",
  "already_linked",
  "inactive_program",
  "invalid",
  "invalid_material",
  "invalid_assignee",
  "invalid_file",
  "invalid_skill",
  "invalid_state",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
] as const;
export type TrainingNotice = (typeof TRAINING_NOTICES)[number];

export const TRAINING_SUCCESS_NOTICES: readonly TrainingNotice[] = [
  "created",
  "updated",
  "assigned",
  "completed",
  "attached",
  "expired",
  "linked",
];

export function isTrainingNotice(v: string): v is TrainingNotice {
  return (TRAINING_NOTICES as readonly string[]).includes(v);
}

/** Map a gated RPC outcome string onto the closed notice vocabulary. An
 *  unknown outcome is reported as an error, never rendered raw. */
export function noticeForTrainingOutcome(outcome: string): TrainingNotice {
  return isTrainingNotice(outcome) ? outcome : "error";
}
